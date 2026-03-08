# Webhook Pipeline

A webhook-driven task processing pipeline — think of it as a simplified Zapier. An inbound event triggers a processing step, and the result is forwarded to one or more destinations.

[![CI](https://github.com/ezzmasre/webhook-pipeline/actions/workflows/ci.yml/badge.svg)](https://github.com/ezzmasre/webhook-pipeline/actions/workflows/ci.yml)

---

## What It Does

```
Inbound Webhook → Job Queue → Worker → Processor → Deliver to Subscribers
```

1. You create a **pipeline** with a processor type and subscriber URLs
2. Each pipeline gets a unique **source URL**
3. When a webhook hits that URL, a **job is queued** (no sync processing)
4. A **background worker** picks up the job, runs the processor, and **delivers the result** to all subscribers
5. Failed deliveries are **retried automatically** with exponential backoff

---

## Quick Start

**Requirements:** Docker Desktop

```bash
git clone https://github.com/ezzmasre/webhook-pipeline.git
cd webhook-pipeline
docker compose up
```

That's it. The API is live at `http://localhost:3000` 🚀

---

## Architecture

```
┌─────────────┐     POST /webhooks/:token     ┌─────────────┐
│   Client    │ ───────────────────────────►  │  API Server │
└─────────────┘                               └──────┬──────┘
                                                     │ INSERT job (pending)
                                                     ▼
                                              ┌─────────────┐
                                              │  PostgreSQL │
                                              └──────┬──────┘
                                                     │ poll every 2s
                                                     ▼
                                              ┌─────────────┐
                                              │   Worker    │
                                              └──────┬──────┘
                                                     │ run processor
                                                     ▼
                                              ┌─────────────┐
                                              │  Processor  │
                                              └──────┬──────┘
                                                     │ POST result
                                                     ▼
                                              ┌─────────────┐
                                              │ Subscribers │
                                              └─────────────┘
```

### Project Structure

```
src/
├── api/
│   ├── routes/
│   │   ├── pipelines.ts   # CRUD for pipelines
│   │   ├── webhooks.ts    # Inbound webhook receiver
│   │   └── jobs.ts        # Job status & history
│   └── server.ts          # Express app entry point
├── worker/
│   ├── index.ts           # Poll loop + job claiming
│   └── delivery.ts        # Deliver results to subscribers
├── processors/
│   ├── index.ts           # Processor router
│   ├── enrichTimestamp.ts
│   ├── filterFields.ts
│   ├── transformJson.ts
│   ├── httpFetch.ts
│   └── textTemplate.ts
├── db/
│   ├── client.ts          # PostgreSQL connection pool
│   └── migrate.ts         # Migration runner
└── types/
    └── index.ts           # Shared TypeScript types
```

---

## API Reference

### Pipelines

#### Create a Pipeline

```http
POST /pipelines
Content-Type: application/json

{
  "name": "My Pipeline",
  "description": "Optional description",
  "processor_type": "enrich_timestamp",
  "processor_config": { "timezone": "UTC" },
  "subscribers": [
    { "url": "https://your-site.com/webhook", "secret": "optional-hmac-secret" }
  ]
}
```

#### List Pipelines

```http
GET /pipelines
```

#### Get Pipeline

```http
GET /pipelines/:id
```

#### Update Pipeline

```http
PATCH /pipelines/:id
Content-Type: application/json

{
  "name": "New Name",
  "is_active": false
}
```

#### Delete Pipeline

```http
DELETE /pipelines/:id
```

---

### Webhooks

#### Send a Webhook

```http
POST /webhooks/:source_token
Content-Type: application/json

{ "any": "data", "you": "want" }
```

Response:

```json
{
  "message": "Webhook received",
  "job_id": "uuid",
  "status": "pending"
}
```

---

### Jobs

#### List Jobs

```http
GET /jobs?pipeline_id=uuid&status=completed&limit=20&offset=0
```

#### Get Job + Delivery Attempts

```http
GET /jobs/:id
```

---

## Processor Types

| Type               | Description                                              | Config Example                                                 |
| ------------------ | -------------------------------------------------------- | -------------------------------------------------------------- |
| `enrich_timestamp` | Adds time metadata (`processed_at`, `day_of_week`, etc.) | `{ "timezone": "UTC" }`                                        |
| `filter_fields`    | Keep or remove specific fields                           | `{ "allow": ["name", "email"] }` or `{ "deny": ["password"] }` |
| `transform_json`   | Rename/remap field keys                                  | `{ "mapping": { "user": "username" } }`                        |
| `http_fetch`       | Call an external URL and merge response                  | `{ "url": "https://api.example.com/data", "method": "GET" }`   |
| `text_template`    | Fill a message template with payload values              | `{ "template": "Hello {{user}}, you did {{event}}!" }`         |

---

## Design Decisions

### 1. Async Job Queue via PostgreSQL

Instead of adding Redis or RabbitMQ, jobs are queued directly in PostgreSQL. This keeps the stack simple (one less dependency) while still being reliable. The worker uses `SELECT FOR UPDATE SKIP LOCKED` which means multiple workers can run in parallel without ever picking up the same job.

### 2. Exponential Backoff on Retries

Failed jobs are retried with exponential backoff (`2^attempt` seconds). This prevents hammering a temporarily down subscriber and gives it time to recover.

### 3. Single Docker Image

The API and worker share the same Docker image — they just run different commands. This means one `docker build` for the whole system, which simplifies CI and deployment.

### 4. HMAC Signature Verification

Subscribers can optionally provide a `secret`. When set, every delivery is signed with `HMAC-SHA256` and sent as the `X-Pipeline-Signature` header — so subscribers can verify the payload actually came from this service.

### 5. Migration Tracking

Migrations track themselves in a `migrations` table. Running `migrate` twice is always safe — already-applied migrations are skipped. Each migration runs inside a transaction so partial failures are rolled back cleanly.

---

## Running Tests

```bash
npm install
npm test
```

---

## Environment Variables

| Variable                  | Default | Description                           |
| ------------------------- | ------- | ------------------------------------- |
| `PORT`                    | `3000`  | API server port                       |
| `DATABASE_URL`            | —       | PostgreSQL connection string          |
| `JWT_SECRET`              | —       | Secret for JWT signing                |
| `WORKER_POLL_INTERVAL_MS` | `2000`  | How often worker polls for jobs       |
| `WORKER_CONCURRENCY`      | `5`     | Max jobs processed at once            |
| `MAX_JOB_ATTEMPTS`        | `5`     | Max retries before job is marked dead |
| `DELIVERY_TIMEOUT_MS`     | `10000` | Timeout for subscriber delivery       |
