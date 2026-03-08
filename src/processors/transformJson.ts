// src/processors/transformJson.ts
// Remaps fields using a mapping config: { "old_key": "new_key" }
import { ProcessorResult } from "../types";

export async function transformJson(
  payload: Record<string, unknown>,
  config: Record<string, unknown>,
): Promise<ProcessorResult> {
  const mapping = (config.mapping as Record<string, string>) ?? {};
  const source = (payload.body as Record<string, unknown>) ?? payload;
  const result: Record<string, unknown> = { ...source };

  for (const [oldKey, newKey] of Object.entries(mapping)) {
    if (oldKey in result) {
      result[newKey] = result[oldKey];
      delete result[oldKey];
    }
  }

  return { success: true, data: result };
}
