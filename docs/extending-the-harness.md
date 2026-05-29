# Extending the harness — adding a new scenario

Scenario YAMLs are executable offline evals. The CLI discovers `tests/scenarios/<id>/scenario.yaml`, loads its deterministic `transcript.json` (and optional `audio.wav`), and scores the committed axes the offline runner supports today:

- **Voice / audio (DSP, `src/scoring/audio.ts`):** voice activity, barge-in recovery, AI-interrupting-user, signal-to-noise ratio, average pitch, words-per-minute.
- **Tool calling:** schema conformance, tool-vs-KB routing, tool-call round-trip latency.
- **Latency budgets:** fixture-p95 `ttfb_p95_ms`, `end_to_first_audio_p95_ms`, `total_turn_p95_ms`.
- **Outcome / aggregate (`src/scoring/dialog.ts`):** not-early-termination, containment rate.
- **LLM-judged (`src/scoring/judges/` + `src/scoring/rubrics.ts`):** g-eval / arena / DAG / Lynx judges; canonical rubrics for intent recognition, instruction following, task completion, first-call resolution, customer satisfaction, AI→human handoff, response consistency.
- **Tone heuristics** (deterministic fallback used when no `judge_llm` is configured).

What's still roadmap: **live mic-stream audio analysis** during a `simulateConversation` call (today's audio scorers consume committed WAV fixtures, not realtime), and **live-call LLM judging** (the judges run on transcripts post-call, not during).

## 1. Drop a transcript fixture in `tests/scenarios/`

```bash
tests/scenarios/<scenario-id>/
├── scenario.yaml      # axes, thresholds, success criteria
├── transcript.json    # seeded synthetic transcript with fixture metrics OR
└── audio.wav          # recorded audio fixture (optional)
```

Use `tests/scenarios/_template/` as the starting point. Pick a scenario id that's descriptive and kebab-cased: `barge-in-mid-question`, `tool-call-crm-503`, `low-asr-confidence-zip-code`.

## 2. Add the scenario YAML

```yaml
id: <scenario-id>
description: One-line description of what this scenario exercises.
agent: <your-agent-key>           # operator-convention key; resolved by your own tooling
fixture:
  transcript: transcript.json
  # OR audio: audio.wav

# Axes the offline scenario runner can score today.
axes:
  - name: tool_call_schema
  - name: tool_call_routing
  - name: tool_call_round_trip_ms
  - name: ttfb_p95_ms
  - name: total_turn_p95_ms
  # Add barge_in_recovery only when transcript.json contains a barge-in event.

# Hard thresholds enforced when the transcript fixture includes the metric.
# At least one latency threshold is required.
thresholds:
  tool_call_round_trip_ms: 2000
  ttfb_p95_ms: 800
  total_turn_p95_ms: 3000

success_criteria:
  - axis: tool_call_schema
    expected: { name: lookup_record, parameters_pass: true, response_consumed_in_next_turn: true }
    weight: 1.0
  - axis: tool_call_routing
    expected: { route: tool, name: lookup_record }  # or "tool" for any tool, "kb" for no tool call
    weight: 1.0
  - axis: tool_call_round_trip_ms
    expected: { name: lookup_record }
    weight: 0.5
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.5
  - axis: total_turn_p95_ms
    expected: pass
    weight: 0.5

partial_credit: true        # passes if weighted score ≥ 0.7 (measured latency-budget breaches, tool schema failures, and routing failures still hard-fail)
judge_llm: claude-haiku-4-5  # for any subjective axis (tone/empathy/clarity)
```

There is currently no scenario-defaults file; the YAML above is the full shape. Unsupported axes fail closed with a clear "no offline scorer registered" dimension instead of silently passing.

## 3. Run the offline suite

```bash
bun run test:offline                                # full offline suite (vitest)
bun run test:watch                                  # vitest watch mode
bun run testing list -t scenario                    # discovered scenario fixtures
bun run testing run --id SCEN-<scenario-id>         # storage-backed CLI (.test-data/)
bun run testing run -t scenario                     # run every committed scenario
```

The vitest-driven projects exercise the runner contracts (webhook / elevenlabs / n8n-eval / mcp / ingestion / governance / agent_evals / integration) with mocked HTTP. Real-network exercise lives in the standalone `testing:live:*` scripts. A committed intentionally failing scenario will make `bun run testing run -t scenario` exit nonzero; use `--id` while authoring a single scenario.

## 4. Commit

```bash
git add tests/scenarios/<scenario-id>/
git commit -m "scenario: <description>"
```

CI runs the offline suite on every push.

## Anti-patterns that will get caught in review

- **Non-deterministic fixtures.** Scenarios that call wall-clock `Date.now()` or rely on the live agent for fixture generation. Every fixture must be reproducible bit-for-bit.
- **Real customer data in fixtures.** Use synthetic phone numbers (`+15550100`–`+15550199`), synthetic names, and synthetic demo agent IDs (`agent_xxxx_demo`). The scenario loader rejects real-looking E.164 phone numbers and transcript `agent_id` values that do not end in `_demo`.
- **Subjective axis without a judge.** Any `tone`, `empathy`, `clarity`-style axis must declare `judge_llm` in the scenario YAML.
- **Missing thresholds.** A scenario without thresholds for at least one latency axis fails to register. The platform is voice; latency is not optional.
- **No-op axes.** `barge_in_recovery` fails unless the transcript includes an `agent_yielded_at_ms_after_caller_start` event. Do not claim interruption coverage from a normal turn-taking fixture.
- **Tool latency without evidence.** `tool_call_round_trip_ms` fails unless every matching tool call in `transcript.json` includes numeric `round_trip_ms` evidence.

## Where to look when something breaks

- Runner can't find a fixture → check `tests/scenarios/<id>/scenario.yaml` paths are relative to that directory.
- Vitest project not picking up your test → confirm the file lives under one of the project includes in `vitest.config.ts`.
- CI passes but local fails → check `bun.lock` parity and that `.env` doesn't shadow CI defaults.

For richer debugging, [`RUNBOOK.md`](../RUNBOOK.md) has the operational diagnostic flows.
