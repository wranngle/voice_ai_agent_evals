# voice_ai_agent_evals

[![elevenlabs](https://img.shields.io/badge/elevenlabs-ff5f00?style=flat-square)](https://elevenlabs.io/)
[![voice-agents](https://img.shields.io/badge/voice--agents-cf3c69?style=flat-square)](#)
[![eval-harness](https://img.shields.io/badge/eval--harness-12111a?style=flat-square)](#)
[![CI](https://img.shields.io/badge/CI-passing-5d8c61?style=flat-square)](.github/workflows/test.yml)

> Eval harness for ElevenLabs voice agents — deterministic scenarios, real latency budgets, real Sarah.

<!-- Loom: 90-sec demo of the harness catching a real Sarah failure (P4 from the spec). Placeholder until recorded. -->
<!-- Replace this comment with: <a href="https://www.loom.com/share/<id>"><img src="https://cdn.loom.com/sessions/thumbnails/<id>-with-play.gif"></a> -->

| Scenarios | Latency target met (p95) | Last run |
|---|---|---|
| 12 | TTFB ≤800 ms · audio ≤1.4 s · turn ≤3.0 s | see `tests/runs/` |

## What this is

Test runner and scenario framework for evaluating ElevenLabs voice agents. Deterministic via seeded synthetic transcripts and recorded audio fixtures; explicit latency budgets (TTFB p95 ≤ 800 ms, end-to-first-audio p95 ≤ 1.4 s, total-turn p95 ≤ 3.0 s); prompt versioning via git tags (`prompt/primary/vN`); scoring rubric in [`docs/methodology.md`](docs/methodology.md). Wired to **Sarah** — ExampleCo's production inbound voice SDR, deployable today (see [`docs/deployment.md`](docs/deployment.md)) — for regression testing. Sample eval-run output committed at [`tests/runs/`](tests/runs/).

## Run it

```bash
bun install
bun test                              # full suite against the example registry
bun test --mock                       # explicit mock mode (no live ElevenLabs calls)
bun test --filter <scenario-name>     # one scenario
```

CI runs against `agent-registry.example.yaml` (placeholder IDs) so the harness exercises end-to-end without any secrets. To wire to your live agent, copy `agent-registry.example.yaml` → `agent-registry.yaml` (gitignored) and fill in real IDs.

## What's in here

- **`scripts/`** — runners (`test-elevenlabs-runner`, `test-mcp-runner`, `test-n8n-eval-runner`) plus the Sarah-specific management scripts (`add-send-sms-tool`, `update-agent`, `verify-prompt`, etc.)
- **`lib/extraction/`** — structured extraction from transcripts/post-call payloads
- **`lib/testing/`** — runner library (the `runners/` and `ingestion/` modules)
- **`prompts/primary.md`** — canonical agent prompt (versioned via `prompt/primary/vN` git tags)
- **`templates/`** — reusable agent and tool config templates (`elevenlabs-agents/`, `voice-agents/`, `email/`, `sms-booking-tool-template.json`)
- **`workflows/evaluations/`** — eval YAMLs for ElevenLabs/voice-agent scenarios (Sarah, transcript extraction, voice-agent tester, etc.)
- **`tests/`** — scenario fixtures (`scenarios/`) and committed eval-run outputs (`runs/`)
- **`docs/`** — methodology, tool calling, webhook security, deployment, contributor walkthrough, model-update playbook

## Documentation

- [`docs/methodology.md`](docs/methodology.md) — eval philosophy: determinism, latency budgets, prompt + agent-config versioning, scoring rubric, voice-specific axes (barge-in, prosody, ASR confidence, timeout), tool-call evaluation
- [`docs/tool-calling.md`](docs/tool-calling.md) — server-side vs. client-side tools, `agent.prompt.tools` schema, KB-vs-tool boundary, end-to-end SMS booking tool walkthrough
- [`docs/webhook-security.md`](docs/webhook-security.md) — `ElevenLabs-Signature` header verification (HMAC-SHA256 over `<timestamp>.<body>`), defensive stance
- [`docs/deployment.md`](docs/deployment.md) — Agent deployment context (production-shaped, low-volume because pre-revenue)
- [`docs/extending-the-harness.md`](docs/extending-the-harness.md) — 5-step contributor flow for adding a new scenario
- [`docs/handling-model-updates.md`](docs/handling-model-updates.md) — playbook for "ElevenLabs ships a new voice / TTS / LLM model"
- [`RUNBOOK.md`](RUNBOOK.md) — operational runbook (rollback, CI failure repro, ElevenLabs 5xx, webhook debug)

## Sarah on the public surface

The agent is the production inbound voice SDR for [example.com](https://example.com). The agent ID and dial-in number are public on that site, so they're not secret here either. The full operational registry (`agent-registry.yaml`) is gitignored; the placeholder shape (`agent-registry.example.yaml`) is the only public form.

## Brand system

This repo vendors `tokens/` from `example/gtm_ops`. The long-form spec lives at [`gtm_ops/DESIGN.md`](https://github.com/example/gtm_ops/blob/main/DESIGN.md).

## License

See [`LICENSE`](LICENSE).
