/**
 * Post-Call Webhook Test Suite
 * Tests for the ElevenLabs post-call data processing workflow
 *
 * Run: bun test tests/post-call-webhook.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";

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

describe("Post-Call Webhook - Agent Validation", () => {
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

describe("Post-Call Webhook - Completed Calls", () => {
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

describe("Post-Call Webhook - Failed Calls", () => {
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

describe("Post-Call Webhook - Abandoned Calls", () => {
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

describe("Post-Call Webhook - Edge Cases", () => {
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
