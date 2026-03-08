// src/api/routes/pipelines.ts
import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { pool } from "../../db/client";
import { logger } from "../../utils/logger";
import { CreatePipelineBody, UpdatePipelineBody } from "../../types";

export const pipelinesRouter = Router();

// ── GET /pipelines ────────────────────────────────────────────────────────────
// List all pipelines with their subscribers
pipelinesRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, 
        COALESCE(json_agg(s.*) FILTER (WHERE s.id IS NOT NULL), '[]') AS subscribers
       FROM pipelines p
       LEFT JOIN subscribers s ON s.pipeline_id = p.id
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
    );
    res.json({ data: rows });
  } catch (err) {
    logger.error("Failed to list pipelines", { err });
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /pipelines/:id ────────────────────────────────────────────────────────
pipelinesRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*,
        COALESCE(json_agg(s.*) FILTER (WHERE s.id IS NOT NULL), '[]') AS subscribers
       FROM pipelines p
       LEFT JOIN subscribers s ON s.pipeline_id = p.id
       WHERE p.id = $1
       GROUP BY p.id`,
      [req.params.id],
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "Pipeline not found" });
    res.json({ data: rows[0] });
  } catch (err) {
    logger.error("Failed to get pipeline", { err });
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /pipelines ───────────────────────────────────────────────────────────
pipelinesRouter.post("/", async (req: Request, res: Response) => {
  const body = req.body as CreatePipelineBody;

  // Basic validation
  if (!body.name || !body.processor_type || !body.subscribers?.length) {
    return res.status(400).json({
      error: "name, processor_type, and at least one subscriber are required",
    });
  }

  const validProcessors = [
    "transform_json",
    "filter_fields",
    "enrich_timestamp",
    "http_fetch",
    "text_template",
  ];
  if (!validProcessors.includes(body.processor_type)) {
    return res.status(400).json({
      error: `Invalid processor_type. Choose from: ${validProcessors.join(", ")}`,
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Create pipeline with a unique source token
    const sourceToken = randomUUID().replace(/-/g, "");
    const {
      rows: [pipeline],
    } = await client.query(
      `INSERT INTO pipelines (name, description, source_token, processor_type, processor_config)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        body.name,
        body.description ?? null,
        sourceToken,
        body.processor_type,
        JSON.stringify(body.processor_config ?? {}),
      ],
    );

    // Create subscribers
    const subscribers = [];
    for (const sub of body.subscribers) {
      if (!sub.url) continue;
      const {
        rows: [subscriber],
      } = await client.query(
        `INSERT INTO subscribers (pipeline_id, url, secret) VALUES ($1, $2, $3) RETURNING *`,
        [pipeline.id, sub.url, sub.secret ?? null],
      );
      subscribers.push(subscriber);
    }

    await client.query("COMMIT");
    logger.info("Pipeline created", { id: pipeline.id, name: pipeline.name });

    res.status(201).json({ data: { ...pipeline, subscribers } });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("Failed to create pipeline", { err });
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

// ── PATCH /pipelines/:id ──────────────────────────────────────────────────────
pipelinesRouter.patch("/:id", async (req: Request, res: Response) => {
  const body = req.body as UpdatePipelineBody;
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (body.name !== undefined) {
    fields.push(`name = $${i++}`);
    values.push(body.name);
  }
  if (body.description !== undefined) {
    fields.push(`description = $${i++}`);
    values.push(body.description);
  }
  if (body.processor_type !== undefined) {
    fields.push(`processor_type = $${i++}`);
    values.push(body.processor_type);
  }
  if (body.processor_config !== undefined) {
    fields.push(`processor_config = $${i++}`);
    values.push(JSON.stringify(body.processor_config));
  }
  if (body.is_active !== undefined) {
    fields.push(`is_active = $${i++}`);
    values.push(body.is_active);
  }

  if (fields.length === 0)
    return res.status(400).json({ error: "No fields to update" });

  values.push(req.params.id);
  try {
    const { rows } = await pool.query(
      `UPDATE pipelines SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`,
      values,
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "Pipeline not found" });
    res.json({ data: rows[0] });
  } catch (err) {
    logger.error("Failed to update pipeline", { err });
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /pipelines/:id ─────────────────────────────────────────────────────
pipelinesRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { rowCount } = await pool.query(
      "DELETE FROM pipelines WHERE id = $1",
      [req.params.id],
    );
    if (rowCount === 0)
      return res.status(404).json({ error: "Pipeline not found" });
    res.json({ message: "Pipeline deleted" });
  } catch (err) {
    logger.error("Failed to delete pipeline", { err });
    res.status(500).json({ error: "Internal server error" });
  }
});
