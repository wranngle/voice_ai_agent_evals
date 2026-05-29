# Handling ElevenLabs model updates

Playbook for: ElevenLabs ships a new voice, TTS, or LLM model. ElevenLabs models update; agents regress. This is how this repo handles that.

## The risk

A new ElevenLabs voice or TTS model can subtly change pacing, prosody, or filler-word frequency. A new LLM (or a silent provider-side LLM update) can shift tool-calling reliability, multi-turn coherence, or how aggressively the agent uses the knowledge base. Worst case: a model update silently regresses a production agent over a weekend.

The harness exists in part to catch this. The playbook below is what an operator runs when they see "new model available" in the ElevenLabs dashboard.

## Step-by-step

### 1. Tag the pre-update prompt + agent-config snapshot

Before you change anything, freeze the current state:

```bash
git tag prompt/<name>/v<N>          # current prompt
git push origin prompt/<name>/v<N>

# Also snapshot the live agent config:
bun run scripts/check-elevenlabs-agent.ts --snapshot > tests/runs/pre-update-snapshot.json
git add tests/runs/pre-update-snapshot.json
git commit -m "snapshot: pre-update agent config (tag prompt/<name>/v<N>)"
```

Without this, you can't roll back. With it, rollback is a one-line `git checkout`.

### 2. Run the regression set against the new model

In the ElevenLabs dashboard, select the new model on a **non-production agent** (clone your prod agent to a `<name>-staging` agent if you don't have one). Set `ELEVENLABS_AGENT_ID` to the staging agent and re-run. (Update `agent-registry.yaml` in parallel if your deploy tooling reads it; the harness itself only consults the env var.)

```bash
# Deterministic offline regression set — checked-in scenario fixtures.
# Exits nonzero on any regression.
bun run testing run -t scenario

# Live smoke against the staging agent (single hardcoded simulate-conversation
# request). Use this to confirm the new model actually answers; pair with the
# offline regression for axis-by-axis verdicts.
bun run testing:live:el
```

Any scenario that was passing against the old model and now fails is **a candidate regression** — but it could also be a real improvement that broke a too-strict assertion. Read the failing scenario's `tests/scenarios/<id>/scenario.yaml` and the runner output before deciding; don't auto-trust the harness's verdict.

### 3. Diff the scoring output against the pre-update snapshot

The harness ships `voice-evals compare` — a side-by-side per-axis scorecard for N runs. The first run is the baseline; deltas in the Δ columns are computed relative to it. Input shape is `RunResult[]` (one JSON file per agent / model version) — see `examples/compare/run-aria.json` for the canonical shape:

```json
{
  "agentId": "<old-or-new-model-id>",
  "scenario": "<scenario-or-suite-name>",
  "outcome": {
    "status": "passed | failed",
    "score": 0.91,
    "dimensions": [
      {"name": "barge_in_recovery", "status": "passed", "score": 0.85, "detail": "..."},
      {"name": "tool_call_schema",   "status": "passed", "score": 1.00, "detail": "..."}
    ],
    "errors": []
  }
}
```

```bash
# Capture the offline regression as JSON, then massage it into the RunResult shape
# (one file per model). `testing run --json` emits the suite summary, not
# per-agent RunResults, so you'll need a small jq step to project per-scenario.
bun run testing run -t scenario --json > tests/runs/<date>-new-model.raw.json
# ... project to RunResult[] per agent: tests/runs/<date>-new-model.json
#     and tests/runs/pre-update.json ...

bun run compare \
  --runs tests/runs/pre-update.json,tests/runs/<date>-new-model.json \
  --out  tests/runs/<date>-compare.html
```

The HTML renders a per-dimension table with old/new score per axis and a Δ column — axes that moved across multiple scenarios stand out (e.g. `barge_in_recovery` drops 15% → new TTS model has different pacing) vs one-scenario regressions (e.g. `tool_call_schema` on a single fixture → that scenario's prompt may need a small tweak). See `examples/compare/run-{aria,nova}.json` + the `demo:compare` script in `package.json` for a runnable end-to-end.

### 4. Decide: rollback, re-tune, or accept

Three outcomes. Pick one before any production deploy:

| Drift type | Decision |
|---|---|
| **Latency budgets blown across the board** (e.g. p95 TTFB +200ms) | **Rollback**. Pin the old model in the agent config until the new model is mature. |
| **One axis regressed by a fixable amount** (e.g. agent over-uses filler words) | **Re-tune the prompt**. Add explicit instructions, re-run the harness, commit a `prompt/<name>/v<N+1>`. |
| **A few legacy scenarios fail because the new model is genuinely better** (e.g. it routes to KB instead of tool, which was actually correct) | **Accept**. Update those scenarios' `success_criteria`, note the rationale in the PR description and the affected `tests/runs/<id>/NOTE.md`. |

Document the decision in the PR description and tag-message of the `prompt/<name>/v<N+1>` rollout — every reader should be able to retrace the decision.

### 5. Promote (or pin)

**To promote** the new model:

```bash
# (your own prompt deploy script)
git tag prompt/<name>/v<N+1>
git push origin prompt/<name>/v<N+1>
```

**To pin** the old model (defer the new one until later):

In the ElevenLabs agent config, explicitly set `llm: <old-model-id>` (don't leave it at `default`). Otherwise ElevenLabs may silently pull you onto the new model later. Re-run the harness afterward to confirm.

## Anti-patterns

- **"The new model passed in the dashboard simulator, ship it."** The dashboard sim doesn't run your scenario regressions or measure your latency budgets. Always run the harness.
- **"Just merge the prompt re-tune; we can roll back if needed."** Yes, but only if you tagged step 1. Without the tag, "roll back" means "guess what the prompt was last week."
- **"It only regressed on 1 of 12 scenarios."** That 1 scenario exists because someone hit that bug in production. Fix it or document why it no longer applies — don't quietly remove it.

## Cadence

This playbook runs whenever:

- ElevenLabs announces a new voice / TTS / LLM model
- The dashboard shows "default" as a different model than yesterday (silent provider update)
- A user / customer reports a behavior change you can't explain from your own commits

Treat the harness as the canonical answer to "did anything change?" The dashboard simulator is supplementary; the regression set is load-bearing.
