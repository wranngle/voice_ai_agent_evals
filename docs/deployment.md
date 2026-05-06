# Deployment

The eval harness runs locally and in CI. The agents it tests are hosted on ElevenLabs and (optionally) wired to your own n8n cloud tenant for tool execution and post-call webhooks. This doc describes the recommended operator setup for using the harness against a live agent.

## What "production-shaped" means here

The harness assumes the agent runtime is fully hosted on ElevenLabs (any plan with Conversational AI access) and routes through Twilio (or any SIP provider) for the phone leg. Integration surfaces — post-call webhook, server-side tools, CRM enrichment — are real HTTP endpoints; the harness asserts on the wire shape and latency, not on a mock.

## Pre-call setup (operator)

```bash
bun install
cp agent-registry.example.yaml agent-registry.yaml
# fill in real agent_id, voice_id, KB ids, tool URLs
lefthook install                          # wire git hooks (pre-commit gitleaks + pre-push)
```

Secrets that must be set in `.env` (or your secrets store):

- `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` — required for the live ElevenLabs runner.
- `ELEVENLABS_POST_CALL_SECRET` — webhook HMAC shared secret your post-call receiver verifies against.
- `N8N_API_KEY`, `N8N_API_URL`, `N8N_WEBHOOK_SECRET` — only if you also evaluate n8n workflows that the agent calls.

`.env.example` enumerates the full set with `[HARNESS-READS]` vs `[CONVENTION]` markers — the harness only loads the former; the latter are operator-side names referenced from docs/templates.

## Promotion flow (prompt change)

1. Edit your prompt source file on a branch.
2. Run `bun run test:offline` — this proves the harness, runners, parser, storage, and adapter contracts.
3. Run `bun run testing run -t scenario` — this executes every committed scenario fixture and exits nonzero on any regression.
4. (Optional) Run `bun run testing:live:el` against a sandbox agent to confirm live behavior.
5. Open a PR. CI re-runs the offline suite on every push; wire scenario CLI execution into your promotion workflow when committed fixtures are expected to be green.
6. After merge, push the new prompt to the live ElevenLabs agent via your own deploy script.
7. Tag the commit `prompt/<name>/v<N>` for rollback addressability (see [`methodology.md` §3](methodology.md)).

Promotion is gated on the harness; never promote a prompt change that did not run through `bun run test:offline` and the relevant `bun run testing run --id SCEN-...` or full scenario suite.

## Rollback flow (live regression)

If the live agent is misbehaving:

```bash
# 1. roll back the prompt in this repo
git checkout prompt/<name>/v<N-1> -- prompts/<name>.md

# 2. push to live (your own deploy script)
# 3. verify
bun run scripts/check-elevenlabs-agent.ts
```

Full operator runbook lives in [`RUNBOOK.md`](../RUNBOOK.md).

## What's hosted where

| Component | Host | Source of truth |
|---|---|---|
| Agent runtime, voice, prompt | ElevenLabs | live agent (queryable via the ElevenLabs API); your prompt source file is the version-controlled prose |
| Phone leg | Twilio (or your provider) | provider dashboard |
| Server-side tools | n8n / your webhook host | your workflow definitions |
| Post-call webhook | n8n / your webhook host | same |
| Eval harness | Local + CI | this repo |

This repo is the **regression and prompt-versioning** layer. The live agent runtime is hosted; we don't try to reproduce ElevenLabs' platform locally.
