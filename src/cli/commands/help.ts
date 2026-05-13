/**
 * `voice-evals --help` / `voice-evals help` — top-level help.
 *
 * Owns the help surface so users don't bottom out in the legacy harness
 * CLI's vocabulary (`.test-data/`, `SCEN-` ids, ingest from vitest files).
 * The legacy commands are still reachable under `voice-evals legacy <cmd>`.
 */

export type HelpOptions = {
  out?: (line: string) => void;
};

const HELP_TEXT = `voice-evals — audio-native voice AI agent eval, polish, and regression-test factory

USAGE
  voice-evals <command> [options]

PRIMARY COMMANDS
  init [--force]
      Scaffold voice-evals.config.{ts,mjs} in the current directory.

  score <wav-file>
      Score a recorded conversation. Audio-native: voice-activity per channel
      and (for stereo: caller=L, agent=R) barge-in detection. Prints
      DimensionScores. Exit 1 if any axis fails.

  ingest <transcript-file>
      Extract structured TestCases from a conversation transcript via the
      TestChain Proposer + Designer (LLM-driven). Uses the \`llm\` callback
      from voice-evals.config.

  polish <agent-id> [--dry-run] [--max-iterations N] [--patience N]
      Run the closed-loop remediation against an ElevenLabs agent. Uses
      \`client\`, \`llm\`, and \`evaluate\` from voice-evals.config. Mutation
      is gated to [DEV]-phase agents by default (see AGENTS.md).

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

  doctor [--install] [--dry-run]
      Sidecar status report. --install provisions the Python venv (uv +
      gepa) under ~/.cache/voice-evals/python/<version>/.

LEGACY HARNESS (v0.x scenario flow)
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

DOCS
  https://github.com/wranngle/voice-evals
`;

export async function runHelp(options: HelpOptions = {}): Promise<number> {
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });

  for (const line of HELP_TEXT.split('\n')) {
    out(line);
  }

  return 0;
}
