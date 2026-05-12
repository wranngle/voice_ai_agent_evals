# Changelog

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Pre-1.0.0. The project is being shaped for v1 — major changes are tracked in git history (`git log --oneline`) until a public release tag lands. The changelog will populate on the first tagged release.

### 1.0.0-dev (in progress on `feat/v1.0-bun-package`)

Rename to `@wranngle/voice-evals` and rebuild as a published Bun package with audio-native voice-AI evals, closed-loop remediation, and dynamic test detection. Phase tracker:

- **Phase 0 — Package shell** (current). Rename `lib/` → `src/`. Add ESM+CJS dual build via `bun build` + `tsc --emitDeclarationOnly`. Wire `exports`, `bin`, `files`, `engines`, `publishConfig`, `peerDependencies` on `@elevenlabs/elevenlabs-js`. Move `arktype` to runtime `dependencies`. Stub `scripts/postinstall.mjs` for the Phase 5 Python sidecar. README + badges updated.
- **Phase 1 — ElevenLabs wrapper.** Lands `src/wrapper/` with: `createVoiceEvalsClient({apiKey | client, modelRankings?})` factory; `agents.list()` / `agents.get(id)` that parse `[PHASE]` prefixes per AGENTS.md; `governance.{parseAgentName, enforceMutation, assertModelAllowed, isPhase, GovernanceError}` pure helpers; `tools.{cleanProperty, cleanTools, hasMutualExclusionViolation}` pure helpers that strip the API's mutually-exclusive fields (`is_system_provided` / `dynamic_variable` / `constant_value` / `enum`) before PATCH and synthesize replacement descriptions; `webhooks.verify` re-export of the HMAC verifier. Subpath export `@wranngle/voice-evals/wrapper`. `config/model-rankings.json` ships with the AGENTS.md banned list (`gpt-4o-mini`, `gpt-5-mini`, `gemini-2.0-flash-001`) and default `gemini-3-flash-preview`. SDK escape hatch via `client.raw`. New vitest `wrapper` project with 46 tests covering all of the above; CI workflow updated.
- **Phase 2 — Scoring engine** (MVP slice). Inspect-AI-shaped composable scoring under `src/scoring/`: `Task = (dataset, caller, scorer)` primitive; `compose(...scorers)`, `weighted(weight, scorer)`, `aggregate(dimensions) -> RunOutcome` composer; Promptfoo-style assertions DSL (`contains`, `regex`, `equals`, `not`, `notAsync`, `llmRubric` with judge-callback) including `not-*` negation that preserves error / skipped states; audio-native scorers — `parseWav` (16/24/32-bit PCM, mono + stereo deinterleave), `rmsEnvelope` (50ms windows), `detectSpeechSegments` (energy-threshold VAD with smoothing), `detectBargeIn` (two-stream stereo barge-in), plus dimension-emitting `scoreVoiceActivity` and `scoreBargeIn`. Subpath export `@wranngle/voice-evals/scoring`. 44 new tests in a `scoring` vitest project with synthesized WAVs (no binary fixtures committed). Migration from `src/testing/runners/scenario-runner.ts` onto the new primitives is deferred to Phase 2.x; judges (`g-eval`, `arena`, `dag`, `rubric`, `lynx`) and rolling-p95 latency scorers also deferred to Phase 2.x.
- **Phase 3 — LLM data layer.** Pending.
- **Phase 4 — Regression + baseline.** Pending.
- **Phase 5 — Closed-loop remediation.** Pending.
- **Phase 6 — CLI + docs + CI + release.** Pending.

## Versioning

- **MAJOR** — breaking changes to the runner contract, scenario YAML schema, or stored-test data shape
- **MINOR** — new runner types, new scoring axes, additional CLI commands
- **PATCH** — bug fixes, doc clarifications, dependency bumps

Deprecations will be announced here with at least 90 days notice before removal.
