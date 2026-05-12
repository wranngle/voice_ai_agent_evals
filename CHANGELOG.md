# Changelog

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Pre-1.0.0. The project is being shaped for v1 — major changes are tracked in git history (`git log --oneline`) until a public release tag lands. The changelog will populate on the first tagged release.

### 1.0.0-dev (in progress on `feat/v1.0-bun-package`)

Rename to `@wranngle/voice-evals` and rebuild as a published Bun package with audio-native voice-AI evals, closed-loop remediation, and dynamic test detection. Phase tracker:

- **Phase 0 — Package shell** (current). Rename `lib/` → `src/`. Add ESM+CJS dual build via `bun build` + `tsc --emitDeclarationOnly`. Wire `exports`, `bin`, `files`, `engines`, `publishConfig`, `peerDependencies` on `@elevenlabs/elevenlabs-js`. Move `arktype` to runtime `dependencies`. Stub `scripts/postinstall.mjs` for the Phase 5 Python sidecar. README + badges updated.
- **Phase 1 — ElevenLabs wrapper.** Pending.
- **Phase 2 — Scoring engine.** Pending.
- **Phase 3 — LLM data layer.** Pending.
- **Phase 4 — Regression + baseline.** Pending.
- **Phase 5 — Closed-loop remediation.** Pending.
- **Phase 6 — CLI + docs + CI + release.** Pending.

## Versioning

- **MAJOR** — breaking changes to the runner contract, scenario YAML schema, or stored-test data shape
- **MINOR** — new runner types, new scoring axes, additional CLI commands
- **PATCH** — bug fixes, doc clarifications, dependency bumps

Deprecations will be announced here with at least 90 days notice before removal.
