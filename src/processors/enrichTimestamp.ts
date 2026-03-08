// src/processors/enrichTimestamp.ts
// Adds timestamp metadata to the payload
import { ProcessorResult } from "../types";

export async function enrichTimestamp(
  payload: Record<string, unknown>,
  config: Record<string, unknown>,
): Promise<ProcessorResult> {
  const now = new Date();
  const timezone = (config.timezone as string) ?? "UTC";

  return {
    success: true,
    data: {
      ...payload,
      _meta: {
        processed_at: now.toISOString(),
        processed_at_unix: Math.floor(now.getTime() / 1000),
        timezone,
        day_of_week: now.toLocaleDateString("en-US", {
          weekday: "long",
          timeZone: timezone,
        }),
        hour_of_day: now.getHours(),
      },
    },
  };
}
