# `tests/_meta_audit/` — the unified hardening + roast suite

This directory holds two species of test that share one vitest project:

1. **Hardening checks** — passing assertions about the production state of the `[TEMPLATE]` agent and its supporting code (config shape, prompt structure, fast-fail webhook contract, data_collection schema, live agent reachability). These should be green.
2. **Spiritual shortcomings** — `it.fails`-marked aspirational contracts that the system *should* satisfy but does not yet. These pass today by failing-as-expected. When someone closes the gap, the `it.fails` flips and signals "promote me to a real test."

Together they answer two CEO-shaped questions in one place:

- "What did you do?" → Hardening checks.
- "What did you not do?" → Spiritual shortcomings.

---

## File map

| File | Type | What it proves |
|------|------|----------------|
| `template-shape.test.ts` | Hardening | The `[TEMPLATE]` snapshot has end_call enabled, the right TTS model, the four content guardrails on, no banned LLM. The v1 system prompt has the five canonical ElevenLabs sections in order, uses dynamic variables, and is under the 2MB cap. The data_collection template has the right shape and stays under the 25-field non-enterprise cap. |
| `template-webhook-fast-fail.test.ts` | Hardening | The reference responder in `src/webhook/client-initiation.ts` always returns a valid object inside 400ms even when every upstream hangs, throws, or returns junk. No `undefined` ever leaks. The n8n workflow mirrors this contract. |
| `template-roundtrip.test.ts` | Hardening (live, `skipIf(CI)`) | The live `[TEMPLATE]` agent is fetchable via HTTPS and matches our local snapshot's guardrails block. |
| `template-spiritual-shortcomings.test.ts` | Spiritual (all `it.fails`) | Ten aspirational contracts (see below). |

---

## The roast — what these tests do NOT prove

Brutal. Read in the voice of a cynical maintainer.

### Hardening tests — the cheap-signal indictments

**`template-shape.test.ts`** snapshots a JSON shape. It does not verify that the agent actually answers a phone call, doesn't crash mid-conversation, or routes correctly. An agent with `end_call` enabled and harassment guardrails on can still be misconfigured in a hundred unobservable ways — a dead voice ID, a tool wired to a non-existent endpoint, a `first_message` with placeholder text that leaks `{{undefined_variable}}` to the caller. The test asserts what's *configured*, not what *works*.

**`template-webhook-fast-fail.test.ts`** is an island. The TS reference responder is well-tested but the actual n8n workflow that will field the live calls is not. The n8n nodes could implement the contract differently and the test would never catch it. We're grading our own homework.

**`template-roundtrip.test.ts`** confirms the agent exists. That's it. It doesn't dial. It doesn't talk. It doesn't measure latency. A CEO watching this turn green should still ask "but does it work?" — and we wouldn't have an answer.

**The data_collection assertions** verify the template file but never check that the agent actually extracts these fields from a real conversation. Schema correctness ≠ extraction efficacy.

**The prompt-shape assertions** count headings. An LLM could be told `# Goal: be unhelpful` under correct headings and pass this test.

### What a CEO actually wants

A five-second video of a phone call where the agent does the job — captures the caller's name, phone, request, urgency, recaps cleanly, hangs up — and a single number for how often it succeeds across 100 trials with diverse personas. None of the hardening tests produce that. They produce a green checkmark in CI. The two are not the same thing.

### Spiritual shortcomings — what's missing, named

| ID | Contract that should hold |
|----|---------------------------|
| **E1** | There exists at least one test that initiates a live ElevenLabs call and verifies the agent's audible response via ASR. Today: `tests/webhook/*` is `skipIf(CI)`, `tests/el/*` mocks `fetch`, `tests/scenarios/*` is YAML-only. Nothing closes the audio loop. |
| **E2** | A post-call webhook delivery results in a row in some persistent store within 30s. Today: `src/ingestion/types.ts` types the payload; no handler writes anywhere. Post-call data is thrown away. |
| **E3** | There is a live integration test that posts to the client-initiation webhook and a real ElevenLabs agent uses the response. Today: the contract is only verified against the TS reference, not against the API. |
| **E4** | `governance.ts` rejects a mutation attempt on a `[PROD]` agent via the live API (not a mocked client). Today: tests use the in-process wrapper. Governance is one `curl` away from being bypassed. |
| **E5** | Scoring produces a number that correlates with a human label on ≥20 graded conversations. Today: no labeled dataset exists. The polish loop optimizes against an unvalidated metric. |
| **E6** | `polishLoop` is exercised on a known-bad config and produces a measurably-better one. Today: tests verify mechanics, not effectiveness. The headline feature is untested for headline outcome. |
| **E7** | A webhook-delivered `first_message` override appears as the first agent utterance in a live call. Today: no live audio path. |
| **E8** | Signature verification rejects a replay of a fresh, valid digest within the 30-min skew window. Today: it does not — `src/security/elevenlabs-signature.ts` has no replay cache. An attacker who captures one valid webhook can replay it indefinitely until the timestamp goes stale. |
| **E9** | `data_collection` extraction is benchmarked against a labeled fixture set, ≥80% accuracy. Today: no benchmark. We promised the CRM consumer a contract we never audited. |
| **E10** | Every public CLI verb emits a structured JSONL trace event per invocation (the user's own global CLAUDE.md rule). Today: no tracer in `src/cli/commands/`, no traces under `logs/`. |

### Running

```bash
bun run test --project _meta_audit          # the whole suite
bun run test --project _meta_audit -- -t E8 # one aspirational contract
```

If a spiritual test stops failing — promote it. Delete the `.fails` qualifier. Add a regression-guard test next to it. The shortcoming is no longer spiritual; it's a feature.
