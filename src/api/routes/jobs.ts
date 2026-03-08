// src/api/routes/jobs.ts
import { Router, Request, Response } from "express";
import { pool } from "../../db/client";
import { logger } from "../../utils/logger";

export const jobsRouter = Router();

// ── GET /jobs?pipeline_id=&status= ───────────────────────────────────────────
jobsRouter.get("/", async (req: Request, res: Response) => {
  const { pipeline_id, status, limit = "20", offset = "0" } = req.query;
  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (pipeline_id) {
    conditions.push(`pipeline_id = $${i++}`);
    values.push(pipeline_id);
  }
  if (status) {
    conditions.push(`status = $${i++}`);
    values.push(status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(Number(limit), Number(offset));

  try {
    const { rows } = await pool.query(
      `SELECT * FROM jobs ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      values,
    );
    res.json({ data: rows });
  } catch (err) {
    logger.error("Failed to list jobs", { err });
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /jobs/:id ─────────────────────────────────────────────────────────────
jobsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const {
      rows: [job],
    } = await pool.query("SELECT * FROM jobs WHERE id = $1", [req.params.id]);
    if (!job) return res.status(404).json({ error: "Job not found" });

    // Also fetch delivery attempts for this job
    const { rows: deliveries } = await pool.query(
      `SELECT da.*, s.url as subscriber_url
       FROM delivery_attempts da
       JOIN subscribers s ON s.id = da.subscriber_id
       WHERE da.job_id = $1
       ORDER BY da.attempted_at ASC`,
      [req.params.id],
    );

    res.json({ data: { ...job, delivery_attempts: deliveries } });
  } catch (err) {
    logger.error("Failed to get job", { err });
    res.status(500).json({ error: "Internal server error" });
  }
});
