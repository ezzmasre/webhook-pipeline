// src/worker/index.ts
import dotenv from "dotenv";
import { pool } from "../db/client";
import { logger } from "../utils/logger";
import { runProcessor } from "../processors";
import { deliverToSubscribers } from "./delivery";
import { Job, Pipeline } from "../types";

dotenv.config();

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 2000);
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 5);
const MAX_JOB_ATTEMPTS = Number(process.env.MAX_JOB_ATTEMPTS ?? 5);

let isRunning = false;

// ── Main poll loop ────────────────────────────────────────────────────────────
async function poll(): Promise<void> {
  if (isRunning) return; // prevent overlapping polls
  isRunning = true;

  try {
    const jobs = await claimJobs(CONCURRENCY);
    if (jobs.length > 0) {
      logger.info(`Processing ${jobs.length} job(s)`);
      await Promise.allSettled(jobs.map(processJob));
    }
  } catch (err) {
    logger.error("Poll error", { err });
  } finally {
    isRunning = false;
  }
}

// ── Claim pending jobs atomically ─────────────────────────────────────────────
// Uses SELECT ... FOR UPDATE SKIP LOCKED so multiple workers never grab the same job
async function claimJobs(limit: number): Promise<Job[]> {
  const { rows } = await pool.query<Job>(
    `UPDATE jobs
     SET status = 'processing', started_at = now(), attempt_count = attempt_count + 1
     WHERE id IN (
       SELECT id FROM jobs
       WHERE status IN ('pending', 'failed')
         AND attempt_count < max_attempts
         AND scheduled_at <= now()
       ORDER BY scheduled_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [limit],
  );
  return rows;
}

// ── Process a single job ──────────────────────────────────────────────────────
async function processJob(job: Job): Promise<void> {
  logger.info("Processing job", {
    job_id: job.id,
    pipeline_id: job.pipeline_id,
  });

  try {
    // Fetch the pipeline config
    const { rows } = await pool.query<Pipeline>(
      "SELECT * FROM pipelines WHERE id = $1",
      [job.pipeline_id],
    );

    if (rows.length === 0) {
      await failJob(job.id, "Pipeline not found");
      return;
    }

    const pipeline = rows[0];

    // Run the processor
    const processorResult = await runProcessor(
      pipeline.processor_type,
      job.payload,
      pipeline.processor_config,
    );

    if (!processorResult.success) {
      throw new Error(processorResult.error ?? "Processor returned failure");
    }

    const result = processorResult.data ?? {};

    // Mark job as completed
    await pool.query(
      `UPDATE jobs SET status = 'completed', result = $1, completed_at = now() WHERE id = $2`,
      [JSON.stringify(result), job.id],
    );

    logger.info("Job completed", { job_id: job.id });

    // Deliver result to all subscribers
    await deliverToSubscribers(job.id, job.pipeline_id, result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Job failed", { job_id: job.id, error: message });

    const isDead = job.attempt_count >= MAX_JOB_ATTEMPTS;

    await pool.query(
      `UPDATE jobs
       SET status = $1,
           error_message = $2,
           -- exponential backoff: retry after 2^attempt seconds
           scheduled_at = now() + ($3 || ' seconds')::interval
       WHERE id = $4`,
      [
        isDead ? "dead" : "failed",
        message,
        String(Math.pow(2, job.attempt_count)),
        job.id,
      ],
    );

    if (isDead) {
      logger.error("Job marked as dead after max attempts", { job_id: job.id });
    }
  }
}

// ── Helper: immediately fail a job ───────────────────────────────────────────
async function failJob(jobId: string, reason: string): Promise<void> {
  await pool.query(
    `UPDATE jobs SET status = 'dead', error_message = $1 WHERE id = $2`,
    [reason, jobId],
  );
}

// ── Start the worker ──────────────────────────────────────────────────────────
async function start(): Promise<void> {
  logger.info("Worker started", {
    poll_interval_ms: POLL_INTERVAL_MS,
    concurrency: CONCURRENCY,
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    logger.info("Worker shutting down...");
    process.exit(0);
  });

  // Poll on an interval
  setInterval(poll, POLL_INTERVAL_MS);

  // Also poll immediately on startup
  await poll();
}

start().catch((err) => {
  logger.error("Worker failed to start", { err });
  process.exit(1);
});
