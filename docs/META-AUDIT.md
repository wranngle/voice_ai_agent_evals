# Meta-audit — feature map + roast + spiritual shortcomings

This is the "impatient-CEO" audit of `@wranngle/voice-evals`. It is deliberately uncomfortable. The whole point is to surface what 1,221 green tests hide.

## TL;DR

> **1,221 tests pass (out of 1,300; 73 currently red, 6 skipped). That number lies about coverage.** Counts are the original v1.1.0 snapshot — see §1 footer for the caveat. The spiritual-shortcoming target this TL;DR originally framed ("until the tests under `tests/_meta_audit/` go from red to green") has been hit: `template-spiritual-shortcomings.test.ts` now has zero `it.fails`, with 7 contracts [PROMOTED] (E2/E3/E4/E5/E6/E8/E9), 1 [PROMOTED-PARTIAL] (E1, text proxy — audio path still gap), 1 [TRACKED-OPT-IN] (E7, gated probe), and 1 plain `it()` (E10). A CEO should still be skeptical of the "audio-native, closed-loop, 1000+ tests" copy — see §5 for the gaps remaining after this round (audio μ-law/G.711 corpus, GEPA sidecar protocol contract, real SDK integration, n8n optimistic concurrency, friction-log rotation, polish-loop A/B framework).

The codebase ships:
- ~30k LOC of production TypeScript (`src/`)
- ~26k LOC of tests (`tests/`)
- 27 vitest projects (`wrapper`, `scoring`, `remediation`, `factory`, `n8n`, `ingestion`, `ingestion-llm`, `regression`, `cli`, `refinement`, `compare`, `fuzz`, `budget`, `replay`, `leaderboard`, `report`, `log`, `scenarios`, `webhook`, `_meta_audit`, … — see `vitest.config.ts`)

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
| **10** | **CLI** | `help`, `init`, `score`, `demo`, `ingest`, `polish`, `refine`, `ceo-demo`, `baseline`, `compare`, `doctor`, `agent`, `factory`, `friction`, `n8n`, `webhooks`, `scenarios`, `legacy` | 23 | ~~No test that `--help` lists every command~~ — closed by `tests/_meta_audit/cli-help-alignment.test.ts` (see §3 S10). No test that the dispatcher rejects malformed argv consistently — still open. |

## 2. The roast — what 1,221 green tests don't tell you

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

At 10 MB of frictions (a real production size), legacy `resolveFriction` is **O(N) IO** per call. The "audit log" abstraction is fine. The implementation will eat a server's disk IO budget.

**Partial closure (2026-05-14):** `resolveFrictionAppend` shipped — writes a single `TOMBSTONE` event in O(1) IO; `getUnresolvedFrictions` / `applyTombstones` materialise the resolved view at read time. Asserted in `tests/_meta_audit/friction-log-scale.test.ts` under 50 ms on a 10k-event log (vs ~5 s for the legacy rewrite). Log rotation + compaction still ungapped — see §5 #5.

### Patterns regex are theatre

```ts
const DECLINE_RE   = /\b(no|don't|do not|stop|never mind|cancel|i can't|i cannot)\b/i
const HOSTILE_RE   = /\b(annoying|ridiculous|frustrating|rude|stupid|useless|terrible|wasting my time)\b/i
```

- ~~"no, but please send it" → fires `SMS_AFTER_DECLINE` falsely if SMS came earlier~~ — **closed**: `isGenuineDecline` at `src/remediation/patterns.ts:278` filters `POSITIVE_FOLLOWUP_RE` per-utterance; asserted by `tests/_meta_audit/pattern-false-positives.test.ts` ("no, but please text me anyway" doesn't fire; "no problem, please text me" doesn't fire).
- ~~Agent says "that's a stupid question" (paraphrasing the caller) → flags HOSTILE_RESPONSE~~ — **closed**: `isAgentHostile` at `src/remediation/patterns.ts:305` filters `AGENT_QUOTING_RE` ("you said X" / "I hear you" reporting clauses); asserted by the same meta_audit file (agent paraphrasing doesn't fire; genuine hostile still fires).
- Semantic decline still goes undetected — "I'd rather not", "actually I changed my mind", "let's skip that" all bypass `DECLINE_RE` even after the recent `i can't` / `i cannot` additions. **Still open.**
- Coefficient-of-variation > 0.4 (`INCONSISTENT_BEHAVIOR`) — magic number with no tuning study. **Still open** (S6).

These are heuristics dressed as a `FAILURE_PATTERNS` constant. The naming implies determinism. The post-fix behaviour is **context-aware on the two closed bullets** but still relies on regex matching against a hard-coded vocabulary for the rest — a real semantic-classifier replacement is the unshipped follow-on.

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

`PHASE_PATTERN = /^\[(DEV|ALPHA|BETA|PROD|ARCHIVED)]\s+/` runs on a single string. ~~No test covers:~~

**Closed** — `tests/_meta_audit/governance-edge-cases.test.ts` now ships 9 adversarial-input tests against `parseAgentName`, including all four originally listed: emoji passes through unmodified (line 50), lowercase `[dev]` is not recognized + now emits a `warning` (line 26), two phase tags parses the first and leaks the second into `displayName` (line 44), mid-string `Agent [DEV]` is ignored (line 38). Plus 5 more: no-trailing-space `[DEV]Sarah`, empty string, bare `[]`, non-canonical `[STAGING]` warning, canonical-phase warning-quiet. The closure also added a `warning` field on `parseAgentName` so non-canonical input is surfaced rather than silently treated as untagged.

Non-canonical prefixes like `[STAGING]` are gate-refused on the path through `enforceMutation` — `parseAgentName` returns `isTagged: false` for them, which trips the same `untagged` rejection as a no-prefix name (requires explicit `allowUntagged: true` to mutate). The `warning` field is informational, surfaced for operators to *notice* the typo rather than relying on a silent untagged fallthrough.

## 3. Spiritual shortcomings — design problems, not bugs

| # | Shortcoming | Where it lives | Why it bites |
|---|---|---|---|
| **S1** | **No real-API contract tests** | Everywhere with `client: VoiceEvalsClient` | SDK shape changes silently break us in prod. |
| **S2** | **Test mocks ARE the contract** | wrapper, tests-api, n8n | We test what we wish the API did, not what it does. |
| **S3** | **No e2e test of the polish loop's outcome** | `polishLoop` | "Iterates" is not "improves". |
| **S4** | **No load / scale test** for the factory | `expand`, friction-log | 1000+ tests is the headline claim. We never run 1000+. |
| **S5** | **No adversarial input fuzz** | Patterns, slugify, YAML loader, governance | One malicious-prompt LLM response → silent damage. |
| **S6** | **Magic numbers everywhere** | INCONSISTENT_BEHAVIOR CV=0.4, VAD threshold, retry counts | Decisions presented as facts, never tuned. |
| **S7** | **Friction log doesn't scale** | `resolveFriction` (legacy) | Legacy `resolveFriction` is still O(N) IO; ~~no append-mode tombstone~~ now closed by `resolveFrictionAppend` (TOMBSTONE event, O(1), <50 ms on 10k events — asserted in `tests/_meta_audit/friction-log-scale.test.ts`). Log rotation + compaction still ungapped — see §5 #5. |
| **S8** | **No A/B framework** for before/after polish | `polishLoop` | Can't prove a fix is net-positive. |
| **S9** | **Documentation lies about behavior** | `inherit:` was declared and ignored for 4 phases. Just fixed. | If one such gap, how many more? |
| **S10** | **`--help` is hand-maintained** | `src/cli/commands/help.ts` | ~~No test enforces alignment~~ now closed by `tests/_meta_audit/cli-help-alignment.test.ts` — extracts command names from the `src/cli.ts` dispatch switch + the `HELP_TEXT` literal and asserts symmetric difference is empty. Adding a verb without touching `help.ts` fails the test at PR time. |
| **S11** | **GEPA bridge is unproven** | `src/remediation/gepa-bridge.ts` | Stub that throws. The protocol isn't real. |
| **S12** | **No cross-runtime determinism test** | `mulberry32`, audio fixtures | ~~No test locks the output~~ now closed for `mulberry32` (via `sample`) by `tests/_meta_audit/cross-runtime-determinism.test.ts` — snapshots the first 5 ints of `mulberry32(1)` so a future Bun/Node `Math.imul` or shift-semantics divergence fails the test at PR time. Audio fixtures (the second half of the original concern) are not yet locked. |
| **S13** | **Webhook signature verifier untested against malicious signatures** | `src/security/elevenlabs-signature.ts` | ~~Replay attacks~~ now covered by E8 PROMOTED + an in-memory `ReplayCache` returning `signature_replayed`; timing attacks mitigated via `timingSafeEqual` in the hmac compare, no explicit constant-time benchmark yet. |
| **S14** | **CLI argv parser is hand-rolled** | factory dispatcher, polish, score | Will diverge from itself per command. Already does. |
| **S15** | **No regression test for v1.1.0 capability matrix in README** | README claims | The README ages faster than the code. |

## 4. New tests addressing these — `tests/_meta_audit/`

Each test file under `tests/_meta_audit/` targets one or more shortcomings. Some FAIL on purpose: the failure is the diagnostic. Others pass because the fix landed in the same change. Each test cites its `S#` in the comment header.

| File | Shortcoming(s) | Pass / Fail / TODO |
|---|---|---|
| `tests/_meta_audit/pattern-false-positives.test.ts` | S5, S6 | Eight tests, zero `it.fails` — every case is a post-fix closure assertion (file docstring line 4-9). Three describes: (1) **SMS_AFTER_DECLINE specificity** — 4 tests: positive-followup "no, but please text me anyway" doesn't fire; "I can't take SMS" is now caught semantically; "no problem, please text me" doesn't fire (friendly idiom); genuine decline still fires (regression guard). (2) **HOSTILE_RESPONSE specificity** — 3 tests: agent paraphrasing the caller is suppressed; genuinely hostile agent still fires; defensive phrasing "like I said" still fires. (3) **INCONSISTENT_BEHAVIOR CV=0.4 magic-number** — 1 documentation test that CV > 0.4 fires but the threshold has no tuning provenance (S6 is documented, not closed). |
| `tests/_meta_audit/polish-loop-outcomes.test.ts` | S3, S8 | Three describes. (1+2) Demonstrate the gap: the loop "succeeds" on a regressing fix and on a lucky flap with no operator signal — success criterion is "iteration", not "improvement". (3) Post-fix closure: PASSING tests asserting `PolishLoopResult` exposes `initialFailingDimensions` / `improvedDimensions` / `regressedDimensions` / `netImprovement` / `regressed` so the operator now has the per-dimension delta (`src/remediation/types.ts:134-180`). The S8 "no A/B framework" gap is still real — `regressed` only flags worse-on-tested-dims, not a statistical cross-revision suite comparison; see README "What's *not* implemented yet" line on A/B. |
| `tests/_meta_audit/friction-log-scale.test.ts` | S7 | Two tests. (1) Legacy `resolveFriction` over a synthetic 10k-event log, asserts it completes under 5 s (CI-generous envelope; documents the O(N) cost). (2) New `resolveFrictionAppend` over the same shape, asserts it completes under 50 ms — closes the S7 "no append-mode tombstone" critique from §2 by writing a single TOMBSTONE event in O(1) IO. Also asserts `getUnresolvedFrictions` applies the tombstone at read time. |
| `tests/_meta_audit/factory-pairwise-coverage.test.ts` | S4, S6 | Five tests. (1) `pairwise` covers **100 %** of pairs on 4×4×4 (`expect(coverage).toBe(1)` at line 48) — the IPO optimum, not just "near it". (2) Output size within 2× the theoretical IPO minimum on 4×4×4. (3) Scale envelope: 10 dims × 5 values runs under 1 s — the partial answer to S4 "no load/scale test". (4) `kWise({k:3})` covers every 3-tuple at least once on 3×3×3×3 — generalises the 2-way claim to k-way. (5) `kWise` rejects `k < 2`. The "no k>2 support" critique from the file's original TODO is closed by tests 4-5. |
| `tests/_meta_audit/governance-edge-cases.test.ts` | S5 | Nine tests on the inputs `parseAgentName` actually receives in adversarial conditions: lowercase `[dev]` (with post-fix `warning`), no-trailing-space `[DEV]Sarah`, mid-string `Sarah [DEV] …`, two phase tags `[DEV] [ALPHA] Sarah` (ALPHA leaks into displayName), emoji in display name, empty string, bare `[]`, non-canonical `[STAGING]` (post-fix `warning`), canonical-phase warning-quiet. The "post-fix" tests assert `parseAgentName` now exposes a `warning` field on non-canonical input — closure of the original adversarial-silence half of S5 for governance specifically. Earlier `S10` co-tag was a typo (S10 is `--help` drift, not governance — file docstring at line 2 names only S5). |
| `tests/_meta_audit/cli-help-alignment.test.ts` | S10, S14 | Parses help text + dispatcher; asserts every dispatched command is documented and vice versa. |
| `tests/_meta_audit/cross-runtime-determinism.test.ts` | S12 | Seeded mulberry32 output snapshot — locks the values so a Node 22 / Bun divergence fails the test at PR time. |
| `tests/_meta_audit/exports-build-alignment.test.ts` | S15 (build invariant) | Asserts every `package.json` `exports[*]` entry corresponds to a `SUBPATH_ENTRIES` row in `scripts/build.mjs` so a new subpath doesn't ship a missing-file 404. |
| `tests/_meta_audit/template-shape.test.ts` | S15 ([TEMPLATE] hardening) | Locks the [TEMPLATE] agent's config / prompt / `data_collection` shape so a silent edit can't drift the canonical agent contract. |
| `tests/_meta_audit/template-webhook-fast-fail.test.ts` | S15 (client-initiation fast-fail) | Forces the client-initiation webhook handler to return a valid `conversation_initiation_client_data` shape even when every upstream enrichment hangs/throws — the 500 ms ElevenLabs hard limit is the real constraint. |
| `tests/_meta_audit/template-roundtrip.test.ts` | S1, S2 (live contract) | Two tests, both bypass the SDK so a `@elevenlabs/elevenlabs-js` shape change can't mask the real contract. (1) `GET /v1/convai/agents/{id}` returns 200 with matching `agent_id`. (2) Live config preserves the snapshot guardrails block from `snapshots/template-pre-hardening-2026-05-12.json`. Gated by `skipIf(CI \|\| !ELEVENLABS_API_KEY)` (line 23) — never runs in CI by design, matches the live-test convention `tests/_meta_audit/README.md:66` documents. Operators run it locally with credentials. |
| `tests/_meta_audit/template-spiritual-shortcomings.test.ts` | All S# (catalog) | The aspirational-contract index — 10 `it()` cases (no remaining `it.fails` in the file as of this row; docstring still describes the `it.fails` → `it()` promotion convention for *new* contracts). Status by marker: **7 PROMOTED** (E2 / E3 / E4 / E5 / E6 / E8 / E9); **1 PROMOTED-PARTIAL** (E1 — live ElevenLabs simulate-conversation exists as a text proxy; audio path via WebRTC/Twilio is a separate forcing function); **1 TRACKED-OPT-IN** (E7 — `VOICE_EVALS_SIMULATE_OVERRIDE_CHECK=1` probe; vendor docs don't list `conversation_config_override` so it's not default-on); **1 plain `it()`** (E10 — every public CLI verb file imports a JSONL tracer). Full per-contract status table at `tests/_meta_audit/README.md:50-61`. |

## 5. What this audit does NOT close

Even after the twelve test files above, the following gaps remain (and need real work, not more tests):

1. **GEPA bridge needs an actual Python sidecar** to validate the protocol contract. (S11)
2. **Audio coverage** needs μ-law / G.711 fixtures and a real-noise corpus. (Pillar 4, "Audio-native")
3. **Real ElevenLabs SDK integration tests** require live credentials + CI secrets management. (S1, S2)
4. **Optimistic concurrency on n8n PUT** is a feature gap, not a test gap. (See §2 "n8n corrector races" — no `ETag`/`If-Match` on the PUT; the S-list catalogues test gaps, not this product gap.)
5. **Friction log rotation/compaction** is a feature gap. (S7)
6. **A/B framework** for polish-loop outcomes is a feature gap. (S3, S8)

These are the items a CEO should fund — *additional engineering*, not more tests on top of broken contracts.

## 6. The honest one-liner

> **What we ship today is a polished surface over a thin contract.** The test suite documents the surface. The contract — what ElevenLabs actually does, what the agent's prompt change actually changes, what GEPA's protocol actually is, what production audio actually sounds like — remains under-tested. v1.1.0 doesn't change that. It widens the surface (factory, autorefinement, n8n) on the same foundation. The foundation is the spiritual shortcoming.

The fix is not more tests. The fix is **live contract verification**: nightly runs against a real ElevenLabs sandbox agent, real n8n test instance, real audio corpus, real Python GEPA. Until those exist, every "X tests pass" headline is partial truth.
