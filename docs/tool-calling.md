# Tool calling for ElevenLabs voice agents

How tools are defined, versioned, and evaluated for the voice agents in this repo.

## Server-side vs. client-side tools

ElevenLabs supports two tool-execution models:

- **Server-side** — the agent emits a tool call; an HTTP endpoint (your server) handles it; the response is fed back to the LLM. Used for phone-based agents because the call leg is held server-side anyway.
- **Client-side** — the agent emits a tool call to the SDK running in the user's browser/app, which executes locally. Used for embedded conversational widgets where the user has local context (clipboard, current page, etc.).

**Phone agents are server-side by construction** — no browser context. Every tool the harness ships examples for is implemented as an HTTP webhook hit by ElevenLabs and answered by your own backend (n8n, custom HTTP service, etc.). The harness refuses to evaluate a "client-side" scenario against a server-side tool definition; the runner asserts on **webhook delivery + response shape**, not local execution.

## Tool schema in `agent.prompt.tools`

Each tool is declared as:

```yaml
- name: <tool_name>
  description: <one-line user-facing description; the LLM reads this>
  type: server-side
  url: "${TOOL_<NAME>_URL}"           # env-var-injected at deploy time
  method: POST
  parameters:                         # JSON Schema (the LLM emits args matching this)
    type: object
    properties:
      <field>:
        type: string | number | boolean | array | object
        description: <field semantics>
    required: [<field>...]
  response_timeout_secs: <int>        # ElevenLabs gives up after this; harness asserts <=
```

The harness reads tool definitions directly from the live agent (via the ElevenLabs API) at scenario start; the tool definitions in `agent-registry.example.yaml` are illustrative only. **Production tool schemas are NOT committed** — they reveal data-model and integration architecture.

## Knowledge base vs. tool boundary

When the agent needs information, the choice is:

| Use a knowledge base when | Use a tool when |
|---|---|
| The data is reference content (locations, hours, FAQs) | The data is per-caller and live |
| Updates are rare (weekly/monthly) | Updates are continuous |
| The agent should cite the source verbatim | The agent should compute / look up by id |
| Latency budget allows the embedding lookup | The lookup needs to hit a CRM/ERP/DB |

Concrete example: an agent might use a KB attachment (`kb_xxxx_demo_locations` in the placeholder shape) for a fixed location list — data that changes once a quarter and benefits from being quoted precisely. The same agent uses a `lookup_record` server-side tool for per-caller account lookup — per-call data behind a CRM API.

A scenario that asks the agent to use the wrong source (KB-shaped question routed to a tool, or vice versa) is a **routing-axis failure**, scored under `tool_routing` in the rubric.

## End-to-end example: the SMS booking tool

The full live shape is in `templates/sms-booking-tool-template.json`; this section walks through it.

**Tool definition (illustrative):**

```yaml
- name: send_sms
  description: "Send an SMS to the caller after the call. Use when caller agrees to receive a text follow-up."
  type: server-side
  url: "${SMS_BOOKING_WEBHOOK_URL}"   # webhook on your n8n / HTTP host
  method: POST
  parameters:
    type: object
    properties:
      phone_number:
        type: string
        description: "E.164 phone, e.g. +15550100"
      first_name:
        type: string
      company_name:
        type: string
      industry:
        type: string
      message_type:
        type: string
        enum: [booking-confirm, callback-link, info-only]
    required: [phone_number, message_type]
  response_timeout_secs: 8
```

**Lifecycle the harness exercises:**

1. **LLM emits a tool call** — agent decides to send SMS, emits `{ name: "send_sms", parameters: { phone_number: "+1555...", ... } }`.
2. **Schema validation (harness)** — Zod-typed validation against the `parameters` shape. Fails the scenario if the LLM hallucinates a field or a wrong type.
3. **Webhook delivery (n8n)** — POST hits the n8n endpoint with `X-Webhook-Secret` header. n8n verifies, dispatches to Twilio, returns `{ status, message_id, error? }`.
4. **Response back to LLM** — the result is fed back as a tool message. The agent uses it to confirm with the caller.
5. **Harness assertions:**
   - `tool_call_schema`: emitted args matched the JSON Schema.
   - `tool_call_routing`: send_sms was called (not e.g. send_email).
   - `tool_response_handling`: agent acknowledged the SMS confirmation in its next utterance.
   - `tool_error_path`: a separate scenario forces the n8n webhook to return 503 and asserts the agent recovers gracefully ("I had trouble sending that text — could I confirm a different number?").

This is the only tool walked through end-to-end; the same template applies to `send_email`, `lookup_record`, and any future server-side tool.

## What's NOT in this repo

- The production tool URLs (live in `${ENV_VAR}` references only)
- The shared webhook secret (lives in `${N8N_WEBHOOK_SECRET}`)
- The Twilio Account SID (live; placeholder `AC00000000000000000000000000000000` in example shapes)
- Operator-specific prompt content (objection handling, scripts, customer data) — bring your own under `prompts/`

These are operational secrets, not pattern documentation.
