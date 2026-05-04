# Project Context

## Purpose

`voice_ai_agent_evals` is a **bulk evaluation harness** for ElevenLabs Conversational AI voice agents. It does for voice agents what unit tests do for code: deterministic regression coverage, latency budgets enforced as hard thresholds, and prompt versioning via git tags.

Bring your own ElevenLabs agent ID, drop in scenario YAMLs, get pass/fail with assertion-level detail. The harness is agent-agnostic; this repo ships generic runners and example scenarios, not a specific deployment.

**Primary goals:**
- Deterministic regression on every commit (no "did the model change?" guessing)
- Voice-specific scoring axes — barge-in recovery, ASR confidence, TTS prosody, timeout handling *(intent — scoring engine not yet implemented; see "Status" below)*
- Latency budgets — TTFB p95 ≤ 800 ms, end-to-first-audio p95 ≤ 1.4 s, total-turn p95 ≤ 3.0 s *(intent — runner currently captures one round-trip latency per test, no per-segment / p95 enforcement yet)*
- Optional integration testing for downstream n8n workflows (tool webhooks, post-call processing)

## Status

**Implemented**: runners (ElevenLabs, n8n-eval, MCP, webhook), single-number `latency_ms` capture per test, scenario YAML loading via Vitest, prompt-versioning convention via git tags, offline test suite (269 tests), 4 specialized live test projects.

**Not yet implemented** (documented intent, no runtime enforcement): per-segment latency split (TTFB / first-audio / total-turn), p95 aggregation across runs, voice-axis scoring (barge-in / prosody / ASR-confidence / timeout), LLM-judge axes for tone/empathy. Scenario YAMLs declare these as conventions; the orchestrator does not yet read them.

## Tech Stack

### Voice & telephony (target surface)
- **ElevenLabs** — Conversational AI agent runtime, native testing API, TTS
- **Twilio** (or any SIP provider) — phone leg
- The harness assumes ElevenLabs hosts the agent runtime; we do not reproduce the platform locally

### Workflow integration (optional)
- **n8n** — example webhook host for tool execution and post-call processing
- The `n8n-eval` and `mcp` runners can be pointed at any n8n instance via env vars

### LLM / extraction
- **arktype** — runtime schema validation
- **Vitest** — test runner with project-based suites (offline / live / governance / agent-evals)
- Judge LLMs are scenario-specified (e.g. `claude-haiku-4-5` for tone/empathy axes)

### Runtime
- **Bun** for execution (`bun run`, `bun install`). Tests use Vitest, not `bun test`.
- **TypeScript 5.9** with strict types
- **xo** for linting (per the user's global JS/TS regime)

## Repo layout

| Path | Purpose |
|---|---|
| `lib/testing/` | runner library: `runners/elevenlabs`, `runners/n8n-eval`, `runners/mcp`, `runners/webhook`; ingestion; CLI |
| `lib/extraction/` | structured extraction from transcripts and post-call payloads |
| `lib/agent_evals/` | agent-eval runtime, fixtures, repos |
| `scripts/` | runner entry points (`test-elevenlabs-runner`, `test-mcp-runner`, `test-n8n-eval-runner`) and ops utilities (`health-check`, `monitor-executions`, `list-workflows`, `ingest-and-run`) |
| `tests/scenarios/` | scenario fixtures (transcripts + YAML); `_template/` is the canonical schema |
| `tests/runs/` | committed eval-run outputs (proof of reproducibility) |
| `templates/` | reusable agent and tool config templates |
| `lib/security/` | webhook signature verification (HMAC-SHA256 over `<timestamp>.<body>`) |
| `docs/` | methodology, tool-calling, webhook-security, contributor walkthrough, model-update playbook |

## Conventions

- **Determinism**: every scenario in `tests/scenarios/` is reproducible bit-for-bit. No `Date.now()` in assertions; LLM judges run with `seed` set when supported.
- **Latency-first**: a scenario without thresholds for at least one latency axis fails to register. Voice is real-time; latency is not optional.
- **Prompt versioning**: tag every prompt change `prompt/<name>/v<N>` on commit. Rollbacks are addressable via `git checkout <tag> -- prompts/<name>.md`.
- **Server-side tools only** (for phone agents): the harness refuses to evaluate a "client-side" scenario against a server-side tool definition.
- **No real customer data in fixtures**: synthetic phone numbers (`+15550100`–`+15550199`), synthetic agent IDs (`agent_xxxx_demo`).

## What this is not

- Not a deployment tool. It does not push prompts to ElevenLabs; bring your own deploy.
- Not a manual exploration tool. ElevenLabs ships a dashboard simulator for that. This is the regression layer.
- Not multi-tenant. One repo per agent suite is the recommended pattern.

## See also

- [`README.md`](../README.md) — quick start
- [`docs/methodology.md`](../docs/methodology.md) — eval scoring rubric
- [`docs/extending-the-harness.md`](../docs/extending-the-harness.md) — adding a scenario
- [`RUNBOOK.md`](../RUNBOOK.md) — operational diagnostics
