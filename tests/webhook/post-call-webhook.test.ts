/**
 * Post-Call Webhook Test Suite
 * Tests for the ElevenLabs post-call data processing workflow
 *
 * Run: vitest tests/webhook/post-call-webhook.test.ts
 */

import { describe, it, expect } from "vitest";

const WEBHOOK_URL = "https://your-n8n-host.example.com/webhook/post-call";
const VALID_AGENT_ID = "agent_xxxx_demo";

interface WebhookResponse {
  success?: boolean;
  processed?: boolean;
  call_status?: string;
  follow_up_type?: string;
  follow_up_priority?: string;
  should_retry?: boolean;
  abandon_reason?: string;
  should_callback?: string | boolean;
  error?: string;
  received?: string;
}

async function sendWebhook(payload: object): Promise<{ status: number; body: WebhookResponse }> {
  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body = response.status === 200 || response.status === 400
    ? await response.json() as WebhookResponse
    : {} as WebhookResponse;

  return { status: response.status, body };
}

describe.skipIf(process.env.CI)("Post-Call Webhook - Agent Validation", () => {
  it("should accept requests with valid agent_id", async () => {
    const { status, body } = await sendWebhook({
      agent_id: VALID_AGENT_ID,
      conversation_id: "test-valid-001",
      call_status: "completed",
      call_duration_seconds: 60,
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("should reject requests with invalid agent_id", async () => {
    const { status, body } = await sendWebhook({
      agent_id: "invalid_agent_123",
      conversation_id: "test-invalid-001",
      call_status: "completed",
    });

    expect(status).toBe(400);
    expect(body.error).toBe("Invalid agent_id");
    expect(body.received).toBe("invalid_agent_123");
  });

  it("should reject requests with missing agent_id", async () => {
    const { status, body } = await sendWebhook({
      conversation_id: "test-missing-001",
      call_status: "completed",
    });

    expect(status).toBe(400);
    expect(body.error).toBe("Invalid agent_id");
  });
});

describe.skipIf(process.env.CI)("Post-Call Webhook - Completed Calls", () => {
  it("should process completed call with booking intent", async () => {
    const { status, body } = await sendWebhook({
      agent_id: VALID_AGENT_ID,
      conversation_id: "test-booking-001",
      call_status: "completed",
      call_duration_seconds: 180,
      transcript: "I would like to book a demo for next week",
      customer_sentiment: "positive",
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.call_status).toBe("completed");
    expect(body.follow_up_type).toBe("booking");
    expect(body.follow_up_priority).toBe("high");
  });

  it("should process completed call with support intent", async () => {
    const { status, body } = await sendWebhook({
      agent_id: VALID_AGENT_ID,
      conversation_id: "test-support-001",
      call_status: "completed",
      call_duration_seconds: 120,
      transcript: "I have a problem with my account, it's not working",
      customer_sentiment: "neutral",
    });

    expect(status).toBe(200);
    expect(body.follow_up_type).toBe("support");
    expect(body.follow_up_priority).toBe("high");
  });

  it("should detect negative sentiment and escalate", async () => {
    const { status, body } = await sendWebhook({
      agent_id: VALID_AGENT_ID,
      conversation_id: "test-negative-001",
      call_status: "completed",
      call_duration_seconds: 90,
      transcript: "This is frustrating, I need help",
      customer_sentiment: "negative",
    });

    expect(status).toBe(200);
    expect(body.follow_up_priority).toBe("urgent");
  });

  it("should handle call with no special intent", async () => {
    const { status, body } = await sendWebhook({
      agent_id: VALID_AGENT_ID,
      conversation_id: "test-general-001",
      call_status: "completed",
      call_duration_seconds: 60,
      transcript: "Just checking in about our services",
      customer_sentiment: "positive",
    });

    expect(status).toBe(200);
    expect(body.follow_up_type).toBe("none");
    expect(body.follow_up_priority).toBe("low");
  });
});

describe.skipIf(process.env.CI)("Post-Call Webhook - Failed Calls", () => {
  it("should process failed call with retryable error", async () => {
    const { status, body } = await sendWebhook({
      agent_id: VALID_AGENT_ID,
      conversation_id: "test-retry-001",
      call_status: "failed",
      call_duration_seconds: 10,
      error_type: "timeout",
    });

    expect(status).toBe(200);
    expect(body.call_status).toBe("failed");
    expect(body.should_retry).toBe(true);
    expect(body.follow_up_type).toBe("error_recovery");
  });

  it("should process failed call with non-retryable error", async () => {
    const { status, body } = await sendWebhook({
      agent_id: VALID_AGENT_ID,
      conversation_id: "test-noretry-001",
      call_status: "failed",
      call_duration_seconds: 5,
      error_type: "user_hangup",
    });

    expect(status).toBe(200);
    expect(body.should_retry).toBe(false);
  });

  it("should handle error status as failed", async () => {
    const { status, body } = await sendWebhook({
      agent_id: VALID_AGENT_ID,
      conversation_id: "test-error-001",
      call_status: "error",
      error_type: "service_unavailable",
    });

    expect(status).toBe(200);
    expect(body.call_status).toBe("failed");
    expect(body.should_retry).toBe(true);
  });
});

describe.skipIf(process.env.CI)("Post-Call Webhook - Abandoned Calls", () => {
  it("should classify immediate hangup (<5s)", async () => {
    const { status, body } = await sendWebhook({
      agent_id: VALID_AGENT_ID,
      conversation_id: "test-immediate-001",
      call_status: "abandoned",
      call_duration_seconds: 3,
      caller_id: "+15551234567",
    });

    expect(status).toBe(200);
    expect(body.abandon_reason).toBe("immediate_hangup");
    expect(body.should_callback).toBeFalsy();
  });

  it("should classify early abandonment (5-30s) with callback", async () => {
    const { status, body } = await sendWebhook({
      agent_id: VALID_AGENT_ID,
      conversation_id: "test-early-001",
      call_status: "abandoned",
      call_duration_seconds: 15,
      caller_id: "+15551234567",
    });

    expect(status).toBe(200);
    expect(body.abandon_reason).toBe("early_abandonment");
    expect(body.should_callback).toBeTruthy();
    expect(body.follow_up_type).toBe("callback");
  });

  it("should classify mid-call abandonment (>30s)", async () => {
    const { status, body } = await sendWebhook({
      agent_id: VALID_AGENT_ID,
      conversation_id: "test-midcall-001",
      call_status: "abandoned",
      call_duration_seconds: 45,
      caller_id: "+15551234567",
    });

    expect(status).toBe(200);
    expect(body.abandon_reason).toBe("mid_call_abandonment");
    expect(body.should_callback).toBeTruthy();
  });
});

describe.skipIf(process.env.CI)("Post-Call Webhook - Edge Cases", () => {
  it("should handle unknown call status via fallback", async () => {
    const { status, body } = await sendWebhook({
      agent_id: VALID_AGENT_ID,
      conversation_id: "test-unknown-001",
      call_status: "unknown",
      call_duration_seconds: 30,
    });

    // Unknown status routes to fallback (Process Completed Call)
    expect(status).toBe(200);
    expect(body.call_status).toBe("completed");
  });

  it("should handle missing optional fields gracefully", async () => {
    const { status, body } = await sendWebhook({
      agent_id: VALID_AGENT_ID,
      conversation_id: "test-minimal-001",
      call_status: "completed",
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("should process action_items array correctly", async () => {
    const { status, body } = await sendWebhook({
      agent_id: VALID_AGENT_ID,
      conversation_id: "test-actions-001",
      call_status: "completed",
      call_duration_seconds: 120,
      action_items: ["Follow up email", "Schedule demo", "Send pricing"],
      dynamic_variables: {
        customer_name: "John Smith",
        email: "john@example.com",
      },
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ============================================
// Robustness Tests - Malformed Input
// These were identified as coverage gaps and are now
// permanent regression tests for the sausage factory.
// ============================================

describe.skipIf(process.env.CI)("Post-Call Webhook - Malformed Input", () => {
  it("should reject non-JSON content type gracefully", async () => {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "this is not json",
    });

    // Should not crash (500) - must return 4xx or handle gracefully
    expect(response.status).toBeLessThan(500);
  });

  it("should handle empty POST body", async () => {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    // Empty body has no agent_id - should reject
    expect(response.status).toBe(400);
  });

  it("should handle null values in required fields", async () => {
    const { status } = await sendWebhook({
      agent_id: null,
      conversation_id: null,
      call_status: null,
    });

    expect(status).toBe(400);
  });

  it("should handle numeric agent_id (wrong type)", async () => {
    const { status, body } = await sendWebhook({
      agent_id: 12345,
      conversation_id: "test-numeric-agent",
      call_status: "completed",
    });

    expect(status).toBe(400);
    expect(body.error).toBe("Invalid agent_id");
  });

  it("should handle array where object expected", async () => {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ agent_id: VALID_AGENT_ID }]),
    });

    // Array payload should not crash the workflow
    expect(response.status).toBeLessThan(500);
  });
});

// ============================================
// Resilience Tests - Large & Unusual Payloads
// ============================================

describe.skipIf(process.env.CI)("Post-Call Webhook - Payload Resilience", () => {
  it("should handle very large transcript (10k+ chars)", async () => {
    const longTranscript = "Customer said something. ".repeat(500); // ~12,500 chars

    const { status, body } = await sendWebhook({
      agent_id: VALID_AGENT_ID,
      conversation_id: "test-large-transcript-001",
      call_status: "completed",
      call_duration_seconds: 3600,
      transcript: longTranscript,
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("should handle unicode and emoji in transcript", async () => {
    const { status, body } = await sendWebhook({
      agent_id: VALID_AGENT_ID,
      conversation_id: "test-unicode-001",
      call_status: "completed",
      call_duration_seconds: 60,
      transcript: "Héllo, I'd like tö book a démö 🎉 für nächste Wöche. Gracias señor! 日本語テスト",
      customer_sentiment: "positive",
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("should handle zero duration call", async () => {
    const { status, body } = await sendWebhook({
      agent_id: VALID_AGENT_ID,
      conversation_id: "test-zero-duration-001",
      call_status: "completed",
      call_duration_seconds: 0,
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("should handle negative duration without crashing", async () => {
    const { status } = await sendWebhook({
      agent_id: VALID_AGENT_ID,
      conversation_id: "test-negative-duration-001",
      call_status: "completed",
      call_duration_seconds: -5,
    });

    // Should not 500 - either process or reject gracefully
    expect(status).toBeLessThan(500);
  });

  it("should handle extra unknown fields without breaking", async () => {
    const { status, body } = await sendWebhook({
      agent_id: VALID_AGENT_ID,
      conversation_id: "test-extra-fields-001",
      call_status: "completed",
      call_duration_seconds: 60,
      // Fields that don't exist in schema - future ElevenLabs API additions
      new_future_field: "some value",
      another_unknown: { nested: true },
      elevenlabs_internal_id: "el_abc123",
      metadata: { version: "2.0", region: "us-east" },
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("should handle deeply nested dynamic_variables", async () => {
    const { status, body } = await sendWebhook({
      agent_id: VALID_AGENT_ID,
      conversation_id: "test-deep-nesting-001",
      call_status: "completed",
      call_duration_seconds: 60,
      dynamic_variables: {
        level1: {
          level2: {
            level3: {
              level4: "deep value",
            },
          },
        },
      },
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ============================================
// Idempotency Tests
// ============================================

describe.skipIf(process.env.CI)("Post-Call Webhook - Idempotency", () => {
  it("should handle duplicate conversation_id without error", async () => {
    const payload = {
      agent_id: VALID_AGENT_ID,
      conversation_id: "test-duplicate-" + Date.now(),
      call_status: "completed",
      call_duration_seconds: 60,
    };

    const first = await sendWebhook(payload);
    const second = await sendWebhook(payload);

    // Both should succeed - no unique constraint violation
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it("should produce consistent output for identical input", async () => {
    const payload = {
      agent_id: VALID_AGENT_ID,
      conversation_id: "test-consistency-" + Date.now(),
      call_status: "completed",
      call_duration_seconds: 120,
      transcript: "I need to schedule a follow up",
      customer_sentiment: "neutral",
    };

    const first = await sendWebhook(payload);
    const second = await sendWebhook(payload);

    expect(first.body.follow_up_type).toBe(second.body.follow_up_type);
    expect(first.body.follow_up_priority).toBe(second.body.follow_up_priority);
    expect(first.body.call_status).toBe(second.body.call_status);
  });
});

// ============================================
// Concurrency & Performance
// ============================================

describe.skipIf(process.env.CI)("Post-Call Webhook - Concurrency", () => {
  it("should handle 10 concurrent requests without 5xx", async () => {
    const requests = Array.from({ length: 10 }, (_, i) =>
      sendWebhook({
        agent_id: VALID_AGENT_ID,
        conversation_id: `test-concurrent-${Date.now()}-${i}`,
        call_status: "completed",
        call_duration_seconds: 30 + i,
      })
    );

    const results = await Promise.all(requests);

    const serverErrors = results.filter(r => r.status >= 500);
    expect(serverErrors, `${serverErrors.length} of 10 requests returned 5xx`).toHaveLength(0);

    const successes = results.filter(r => r.status === 200);
    expect(successes.length).toBeGreaterThanOrEqual(9); // Allow 1 transient failure
  });

  it("should respond within 500ms for standard payload", async () => {
    const start = Date.now();
    await sendWebhook({
      agent_id: VALID_AGENT_ID,
      conversation_id: "test-latency-" + Date.now(),
      call_status: "completed",
      call_duration_seconds: 60,
      transcript: "Standard length call transcript for latency test",
    });
    const latency = Date.now() - start;

    expect(latency, `Response took ${latency}ms, expected < 500ms`).toBeLessThan(500);
  });
});

// ============================================
// Response Contract Tests
// ============================================

describe.skipIf(process.env.CI)("Post-Call Webhook - Response Contract", () => {
  it("must always return JSON content-type on 200", async () => {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: VALID_AGENT_ID,
        conversation_id: "test-content-type-" + Date.now(),
        call_status: "completed",
        call_duration_seconds: 60,
      }),
    });

    expect(response.status).toBe(200);
    const contentType = response.headers.get("content-type");
    expect(contentType).toContain("application/json");
  });

  it("must always include success field on 200 response", async () => {
    const statuses = ["completed", "failed", "abandoned"];

    for (const callStatus of statuses) {
      const { status, body } = await sendWebhook({
        agent_id: VALID_AGENT_ID,
        conversation_id: `test-contract-${callStatus}-${Date.now()}`,
        call_status: callStatus,
        call_duration_seconds: 30,
        ...(callStatus === "failed" ? { error_type: "timeout" } : {}),
        ...(callStatus === "abandoned" ? { caller_id: "+15551234567" } : {}),
      });

      expect(status, `${callStatus} should return 200`).toBe(200);
      expect(body.success, `${callStatus} response must include success field`).toBeDefined();
      expect(body.call_status, `${callStatus} response must include call_status field`).toBeDefined();
    }
  });

  it("must always include error field on 400 response", async () => {
    const { status, body } = await sendWebhook({
      agent_id: "bad_agent",
      conversation_id: "test-error-contract-" + Date.now(),
    });

    expect(status).toBe(400);
    expect(body.error).toBeDefined();
    expect(typeof body.error).toBe("string");
    expect(body.error!.length).toBeGreaterThan(0);
  });
});

/**
 * Logging Tests - n8n Data Tables
 *
 * The webhook logs call data to an n8n Data Table named "Post-Call History".
 * The logging node uses continueOnFail:true, so the webhook works even if:
 * - The table doesn't exist yet
 * - The table schema doesn't match
 * - n8n Data Tables service is unavailable
 *
 * NOTE: n8n Data Tables cannot be created via API due to a platform limitation.
 * The table must be created manually in the n8n UI with these columns:
 * - timestamp (string)
 * - phone (string)
 * - conversation_id (string)
 * - duration_seconds (number)
 * - status (string)
 * - sentiment (string)
 * - summary (string)
 * - follow_up_type (string)
 * - follow_up_priority (string)
 */
describe.skipIf(process.env.CI)("Post-Call Webhook - Logging Resilience", () => {
  it("should return success even when logging fails (continueOnFail)", async () => {
    // This test verifies the webhook works regardless of logging status
    const { status, body } = await sendWebhook({
      agent_id: VALID_AGENT_ID,
      conversation_id: "test-logging-001",
      call_status: "completed",
      call_duration_seconds: 60,
      transcript: "Test call for logging verification",
    });

    // Webhook should succeed regardless of whether logging worked
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.processed).toBe(true);
  });

  it("should include all loggable fields in response", async () => {
    const { status, body } = await sendWebhook({
      agent_id: VALID_AGENT_ID,
      conversation_id: "test-logging-002",
      call_status: "completed",
      call_duration_seconds: 90,
      caller_id: "+15559876543",
      customer_sentiment: "positive",
      call_summary: "Customer inquiry about services",
    });

    expect(status).toBe(200);
    // These fields are also logged to the data table
    expect(body.call_status).toBe("completed");
    expect(body.follow_up_type).toBeDefined();
    expect(body.follow_up_priority).toBeDefined();
  });
});
