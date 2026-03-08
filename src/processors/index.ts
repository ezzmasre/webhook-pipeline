// src/processors/index.ts
import { ProcessorType, ProcessorResult } from "../types";
import { transformJson } from "./transformJson";
import { filterFields } from "./filterFields";
import { enrichTimestamp } from "./enrichTimestamp";
import { httpFetch } from "./httpFetch";
import { textTemplate } from "./textTemplate";

export async function runProcessor(
  type: ProcessorType,
  payload: Record<string, unknown>,
  config: Record<string, unknown>,
): Promise<ProcessorResult> {
  switch (type) {
    case "transform_json":
      return transformJson(payload, config);
    case "filter_fields":
      return filterFields(payload, config);
    case "enrich_timestamp":
      return enrichTimestamp(payload, config);
    case "http_fetch":
      return httpFetch(payload, config);
    case "text_template":
      return textTemplate(payload, config);
    default:
      return { success: false, error: `Unknown processor type: ${type}` };
  }
}
