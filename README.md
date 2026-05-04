# voice_ai_agent_evals

[![CI](https://github.com/wranngle/voice_ai_agent_evals/actions/workflows/vitest.yml/badge.svg)](https://github.com/wranngle/voice_ai_agent_evals/actions/workflows/vitest.yml)
[![License: MIT](https://img.shields.io/github/license/wranngle/voice_ai_agent_evals?style=flat-square)](LICENSE)

> Bulk eval harness for ElevenLabs voice agents — deterministic scenarios, total-turn latency capture, prompt versioning via git tags.

## What this is

Test runner and scenario framework for evaluating ElevenLabs Conversational AI voice agents in bulk. Deterministic via seeded synthetic transcripts; total-turn latency captured per test (`latency_ms` per result, `avg_latency_ms` and slowest-test in the run summary); prompt versioning via git tags. Bring-your-own agent — point the harness at any agent ID, drop in a scenario YAML, get pass/fail with assertion-level detail.

### What's implemented today

- **Total-turn latency** captured per test as `latency_ms`; `avg_latency_ms` and slowest-test surfaced in the run summary.
- **Webhook + n8n + ElevenLabs + MCP runners**, each with its own assertion shape (`response_contains`, `output_contains`, `execution_status`, etc.).
- **Vitest project layout** that segregates offline (no secrets) from live (needs API keys) tests.
- **Scenario YAML discoverability**: `bun run testing list` surfaces every `tests/scenarios/<id>/scenario.yaml` alongside ingested test cases. The CLI extracts the `description:` line; deeper fields aren't parsed yet.

### What's *not* implemented yet (known gaps)

The following are documented intent and YAML conventions, **not yet enforced by the runner**:

- **Scenario YAMLs as runnable test cases.** The YAML schema in `tests/scenarios/_template/scenario.yaml` declares `axes`, `thresholds`, `success_criteria`, `judge_llm` — none of those keys are read by code today. Scenarios show up in `testing list` (description-only); they don't execute.
- **TTFB / end-to-first-audio split.** The runner measures one round-trip number per test, not separate TTFB / first-audio / total-turn. Per-segment budgets in `tests/scenarios/*/scenario.yaml` are aspirational.
- **p95 / p99 aggregation across runs.** Per-test latency is captured, but no rolling-window p95 enforcement.
- **Voice-specific scoring axes** (barge-in recovery, ASR confidence, TTS prosody, timeout handling) — declared in scenario YAMLs, but no scoring engine yet reads them.
- **LLM-judge axes** (tone, empathy) — same: declared, not wired.

These are the next slices of work, not a finished feature.

## Run it

```bash
bun install

# Offline tests — pure logic + runner UNIT tests (mocked fetch). No secrets needed.
# Covers: ingestion, integration, governance, agent_evals, elevenlabs, n8n-eval, mcp.
bun run test:offline

# Live tests — actually hit real endpoints. Require API keys and run locally.
# These are STANDALONE SCRIPTS, not vitest tests.
bun run testing:live:el       # POSTs to api.elevenlabs.io/v1/convai/agents/<id>/simulate-conversation
bun run testing:live:n8n      # POSTs to your n8n webhook host
bun run testing:live:mcp      # POSTs to your n8n MCP-style workflow

# Webhook tests against a deployed receiver — vitest project that auto-skips in CI.
bun run test:webhook

# CLI (stored test cases & runs under .test-data/)
bun run testing list
bun run testing run <test-id>
```

To wire to your live agent, copy `agent-registry.example.yaml` → `agent-registry.yaml` (gitignored) and fill in real IDs, or set `ELEVENLABS_AGENT_ID` directly.

## What's in here

- **`lib/testing/`** — runner library: `runners/` (elevenlabs, n8n-eval, mcp, webhook), `ingestion/`, CLI
- **`lib/extraction/`** — structured extraction from transcripts and post-call payloads
- **`lib/agent_evals/`** — agent-eval runtime + fixtures
- **`scripts/`** — runner entry points (`test-elevenlabs-runner`, `test-mcp-runner`, `test-n8n-eval-runner`) and harness utilities (`health-check`, `monitor-executions`, `list-workflows`, `ingest-and-run`)
- **`templates/`** — reusable agent and tool config templates (`elevenlabs-agents/`, `voice-agents/`, `email/`, `sms-booking-tool-template.json`)
- **`tests/scenarios/`** — runnable scenario fixtures (transcript + scenario.yaml). `_template/` is the canonical schema; copy and edit.
- **`tests/runs/`** — hand-authored synthetic result.json + NOTE.md examples that document the intended shape of a passing and failing run. Once the per-axis scoring engine lands (see "known gaps"), real eval-run outputs will be produced into the same shape.
- **`docs/`** — methodology, tool calling, webhook security, contributor walkthrough, model-update playbook

## Documentation

- [`docs/methodology.md`](docs/methodology.md) — eval philosophy: determinism, prompt versioning, scoring rubric, voice-specific axes (most are aspirational — see "known gaps" above)
- [`docs/tool-calling.md`](docs/tool-calling.md) — server-side vs. client-side tools, `agent.prompt.tools` schema, KB-vs-tool boundary
- [`docs/webhook-security.md`](docs/webhook-security.md) — `ElevenLabs-Signature` header verification (HMAC-SHA256 over `<timestamp>.<body>`)
- [`docs/deployment.md`](docs/deployment.md) — operator setup: env vars, prompt-promotion flow, rollback flow
- [`docs/extending-the-harness.md`](docs/extending-the-harness.md) — adding a new scenario
- [`docs/handling-model-updates.md`](docs/handling-model-updates.md) — playbook for ElevenLabs model updates
- [`docs/elevenlabs-twilio-voiceagent/`](docs/elevenlabs-twilio-voiceagent/) — standalone smoke-test bundle (shell scripts + API references) for verifying ElevenLabs and Twilio credentials in a fresh sandbox
- [`RUNBOOK.md`](RUNBOOK.md) — operational runbook

## License

See [`LICENSE`](LICENSE).
