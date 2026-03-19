// src/worker/delivery.ts
// Delivers processed results to subscriber URLs with retry logic
import axios from "axios";
import crypto from "crypto";
import { pool } from "../db/client";
import { logger } from "../utils/logger";
import { Subscriber } from "../types";

const DELIVERY_TIMEOUT_MS = Number(process.env.DELIVERY_TIMEOUT_MS ?? 10000);
const MAX_DELIVERY_ATTEMPTS = 3;

export async function deliverToSubscribers(
  jobId: string,
  pipelineId: string,
  result: Record<string, unknown>,
): Promise<void> {
  // Get all active subscribers for this pipeline
  const { rows: subscribers } = await pool.query<Subscriber>(
    "SELECT * FROM subscribers WHERE pipeline_id = $1 AND is_active = true",
    [pipelineId],
  );

  // Deliver to each subscriber in parallel
  await Promise.allSettled(
    subscribers.map((sub) => deliverWithRetry(jobId, sub, result)),
  );
}
/////gitsadsad
async function deliverWithRetry(
  jobId: string,
  subscriber: Subscriber,
  result: Record<string, unknown>,
  attemptNumber = 1,
): Promise<void> {
  const body = JSON.stringify(result);

  // Sign the payload if subscriber has a secret
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Pipeline-Job-Id": jobId,
  };

  if (subscriber.secret) {
    const signature = crypto
      .createHmac("sha256", subscriber.secret)
      .update(body)
      .digest("hex");
    headers["X-Pipeline-Signature"] = `sha256=${signature}`;
  }

  try {
    const response = await axios.post(subscriber.url, result, {
      headers,
      timeout: DELIVERY_TIMEOUT_MS,
    });

    // Record successful delivery
    await pool.query(
      `INSERT INTO delivery_attempts
         (job_id, subscriber_id, status, http_status, response_body, attempt_number)
       VALUES ($1, $2, 'success', $3, $4, $5)`,
      [
        jobId,
        subscriber.id,
        response.status,
        JSON.stringify(response.data).slice(0, 1000), // cap response size
        attemptNumber,
      ],
    );

    logger.info("Delivered to subscriber", {
      job_id: jobId,
      url: subscriber.url,
      status: response.status,
    });
  } catch (err: unknown) {
    const httpStatus = axios.isAxiosError(err)
      ? (err.response?.status ?? null)
      : null;
    const message = err instanceof Error ? err.message : "Unknown error";

    // Record failed attempt
    await pool.query(
      `INSERT INTO delivery_attempts
         (job_id, subscriber_id, status, http_status, error_message, attempt_number)
       VALUES ($1, $2, 'failed', $3, $4, $5)`,
      [jobId, subscriber.id, httpStatus, message, attemptNumber],
    );

    logger.warn("Delivery failed", {
      job_id: jobId,
      url: subscriber.url,
      attempt: attemptNumber,
      error: message,
    });

    // Retry with exponential backoff (1s, 2s, 4s...)
    if (attemptNumber < MAX_DELIVERY_ATTEMPTS) {
      const delay = Math.pow(2, attemptNumber - 1) * 1000;
      logger.info(`Retrying delivery in ${delay}ms`, {
        job_id: jobId,
        attempt: attemptNumber + 1,
      });
      await sleep(delay);
      return deliverWithRetry(jobId, subscriber, result, attemptNumber + 1);
    }

    logger.error("Delivery permanently failed after max attempts", {
      job_id: jobId,
      url: subscriber.url,
    });
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
