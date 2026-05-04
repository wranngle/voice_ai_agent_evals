# Extending the harness — adding a new scenario

Scenario YAMLs are the canonical record of what the harness *intends* to evaluate. Today the runner captures a single round-trip latency per scenario and exposes assertion shapes per runner type (webhook / elevenlabs / n8n-eval / mcp); the per-axis scoring engine the YAMLs declare is **not yet wired** (see `docs/methodology.md` "What's not implemented yet"). Drop scenarios in anyway — they document intent and become live the moment the scoring engine ships.

## 1. Drop a transcript fixture in `tests/scenarios/`

```bash
tests/scenarios/<scenario-id>/
├── scenario.yaml      # axes, thresholds, success criteria (declarative; not yet executed)
├── transcript.json    # seeded synthetic transcript OR
└── audio.wav          # recorded audio fixture (optional)
```

Use `tests/scenarios/_template/` as the starting point. Pick a scenario id that's descriptive and kebab-cased: `barge-in-mid-question`, `tool-call-crm-503`, `low-asr-confidence-zip-code`.

## 2. Add the scenario YAML

```yaml
id: <scenario-id>
description: One-line description of what this scenario exercises.
agent: <your-agent-key>           # matches an entry in agent-registry.yaml
fixture:
  transcript: transcript.json
  # OR audio: audio.wav

# Axes the harness will score (declared as conventions; scoring engine is on the roadmap).
axes:
  - name: barge_in_recovery
  - name: tool_call_schema
  - name: ttfb_p95

# Hard thresholds (declared; not yet enforced — see methodology.md).
thresholds:
  ttfb_p95_ms: 800
  total_turn_p95_ms: 3000

success_criteria:
  - axis: barge_in_recovery
    expected: true
    weight: 1.0
  - axis: tool_call_schema
    expected: { name: lookup_record, parameters_pass: true }
    weight: 1.0

partial_credit: true        # passes if weighted score ≥ 0.7
judge_llm: claude-haiku-4-5  # for any subjective axis (tone/empathy/clarity)
```

There is currently no scenario-defaults file; the YAML above is the full shape. Once the scoring engine lands, defaults will live in `lib/testing/` alongside the loader.

## 3. Run the offline suite

```bash
bun run test:offline                                # full offline suite (vitest)
bun run test:watch                                  # vitest watch mode
bun run testing run <test-id>                       # storage-backed CLI (.test-data/)
```

The vitest-driven projects exercise the runner contracts (webhook / elevenlabs / n8n-eval / mcp / ingestion / governance / agent_evals / integration) with mocked HTTP. Real-network exercise lives in the standalone `testing:live:*` scripts.

## 4. Commit

```bash
git add tests/scenarios/<scenario-id>/
git commit -m "scenario: <description>"
```

CI runs the offline suite on every push.

## Anti-patterns that will get caught in review

- **Non-deterministic fixtures.** Scenarios that call wall-clock `Date.now()` or rely on the live agent for fixture generation. Every fixture must be reproducible bit-for-bit.
- **Real customer data in fixtures.** Use synthetic phone numbers (`+15550100`–`+15550199`), synthetic names, synthetic agent IDs (`agent_xxxx_demo`). The harness will refuse a fixture matching the live `agent-registry.yaml` IDs.
- **Subjective axis without a judge.** Any `tone`, `empathy`, `clarity`-style axis must declare `judge_llm` in the scenario YAML.
- **Missing thresholds.** A scenario without thresholds for at least one latency axis fails to register. The platform is voice; latency is not optional.

## Where to look when something breaks

- Runner can't find a fixture → check `tests/scenarios/<id>/scenario.yaml` paths are relative to that directory.
- Vitest project not picking up your test → confirm the file lives under one of the project includes in `vitest.config.ts`.
- CI passes but local fails → check `bun.lock` parity and that `.env` doesn't shadow CI defaults.

For richer debugging, [`RUNBOOK.md`](../RUNBOOK.md) has the operational diagnostic flows.
