-- migrations/001_initial.sql

-- ── Pipelines ──────────────────────────────────────────────────────────────
-- A pipeline connects an inbound webhook source to a processor and subscribers
CREATE TABLE IF NOT EXISTS pipelines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  description      TEXT,
  source_token     TEXT NOT NULL UNIQUE,  -- forms the inbound URL: /webhooks/:token
  processor_type   TEXT NOT NULL,
  processor_config JSONB NOT NULL DEFAULT '{}',
  is_active        BOOLEAN NOT NULL DEFAULT true,
  owner_id         UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Subscribers ────────────────────────────────────────────────────────────
-- Each pipeline can deliver results to one or more subscriber URLs
CREATE TABLE IF NOT EXISTS subscribers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  secret      TEXT,          -- optional HMAC secret for signed delivery
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Jobs ───────────────────────────────────────────────────────────────────
-- Every inbound webhook creates a job; processed asynchronously by the worker
CREATE TABLE IF NOT EXISTS jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id   UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','completed','failed','dead')),
  payload       JSONB NOT NULL DEFAULT '{}',
  result        JSONB,
  error_message TEXT,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts  INT NOT NULL DEFAULT 5,
  scheduled_at  TIMESTAMPTZ NOT NULL DEFAULT now(),  -- supports delayed jobs
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Delivery Attempts ──────────────────────────────────────────────────────
-- Every attempt to POST a result to a subscriber URL is recorded here
CREATE TABLE IF NOT EXISTS delivery_attempts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  subscriber_id  UUID NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','success','failed')),
  http_status    INT,
  response_body  TEXT,
  error_message  TEXT,
  attempt_number INT NOT NULL DEFAULT 1,
  attempted_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────
-- Worker polls for pending jobs frequently — this index is critical
CREATE INDEX IF NOT EXISTS idx_jobs_status_scheduled
  ON jobs(status, scheduled_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_jobs_pipeline_id
  ON jobs(pipeline_id);

CREATE INDEX IF NOT EXISTS idx_subscribers_pipeline_id
  ON subscribers(pipeline_id);

CREATE INDEX IF NOT EXISTS idx_delivery_attempts_job_id
  ON delivery_attempts(job_id);

CREATE INDEX IF NOT EXISTS idx_pipelines_source_token
  ON pipelines(source_token);

-- ── Auto-update updated_at ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pipelines_updated_at
  BEFORE UPDATE ON pipelines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();