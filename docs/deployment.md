# Deployment

The agent is the inbound voice SDR for [example.com](https://example.com) — deployable today; the eval harness in this repo is wired to the live agent for regression testing. ExampleCo is pre-revenue, so call volume is low, but the agent and harness are production-shaped, not toy.

## What "production-shaped" means here

The agent runtime is fully hosted on ElevenLabs (paid plan, configured per [`docs/elevenlabs-client-initiation-setup.md`](elevenlabs-client-initiation-setup.md)) and routes through Twilio for the phone leg. The integration surfaces — post-call webhook, server-side tools, CRM enrichment — are real n8n workflows on a live n8n cloud tenant; nothing is mocked at runtime.

What's deliberately *not* yet at production scale:

- **Call volume** — pre-revenue means a few demos a week, not hundreds of calls a day. The harness is tuned for correctness signals, not load.
- **Multi-tenant** — The agent is one agent for one company. Multi-tenant routing exists in `lib/extraction/` but isn't exercised live.
- **Always-on monitoring** — Grafana / Vector observability stack runs locally only; CI doesn't currently page on regressions.

## Pre-call setup (operator)

```bash
bun install
cp agent-registry.example.yaml agent-registry.yaml
# fill in real agent_id, voice_id, KB ids, tool URLs
bun run setup-automation       # idempotent provisioning
```

Secrets that must be set in `.env` (or your secrets store):

- `ELEVENLABS_API_KEY`
- `ELEVENLABS_AGENT_ID`
- `ELEVENLABS_POST_CALL_SECRET` — webhook HMAC shared secret
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
- `N8N_API_KEY`, `N8N_WEBHOOK_SECRET`
- `${TOOL_LOOKUP_URL}`, `${TOOL_SEND_SMS_URL}`, `${TOOL_SEND_EMAIL_URL}` — n8n tool endpoints

`.env.example` enumerates the full list.

## Promotion flow (prompt change)

1. Edit `prompts/primary.md` on a branch.
2. Run `bun test` locally — the regression suite exercises every committed scenario against the new prompt.
3. Open a PR. CI re-runs the suite against `agent-registry.example.yaml` (mock mode) on every push; the harness fails the build if any scenario regresses.
4. After merge, run `bun run scripts/stepwise-agent-update.js` to push the new prompt to the live ElevenLabs agent.
5. Tag the commit `prompt/primary/v<N>` for rollback addressability (see [`methodology.md` §3](methodology.md)).

Promotion is gated on the harness; never promote a prompt change that didn't run through `bun test` against the full suite.

## Rollback flow (live regression)

If the live agent is misbehaving (the agent making bad calls, tool errors, latency spike):

```bash
# 1. roll back the prompt in this repo
git checkout prompt/primary/v<N-1> -- prompts/primary.md

# 2. push to live
bun run scripts/stepwise-agent-update.js

# 3. verify
bun run scripts/check-elevenlabs-agent.js
```

Full operator runbook (with diagnostic steps for common failure modes) lives in [`RUNBOOK.md`](../RUNBOOK.md).

## What's hosted where

| Component | Host | Source of truth |
|---|---|---|
| Agent runtime, voice, prompt | ElevenLabs | live agent (queryable via `mcp__elevenlabs-mcp__get_agent`); `prompts/primary.md` is the version-controlled prose |
| Phone leg | Twilio | Twilio dashboard |
| Server-side tools | n8n cloud (`example/n8n`) | n8n workflow JSONs in that repo |
| Post-call webhook | n8n cloud | same |
| Eval harness | Local + CI | this repo |
| Brand tokens | `example/gtm_ops` | mirrored from `~/.dotfiles/DESIGN.md` |

This repo is the **regression and prompt-versioning** layer. The live agent runtime is hosted; we don't try to reproduce ElevenLabs' platform locally.
