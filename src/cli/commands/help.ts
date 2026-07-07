/**
 * `voice-evals --help` / `voice-evals help` — top-level help.
 *
 * Owns the help surface so users don't bottom out in the legacy harness
 * CLI's vocabulary (`.test-data/`, `SCEN-` ids, ingest from vitest files).
 * The legacy commands are still reachable under `voice-evals legacy <cmd>`.
 */

import {createTracer, traced} from '../../internal/jsonl-trace';

const trace = createTracer('cli.help');

export type HelpOptions = {
  out?: (line: string) => void;
};

const HELP_TEXT = `voice-evals — audio-native voice AI agent eval, polish, and regression-test factory

USAGE
  voice-evals <command> [options]

PRIMARY COMMANDS
  init [--force]
      Scaffold voice-evals.config.{ts,mjs} in the current directory.

  demo
      Run a 60-second end-to-end demo against a synthesized fixture: prints
      dimension scores, writes an HTML report, exits 0. No env vars required —
      ideal first-touch surface (\`npx @wranngle/voice-evals demo\`).

  score <wav-file> [--html-out <file>] [--run-id <id>] [--json-log <file>]
      Score a recorded conversation. Audio-native: voice-activity per channel
      and (for stereo: caller=L, agent=R) barge-in detection. Prints
      DimensionScores. Exit 1 if any axis fails. --html-out writes a
      self-contained report, --run-id labels the run, --json-log appends
      a JSONL result row.

  ingest <transcript-file>
      Extract structured TestCases from a conversation transcript via the
      TestChain Proposer + Designer (LLM-driven). Uses the \`llm\` callback
      from voice-evals.config.

  polish <agent-id> [--dry-run] [--max-iterations N] [--patience N]
      Run the closed-loop remediation against an ElevenLabs agent. Uses
      \`client\`, \`llm\`, and \`evaluate\` from voice-evals.config. Mutation
      is gated to [DEV]-phase agents by default (see AGENTS.md).

  refine [--agent-id <id> | --business-name "Name"] [--website https://...] [--vertical id] [--mock]
      One-button Refinement pipeline. Enriches the business, picks a
      vertical template, exercises 5 canonical personas, detects failures
      from the catalog, proposes plain-language fixes, scores before/after
      (mock mode replays and measures; live mode defers replay and marks
      the after-score pending), and writes a session bundle under
      proof/sessions/<id>/ — including a one-page compliance artifact
      (HTML, prints to PDF) and a captured regression suite. View it with
      \`bun run proof\` → http://localhost:4173/refine.html.

      --agent-id  Live mode: simulates 5 personas against an existing
                  ElevenLabs agent via simulateConversation. Requires
                  ELEVENLABS_API_KEY.
      --mock      Force mock mode even with --agent-id (deterministic
                  fixtures for demos / CI).
      --no-llm    Skip the LLM rubric judge. By default, when an LLM CLI
                  (llm.sh / LLM_SH) or GEMINI_API_KEY is available, the
                  rubric_judge failure modes (medical/legal advice, menu
                  hallucination, etc.) run through it; --no-llm keeps the
                  run deterministic + offline.
      --session-id <id>   Name the session directory (default: timestamped).
      --out-dir <dir>     Write the session bundle somewhere other than
                          proof/sessions/.
      --personas a,b,...  Run a subset of the 5 canonical personas.

  ceo-demo [agent-id] [--scenarios N] [--concurrency N]
      The central-promise eval: N scenarios × 5 canonical personas against
      a live ElevenLabs agent via simulate-conversation. Produces a single
      pass-rate number, per-persona breakdown, and a JSON report under
      reports/. Defaults to the [DEV] INBOUND TEMPLATE agent. Requires
      ELEVENLABS_API_KEY. See docs/META-AUDIT.md §5 for what it does NOT
      prove (audio path, TTS quality, real-call dynamics).

  factory <subcommand>
      Combinatorial test factory: generate, upload, execute, and report on
      bulk tests against an ElevenLabs agent. Subcommands: generate, upload,
      list, cleanup, execute, report, run. See \`voice-evals factory --help\`.

  agent <subcommand>
      Agent CRUD with [PHASE] governance. Subcommands: list, create, clone,
      archive, promote. See \`voice-evals agent --help\`.

  friction <subcommand>
      Friction-log audit ops. Subcommands: tail, list, resolve. The
      resolve subcommand appends an O(1) TOMBSTONE event rather than
      rewriting the log. See \`voice-evals friction --help\`.

  n8n <subcommand>
      n8n workflow corrector + Layer 7 black-box runner. Subcommands:
      diagnose, fix, eval. See \`voice-evals n8n --help\`. Requires
      N8N_API_KEY and N8N_BASE_URL env vars.

  webhooks <subcommand>
      Bootstrap and manage the ElevenLabs n8n webhook plumbing
      (post-call, monitoring, client-initiation). Subcommands: status,
      provision, rotate. See \`voice-evals webhooks --help\`. Requires
      ELEVENLABS_API_KEY, N8N_API_URL, N8N_API_KEY env vars.

  scenarios <subcommand>
      Random simulated-user scenario generator. Subcommand: generate.
      See \`voice-evals scenarios --help\`.

  baseline capture <name>
      Snapshot the latest stored run's results as a baseline JSON under
      baselines/<name>.json.

  baseline diff <name>
      Diff the latest stored run against a named baseline. Exits 1 if any
      regressions — wire into CI for gate.

  compare --runs <path,path,...> [--out <file|->]
      Render a side-by-side scorecard across N runs of the same scenario
      (each --runs entry is a RunResult JSON: agentId, scenario, outcome).
      Emits a self-contained HTML document with one \`<th>Δ</th>\` column
      per non-baseline agent. Writes to --out or stdout (--out -).

  doctor [--install] [--dry-run]
      Sidecar status report. --install provisions the Python venv (uv +
      gepa) under ~/.cache/voice-evals/python/<version>/.

LEGACY HARNESS (v0.x scenario flow)
  run -t <scenario> [--json]
      Legacy passthrough, identical to legacy run.

  list
      Legacy passthrough, identical to legacy list.

  validate
      Legacy passthrough, identical to legacy validate.

  report
      Legacy passthrough, identical to legacy report.

  legacy run|list|validate|report|ingest|clear
      The original test-runner CLI with stored scenario fixtures. Useful
      if you have already built a scenario suite; the v1.0 commands above
      are usually what you want.

GLOBAL
  --help, -h          Show this help.

CONFIG
  voice-evals.config.{ts,mjs} in cwd. \`voice-evals init\` scaffolds one.
  Required exports vary by command — see each command's error message.

ENV
  VOICE_EVALS_SKIP_PYTHON_INSTALL=1   Skip the optional Python sidecar
                                      install entirely.
  VOICE_EVALS_DISABLE_TRACE=1         Suppress all JSONL runtime tracing
                                      (logs/voice-evals-<date>.jsonl).
  VOICE_EVALS_NOTIFY_WEBHOOK_URL      POST run reports to this webhook
                                      (notify sink; off when unset).
  REFINE_JUDGE_MODEL                  Override the LLM model used by the
                                      refine rubric judge.

DOCS
  https://github.com/wranngle/voice_ai_agent_evals
`;

export async function runHelp(options: HelpOptions = {}): Promise<number> {
  return traced(trace, undefined, async () => runHelpInner(options));
}

async function runHelpInner(options: HelpOptions = {}): Promise<number> {
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });

  for (const line of HELP_TEXT.split('\n')) {
    out(line);
  }

  return 0;
}
