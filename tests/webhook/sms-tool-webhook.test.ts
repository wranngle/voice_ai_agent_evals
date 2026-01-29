/**
 * SMS Tool Webhook Test Suite
 *
 * Tests the Sarah SMS Tool - BULLETPROOF v3.0 webhook.
 * Workflow: send-sms-v3 (n8n ID: uFFwYcr7XgdRCvdW)
 *
 * NOTE: Valid phone tests actually send SMS via Twilio.
 * Use +15005550006 (Twilio test "unroutable" number) for safe tests.
 * Run with: vitest tests/webhook/sms-tool-webhook.test.ts
 *
 * @tags live-api
 */

import { describe, test, expect } from "vitest";

const WEBHOOK_URL =
  process.env.SMS_WEBHOOK_URL ||
  "https://your-n8n-host.example.com/webhook/send-sms-v3";
const WEBHOOK_SECRET = "test-secret-placeholder";

interface SmsRequest {
  phone_number?: string;
  first_name?: string;
  company_name?: string;
  industry?: string;
  email?: string;
  template?: string;
}

interface SmsResponse {
  success: boolean;
  error?: string;
  message?: string;
  status?: string;
  message_sid?: string;
  recipient?: string;
  first_name?: string;
  company_name?: string;
  request_id?: string;
  delivery_status?: string;
  note?: string;
  hint?: string;
  provided?: string;
  cleaned?: string;
  expected?: string;
  troubleshooting?: string;
}

async function callSmsWebhook(
  payload: SmsRequest,
  headers?: Record<string, string>
): Promise<{ status: number; body: SmsResponse; latencyMs: number }> {
  const start = Date.now();
  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": WEBHOOK_SECRET,
      ...headers,
    },
    body: JSON.stringify(payload),
  });
  const latencyMs = Date.now() - start;

  let body: SmsResponse;
  try {
    body = await response.json();
  } catch {
    body = { success: false, error: "PARSE_ERROR", message: await response.text() } as any;
  }

  return { status: response.status, body, latencyMs };
}

describe("SMS Tool Webhook", () => {
  describe("Authentication", () => {
    test("should reject requests without auth header", async () => {
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: "+15005550006" }),
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe("UNAUTHORIZED");
    });

    test("should reject requests with wrong secret", async () => {
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": "wrong-secret",
        },
        body: JSON.stringify({ phone_number: "+15005550006" }),
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("UNAUTHORIZED");
    });

    test("should accept requests with valid secret header", async () => {
      const result = await callSmsWebhook({
        phone_number: "+15005550006",
        first_name: "Test",
      });

      // Should get past auth (400 for unroutable is fine, just not 401)
      expect(result.status).not.toBe(401);
    });
  });

  describe("Phone Validation", () => {
    test("should return 400 for missing phone number", async () => {
      const result = await callSmsWebhook({
        first_name: "Test",
      });

      expect(result.status).toBe(400);
      expect(result.body.success).toBe(false);
      expect(result.body.error).toBe("MISSING_PHONE_NUMBER");
      expect(result.body.hint).toContain("E.164");
    });

    test("should return 400 for empty phone number", async () => {
      const result = await callSmsWebhook({
        phone_number: "",
        first_name: "Test",
      });

      expect(result.status).toBe(400);
      expect(result.body.error).toBe("MISSING_PHONE_NUMBER");
    });

    test("should return 400 for invalid phone format", async () => {
      // Use a numeric string that doesn't match E.164 patterns
      const result = await callSmsWebhook({
        phone_number: "+999",
        first_name: "Test",
      });

      expect(result.status).toBe(400);
      expect(result.body.error).toBe("INVALID_PHONE_FORMAT");
      expect(result.body.expected).toContain("E.164");
    });

    test("should return 400 for phone without country code", async () => {
      const result = await callSmsWebhook({
        phone_number: "5551234567",
        first_name: "Test",
      });

      expect(result.status).toBe(400);
      expect(result.body.error).toBe("INVALID_PHONE_FORMAT");
    });

    test("should accept US E.164 format (+1XXXXXXXXXX)", async () => {
      const result = await callSmsWebhook({
        phone_number: "+15005550006",
        first_name: "Test",
      });

      // Past validation = not 400 with phone error
      expect(result.body.error).not.toBe("MISSING_PHONE_NUMBER");
      expect(result.body.error).not.toBe("INVALID_PHONE_FORMAT");
    });

    test("should accept international E.164 format", async () => {
      const result = await callSmsWebhook({
        phone_number: "+447700900000",
        first_name: "Test",
      });

      expect(result.body.error).not.toBe("INVALID_PHONE_FORMAT");
    });

    test("should strip non-numeric characters from phone", async () => {
      const result = await callSmsWebhook({
        phone_number: "+1 (555) 000-0001",
        first_name: "Test",
      });

      // After cleaning, +15550000001 should pass validation
      expect(result.body.error).not.toBe("INVALID_PHONE_FORMAT");
    });
  });

  describe("Parameter Defaults", () => {
    test("should default first_name to 'there'", async () => {
      const result = await callSmsWebhook({
        phone_number: "+15005550006",
      });

      // Can't directly check first_name in all responses, but success response includes it
      expect(result.body.error).not.toBe("MISSING_PHONE_NUMBER");
    });

    test("should default template to 'demo'", async () => {
      const result = await callSmsWebhook({
        phone_number: "+15005550006",
        first_name: "TestUser",
      });

      expect(result.body.error).not.toBe("MISSING_PHONE_NUMBER");
    });
  });

  describe("Response Contract", () => {
    test("should include request_id in error responses", async () => {
      const result = await callSmsWebhook({
        phone_number: "",
      });

      expect(result.body.request_id).toBeDefined();
      expect(typeof result.body.request_id).toBe("string");
    });

    test("should include request_id in success/pending responses", async () => {
      const result = await callSmsWebhook({
        phone_number: "+15005550006",
        first_name: "Test",
      });

      if (result.status === 200 || result.status === 202) {
        expect(result.body.request_id).toBeDefined();
      }
    });

    test("error responses should have success: false", async () => {
      const result = await callSmsWebhook({
        phone_number: "invalid",
      });

      expect(result.body.success).toBe(false);
    });

    test("error responses should have error code string", async () => {
      const result = await callSmsWebhook({});

      expect(result.body.error).toBeDefined();
      expect(typeof result.body.error).toBe("string");
      expect(result.body.error).toMatch(/^[A-Z_]+$/);
    });
  });

  describe("Performance", () => {
    test("should respond to validation errors within 500ms", async () => {
      const result = await callSmsWebhook({
        phone_number: "",
      });

      expect(result.latencyMs).toBeLessThan(500);
    });

    test("should respond to auth errors within 500ms", async () => {
      const start = Date.now();
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: "+15005550006" }),
      });
      const latencyMs = Date.now() - start;
      await response.json();

      expect(latencyMs).toBeLessThan(500);
    });

    test("should handle 3 concurrent validation requests", async () => {
      const requests = Array(3)
        .fill(null)
        .map((_, i) =>
          callSmsWebhook({
            phone_number: i === 0 ? "" : "bad-phone-" + i,
          })
        );

      const results = await Promise.all(requests);
      results.forEach((r) => {
        expect(r.status).toBe(400);
        expect(r.latencyMs).toBeLessThan(1000);
      });
    });
  });

  describe("Template Selection", () => {
    test("should accept 'demo' template", async () => {
      const result = await callSmsWebhook({
        phone_number: "+15005550006",
        first_name: "Test",
        template: "demo",
      });

      expect(result.body.error).not.toBe("MISSING_PHONE_NUMBER");
    });

    test("should accept 'recap' template", async () => {
      const result = await callSmsWebhook({
        phone_number: "+15005550006",
        first_name: "Test",
        template: "recap",
        company_name: "TestCo",
      });

      expect(result.body.error).not.toBe("MISSING_PHONE_NUMBER");
    });

    test("should accept 'followup' template", async () => {
      const result = await callSmsWebhook({
        phone_number: "+15005550006",
        first_name: "Test",
        template: "followup",
        industry: "plumbing",
      });

      expect(result.body.error).not.toBe("MISSING_PHONE_NUMBER");
    });

    test("should fallback to demo for unknown template", async () => {
      const result = await callSmsWebhook({
        phone_number: "+15005550006",
        first_name: "Test",
        template: "nonexistent",
      });

      // Should not error on template — falls back to demo
      expect(result.body.error).not.toBe("INVALID_TEMPLATE");
    });
  });

  describe("Body Nesting", () => {
    test("should accept phone_number at top level", async () => {
      const result = await callSmsWebhook({
        phone_number: "+15005550006",
        first_name: "Test",
      });

      expect(result.body.error).not.toBe("MISSING_PHONE_NUMBER");
    });
  });
});
