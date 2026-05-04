# Extending the harness — adding a new scenario

Five steps. ~10 minutes once you know the pattern.

## 1. Drop a transcript fixture in `tests/scenarios/`

```bash
tests/scenarios/<scenario-id>/
├── scenario.yaml      # axes, thresholds, success criteria
├── transcript.json    # seeded synthetic transcript OR
└── audio.wav          # recorded audio fixture (optional)
```

Use `tests/scenarios/_template/` as the starting point — it has the canonical YAML keys with comments. Pick a scenario id that's descriptive and kebab-cased: `barge-in-mid-question`, `tool-call-crm-503`, `low-asr-confidence-zip-code`.

## 2. Add the scenario YAML

```yaml
id: <scenario-id>
description: One-line description of what this scenario exercises.
agent: <your-agent-key>           # matches an entry in agent-registry.yaml
fixture:
  transcript: transcript.json
  # OR audio: audio.wav

# Axes the harness will score
axes:
  - name: barge_in_recovery
  - name: tool_call_schema
  - name: ttfb_p95

# Hard thresholds (override defaults from methodology.md if needed)
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
judge_llm: claude-haiku-4-5  # for any subjective axis
```

Every key has a default in `lib/testing/scenario-defaults.ts`; only override what you need.

## 3. (Optional) Add a custom assertion in `lib/testing/`

If your scenario needs an assertion that doesn't already exist as a built-in axis, add it as a function in `lib/testing/assertions/`:

```ts
// lib/testing/assertions/no-filler-words.ts
export function noFillerWords(transcript: Turn[]): AxisResult {
  const fillers = ["um", "uh", "like", "you know"];
  const violations = transcript
    .filter((t) => t.role === "agent")
    .flatMap((t) => fillers.filter((f) => t.text.toLowerCase().includes(f)));
  return {
    name: "no_filler_words",
    pass: violations.length === 0,
    detail: violations.length ? `${violations.length} filler word(s)` : "clean",
  };
}
```

Register it in `lib/testing/assertions/index.ts`. The runner picks up new axes automatically; `scenario.yaml` can reference `name: no_filler_words` immediately.

## 4. Run locally

```bash
bun run test --project agent_evals -- <scenario-id>   # just this one
bun run test:watch                                    # live re-run on edit
bun run test:offline                                  # full suite, no live agent calls
```

A passing run drops a sample output at `tests/runs/<scenario-id>-<timestamp>/`; a failing run also writes a `NOTE.md` postmortem stub.

## 5. Commit

```bash
git add tests/scenarios/<scenario-id>/
git add lib/testing/assertions/<assertion>.ts  # if step 3 applied
git commit -m "scenario: <description>"
```

CI runs the full suite on every push. Your scenario lands in the regression set immediately.

## Anti-patterns that will get caught in review

- **Non-deterministic fixtures.** Scenarios that call wall-clock `Date.now()` or rely on the live agent for fixture generation. Every fixture must be reproducible bit-for-bit.
- **Real customer data in fixtures.** Use synthetic phone numbers (`+15550100`–`+15550199`), synthetic names, synthetic agent IDs (`agent_xxxx_demo`). The harness will refuse a fixture matching the live `agent-registry.yaml` IDs.
- **Subjective axis without a judge.** Any `tone`, `empathy`, `clarity`-style axis must declare `judge_llm` in the scenario YAML. The harness rejects scenarios that ask the runner to "feel" something without an explicit judge.
- **Missing thresholds.** A scenario without thresholds for at least one latency axis fails to register. The platform is voice; latency is not optional.

## Where to look when something breaks

- Schema validation errors → `lib/testing/scenario-loader.ts`
- Runner can't find a fixture → check `tests/scenarios/<id>/scenario.yaml` paths are relative to that directory
- Custom assertion not picked up → register it in `lib/testing/assertions/index.ts`
- CI passes but local fails → check that local has the same node/bun version (`.mise.toml` in repo root)

For richer debugging, [`RUNBOOK.md`](../RUNBOOK.md) has the operational diagnostic flows.
