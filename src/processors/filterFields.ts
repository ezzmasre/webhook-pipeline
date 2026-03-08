// src/processors/filterFields.ts
// Keeps only specified fields (allowlist) or removes specified fields (denylist)
import { ProcessorResult } from "../types";

export async function filterFields(
  payload: Record<string, unknown>,
  config: Record<string, unknown>,
): Promise<ProcessorResult> {
  const allow = config.allow as string[] | undefined;
  const deny = config.deny as string[] | undefined;

  // Work on the body if it exists, otherwise the whole payload
  const source = (payload.body as Record<string, unknown>) ?? payload;
  let result: Record<string, unknown> = { ...source };

  if (allow && allow.length > 0) {
    // Only keep fields in the allow list
    result = Object.fromEntries(
      Object.entries(result).filter(([key]) => allow.includes(key)),
    );
  }

  if (deny && deny.length > 0) {
    // Remove fields in the deny list
    result = Object.fromEntries(
      Object.entries(result).filter(([key]) => !deny.includes(key)),
    );
  }

  return { success: true, data: result };
}
