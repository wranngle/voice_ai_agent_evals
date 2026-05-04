# Architecture

## Overview

This repo evaluates ElevenLabs voice agents in bulk. Optionally, it also evaluates downstream n8n workflows that the agent calls during a conversation (server-side tools, post-call webhooks, client-initiation lookups).

The harness is **agent-agnostic**: bring your own ElevenLabs agent ID, point the runners at it, drop in scenario YAMLs. The architecture below describes the *integration surface* the harness was designed to test, not a specific deployment.

## System Diagram

```
                                    +------------------+
                                    |   Twilio/Phone   |
                                    +--------+---------+
                                             |
                                             v
+------------------------------------------+-------------------------------------------+
|                              ElevenLabs Conversational AI                           |
|  +-------------+    +------------------+    +----------------+    +--------------+  |
|  | Voice Agent |    | Client Initiation|    | Tool Execution |    | Post-Call    |  |
|  | (your-agent)|<-->| Data Webhook     |<-->| (SMS, etc.)    |<-->| Webhook      |  |
|  +-------------+    +--------+---------+    +-------+--------+    +------+-------+  |
+------------------------------------------+-------------------------------------------+
                               |                      |                    |
                               v                      v                    v
+------------------------------------------+-------------------------------------------+
|                              n8n Workflow Engine (optional)                         |
|  +------------------+    +------------------+    +------------------+               |
|  | Client Initiation|    | Tool Webhook     |    | Post-Call        |               |
|  | Workflow         |    | (SMS / lookup)   |    | Webhook          |               |
|  +--------+---------+    +--------+---------+    +--------+---------+               |
+------------------------------------------+-------------------------------------------+
            |                      |                    |
            v                      v                    v
+------------------------------------------+-------------------------------------------+
|                              External Services                                      |
|  +----------+  +---------+  +----------+  +---------+  +----------+                |
|  | CRM      |  | Sheets  |  | Twilio   |  | Booking |  | Email    |                |
|  | (any)    |  | (any)   |  | SMS      |  | (any)   |  | (any)    |                |
|  +----------+  +---------+  +----------+  +---------+  +----------+                |
+------------------------------------------------------------------------------------|
```

## Three call lifecycle phases the harness tests

### 1. Client Initiation

When a call connects, ElevenLabs fires `client_initiation_data` against your webhook. Your handler returns dynamic variables and (optionally) a per-call first-message override. Latency budget: **<500 ms hard limit from ElevenLabs**.

The harness tests this surface via `tests/webhook/client-initiation-webhook.test.ts` — assertion against response shape, schema, and latency.

### 2. Tool Execution

During a call, the agent emits tool calls (server-side, since voice has no client). Your tool webhook validates parameters, executes the action, returns the result. Tested via `tests/webhook/sms-tool-webhook.test.ts` and the `n8n-eval` runner against any deployed tool workflow.

### 3. Post-Call Webhook

When the call ends, ElevenLabs fires `post_call_webhook` with the full conversation. Your handler logs analytics, updates downstream systems, sends follow-ups. Tested via `tests/webhook/post-call-webhook.test.ts`.

## Webhook contract (reference)

### Client-Initiation request shape

```json
{
  "caller_id": "+15551234567",
  "agent_id": "your-agent-id",
  "called_number": "+15550100",
  "call_sid": "CA1234567890"
}
```

### Client-Initiation response shape

```json
{
  "type": "conversation_initiation_client_data",
  "dynamic_variables": {
    "customer_name": "Jane Doe",
    "account_tier": "Gold",
    "lookup_success": true,
    "data_source": "crm"
  },
  "conversation_config_override": {
    "agent": {
      "first_message": "Hi Jane, thanks for calling — how can I help?"
    }
  }
}
```

Variables prefixed `secret__` are hidden from the LLM but still passed to server-side tools — useful for IDs and tokens that the agent shouldn't quote back.

## Performance targets

These are the design intents the harness was built around. Today the runner captures one round-trip latency per test (`latency_ms` per result, `avg_latency_ms` and slowest-test in the run summary); per-segment thresholds below are documented intent — **not yet enforced as hard gates** (see `docs/methodology.md` "What's not implemented yet").

| Metric | Target | Critical | Enforced today? |
|---|---|---|---|
| Client-init response | <200 ms | <500 ms (ElevenLabs hard limit) | ❌ |
| Tool webhook latency | <800 ms | <2 s | ❌ |
| Post-call webhook | <2 s | <5 s | ❌ |

The 500 ms ElevenLabs hard limit on client-init is enforced by ElevenLabs itself, not by this harness — your receiver will time out on ElevenLabs's side. The other rows are operator targets you'd assert on once the scoring engine lands.

## Wiring your own deployment

1. Set environment variables (env vars are what the harness actually reads — see `.env.example` for the full list with `[HARNESS-READS]` markers):
   - `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`
   - `N8N_API_URL`, `N8N_API_KEY` (only if testing n8n workflows)
   - `N8N_POST_CALL_WORKFLOW_ID`, `N8N_POST_CALL_WEBHOOK_PATH`
2. Optionally copy `agent-registry.example.yaml` → `agent-registry.yaml` if your own deploy tooling reads it (the harness itself does not — see the file header for the convention).
3. Run offline tests: `bun run test:offline`
4. Run live tests: `bun run testing:live:el` (or `:n8n`, `:mcp`)
5. Add scenarios under `tests/scenarios/<your-id>/` using `tests/scenarios/_template/` as the starting shape

## Related documentation

- [ElevenLabs Conversational AI Docs](https://elevenlabs.io/docs/conversational-ai)
- [n8n Workflow Documentation](https://docs.n8n.io)
- [`docs/methodology.md`](docs/methodology.md) — eval scoring rubric
- [`docs/tool-calling.md`](docs/tool-calling.md) — tool integration patterns
- [`docs/webhook-security.md`](docs/webhook-security.md) — HMAC verification
