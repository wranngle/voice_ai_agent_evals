# Meta-audit — feature map + roast + spiritual shortcomings

This is the "impatient-CEO" audit of `@wranngle/voice-evals`. It is deliberately uncomfortable. The whole point is to surface what 1,221 green tests hide.

## TL;DR

> **1,221 tests pass (out of 1,300; 73 currently red, 6 skipped). That number lies about coverage.** A CEO who reads this should walk away skeptical of the "audio-native, closed-loop, 1000+ tests" copy until the spiritual-shortcoming tests under `tests/_meta_audit/` go from red to green.

The codebase ships:
- ~30k LOC of production TypeScript (`src/`)
- ~26k LOC of tests (`tests/`)
- 24 vitest projects (`wrapper`, `scoring`, `remediation`, `factory`, `n8n`, `ingestion`, `ingestion-llm`, `regression`, `cli`, `refinement`, `compare`, `fuzz`, `budget`, `replay`, `leaderboard`, `_meta_audit`, … — see `vitest.config.ts`)

Test-to-code ratio is ~0.88. The per-pillar test counts in § 1 below were taken at a v1.1.0 snapshot and have not been re-verified since; treat them as illustrative of the **shape** of coverage, not the absolute count. The **kind** of test matters more than the count regardless.

## 1. Feature map (full surface)

| # | Pillar | Surface | Tests | Reality |
|---|---|---|---|---|
| **1** | **ElevenLabs wrapper** | `createVoiceEvalsClient`, `agents.{list,get,create,update,clone,archive,promote}`, `tools.{cleanTools,cleanProperty}`, `webhooks.verify`, `assertModelAllowed`, `enforceMutation` | 63 | Almost entirely mocked SDK. Zero tests with a *real* ElevenLabs response payload. Drift between SDK and our wrapper is invisible until prod. |
| **2** | **Tests API** (v1.1) | `tests.{create,get,list,update,delete,runBatch,pollInvocation,resubmitFailed}` | 13 | Mocked. No test that `runBatch` survives a 429. No test that `pollInvocation` times out cleanly. |
| **3** | **Factory** (v1.1) | `cartesian`, `pairwise`, `sample`, `expandTemplate`, `resolveInheritance`, YAML loaders, 7 CLI verbs | 39 | Pairwise IPO has no actual *coverage rate* property test. mulberry32 PRNG never tested for cross-platform determinism. |
| **4** | **Scoring** | `compose`, `weighted`, `aggregate`, `contains`, `regex`, `equals`, `not`, `llmRubric`, `g-eval`, `arena`, `dag`, `lynx`, audio (`parseWav`, VAD, barge-in) | 67 | Audio tests use *synthesized* in-test WAVs. No real-world noise, codec artifacts, G.711/μ-law, or telco-quality recordings. |
| **5** | **Ingestion** | `importPostCallWebhook`, `proposeTestCases`, `designAssertions`, `CANONICAL_PERSONAS`, `buildPersonaSystemPrompt`, `generateRandomScenarios` (v1.1) | ~30 | Random scenario PROMPTS have zero validation that an LLM would produce useful behavior from them. |
| **6** | **Regression** | `captureBaseline`, `saveBaseline`, `loadBaseline`, `diffAgainstBaseline` | 11 | File-based JSON only. No locking, no race protection, no rotation policy. |
| **7** | **Remediation** | `proposeFix`, `applyFix`, `polishLoop`, 5 `FAILURE_PATTERNS`, `friction-log`, `cycle-stats`, GEPA bridge stub | 70 | Loop has 12 tests. **None prove the loop actually improves an agent** — they prove iteration mechanics. |
| **8** | **n8n corrector** (v1.1) | `createN8nCorrector`, `applyPartialUpdate`, 4 `WORKFLOW_FIXES`, `applyOperation` | 20 | All mocked fetch. Concurrent write race is unguarded. |
| **9** | **Runners** (v0.x legacy) | ElevenLabs, n8n-eval, MCP, webhook, external-command | ~80 | Older surface. Webhook tests skipIf(CI) → most don't run in CI. |
| **10** | **CLI** | `init`, `score`, `ingest`, `polish`, `baseline`, `doctor`, `factory`, `legacy` | 23 | No test that `--help` lists every command. No test that the dispatcher rejects malformed argv consistently. |

## 2. The roast — what 902 green tests don't tell you

### "Audio-native" is a marketing word

| Claim | Test reality |
|---|---|
| "voice-activity per channel" | Synthesized sine waves at 48 kHz. No noise, no reverb, no codec artifacts. |
| "barge-in detection" | Assumes stereo (caller-L, agent-R). **Most production call recordings are mono mixdowns.** No mono fallback heuristic. |
| "16/24/32-bit WAV PCM" | Yes. But **no G.711 / μ-law / a-law support** — and that's what 70 % of telco call audio actually is. |
| "Audio-format decision is canonical WAV 48kHz" | A decision, not a feature. The decision excludes everyone who can't transcode upstream. |

### "Closed-loop remediation" iterates, doesn't improve

The 12 polishLoop tests prove:
- The loop iterates ✓
- Stop conditions fire ✓
- Governance gates apply ✓
- Friction events log ✓

The tests do **not** prove:
- Applied fixes monotonically reduce failure count (could regress unrelated dims)
- The loop converges in fewer iterations than a random-walk would
- A fix that "addresses voice_activity" doesn't break "tone"
- The same scenario re-run after a fix would actually fail less

The premise of the system is "polish until 100% pass". The test suite verifies "iterate until stop condition". Those are different.

### "1000+ combinatorial tests" without a coverage proof

`pairwise` claims IPO-style 2-way coverage. But:
- No test computes the actual pair-coverage percentage on a known input
- No test compares pairwise's output size against the theoretical IPO minimum
- mulberry32 seed determinism is asserted on Bun. Untested on Node 22 ARM. Untested on Windows.

### Friction log scales like a 1995 Perl script

```ts
resolveFriction(matcher) {
  const events = readFrictionLog(path);   // load entire log
  const next = events.map(…);             // rebuild in memory
  writeFileSync(path, …);                 // rewrite entire file
}
```

At 10 MB of frictions (a real production size), resolve is **O(N) IO** per call. No append-mode tombstone. No log rotation. No compaction. The "audit log" abstraction is fine. The implementation will eat a server's disk IO budget.

### Patterns regex are theatre

```ts
const DECLINE_RE   = /\b(no|don't|stop|never mind|cancel|do not)\b/i
const HOSTILE_RE   = /\b(annoying|ridiculous|frustrating|rude|stupid|useless|terrible|wasting my time)\b/i
```

- "no, but please send it" → fires `SMS_AFTER_DECLINE` falsely if SMS came earlier
- Agent says "that's a stupid question" (paraphrasing the caller) → flags HOSTILE_RESPONSE
- "I can't" is not in DECLINE_RE — semantic decline goes undetected
- Coefficient-of-variation > 0.4 (INCONSISTENT_BEHAVIOR) — magic number with no tuning study

These are heuristics dressed as a `FAILURE_PATTERNS` constant. The naming implies determinism. The behavior is brittle.

### GEPA bridge: testing absence, not presence

`tests/remediation/sidecar-install.test.ts` has 24 tests. **All 24 test what happens when the Python sidecar is missing** — because we ship without it. The bridge protocol — the JSON-IO contract between TypeScript and the Python `gepa_run.py` — has zero contract tests.

We don't know the protocol works because we've never run it.

### n8n corrector races

`applyPartialUpdate(workflowId, ops)`:
1. GET workflow
2. Mutate locally
3. PUT workflow

Two concurrent fix attempts on the same workflow ID = last-write-wins. There is no `ETag` / `If-Match` header on the PUT. No optimistic concurrency. Operators running parallel agent fleets will overwrite each other silently.

### Governance is regex against a single agent name

`PHASE_PATTERN = /^\[(DEV|ALPHA|BETA|PROD|ARCHIVED)]\s+/` runs on a single string. No test covers:
- Emoji in the agent name (`[DEV] 🚀 Agent`) — does the slugifier survive?
- Mixed case (`[dev]` vs `[DEV]`)
- Two phase tags (`[DEV] [ALPHA] Foo`) — first wins? last? both flagged?
- A phase tag mid-name (`Agent [DEV]`)

The contract is implicit. The tests assume a happy world.

## 3. Spiritual shortcomings — design problems, not bugs

| # | Shortcoming | Where it lives | Why it bites |
|---|---|---|---|
| **S1** | **No real-API contract tests** | Everywhere with `client: VoiceEvalsClient` | SDK shape changes silently break us in prod. |
| **S2** | **Test mocks ARE the contract** | wrapper, tests-api, n8n | We test what we wish the API did, not what it does. |
| **S3** | **No e2e test of the polish loop's outcome** | `polishLoop` | "Iterates" is not "improves". |
| **S4** | **No load / scale test** for the factory | `expand`, friction-log | 1000+ tests is the headline claim. We never run 1000+. |
| **S5** | **No adversarial input fuzz** | Patterns, slugify, YAML loader, governance | One malicious-prompt LLM response → silent damage. |
| **S6** | **Magic numbers everywhere** | INCONSISTENT_BEHAVIOR CV=0.4, VAD threshold, retry counts | Decisions presented as facts, never tuned. |
| **S7** | **Friction log doesn't scale** | `resolveFriction` | Production-incompatible at >10 MB. |
| **S8** | **No A/B framework** for before/after polish | `polishLoop` | Can't prove a fix is net-positive. |
| **S9** | **Documentation lies about behavior** | `inherit:` was declared and ignored for 4 phases. Just fixed. | If one such gap, how many more? |
| **S10** | **`--help` is hand-maintained** | `src/cli/commands/help.ts` | Will drift from the real dispatcher. No test enforces alignment. |
| **S11** | **GEPA bridge is unproven** | `src/remediation/gepa-bridge.ts` | Stub that throws. The protocol isn't real. |
| **S12** | **No cross-runtime determinism test** | `mulberry32`, audio fixtures | Bun and Node disagree silently. |
| **S13** | **Webhook signature verifier untested against malicious signatures** | `src/security/elevenlabs-signature.ts` | Replay attacks, timing attacks — not covered. |
| **S14** | **CLI argv parser is hand-rolled** | factory dispatcher, polish, score | Will diverge from itself per command. Already does. |
| **S15** | **No regression test for v1.1.0 capability matrix in README** | README claims | The README ages faster than the code. |

## 4. New tests addressing these — `tests/_meta_audit/`

Each test file under `tests/_meta_audit/` targets one or more shortcomings. Some FAIL on purpose: the failure is the diagnostic. Others pass because the fix landed in the same change. Each test cites its `S#` in the comment header.

| File | Shortcoming(s) | Pass / Fail / TODO |
|---|---|---|
| `tests/_meta_audit/pattern_false_positives.test.ts` | S5, S6 | Mix: some PASS (current behavior is broken-by-design), some `it.fails` to mark them as known. |
| `tests/_meta_audit/polish_loop_outcomes.test.ts` | S3, S8 | Demonstrates that the loop's success criterion is "iteration", not "improvement". |
| `tests/_meta_audit/friction_log_scale.test.ts` | S7 | Synthetic 10k events, asserts resolve completes under 1 s. Will likely pass on small SSD but document the O(N) cost. |
| `tests/_meta_audit/factory_pairwise_coverage.test.ts` | S4 | Computes actual 2-way pair-coverage rate on a 4×4×4 input; asserts ≥ 95 % (IPO optimal would be 100 %). |
| `tests/_meta_audit/governance_edge_cases.test.ts` | S5, S10 | Emoji names, mixed-case phase, two-phase tags, mid-name phase. |
| `tests/_meta_audit/cli_help_alignment.test.ts` | S10, S14 | Parses help text + dispatcher; asserts every dispatched command is documented and vice versa. |
| `tests/_meta_audit/cross_runtime_determinism.test.ts` | S12 | Seeded mulberry32 output snapshot — locks the values in a snapshot so a Node 22 / Bun divergence is caught at PR time. |

## 5. What this audit does NOT close

Even after the seven test files above, the following gaps remain (and need real work, not more tests):

1. **GEPA bridge needs an actual Python sidecar** to validate the protocol contract. (S11)
2. **Audio coverage** needs μ-law / G.711 fixtures and a real-noise corpus. (Pillar 4, "Audio-native")
3. **Real ElevenLabs SDK integration tests** require live credentials + CI secrets management. (S1, S2)
4. **Optimistic concurrency on n8n PUT** is a feature gap, not a test gap. (S5)
5. **Friction log rotation/compaction** is a feature gap. (S7)
6. **A/B framework** for polish-loop outcomes is a feature gap. (S3, S8)

These are the items a CEO should fund — *additional engineering*, not more tests on top of broken contracts.

## 6. The honest one-liner

> **What we ship today is a polished surface over a thin contract.** The test suite documents the surface. The contract — what ElevenLabs actually does, what the agent's prompt change actually changes, what GEPA's protocol actually is, what production audio actually sounds like — remains under-tested. v1.1.0 doesn't change that. It widens the surface (factory, autorefinement, n8n) on the same foundation. The foundation is the spiritual shortcoming.

The fix is not more tests. The fix is **live contract verification**: nightly runs against a real ElevenLabs sandbox agent, real n8n test instance, real audio corpus, real Python GEPA. Until those exist, every "X tests pass" headline is partial truth.
