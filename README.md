# voice_ai_agent_evals

[![CI](https://github.com/wranngle/voice_ai_agent_evals/actions/workflows/vitest.yml/badge.svg)](https://github.com/wranngle/voice_ai_agent_evals/actions/workflows/vitest.yml)
[![License: MIT](https://img.shields.io/github/license/wranngle/voice_ai_agent_evals?style=flat-square)](LICENSE)

Eval and regression harness for ElevenLabs Conversational AI voice agents,
written in TypeScript and run with Bun. It scores call audio and transcripts,
captures versioned baselines, diffs new runs against them, and runs a
closed-loop prompt-fix iteration against a DEV agent. Bring your own agent
ID and a scenario file; get pass/fail with assertion-level detail.

## Status

Research and personal-tool stage. This is a solo build by one operator
(Wranngle), with no external users and no published npm package yet. The
code under `src/` works and is covered by 100+ Vitest files, but treat it as
an experimental harness, not a hardened product. Earlier drafts of this
README described a "v1.0 release candidate" and an npm install; the package
is not published, so install from source.

The honest gaps, also tracked in `docs/META-AUDIT.md`:

- **GEPA prompt-optimization sidecar is a stub.** `runGepaOptimization()`
  throws `GepaUnavailableError` because the Python sidecar is not shipped.
  The closed-loop `polishLoop` works today against a single-shot LLM
  proposer, not GEPA. Full GEPA wiring is a future plan, not done.
- **ElevenLabs and n8n integration tests use mocked clients.** Live SDK
  drift is not caught until a real call fails. The live scripts under
  `scripts/` do hit real endpoints, but they are standalone, not in CI.
- **Audio support is WAV PCM only.** No mu-law / G.711 / a-law parser, so
  mono call recordings (common in production) fall back to single-channel
  VAD with no barge-in.
- **LLM judges run deterministic heuristics in CI.** `g-eval`, `arena`, and
  `dag` accept a judge callback but CI does not call a live model.

## What actually ships

**Audio scoring (`src/scoring/audio.ts`).** Pure functions over WAV PCM
(16/24/32-bit, mono or stereo): `parseWav`, `rmsEnvelope`, energy-threshold
VAD (`detectSpeechSegments`), two-stream barge-in detection
(`detectBargeIn`), plus dimension scorers for voice activity, barge-in, SNR,
average pitch (autocorrelation F0), and speech rate. No filesystem I/O; the
caller loads the bytes and passes them in.

**Scoring composer and assertions (`src/scoring/`).** A composable
`Task = (dataset, caller, scorer)` model with `compose`, `weighted`, and
`aggregate`; an assertions DSL (`contains`, `regex`, `equals`, `not`,
`llmRubric`); and LLM-judge scaffolding (`g-eval`, `arena`, `dag`, `lynx`)
that takes an injected model callback.

**ElevenLabs wrapper with governance (`src/wrapper/`).**
`createVoiceEvalsClient` wraps agent CRUD (`list`, `get`, `create`,
`update`, `clone`, `archive`, `promote`) behind a `[PHASE]` name-tag gate so
mutations only land on agents you tag for it, tool-schema sanitization
(`cleanTools`), a model-rankings ban list, and an HMAC webhook signature
verifier.

**Regression baselines and diff (`src/regression/`).** Capture a versioned
baseline, then `diffAgainstBaseline` produces a Braintrust-shaped diff
(per-test, per-dimension, improvements / regressions / unchanged / new /
dropped). Pure function; gate CI on `result.regressions.length`.

**Ingestion (`src/ingestion/`).** Post-call webhook importer that turns a
production payload into test cases, an LLM-driven test proposer/designer, a
library of canonical personas with audio traits, and a deterministic random
scenario generator.

**Closed-loop remediation (`src/remediation/`).** `polishLoop` runs an
EVALUATE to ANALYZE to PROPOSE to APPLY to VERIFY to LOG cycle and returns
dimension-level deltas (improved, regressed, net). Ships five failure-pattern
detectors with context-aware regex (negation lookahead, agent-quote
suppression) and an append-only friction log. The GEPA optimizer path is a
stub (see Status).

**Test factory (`src/factory/`).** Combinatorial expansion (`cartesian`,
`pairwise`, `kWise`, seeded `sample`) over YAML templates with placeholder
interpolation and overlay merging.

**n8n auto-corrector (`src/n8n/`).** `createN8nCorrector` diagnoses workflow
failures and applies partial updates (retry, error-handling, timeout,
webhook-data fixes), with node-level vs parameter-level key separation.

**CLI (`src/cli.ts`).** Verbs: `init`, `demo`, `score`, `ingest`, `polish`,
`refine`, `ceo-demo`, `baseline`, `compare`, `doctor`, `factory`, `agent`,
`friction`, `n8n`, `webhooks`, `scenarios`, `legacy` (plus bare
`run`/`list`/`validate`/`report` passthroughs to the legacy harness). Each
verb has `--help`, and the dispatcher-to-help alignment is regression-tested.

## Try the demo (no keys, no config)

```bash
bun install
bun run src/cli.ts demo
```

The refinement proof console (session timelines, transcripts, scoreboards,
compliance artifacts) is served locally — it fetches session data, so opening
the HTML file directly won't work:

```bash
bun run proof   # → http://localhost:4173/refine.html
```

It synthesizes a short stereo fixture (caller left, agent right), runs the
voice-activity and barge-in scorers, prints a scorecard, and writes an HTML
report. Deterministic and offline.

## Library use (from source)

```ts
import {
  parseWav,
  scoreBargeIn,
  importPostCallWebhook,
  captureBaseline,
  diffAgainstBaseline,
  polishLoop,
} from './src/index';

// Audio-native barge-in scoring on a stereo WAV (caller=L, agent=R).
const wav = parseWav(await Bun.file('post-call.wav').arrayBuffer());
const dim = scoreBargeIn({
  callerSamples: wav.channelSamples![0],
  agentSamples: wav.channelSamples![1],
  sampleRate: wav.sampleRate,
  maxOverlapMs: 250,
});

// Turn a production webhook payload into test cases.
const {cases} = importPostCallWebhook(postCallWebhookJson);

// Closed-loop polish on a [DEV]-tagged agent (governance-gated, dry run).
await polishLoop({
  client,
  agentId: 'agent_xxxx_demo',
  evaluate: async () => myEvalSuite(), // returns DimensionScore[]
  llm: async ({system, user}) => myLlmCallback(system, user),
  maxIterations: 3,
  dryRun: true,
});
```

The flat `src/index.ts` barrel re-exports the public surface; the same
modules are split under `src/scoring`, `src/wrapper`, `src/regression`,
`src/ingestion`, `src/remediation`, `src/factory`, and `src/n8n` for direct
import.

## Gate merges on voice-evals score

The gating workflow template lives at [`.github/workflows/voice-evals-gate.yml.template`](.github/workflows/voice-evals-gate.yml.template). It runs on every pull request to `main` and fails the gate when the score drops below your threshold. Drop it into a consuming repo:

```bash
mkdir -p .github/workflows
curl -fsSL https://raw.githubusercontent.com/wranngle/voice_ai_agent_evals/main/.github/workflows/voice-evals-gate.yml.template \
  -o .github/workflows/voice-evals-gate.yml
gh secret set ELEVENLABS_API_KEY VOICE_EVALS_AGENT_ID
git add .github/workflows/voice-evals-gate.yml && git commit -m "ci: gate PRs on voice-evals"
```

The template runs the harness **from source** (it checks out this repo inside the consumer's workflow — the package is not on npm) and gates on the stored-scenario pass rate. The gate-native `score --fixtures --min-success-rate` CLI is a v1.2 target; the template will be rewritten around it when it ships.

## Tests

```bash
bun install

# Offline unit + integration tests (mocked fetch, no secrets).
bun run test:offline

# Live scripts that hit real endpoints (need API keys; run locally).
bun run testing:live:el    # ElevenLabs simulate-conversation
bun run testing:live:n8n   # your n8n webhook host
bun run testing:live:mcp   # your n8n MCP-style workflow

# Legacy scenario harness (scenario YAML + .test-data flow).
bun run testing list
bun run testing run -t scenario   # nonzero exit if a committed scenario fails
```

To wire to a live agent, copy `agent-registry.example.yaml` to
`agent-registry.yaml` (gitignored) and fill in real IDs, or set
`ELEVENLABS_AGENT_ID`.

## Layout

- `src/scoring/` - audio scorers, assertions DSL, composer, LLM judges
- `src/wrapper/` - ElevenLabs client + `[PHASE]` governance + tool cleaning
- `src/regression/` - versioned baselines + Braintrust-shaped diff
- `src/ingestion/` - post-call import, personas, scenario generation
- `src/remediation/` - polishLoop, failure patterns, friction log, GEPA stub
- `src/factory/` - combinatorial test expansion + YAML templates
- `src/n8n/` - n8n workflow auto-corrector
- `src/security/` - ElevenLabs HMAC signature verification
- `src/testing/` - legacy runner library and CLI
- `templates/` - agent, tool, and n8n workflow config templates
- `tests/` - Vitest suites (100+ files) plus runnable scenario fixtures
- `playground/` - Bun-served single-page ElevenLabs widget and UI showcase
- `docs/` - methodology, tool calling, webhook security, and the
  `META-AUDIT.md` feature-vs-test-reality matrix

## Documentation

- [`docs/methodology.md`](docs/methodology.md) - eval philosophy: determinism, prompt versioning, scoring rubric, and remaining live-agent gaps
- [`docs/tool-calling.md`](docs/tool-calling.md) - server-side vs client-side tools and the `agent.prompt.tools` schema
- [`docs/webhook-security.md`](docs/webhook-security.md) - `ElevenLabs-Signature` HMAC-SHA256 verification
- [`docs/META-AUDIT.md`](docs/META-AUDIT.md) - what is implemented vs what the tests actually cover

## License

MIT. See [`LICENSE`](LICENSE).
