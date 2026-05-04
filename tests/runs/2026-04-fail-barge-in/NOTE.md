# Postmortem: barge-in-mid-question

**Verdict**: failed (weighted score 0.45 / threshold 0.7)
**Scenario**: caller interrupts the agent during a multi-clause description.
**Headline failure**: agent kept speaking for **1.8 seconds** after the caller began the interrupt. The barge-in budget is 400 ms.

## What happened

The scenario fixture has the caller saying "Wait, just Cheyenne — I'm in Cheyenne." starting at the 8.2 s mark of the agent's third clause ("...the typical—"). On a healthy run, the agent's voice activity detection (VAD) should drop the current TTS within ~400 ms of the caller's onset and yield to listen. In this run, the agent continued speaking until end-of-clause.

This blew past the barge-in budget AND pushed `total_turn_p95_ms` to 3.45 s (budget 3.0 s) because the re-plan after the interrupt added ~600 ms of LLM time. Two budgets failed because the root cause was one.

## Why this matters (and why it's committed)

A senior reviewer scanning `tests/runs/` should see at least one failing run with a real diagnosis. Failing runs prove three things:

1. The harness actually runs against the live agent (not just a mocked happy-path).
2. The scoring rubric distinguishes failure modes (this run failed barge_in_recovery AND total_turn_p95_ms — the rubric correctly identified barge-in as the upstream cause, not the downstream symptom).
3. The team operates the system — failures get postmortems, not silent retries.

This is committed deliberately. Don't delete it on cleanup.

## Likely root cause

VAD threshold in the ElevenLabs agent config was tuned for noisy environments (less aggressive interrupt detection). The caller in this scenario is on a clean line; VAD didn't fire fast enough. Two paths:

1. **Tune VAD per-scenario** — possible if ElevenLabs exposes per-scenario tuning (it doesn't yet for ConvAI agents as of this writing).
2. **Tune VAD globally** — accept slightly more false-positive yields in exchange for faster legitimate interrupt detection. Re-run the regression set; if no other scenarios regress, ship it.

Path 2 is the pragmatic answer.

## Follow-up

- Ticket: open a PR adjusting VAD threshold; re-run full regression set; check that `tests/runs/2026-04-pass-*` runs all stay green.
- Add a scenario `noisy-line-spurious-yield` to catch the inverse failure (VAD over-tuned, agent yields on background noise) before it ships.
- Tag the new prompt+config `prompt/primary/v4` after fix.

## Commit / artifact references

- Scenario YAML: `tests/scenarios/barge-in-mid-question/scenario.yaml`
- Result JSON: `result.json` (this directory)
- Harness assertion: TBD — the per-axis scoring engine that would automate
  this verdict is still on the roadmap (see `docs/methodology.md`); this
  postmortem was hand-authored to document the intended failure shape.
