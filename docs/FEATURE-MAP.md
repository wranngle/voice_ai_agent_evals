# Feature Map — voice_ai_agent_evals

Generated: 2026-05-12. Source: `@wranngle/voice-evals` v1.1.0 on branch `feat/v1.1.0-supersystem-port`.

## Overview

Audio-native voice AI agent evaluation, closed-loop remediation, and combinatorial test factory for ElevenLabs Conversational AI. Deterministic testing via seeded synthetic scenarios; prompt optimization through LLM-driven proposer + apply loops; governance-gated mutation with phase tagging (`[DEV]`, `[ALPHA]`, `[BETA]`, `[PROD]`, `[ARCHIVED]`). Bun-first TypeScript SDK with native ElevenLabs Tests API integration, YAML template expansion (cartesian/pairwise/k-wise/sample), audio-native scoring (RMS, barge-in, VAD), and regression baselines in Braintrust shape.

---

## Feature Inventory

### 1. CLI Surface

| Feature | Purpose | Primary file(s) | Entry point | Test status |
|---------|---------|-----------------|-------------|------------|
| **help** | Print command reference + env var guide | `src/cli/commands/help.ts` | `voice-evals help` | ✅ covered |
| **init** | Scaffold `voice-evals.config.{ts,mjs}` | `src/cli/commands/init.ts` | `voice-evals init [--force]` | ✅ covered |
| **score** | Audio-native WAV scoring (RMS envelope, VAD, barge-in) | `src/cli/commands/score.ts` | `voice-evals score <wav>` | ✅ covered |
| **ingest** | Transcript → `ProposedTestCase[]` via LLM | `src/cli/commands/ingest.ts` | `voice-evals ingest <txt>` | ✅ covered |
| **polish** | Closed-loop remediation (evaluate → propose → apply → iterate) | `src/cli/commands/polish.ts` | `voice-evals polish <agent-id> [--dry-run] [--max-iterations N]` | ✅ covered |
| **baseline capture** | Snapshot current agent test results | `src/cli/commands/baseline.ts` | `voice-evals baseline capture <name>` | ✅ covered |
| **baseline diff** | Compare current vs versioned baseline | `src/cli/commands/baseline.ts` | `voice-evals baseline diff <name>` | ✅ covered |
| **doctor** | Python sidecar health check + install | `src/cli/commands/doctor.ts` | `voice-evals doctor [--install] [--dry-run]` | ✅ covered |
| **agent list/create/clone/archive/promote** | Agent CRUD subcommands | `src/cli/commands/agent.ts` | `voice-evals agent <sub>` | ✅ covered |
| **factory generate/upload/list/cleanup/execute/report/run** | Combinatorial test pipeline | `src/cli/commands/factory/*.ts` | `voice-evals factory <sub>` | ✅ covered |
| **friction** | Remediation cycle stats + friction log | `src/cli/commands/friction.ts` | `voice-evals friction {summary\|dump\|stats}` | ✅ covered |
| **n8n** | n8n workflow auto-corrector CLI | `src/cli/commands/n8n.ts` | `voice-evals n8n {fix\|validate\|diagnose}` | ✅ covered |
| **scenarios** | Random scenario generator | `src/cli/commands/scenarios.ts` | `voice-evals scenarios {list\|export}` | ✅ covered |
| **legacy** | v0.x compatibility harness | `src/cli.ts` → `src/testing/cli.ts` | `voice-evals legacy <cmd>` | ⚠️ partial |

### 2. Agent CRUD Wrapper

| Function | Purpose | File | Test status |
|----------|---------|------|------------|
| `list()` / `get()` | Enumerate / fetch | `src/wrapper/agents.ts:55-64` | ✅ |
| `create()` | Auto `[DEV]` prefix on creation | `src/wrapper/agents.ts:66-106` | ✅ |
| `update()` | Governance-gated mutation | `src/wrapper/agents.ts:108-141` | ✅ |
| `clone()` | Duplicate + rename, fully implemented | `src/wrapper/agents.ts:143-178` | ✅ |
| `archive()` / `promote()` | Phase transitions | `src/wrapper/agents.ts:180-247` | ✅ |

### 3. Governance

- `parseAgentName()` — linear-time `[PHASE] Name` parser (CodeQL-vetted) — `src/wrapper/governance.ts:40` ✅
- `enforceMutation()` — default-deny on non-`[DEV]` — `src/wrapper/governance.ts:94` ✅
- `GovernanceError` — `phase_not_allowed | untagged | banned_model` — `src/wrapper/governance.ts:20` ✅
- Model rankings (FALLBACK_RANKINGS) — banned + default — `src/wrapper/client.ts:24+` ✅

### 4. Webhook Security

- `verifyElevenLabsSignature()` — HMAC-SHA256 with 30-min skew window — `src/security/elevenlabs-signature.ts:130` ✅ (17 test cases)
- `signElevenLabsPayload()` — test-fixture signer — `src/security/elevenlabs-signature.ts:185` ✅

### 5. n8n Workflow Engine

- `corrector` — apply WORKFLOW_FIXES to n8n workflow JSON — `src/n8n/corrector.ts` ✅
- `patterns` — ADD_RETRY_LOGIC, ADD_ERROR_HANDLING, FIX_WEBHOOK_DATA, ADD_TIMEOUT — `src/n8n/patterns.ts` ✅
- `workflow-eval` — black-box runner — `src/n8n/workflow-eval.ts` ✅
- `normalizeN8nApiUrl()` — URL normalizer — `src/n8n-url.ts:16` ✅

### 6. Ingestion (LLM Data Layer)

- `importPostCallWebhook()` — deterministic webhook → `TestCase[]` — `src/ingestion/post-call-import.ts` ✅
- `proposeTestCases()` — LLM transcript → tests — `src/ingestion/llm-data-layer.ts` ✅
- `designAssertions()` — assertion builder (free-form QA strings → structured `DesignedAssertion[]` via LLM callback) — `src/ingestion/designer.ts` ✅
- `CANONICAL_PERSONAS` — adversarial persona traits — `src/ingestion/persona-generator.ts` ✅
- `generateRandomScenarios()` — dynamic scenarios (industries × names × volumes × interests) — `src/ingestion/random-scenarios.ts` ✅
- Extraction (5 files: categories, strictness, validation) — `src/ingestion/extraction/` ✅

### 7. Scoring

- `compose`/`weighted`/`aggregate` — task composition — `src/scoring/composer.ts` ✅
- Assertions DSL — `contains`/`regex`/`equals`/`not`/`llmRubric` — `src/scoring/assertions.ts` ✅
- Audio: `parseWav`, `rmsEnvelope`, `detectSpeechSegments`, `scoreBargeIn` — `src/scoring/audio.ts` ✅
- Judges: g-eval, arena, DAG, Lynx — `src/scoring/judges/*.ts` ✅

### 8. Remediation (Closed-Loop)

- `proposeFix()` — LLM proposer over 5 failure patterns — `src/remediation/proposal.ts` ✅
- `applyFix()` — apply with governance gate — `src/remediation/apply.ts` ✅
- `polishLoop()` — 6-phase loop (EVALUATE → ANALYZE → PROPOSE → APPLY → VERIFY → LOG) — `src/remediation/polish-loop.ts` ✅
- Patterns: `SMS_AFTER_DECLINE`, `TOOL_NOT_CALLED`, `CONTEXT_LOST`, `HOSTILE_RESPONSE`, `INCONSISTENT_BEHAVIOR` — `src/remediation/patterns.ts` ✅
- `FrictionLog` (uncommitted) — `src/remediation/friction-log.ts` ⚠️
- `CycleStats` (uncommitted) — `src/remediation/cycle-stats.ts` ⚠️
- GEPA bridge (Python sidecar contract, stub in v1.0) — `src/remediation/gepa-bridge.ts` ✅
- Supersystem orchestrator — `src/remediation/supersystem.ts` ✅

### 9. Regression

- `captureBaseline()` / `loadBaseline()` / `saveBaseline()` / `baselineExists()` — `src/regression/baseline.ts` ✅
- `diffAgainstBaseline()` — Braintrust-shaped diff — `src/regression/diff.ts` ✅

### 10. Factory (Test Generation)

- Strategies: `cartesian`, `pairwise`, `kWise`, `sample` (Fisher-Yates) — `src/factory/expand.ts` ✅
- Template loaders: `loadIndustries`, `loadVariants`, `loadTemplates` — `src/factory/templates.ts` ✅
- `resolveInheritance()` — `inherit:` / `overrides:` merging — `src/factory/templates.ts:82` ✅
- `generatedToCreatePayload()` / `generatedTestsToCreatePayloads()` — converter — `src/factory/to-elevenlabs.ts` ❌ uncovered
- YAML assets: `templates/factory/{industries,variants,base-scenarios}.yaml` — file assets

### 11. Testing Runners

- `ElevenLabsRunner` — live agent runner — `src/testing/runners/elevenlabs-runner.ts` ✅
- `n8nEvalRunner` — n8n workflow test runner — `src/testing/runners/n8n-eval-runner.ts` ✅
- `WebhookRunner` — generic webhook runner — `src/testing/runners/webhook-runner.ts` ✅
- `McpRunner` — MCP runner — `src/testing/runners/mcp-runner.ts` ✅
- `ExternalCommandRunner` — shell command runner — `src/testing/runners/external-command-runner.ts` ✅
- `ScenarioRunner` / `Orchestrator` — unified scenario routing — `src/testing/runners/{scenario,orchestrator}.ts` ✅

### 12. Agent Evals Runtime

- Service: `createEvaluator()` — `src/agent_evals/service/evaluator.ts` ✅
- Settings, metrics, logger, clock providers — `src/agent_evals/{config,providers}/*.ts` ✅
- Conversation event-sourced repo — `src/agent_evals/repo/conversation-repo.ts`
- UI render: ANSI formatter — `src/agent_evals/ui/render.ts` ✅

### 13. Templates & Config

- `templates/elevenlabs-agents/` — agent prompt template (legacy) + v1 system prompt (new today)
- `templates/factory/` — 12 industries × ~20 variants × 17 base scenarios
- `templates/ai_conversation_data_collection_fields_template.json` — 23 fields across requestor/contact/request/routing
- `config/model-rankings.json` — default/recommended/banned LLM IDs

### 14. Scripts

- `build`, `postinstall`, `health-check`, `ingest-and-run`, `list-workflows`, `test-{elevenlabs,n8n,mcp}-runner`, `check-elevenlabs-agent` (with `--snapshot` mode), `monitor-executions`, `run-gtm-ops-adapter`

### 15. OpenSpec Change Proposals

- `add-gtm-ops-adapter` — pending — external workflow execution bridge

---

## Coverage Summary

- Total source `.ts` files (excl. `.d.ts`): **118**
- Test files (`.test.ts`): **74**
- Modules with direct test coverage: **73**
- Modules without coverage: **4** (`src/factory/to-elevenlabs.ts`, `src/internal/slug.ts`, `src/testing/scenarios.ts`, `src/wrapper/webhooks.ts` — last one covered indirectly via integration suite)

## Known Gaps (deliberately not shipped)

- **GEPA optimizer wiring (v1.2)** — Python sidecar install ships via `voice-evals doctor --install`; the optimizer stub echoes prompts back. Full optimizer wiring lands in v1.2 once the metric-callback transport is finalized.
- **PyRIT adversarial sidecar (v1.2)** — uses the same Python install path as GEPA; contract only today.
- **Automatic Python install at `npm install`** — intentional. Postinstall is opt-in by design (CI / containers / build images often lack `uv` or Python). Operator runs `voice-evals doctor --install` when they want the sidecar.
- **Drift module — statistical-significance regression gates** — permutation tests are planned but not shipped. Today's `diffAgainstBaseline` does deterministic per-axis diff, not significance testing.
- **Dedicated `scoring/latency.ts` module** — latency budgets are enforced inline by `src/testing/runners/scenario-runner.ts` (`ttfb_p95_ms` / `end_to_first_audio_p95_ms` / `total_turn_p95_ms` / `tool_call_round_trip_ms`); a standalone `scoring/latency.ts` API is planned for v1.2.
- **Dedicated transcript-tone scorer module** — tone is currently scored inline in the scenario runner via `tone_judge` (deterministic heuristic + judge-LLM hook); a standalone `src/scoring/transcript-tone.ts` module is planned for v1.2.
