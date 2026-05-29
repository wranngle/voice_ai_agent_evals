# @wranngle/voice-evals

[![CI](https://github.com/wranngle/voice-evals/actions/workflows/vitest.yml/badge.svg)](https://github.com/wranngle/voice-evals/actions/workflows/vitest.yml)
[![Live](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fwranngle%2Fvoice-evals%2Fmain%2Fdocs%2Flive-status.json)](https://github.com/wranngle/voice-evals/actions/workflows/live-badge.yml)
[![License: MIT](https://img.shields.io/github/license/wranngle/voice-evals?style=flat-square)](LICENSE)
[![npm](https://img.shields.io/npm/v/@wranngle/voice-evals?style=flat-square)](https://www.npmjs.com/package/@wranngle/voice-evals)

> Audio-native voice AI agent eval, polish, and regression-test factory wrapping ElevenLabs Conversational AI — closed-loop performance evaluation, GEPA-driven prompt remediation, latency-budget-as-code, dynamic test detection from arbitrary conversational data via an LLM data-translation layer, packaged as a Bun-first TypeScript SDK.

## Status — v1.0 release candidate

Phases 0-5 are merged on `feat/v1.0-bun-package`; Phase 6 (CLI completion + docs site + npm publish) is in progress. The Python sidecar that powers GEPA closed-loop optimization is stubbed as a contract (Phase 5.x install lands shortly); the rest of `polishLoop` works against the single-shot LLM proposer today.

See [`CHANGELOG.md`](CHANGELOG.md) for per-phase detail.

## 60-second demo

No API keys, no config, no env vars — try it cold:

```console
$ npx @wranngle/voice-evals demo
voice-evals demo — synthesizing 2.0s stereo fixture (caller=L, agent=R)
  audio: stereo, 48000 Hz, 2000ms
  ✓ voice_activity_caller (1.00): 2 segment(s), 1100ms total speech (min 300ms)
  ✓ voice_activity_agent  (1.00): 1 segment(s),  350ms total speech (min 300ms)
  ✓ barge_in_recovery     (1.00): no barge-in detected (clean turn-taking)

  overall: 1.00 (3/3 dimensions passed)

  report: /tmp/voice-evals-demo/run-1731543210/index.html
  elapsed: 69ms

  → next: voice-evals score <your-wav>
```

Runs in under a second on a clean Node ≥20 runner, exits 0, opens an HTML
report. Recording: [`docs/demo.cast`](docs/demo.cast) (asciinema).

## One-button Refinement

The strategic destination of this repo is a feature ElevenLabs ships inside their agent builder (see [`proof/pitch.html`](proof/pitch.html)). The `refine` CLI verb is the runnable wedge:

```bash
voice-evals refine --mock --business-name "Riverside Heating & Cooling"
```

In ~30 seconds it enriches the business, picks one of four shipped vertical templates (HVAC, dental, restaurant, legal), exercises the 5 canonical personas, applies the failure-mode catalog ([`config/failure-mode-catalog.json`](config/failure-mode-catalog.json), 21 modes across the ElevenLabs configuration surface), proposes plain-language fixes, scores before/after, and writes a session bundle under `proof/sessions/<id>/` — including a one-page compliance HTML (prints to PDF) and a re-runnable regression suite.

**Detection has two layers.** Deterministic detectors (regex / tool-coherence / audio-metric) run offline with zero credentials. The `rubric_judge` modes — the semantic ones regex can't catch, like medical/legal advice emission, severity assessment, or menu hallucination — route through an `LlmCompleteCallback`. The CLI auto-wires one from an LLM CLI on PATH (`llm.sh` / `LLM_SH`) or `GEMINI_API_KEY`; pass `--no-llm` to stay deterministic. SDK consumers inject their own.

**Live mode** (`--agent-id <id>`, needs `ELEVENLABS_API_KEY`) simulates each persona against a real agent via `simulateConversation`, then runs the same detector/diff/scoring pipeline on the returned transcripts.

```bash
voice-evals refine --agent-id agent_xxxx           # live, against your DEV agent
```

Open [`proof/refine.html`](proof/refine.html) to watch a run unfold (timeline · enrichment · personas with inline defect highlights · fix proposals · scoreboard · regression suite · compliance artifact). Four sessions ship seeded; arrow-key through them via the sidebar.

## Quickstart

```bash
npm install @wranngle/voice-evals @elevenlabs/elevenlabs-js  # or bun add
```

```ts
import {
  createVoiceEvalsClient,
  importPostCallWebhook,
  scoreBargeIn,
  parseWav,
  diffAgainstBaseline,
  captureBaseline,
  polishLoop,
} from '@wranngle/voice-evals';

const client = createVoiceEvalsClient({apiKey: process.env.ELEVENLABS_API_KEY!});

// 1. Audio-native barge-in scoring on a stereo WAV (caller=L, agent=R).
const wav = parseWav(await Bun.file('post-call.wav').arrayBuffer());
const dim = scoreBargeIn({
  callerSamples: wav.channelSamples![0],
  agentSamples: wav.channelSamples![1],
  sampleRate: wav.sampleRate,
  maxOverlapMs: 250,
});

// 2. Trace-to-test: turn a production webhook payload into TestCase[].
const {cases} = importPostCallWebhook(postCallWebhookJson);

// 3. Closed-loop polish on a [DEV]-tagged agent (governance-gated).
await polishLoop({
  client,
  agentId: 'agent_xxxx_demo',
  evaluate: async () => myEvalSuite(),  // returns DimensionScore[]
  llm: async ({system, user}) => myLlmCallback(system, user),
  maxIterations: 3,
  dryRun: true,
});
```

## Why this vs. incumbents (May 2026 research)

| Capability | Hamming AI | Coval | Vapi Evals | ElevenLabs sim | **`@wranngle/voice-evals`** |
|---|---|---|---|---|---|
| Audio-native (WAV PCM, RMS, barge-in) | ✓ | partial | — | — | **✓** |
| Latency-budget-as-code (YAML thresholds) | partial | — | — | — | **✓** |
| Closed-loop remediation (LLM proposer + apply) | — | — | — | — | **✓** |
| `[PHASE]` governance gate on agent mutation | — | — | — | — | **✓** |
| Tool-schema mutual-exclusion auto-cleaning | — | — | — | — | **✓** |
| Bun / TypeScript first-class SDK | — | — | — | — | **✓** |
| OSS (MIT) | — | — | — | — | **✓** |
| GEPA reflective prompt optimization | — | — | — | — | **stub (Phase 5.x)** |

Source: research synthesis from agent-eval landscape, LLM eval framework, closed-loop remediation, and Bun packaging surveys — see commit history.

## Public surface (subpath exports)

```ts
import {...} from '@wranngle/voice-evals/wrapper';      // ElevenLabs API wrapper + governance (CRUD + tools + webhooks)
import {...} from '@wranngle/voice-evals/tests-api';    // Native Tests API: create/list/runBatch/pollInvocation (v1.1)
import {...} from '@wranngle/voice-evals/scoring';      // Composer + assertions DSL + audio scorers
import {...} from '@wranngle/voice-evals/ingestion';    // Post-call import + TestChain proposer + personas + random scenarios
import {...} from '@wranngle/voice-evals/regression';   // Versioned baselines + Braintrust-shape diff
import {...} from '@wranngle/voice-evals/remediation';  // proposeFix / applyFix / polishLoop + autorefinement patterns (v1.1)
import {...} from '@wranngle/voice-evals/factory';      // Combinatorial test factory: cartesian/pairwise/sample + YAML templates (v1.1)
import {...} from '@wranngle/voice-evals/n8n';          // n8n workflow auto-corrector + WORKFLOW_FIXES (v1.1)
import {...} from '@wranngle/voice-evals/scenarios';    // Adversarial preset catalogue: noise / interrupt / mumble / accent
```

The flat `'@wranngle/voice-evals'` barrel re-exports everything for convenience.

## What this is

Test runner and scenario framework for evaluating ElevenLabs Conversational AI voice agents in bulk. Deterministic via seeded synthetic transcripts; total-turn latency captured per test (`latency_ms` per result, `avg_latency_ms` and slowest-test in the run summary); prompt versioning via git tags. Bring-your-own agent — point the harness at any agent ID, drop in a scenario YAML, get pass/fail with assertion-level detail.

### What's implemented today (v1.1)

**Wrapper** — `createVoiceEvalsClient` with full agent CRUD (`list`, `get`, `create`, `update`, `clone`, `archive`, `promote`) under `[PHASE]` governance, tool-schema sanitization (`cleanTools`), webhook signature verifier, model-rankings ban list, native Tests API (`tests.{create, list, runBatch, pollInvocation, …}`).

**Scoring** — Composable `Task = (dataset, caller, scorer)` model; `compose`, `weighted`, `aggregate`; assertions DSL (`contains`, `regex`, `equals`, `not`, `llmRubric`); audio-native scorers (`parseWav`, RMS envelope, VAD, two-stream barge-in); judges (`g-eval`, `arena`, `dag`, `lynx`).

**Test factory** — Combinatorial expansion (`cartesian`, `pairwise`, `kWise` with k≥3 support, `sample` with seeded Fisher-Yates), YAML template loader with `{placeholder}` interpolation + `inherit:`/`overrides:` overlay merging; 12 industries × 20 variants (5 demo_close + 5 objection + 5 personality + 5 edge_case) × 26 base scenarios shipped under `templates/factory/`.

**Closed-loop remediation** — `polishLoop` (6-phase: EVALUATE → ANALYZE → PROPOSE → APPLY → VERIFY → LOG) returns dimension-level deltas (`initialFailingDimensions`, `improvedDimensions`, `regressedDimensions`, `netImprovement`, `regressed`); 5 canonical `FAILURE_PATTERNS` (`SMS_AFTER_DECLINE`, `TOOL_NOT_CALLED`, `CONTEXT_LOST`, `HOSTILE_RESPONSE`, `INCONSISTENT_BEHAVIOR`) with context-aware regex (negation lookahead, agent-quoting suppression); append-only friction log with O(1) tombstone resolve; cycle-stats aggregation.

**Supersystem** — `runSupersystem` orchestrates L1 agent fixes (polishLoop) + L2 n8n workflow fixes + L3 friction log + L7 black-box workflow eval in a single autonomous driver. Stops on `agent_regressed` (operator gate), `all_passing`, or `max_cycles`.

**n8n auto-corrector** — `createN8nCorrector` with `applyPartialUpdate`, `diagnoseWorkflowFailure`, 4 `WORKFLOW_FIXES` (retry, error-handling, timeout, webhook data); node-level vs parameters-level key separation enforced via `NODE_LEVEL_PROPS`. `evaluateWorkflows` (Layer 7) feeds black-box failures back into the friction log.

**Ingestion** — Post-call webhook importer, TestChain proposer/designer (LLM-driven), 5 canonical personas with audio traits, deterministic random scenario generator (14 baked-in industries × 24 names × 5 call volumes × 4 interest levels).

**Regression** — Versioned baselines + Braintrust-shape diff; CI-gateable on `result.regressions.length`.

**CLI** — `voice-evals {help, init, score, demo, ingest, polish, refine, ceo-demo, baseline, compare, doctor, factory, agent, friction, n8n, webhooks, scenarios, legacy}`. Each verb has a `--help` listing its subcommands; the dispatcher → help alignment is regression-tested under `tests/_meta_audit/cli-help-alignment.test.ts`.

### What's *not* implemented yet (known gaps, post-v1.1 audit)

- **Live ElevenLabs SDK contract tests.** All wrapper / Tests-API / corrector tests use mocked clients. Production drift (SDK shape changes, response envelopes) goes uncaught until a real call fails.
- **GEPA Python sidecar protocol.** The bridge stubs out with `GepaUnavailableError`. 24 tests cover the *absence* of the sidecar; zero cover the JSON-IO protocol because the sidecar isn't shipped yet.
- **Audio formats beyond WAV PCM.** No G.711 / μ-law / a-law parser. Mono call recordings (common in production) fall back to single-channel VAD with no barge-in.
- **Live LLM judges in CI.** `g-eval`, `arena`, `dag` accept `judge_llm` callbacks but CI runs deterministic heuristics only.
- **A/B framework for polish-loop outcomes.** `regressed` flag tells you when a fix made things worse on the dimensions you tested, but there's no built-in suite-comparison across agent revisions.
- **Optimistic concurrency on n8n PUTs.** Two parallel `applyPartialUpdate` calls on the same workflow last-write-win silently. No `If-Match` / ETag.
- **Append-only friction log compaction.** `resolveFrictionAppend` writes a tombstone in O(1), but the log grows monotonically. No rotation or compaction utility yet.

See `docs/META-AUDIT.md` for the full feature × test-reality matrix and the impatient-CEO roast that motivated the post-v1.1 hardening.

## Run it

```bash
bun install

# Offline tests — pure logic + runner UNIT tests (mocked fetch). No secrets needed.
# Covers: ingestion, integration, governance, agent_evals, elevenlabs, n8n-eval, mcp.
bun run test:offline

# Live tests — actually hit real endpoints. Require API keys and run locally.
# These are STANDALONE SCRIPTS, not vitest tests.
bun run testing:live:el       # POSTs to api.elevenlabs.io/v1/convai/agents/<id>/simulate-conversation
bun run testing:live:n8n      # POSTs to your n8n webhook host
bun run testing:live:mcp      # POSTs to your n8n MCP-style workflow

# Webhook tests against a deployed receiver — vitest project that auto-skips in CI.
bun run test:webhook

# CLI (stored test cases & runs under .test-data/)
bun run testing list
bun run testing list -t scenario
bun run testing run --id SCEN-lookup-record-greeting
bun run testing run -t scenario   # exits nonzero if a committed scenario is failing
bun run testing run -t scenario --parallel --concurrency 4   # bounded concurrency for long suites

# App adapter: run gtm_ops through its manifest-owned test surface.
bun run testing:gtm-ops --root ../gtm_ops
bun run testing:gtm-ops --root ../gtm_ops --tag ui
```

To wire to your live agent, copy `agent-registry.example.yaml` → `agent-registry.yaml` (gitignored) and fill in real IDs, or set `ELEVENLABS_AGENT_ID` directly.

## Gate merges on voice-evals score (preview)

The gating workflow template lives at [`.github/workflows/voice-evals-gate.yml.template`](.github/workflows/voice-evals-gate.yml.template). It pins `@wranngle/voice-evals@v1`, runs on every PR to `main`, uploads the JSON summary as an artifact, and posts a PR comment when the gate fails.

> ⚠️  **Preview interface.** The template invokes `voice-evals score --fixtures <dir> --min-success-rate <rate> --json-summary <file>` — the v1.2 gate-native CLI shape. That flag surface is **not** shipped in v1.1.x; `voice-evals score` today takes a single WAV positional + `--html-out` / `--run-id` / `--json-log`. The template's header lists working alternatives (`legacy run -t scenario --json` + jq, or a per-fixture shell loop) you can splice in until the unified gate CLI lands.

```bash
mkdir -p .github/workflows
curl -fsSL https://raw.githubusercontent.com/wranngle/voice-evals/v1/.github/workflows/voice-evals-gate.yml.template \
  -o .github/workflows/voice-evals-gate.yml
gh secret set ELEVENLABS_API_KEY VOICE_EVALS_AGENT_ID
git add .github/workflows/voice-evals-gate.yml && git commit -m "ci: gate PRs on voice-evals"
```

## What's in here

- **`src/testing/`** — runner library: `runners/` (elevenlabs, n8n-eval, mcp, webhook, external-command), `adapters/`, `ingestion/`, CLI
- **`src/extraction/`** — structured extraction from transcripts and post-call payloads (will be reshaped into `src/ingestion/` in Phase 3)
- **`src/agent_evals/`** — agent-eval runtime + fixtures
- **`src/security/`** — ElevenLabs HMAC signature verification
- **`scripts/`** — build (`build.mjs`), postinstall (`postinstall.mjs`), runner entry points (`test-elevenlabs-runner`, `test-mcp-runner`, `test-n8n-eval-runner`), and harness utilities (`health-check`, `monitor-executions`, `list-workflows`, `ingest-and-run`)
- **`templates/`** — reusable agent and tool config templates (`elevenlabs-agents/`, `voice-agents/`, `email/`, `sms-booking-tool-template.json`)
- **`tests/scenarios/`** — runnable scenario fixtures (transcript + scenario.yaml). `_template/` is the canonical schema; copy and edit.
- **`tests/runs/`** — hand-authored synthetic result.json examples for a passing and a failing run, with a postmortem `NOTE.md` alongside the failing example to document the failure-mode reasoning; live CLI runs persist normalized results under `.test-data/`.
- **`docs/`** — methodology, tool calling, webhook security, contributor walkthrough, model-update playbook
- **`playground/`** — Bun-served single-page ElevenLabs widget + UI showcase (see below)

## Playground — live ElevenLabs UI showcase

Standalone single-page console at `playground/` that demos every `<elevenlabs-convai>` knob, the native UI components, the `@elevenlabs/react` hooks, and 11 upstream reference blocks against a real `[DEV]` showcase agent. Live PATCH round-trip through the governance guard, real Scribe / WebRTC / signed-url, API key never reaches the browser.

```console
$ bun playground          # http://localhost:4321
$ bun playground:verify   # 18/18 e2e + 7/7 live-probe + a11y (4 views) + mobile
```

See [`playground/README.md`](playground/README.md) for the capability map and [`playground/AUDIT.md`](playground/AUDIT.md) for the per-capability evidence table.

## v1.0 phase tracker

Tracked under [`feat/v1.0-bun-package`](https://github.com/wranngle/voice-evals/tree/feat/v1.0-bun-package). See [`CHANGELOG.md`](CHANGELOG.md) for full per-phase notes.

- ✅ **Phase 0** — package shell + build pipeline
- ✅ **Phase 1** — ElevenLabs wrapper (governance + tool-schema cleaning)
- ✅ **Phase 2** — scoring engine (composer + assertions DSL + audio-native)
- ✅ **Phase 2.x** — judges (G-Eval, ArenaGEval, Lynx, DAG)
- ✅ **Phase 3** — LLM data layer (post-call import + TestChain Proposer + personas)
- ✅ **Phase 3.x** — TestChain Designer (free-form draft assertions → structured specs)
- ✅ **Phase 4** — regression baselines + Braintrust-shaped diff
- ✅ **Phase 5** — closed-loop remediation (proposer + apply + polish loop; GEPA bridge contract)
- ✅ **Phase 5.x** — Python sidecar install via `voice-evals doctor --install` (uv-managed venv + gepa pip + `gepa_run.py` JSON-IO; Python stub, full optimizer wiring in v1.1)
- ✅ **Phase 6** — CLI doctor + README v1.0 + quickstart example
- ✅ **Phase 6.x** — matrix CI on Bun 1.1 + Node 20 + Node 22; CLI commands split (`init`, `baseline capture`, `baseline diff`)
- ⏳ **npm publish** — `bun publish` to `@wranngle/voice-evals@1.0.0` (user-authorized action; not autonomous)
- ⏳ **GitHub repo rename** — `wranngle/voice_ai_agent_evals` → `wranngle/voice-evals` (user action)
- ⏳ **v1.1** — scenario-runner migration onto new scoring primitives; full GEPA optimizer wiring; PyRIT adversarial sidecar

## Documentation

- [`docs/methodology.md`](docs/methodology.md) — eval philosophy: determinism, prompt versioning, scoring rubric, implemented fixture axes, and remaining live-agent gaps
- [`docs/tool-calling.md`](docs/tool-calling.md) — server-side vs. client-side tools, `agent.prompt.tools` schema, KB-vs-tool boundary
- [`docs/webhook-security.md`](docs/webhook-security.md) — `ElevenLabs-Signature` header verification (HMAC-SHA256 over `<timestamp>.<body>`)
- [`docs/deployment.md`](docs/deployment.md) — operator setup: env vars, prompt-promotion flow, rollback flow
- [`docs/external-app-adapters.md`](docs/external-app-adapters.md) — app-owned command manifests and the `gtm_ops` adapter
- [`docs/extending-the-harness.md`](docs/extending-the-harness.md) — adding a new scenario
- [`docs/handling-model-updates.md`](docs/handling-model-updates.md) — playbook for ElevenLabs model updates
- [`docs/elevenlabs-twilio-voiceagent/`](docs/elevenlabs-twilio-voiceagent/) — standalone smoke-test bundle (shell scripts + API references) for verifying ElevenLabs and Twilio credentials in a fresh sandbox
- [`RUNBOOK.md`](RUNBOOK.md) — operational runbook

## License

See [`LICENSE`](LICENSE).
