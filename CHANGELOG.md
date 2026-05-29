# Changelog

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] — 2026-05-13

Ports the supersystem from `wranngle/voice_ai_agents` (archived 2026-05-06) into `voice-evals` on top of the v1.0 wrapper / scoring / ingestion / regression / remediation core. Excluded by request: Gemini brain (L4), Claude Code auto-commit (L5), Deep Research engine (L6).

### Added

- **Phase A — Native ElevenLabs Tests API wrap** (`src/wrapper/tests.ts`). `client.tests.{create, get, list, update, delete, runBatch, pollInvocation, resubmitFailed}` mirroring the SDK 1:1 with auto-pagination, invocation polling, and normalized pending/passed/failed status. Subpath `@wranngle/voice-evals/tests-api`.
- **Phase B — Combinatorial factory** (`src/factory/`). `cartesian`, `pairwise` (greedy IPO), `sample` (Fisher-Yates with mulberry32 seed). YAML template loader with `{placeholder}` interpolation, `inherit` + `expand_with` overlay merging. 12 industries × 20 variants (5 demo_close + 5 objection + 5 personality + 5 edge_case) × 26 base scenarios ported under `templates/factory/`. Subpath `@wranngle/voice-evals/factory`.
- **Phase C — Factory CLI** (`src/cli/commands/factory/`). `voice-evals factory {generate, upload, list, cleanup, execute, report, run}`. End-to-end pipeline: YAML → JSON → portal-create → batch-run → poll → pass/fail report.
- **Phase D — Friction log + cycle stats + random scenarios** (`src/remediation/{friction-log,cycle-stats}.ts`, `src/ingestion/random-scenarios.ts`). Append-only JSONL audit log; per-cycle aggregation (improvements, regressions, patterns); deterministic random simulated-user generator (14 baked-in industries × 24 names × 5 volumes × 4 interest levels, 70/30 industry/objection split — consumers can override the industry pool via `options.industries`).
- **Phase E — Autorefinement engine** (`src/remediation/patterns.ts` + extended `polish-loop.ts`). 5 canonical FAILURE_PATTERNS (SMS_AFTER_DECLINE, TOOL_NOT_CALLED, CONTEXT_LOST, HOSTILE_RESPONSE, INCONSISTENT_BEHAVIOR) drive deterministic ANALYZE → PROPOSE shortcuts; LLM fallback for unmatched failures. Loop gains `analyze` callback, `frictionLogPath`, aggregate `patternsDetected`.
- **Phase F — n8n workflow corrector** (`src/n8n/`). `createN8nCorrector` with `applyPartialUpdate`, `diagnoseWorkflowFailure`, `applyWorkflowFixes` (batched in 5s). 4 fix patterns (ADD_RETRY_LOGIC, ADD_ERROR_HANDLING, FIX_WEBHOOK_DATA, ADD_TIMEOUT). Enforces node-level vs parameters-level key separation via `NODE_LEVEL_PROPS`. Subpath `@wranngle/voice-evals/n8n`.
- **Phase G — Agent CRUD extensions** (`src/wrapper/agents.ts`). `agents.{create, update, clone, archive, promote}` with [PHASE] governance: `[DEV]` auto-prefix on create, `enforceMutation` gate on update, `[ARCHIVED]` rename (no delete API per AGENTS.md policy), explicit `allowedPhases` for promote.
- New docs: `docs/factory.md`, `docs/autorefinement.md`, `docs/n8n-correction.md`, `docs/personas.md`.

### Changed

- `voice-evals --help` documents the `factory` subcommand surface.
- vitest project list grows two namespaces: `factory`, `n8n`. CI matrix runs them on Bun 1.1 + Node 20 + Node 22.
- `polishLoop` no longer requires an LLM call when a known pattern fires — deterministic short-circuit saves both latency and cost.

### Dependencies

- Added: `yaml@2.8.4` (runtime, for factory templates).
- Deliberately **not** added: `@n8n/rest-api-client` (heavy transitive tree + opaque license — direct fetch is leaner).

## [1.0.0] — 2026-05-12

Rename to `@wranngle/voice-evals` and rebuild as a published Bun package with audio-native voice-AI evals, closed-loop remediation, and dynamic test detection. Tagged `v1.0.0` at commit `cb497a1`.

### Added

- **Phase 0 — Package shell.** Rename `lib/` → `src/`. ESM+CJS dual build via `bun build` + `tsc --emitDeclarationOnly`. Wired `exports`, `bin`, `files`, `engines`, `publishConfig`, `peerDependencies` on `@elevenlabs/elevenlabs-js`. Moved `arktype` to runtime `dependencies`. Stubbed `scripts/postinstall.mjs` for the Phase 5 Python sidecar.
- **Phase 1 — ElevenLabs wrapper** (`src/wrapper/`). `createVoiceEvalsClient({apiKey | client, modelRankings?})` factory; `agents.list()` / `agents.get(id)` that parse `[PHASE]` prefixes per AGENTS.md; `governance.{parseAgentName, enforceMutation, assertModelAllowed, isPhase, GovernanceError}` pure helpers; `tools.{cleanProperty, cleanTools, hasMutualExclusionViolation}` pure helpers that strip the API's mutually-exclusive fields (`is_system_provided` / `dynamic_variable` / `constant_value` / `enum`) before PATCH and synthesize replacement descriptions; `webhooks.verify` re-export of the HMAC verifier. Subpath `@wranngle/voice-evals/wrapper`. `config/model-rankings.json` ships with the AGENTS.md banned list (`gpt-4o-mini`, `gpt-5-mini`, `gemini-2.0-flash-001`) and default `gemini-3-flash-preview`. SDK escape hatch via `client.raw`. 46 new tests.
- **Phase 2 — Scoring engine** (`src/scoring/`). Inspect-AI-shaped composable scoring: `Task = (dataset, caller, scorer)` primitive; `compose(...scorers)`, `weighted(weight, scorer)`, `aggregate(dimensions) -> RunOutcome` composer; Promptfoo-style assertions DSL (`contains`, `regex`, `equals`, `not`, `notAsync`, `llmRubric`) including `not-*` negation that preserves error / skipped states; audio-native scorers — `parseWav` (16/24/32-bit PCM, mono + stereo deinterleave), `rmsEnvelope`, `detectSpeechSegments`, `detectBargeIn`, plus dimension-emitting `scoreVoiceActivity` and `scoreBargeIn`. Subpath `@wranngle/voice-evals/scoring`. 44 new tests.
- **Phase 2.x — Judges.** G-Eval, ArenaGEval, Lynx, DAG.
- **Phase 3 — LLM data layer** (`src/ingestion/`). `importPostCallWebhook(payload, opts)` — deterministic converter from an ElevenLabs `post_call_transcription` webhook payload to `TestCase[]`. `proposeTestCases(transcript, {llm})` — TestChain Proposer with LLM callback, tolerates fenced/wrapped JSON, drops schema-failing items. `persona-generator` — 5 `CANONICAL_PERSONAS` (polite-elderly, frustrated-rusher, esl-non-native, confused-meanderer, hostile-skeptic) with traits and `buildPersonaSystemPrompt(persona, intent)`. Subpath `@wranngle/voice-evals/ingestion`. 17 new tests.
- **Phase 3.x — TestChain Designer.** Free-form draft assertions → structured specs.
- **Phase 4 — Regression + baseline** (`src/regression/`). Versioned `BaselineSnapshot` capture / save / load (file-based JSON under `baselines/<name>.json`, path-traversal-safe slug) and the Braintrust-shaped `diffAgainstBaseline(current, baseline)`. Status flips always land in improvements / regressions; deltas below `unchangedThreshold` (default 0.02) land in `unchanged`. Subpath `@wranngle/voice-evals/regression`. 11 new tests.
- **Phase 5 — Closed-loop remediation** (`src/remediation/`). `proposeFix({llm, agentConfig, failures})` over 8 targets (`system_prompt`, `tool_description`, `first_message`, `voice_*`, `temperature`, `turn_eagerness`) with defensive sanitization. `applyFix({client, agentId, fix, governance?, dryRun?})` translates the proposal into a `conversationConfig` PATCH and enforces the `[DEV]`-only mutation gate. `polishLoop({client, agentId, evaluate, llm, maxIterations?, patience?, dryRun?})` iterates evaluate → propose → apply → evaluate with plateau detection, max-iteration cap, all-passing short-circuit, and `no_proposal` early exit. Subpath `@wranngle/voice-evals/remediation`. 16 new tests.
- **Phase 5.x — Python sidecar install.** `voice-evals doctor --install` provisions a uv-managed venv + `gepa pip` + `gepa_run.py` JSON-IO protocol. Full optimizer wiring deferred to v1.2; today's bridge throws `GepaUnavailableError` with installation instructions until `--install` runs.
- **Phase 6 — CLI doctor + quickstart + README v1.0.** `voice-evals doctor` prints Python sidecar status (cache path, venv binary, bridge script, availability). README rewritten for v1.0 positioning: quickstart code that touches every namespace, capability table vs. Hamming / Coval / Vapi / ElevenLabs sim, subpath-exports reference, phase tracker. `examples/quickstart.ts` ships a runnable end-to-end demo using synthesized data.
- **Phase 6.x — Matrix CI + CLI split.** Bun 1.1 + Node 20 + Node 22 matrix. CLI commands split (`init`, `baseline capture`, `baseline diff`).
- **npm publish.** `@wranngle/voice-evals@1.0.0` shipped to the registry.

## Versioning

- **MAJOR** — breaking changes to the runner contract, scenario YAML schema, or stored-test data shape
- **MINOR** — new runner types, new scoring axes, additional CLI commands
- **PATCH** — bug fixes, doc clarifications, dependency bumps

Deprecations will be announced here with at least 90 days notice before removal.
