// src/processors/processors.test.ts
import { enrichTimestamp } from "./enrichTimestamp";
import { filterFields } from "./filterFields";
import { transformJson } from "./transformJson";
import { textTemplate } from "./textTemplate";

// ── enrichTimestamp ───────────────────────────────────────────────────────────
describe("enrichTimestamp", () => {
  it("adds _meta to the payload", async () => {
    const result = await enrichTimestamp(
      { body: { user: "Ahmed" } },
      { timezone: "UTC" },
    );
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty("_meta");
    expect(result.data!._meta).toHaveProperty("processed_at");
    expect(result.data!._meta).toHaveProperty("day_of_week");
    expect(result.data!._meta).toHaveProperty("hour_of_day");
  });

  it("preserves original payload fields", async () => {
    const result = await enrichTimestamp({ body: { user: "Ahmed" } }, {});
    expect((result.data!.body as Record<string, unknown>).user).toBe("Ahmed");
  });
});

// ── filterFields ──────────────────────────────────────────────────────────────
describe("filterFields", () => {
  const payload = {
    body: { name: "Ahmed", password: "secret", email: "a@b.com" },
  };

  it("keeps only allowed fields", async () => {
    const result = await filterFields(payload, { allow: ["name", "email"] });
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty("name");
    expect(result.data).toHaveProperty("email");
    expect(result.data).not.toHaveProperty("password");
  });

  it("removes denied fields", async () => {
    const result = await filterFields(payload, { deny: ["password"] });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("password");
    expect(result.data).toHaveProperty("name");
  });
});

// ── transformJson ─────────────────────────────────────────────────────────────
describe("transformJson", () => {
  it("renames fields using mapping", async () => {
    const payload = { body: { user: "Ahmed", event: "signup" } };
    const result = await transformJson(payload, {
      mapping: { user: "username", event: "action" },
    });
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty("username", "Ahmed");
    expect(result.data).toHaveProperty("action", "signup");
    expect(result.data).not.toHaveProperty("user");
    expect(result.data).not.toHaveProperty("event");
  });

  it("ignores mapping keys that do not exist", async () => {
    const payload = { body: { user: "Ahmed" } };
    const result = await transformJson(payload, {
      mapping: { nonexistent: "new_name" },
    });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("new_name");
  });
});

// ── textTemplate ──────────────────────────────────────────────────────────────
describe("textTemplate", () => {
  it("fills template with payload values", async () => {
    const payload = { body: { user: "Ahmed", event: "signup" } };
    const result = await textTemplate(payload, {
      template: "Hello {{user}}, you did {{event}}!",
    });
    expect(result.success).toBe(true);
    expect(result.data!.rendered_text).toBe("Hello Ahmed, you did signup!");
  });

  it("leaves unfound keys as-is", async () => {
    const payload = { body: { user: "Ahmed" } };
    const result = await textTemplate(payload, {
      template: "Hello {{user}} and {{missing}}",
    });
    expect(result.data!.rendered_text).toBe("Hello Ahmed and {{missing}}");
  });

  it("returns error if no template in config", async () => {
    const result = await textTemplate({ body: {} }, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("template");
  });
});
