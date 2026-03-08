// src/api/server.ts
import express from "express";
import helmet from "helmet";
import dotenv from "dotenv";
import { pipelinesRouter } from "./routes/pipelines";
import { webhooksRouter } from "./routes/webhooks";
import { jobsRouter } from "./routes/jobs";
import { checkDbConnection } from "../db/client";
import { logger } from "../utils/logger";

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/pipelines", pipelinesRouter);
app.use("/webhooks", webhooksRouter);
app.use("/jobs", jobsRouter);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  await checkDbConnection();
  logger.info("Database connection established");

  app.listen(PORT, () => {
    logger.info(`API server running on port ${PORT}`);
  });
}

start().catch((err) => {
  logger.error("Failed to start server", { err });
  process.exit(1);
});

export { app };
