// src/types/index.ts

export type ProcessorType =
  | "transform_json"
  | "filter_fields"
  | "enrich_timestamp"
  | "http_fetch"
  | "text_template";

export type JobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "dead";
export type DeliveryStatus = "pending" | "success" | "failed";

// ─── Database row types ──────────────────────────────────────────────────────

export interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  source_token: string;
  processor_type: ProcessorType;
  processor_config: Record<string, unknown>;
  is_active: boolean;
  owner_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Subscriber {
  id: string;
  pipeline_id: string;
  url: string;
  secret: string | null;
  is_active: boolean;
  created_at: Date;
}

export interface Job {
  id: string;
  pipeline_id: string;
  status: JobStatus;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error_message: string | null;
  attempt_count: number;
  max_attempts: number;
  scheduled_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
}

export interface DeliveryAttempt {
  id: string;
  job_id: string;
  subscriber_id: string;
  status: DeliveryStatus;
  http_status: number | null;
  response_body: string | null;
  error_message: string | null;
  attempt_number: number;
  attempted_at: Date;
}

// ─── API request body types ──────────────────────────────────────────────────

export interface CreatePipelineBody {
  name: string;
  description?: string;
  processor_type: ProcessorType;
  processor_config: Record<string, unknown>;
  subscribers: Array<{ url: string; secret?: string }>;
}

export interface UpdatePipelineBody {
  name?: string;
  description?: string;
  processor_type?: ProcessorType;
  processor_config?: Record<string, unknown>;
  is_active?: boolean;
}

// ─── Processor types ─────────────────────────────────────────────────────────

export interface ProcessorResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}
