// src/processors/textTemplate.ts
// Fills a template string with values from the payload
// Example template: "Hello {{user}}, your order {{event}} was received!"
import { ProcessorResult } from "../types";

export async function textTemplate(
  payload: Record<string, unknown>,
  config: Record<string, unknown>,
): Promise<ProcessorResult> {
  const template = config.template as string;
  if (!template)
    return {
      success: false,
      error: "text_template requires a template in config",
    };

  const source = (payload.body as Record<string, unknown>) ?? payload;

  // Replace {{key}} with values from the payload
  const rendered = template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    return key in source ? String(source[key]) : `{{${key}}}`;
  });

  return {
    success: true,
    data: {
      original_payload: source,
      rendered_text: rendered,
      template_used: template,
    },
  };
}
