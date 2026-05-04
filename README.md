# voice_ai_agent_evals

[![elevenlabs](https://img.shields.io/badge/elevenlabs-ff5f00?style=flat-square)](https://elevenlabs.io/)
[![voice-agents](https://img.shields.io/badge/voice--agents-cf3c69?style=flat-square)](#)
[![eval-harness](https://img.shields.io/badge/eval--harness-12111a?style=flat-square)](#)

> Bulk eval harness for ElevenLabs voice agents — deterministic scenarios, explicit latency budgets, regression-grade.

## What this is

Test runner and scenario framework for evaluating ElevenLabs Conversational AI voice agents in bulk. Deterministic via seeded synthetic transcripts; explicit latency budgets (TTFB, end-to-first-audio, total-turn p95s); prompt versioning via git tags. Bring-your-own agent — point the harness at any agent ID, drop in a scenario YAML, get pass/fail with assertion-level detail. See [`docs/methodology.md`](docs/methodology.md) for the scoring rubric and voice-specific axes (barge-in, prosody, ASR confidence, timeout).

## Run it

```bash
bun install

# Offline tests — runs against fixtures, no secrets needed
bun run test:offline

# Live tests — require ELEVENLABS_API_KEY (and N8N_API_URL/N8N_API_KEY for n8n-eval)
bun run testing:live:el       # ElevenLabs runner against a real agent
bun run testing:live:n8n      # n8n eval runner against a deployed workflow
bun run testing:live:mcp      # MCP runner

# CLI
bun run testing list
bun run testing run <test-id>
```

To wire to your live agent, copy `agent-registry.example.yaml` → `agent-registry.yaml` (gitignored) and fill in real IDs, or set `ELEVENLABS_AGENT_ID` directly.

## What's in here

- **`lib/testing/`** — runner library: `runners/` (elevenlabs, n8n-eval, mcp, webhook), `ingestion/`, CLI
- **`lib/extraction/`** — structured extraction from transcripts and post-call payloads
- **`lib/agent_evals/`** — agent-eval runtime + fixtures
- **`scripts/`** — runner entry points (`test-elevenlabs-runner`, `test-mcp-runner`, `test-n8n-eval-runner`) and harness utilities (`health-check`, `monitor-executions`, `list-workflows`, `setup-automation`, `ingest-and-run`)
- **`templates/`** — reusable agent and tool config templates (`elevenlabs-agents/`, `voice-agents/`, `email/`, `sms-booking-tool-template.json`)
- **`workflows/evaluations/`** — example eval YAMLs (transcript extraction, voice-agent-tester, get-elevenlabs-agent)
- **`tests/`** — scenario fixtures (`scenarios/`) and committed eval-run outputs (`runs/`)
- **`docs/`** — methodology, tool calling, webhook security, contributor walkthrough, model-update playbook

## Documentation

- [`docs/methodology.md`](docs/methodology.md) — eval philosophy: determinism, latency budgets, prompt versioning, scoring rubric, voice-specific axes
- [`docs/tool-calling.md`](docs/tool-calling.md) — server-side vs. client-side tools, `agent.prompt.tools` schema, KB-vs-tool boundary
- [`docs/webhook-security.md`](docs/webhook-security.md) — `ElevenLabs-Signature` header verification (HMAC-SHA256 over `<timestamp>.<body>`)
- [`docs/extending-the-harness.md`](docs/extending-the-harness.md) — adding a new scenario
- [`docs/handling-model-updates.md`](docs/handling-model-updates.md) — playbook for ElevenLabs model updates
- [`RUNBOOK.md`](RUNBOOK.md) — operational runbook

## License

See [`LICENSE`](LICENSE).
