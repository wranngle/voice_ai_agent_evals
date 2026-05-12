# @wranngle/voice-evals

[![CI](https://github.com/wranngle/voice-evals/actions/workflows/vitest.yml/badge.svg)](https://github.com/wranngle/voice-evals/actions/workflows/vitest.yml)
[![License: MIT](https://img.shields.io/github/license/wranngle/voice-evals?style=flat-square)](LICENSE)
[![npm](https://img.shields.io/npm/v/@wranngle/voice-evals?style=flat-square)](https://www.npmjs.com/package/@wranngle/voice-evals)

> Audio-native voice AI agent eval, polish, and regression-test factory wrapping ElevenLabs Conversational AI — closed-loop performance evaluation, GEPA-driven prompt remediation, latency-budget-as-code, dynamic test detection from arbitrary conversational data via an LLM data-translation layer, packaged as a Bun-first TypeScript SDK.

## Status — v1.0 in progress

Repo is mid-migration from `voice_ai_agent_evals` (private eval harness) to `@wranngle/voice-evals` (published Bun package). The runtime under `src/` ships the v0.x harness surface today; the v1.0 architecture (ElevenLabs API wrapper, audio-native scoring, LLM test ingestion, baseline/diff regression, closed-loop remediation, polish CLI) is landing in phases on `feat/v1.0-bun-package` and will release as `1.0.0` once all phases are dogfooded.

See [`CHANGELOG.md`](CHANGELOG.md) for phase progress.

## What this is

Test runner and scenario framework for evaluating ElevenLabs Conversational AI voice agents in bulk. Deterministic via seeded synthetic transcripts; total-turn latency captured per test (`latency_ms` per result, `avg_latency_ms` and slowest-test in the run summary); prompt versioning via git tags. Bring-your-own agent — point the harness at any agent ID, drop in a scenario YAML, get pass/fail with assertion-level detail.

### What's implemented today

- **Total-turn latency** captured per test as `latency_ms`; `avg_latency_ms`, current-run `p95_latency_ms` / `p99_latency_ms`, and slowest-test surfaced in the run summary.
- **Webhook + n8n + ElevenLabs + MCP + external-command runners**, each with its own assertion shape (`response_contains`, `output_contains`, `execution_status`, exit code/output checks, etc.).
- **`gtm_ops` adapter**: reads `../gtm_ops/eval-harness.manifest.json` and runs the app-owned validation/eval commands without duplicating Playwright or Vitest semantics here.
- **Vitest project layout** that segregates offline (no secrets) from live (needs API keys) tests.
- **Scenario YAML execution**: `bun run testing list -t scenario` surfaces every `tests/scenarios/<id>/scenario.yaml`, and `bun run testing run --id SCEN-<id>` executes the YAML `axes`, `thresholds`, `success_criteria`, `partial_credit`, transcript fixture, latency fixture metrics, tool-call schema/routing/round-trip assertions, barge-in recovery, and tone heuristic.

### What's *not* implemented yet (known gaps)

- **Live TTFB / end-to-first-audio split.** Offline scenario fixtures can assert `ttfb_p95_ms`, `end_to_first_audio_p95_ms`, and `total_turn_p95_ms` when metrics are present in `transcript.json`; the live ElevenLabs runner still records one round-trip number per test rather than splitting the streaming voice path into TTFB / first-audio / total-turn.
- **p95 / p99 aggregation across runs.** Per-test latency and current-run percentiles are captured, but no rolling-window p95 enforcement.
- **Tool-call latency aggregation.** Per-call tool latency can be asserted from fixtures and live simulate responses, but there is no rolling p95/p99 view by tool yet.
- **More voice-specific axes**: barge-in recovery, tool schema/routing, fixture latency budgets, and tone heuristics are wired; ASR confidence, TTS prosody, interruption recovery, timeout handling, caller frustration/capability disappointment, and full audio fixture analysis are still gaps.
- **Live LLM-judge axes**: subjective axes can declare `judge_llm`, but the offline runner uses deterministic heuristics. It does not call a live judge model in CI.
- **Bulk live agent creation and factorial iteration**: the harness evaluates existing agents and app-owned adapters; it does not yet create/update ElevenLabs agents in bulk or run matrixed prompt/voice/tool permutations hands-free.
- **Operational monitoring**: webhook flow checks and n8n/MCP runners exist, but there is no persistent last-success dashboard, agent-change time series, or correlation view across agent updates yet.

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
bun run testing list -t scenario
bun run testing run --id SCEN-lookup-record-greeting
bun run testing run -t scenario   # exits nonzero if a committed scenario is failing
bun run testing run -t scenario --parallel --concurrency 4   # bounded concurrency for long suites

# App adapter: run gtm_ops through its manifest-owned test surface.
bun run testing:gtm-ops --root ../gtm_ops
bun run testing:gtm-ops --root ../gtm_ops --tag ui
```

To wire to your live agent, copy `agent-registry.example.yaml` → `agent-registry.yaml` (gitignored) and fill in real IDs, or set `ELEVENLABS_AGENT_ID` directly.

## What's in here

- **`src/testing/`** — runner library: `runners/` (elevenlabs, n8n-eval, mcp, webhook, external-command), `adapters/`, `ingestion/`, CLI
- **`src/extraction/`** — structured extraction from transcripts and post-call payloads (will be reshaped into `src/ingestion/` in Phase 3)
- **`src/agent_evals/`** — agent-eval runtime + fixtures
- **`src/security/`** — ElevenLabs HMAC signature verification
- **`scripts/`** — build (`build.mjs`), postinstall (`postinstall.mjs`), runner entry points (`test-elevenlabs-runner`, `test-mcp-runner`, `test-n8n-eval-runner`), and harness utilities (`health-check`, `monitor-executions`, `list-workflows`, `ingest-and-run`)
- **`templates/`** — reusable agent and tool config templates (`elevenlabs-agents/`, `voice-agents/`, `email/`, `sms-booking-tool-template.json`)
- **`tests/scenarios/`** — runnable scenario fixtures (transcript + scenario.yaml). `_template/` is the canonical schema; copy and edit.
- **`tests/runs/`** — hand-authored synthetic result.json examples for a passing and a failing run, with a postmortem `NOTE.md` alongside the failing example to document the failure-mode reasoning; live CLI runs persist normalized results under `.test-data/`.
- **`docs/`** — methodology, tool calling, webhook security, contributor walkthrough, model-update playbook

## v1.0 roadmap

Tracked under [`feat/v1.0-bun-package`](https://github.com/wranngle/voice-evals/tree/feat/v1.0-bun-package). Phases:

- **Phase 0** — package shell + build pipeline (`@wranngle/voice-evals`, ESM+CJS dual build, `exports`/`bin`/`files`, `peerDependency` on `@elevenlabs/elevenlabs-js`)
- **Phase 1** — ElevenLabs API wrapper (`src/wrapper/`) with `[PHASE]` governance + schema-clean PATCH cycle
- **Phase 2** — Inspect-AI-shaped scoring engine: composable scorers, audio-native (RMS-energy barge-in, basic prosody on WAV PCM 48kHz), `not-*` negation grammar, G-Eval / ArenaGEval / DAG / Lynx judges
- **Phase 3** — LLM data layer (TestChain Proposer/Designer/Judge) for arbitrary conversational data → structured assertions, persona-driven synthetic users, PyRIT adversarial bridge
- **Phase 4** — versioned-dataset baselines + Braintrust-shaped diff API + drift gates + trace-to-test
- **Phase 5** — closed-loop remediation via GEPA optimizer (Python sidecar), `[DEV]`-only governance gate, iterative polish loop
- **Phase 6** — split CLI, docs site, matrix CI (Bun + Node 20/22), npm release

## Documentation

- [`docs/methodology.md`](docs/methodology.md) — eval philosophy: determinism, prompt versioning, scoring rubric, implemented fixture axes, and remaining live-agent gaps
- [`docs/tool-calling.md`](docs/tool-calling.md) — server-side vs. client-side tools, `agent.prompt.tools` schema, KB-vs-tool boundary
- [`docs/webhook-security.md`](docs/webhook-security.md) — `ElevenLabs-Signature` header verification (HMAC-SHA256 over `<timestamp>.<body>`)
- [`docs/deployment.md`](docs/deployment.md) — operator setup: env vars, prompt-promotion flow, rollback flow
- [`docs/external-app-adapters.md`](docs/external-app-adapters.md) — app-owned command manifests and the `gtm_ops` adapter
- [`docs/extending-the-harness.md`](docs/extending-the-harness.md) — adding a new scenario
- [`docs/handling-model-updates.md`](docs/handling-model-updates.md) — playbook for ElevenLabs model updates
- [`docs/elevenlabs-twilio-voiceagent/`](docs/elevenlabs-twilio-voiceagent/) — standalone smoke-test bundle (shell scripts + API references) for verifying ElevenLabs and Twilio credentials in a fresh sandbox
- [`RUNBOOK.md`](RUNBOOK.md) — operational runbook

## License

See [`LICENSE`](LICENSE).
