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

### Spiritual shortcomings — status

Status of each contract after the 2026-05-13 cleanup pass, with the 2026-05-20 live-test honesty correction.

| ID | Contract | Status | Where the proof lives |
|----|---------|--------|------------------------|
| **E1** | An end-to-end test exercises the live agent and verifies its response. | ✅ PARTIAL | `tests/integration/elevenlabs-simulate-live.test.ts` — uses ElevenLabs's simulate-conversation API as a text proxy. The true audio path (TTS + WebRTC) is still a separate forcing function. |
| **E2** | Post-call webhook payloads reach a persistent sink within 30s. | ✅ DONE | `src/ingestion/post-call-receiver.ts` + `tests/integration/post-call-receiver.test.ts` — HMAC-verifying NDJSON receiver with replay protection. |
| **E3** | A live integration test posts to the client-init webhook and a real agent uses the response. | ✅ DONE | `tests/integration/client-initiation-live.test.ts` — POSTs to the live n8n endpoint and asserts the response shape + latency. |
| **E4** | Governance rejects `[PROD]` mutation against the real API. | ✅ DONE | `tests/integration/governance-live.test.ts` — requires `VOICE_EVALS_TEST_PROD_AGENT_ID` and asserts wrapper rejection without synthesizing/promoting a cloud PROD agent. |
| **E5** | Scoring has labeled ground-truth ≥20 conversations. | ✅ DONE | `tests/fixtures/labeled-conversations.json` — 21 entries spanning happy path, edge cases, and guardrail violations. |
| **E6** | `polishLoop` is exercised on a known-bad config and produces measurable improvement. | ✅ DONE | Pre-existing: `tests/_meta_audit/polish-loop-outcomes.test.ts`. |
| **E7** | A webhook-delivered `first_message` override appears as the first agent utterance. | ⚠️ OPT-IN GAP | `tests/integration/elevenlabs-simulate-live.test.ts` keeps an explicit `VOICE_EVALS_SIMULATE_OVERRIDE_CHECK=1` probe, but current public simulate-conversation docs do not list `conversation_config_override`; this is not default proof. |
| **E8** | Signature verification rejects a replay of a fresh, valid digest. | ✅ DONE | `src/security/elevenlabs-signature.ts` — `createReplayCache()` factory + module-default in-memory cache, integrated into the verifier. |
| **E9** | `data_collection` extraction is benchmarked against a labeled fixture set. | ✅ DONE | `tests/fixtures/data-collection-benchmark.json` — 6 labeled transcripts covering complete intake, emergency, estimate routing, different-contact-than-requestor, incomplete intake, and transfer cases. |
| **E10** | Every public CLI verb emits structured JSONL traces. | ✅ DONE | `src/internal/jsonl-trace.ts` + `scripts/lib/jsonl-trace.mjs`. All 12 top-level verbs and 8 factory subcommands import `createTracer`. |

### Remaining gaps (called out, NOT pretended to be closed)

- **Audio path**: E1/E7 are PARTIAL because the simulate-conversation API is text. To fully close: a WebRTC test client OR a Twilio phone-number harness. Tracked as a separate forcing function — not work this suite can do unilaterally.
- **Live-test secrets**: `tests/integration/{governance,client-initiation,elevenlabs-simulate}-live.test.ts` are `skipIf(CI || !ELEVENLABS_API_KEY)`. They never run in CI by design. Operators run them locally with credentials.
- **JSONL traces under load**: the new tracer is wired but not exercised by a perf/burn-in test. If `appendFileSync` becomes a bottleneck under thousands of events/sec, swap to a streaming write.

### Running

```bash
bun run test --project _meta_audit          # the whole suite
bun run test --project _meta_audit -- -t E8 # one contract
```

When a NEW spiritual contract gets added: write it `it.fails(...)` against the desired behavior. When someone closes the gap, vitest reports `Expect test to fail` — that's the signal to remove the `.fails` qualifier and add a regression-guard test next to it.
