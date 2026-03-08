// src/api/routes/webhooks.ts
import { Router, Request, Response } from "express";
import { pool } from "../../db/client";
import { logger } from "../../utils/logger";

export const webhooksRouter = Router();

// ── POST /webhooks/:token ─────────────────────────────────────────────────────
// This is the inbound URL for every pipeline.
// It finds the pipeline by token, then queues a job — no sync processing.
webhooksRouter.post("/:token", async (req: Request, res: Response) => {
  const { token } = req.params;

  try {
    // Look up the pipeline by its source token
    const { rows } = await pool.query(
      "SELECT id, name, is_active FROM pipelines WHERE source_token = $1",
      [token],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Unknown webhook source" });
    }

    const pipeline = rows[0];

    if (!pipeline.is_active) {
      return res.status(409).json({ error: "Pipeline is inactive" });
    }

    // Queue the job — store the full request body as the payload
    const payload = {
      body: req.body,
      headers: req.headers,
      received_at: new Date().toISOString(),
    };

    const {
      rows: [job],
    } = await pool.query(
      `INSERT INTO jobs (pipeline_id, payload) VALUES ($1, $2) RETURNING id, status, created_at`,
      [pipeline.id, JSON.stringify(payload)],
    );

    logger.info("Webhook received, job queued", {
      pipeline: pipeline.name,
      job_id: job.id,
    });

    // Respond immediately — processing happens in the background
    res.status(202).json({
      message: "Webhook received",
      job_id: job.id,
      status: job.status,
    });
  } catch (err) {
    logger.error("Failed to queue webhook job", { err });
    res.status(500).json({ error: "Internal server error" });
  }
});
