// src/processors/httpFetch.ts
// Calls an external URL and merges the response into the payload
import axios from "axios";
import { ProcessorResult } from "../types";

export async function httpFetch(
  payload: Record<string, unknown>,
  config: Record<string, unknown>,
): Promise<ProcessorResult> {
  const url = config.url as string;
  const method = ((config.method as string) ?? "GET").toUpperCase();
  const headers = (config.headers as Record<string, string>) ?? {};

  if (!url)
    return { success: false, error: "http_fetch requires a url in config" };

  try {
    const response = await axios({
      method,
      url,
      headers,
      data: method !== "GET" ? payload : undefined,
      timeout: 8000,
    });

    return {
      success: true,
      data: {
        original_payload: payload,
        fetched_data: response.data,
        fetch_status: response.status,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: `http_fetch failed: ${message}` };
  }
}
