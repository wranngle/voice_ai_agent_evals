/**
 * `voice-evals refine` — the one-button Refinement command.
 *
 * Orchestrates enrichment → template selection → persona exercise → failure
 * detection → fix proposals → before/after scoring → compliance artifact.
 * Writes everything to proof/sessions/<id>/ so the surfaced-experience
 * console at proof/refine.html can render the run.
 */

import {createTracer} from '../../internal/jsonl-trace';
import {runRefinement} from '../../refinement';
import {renderEventForConsole} from '../../refinement/session-log';
import type {RefineOptions} from '../../refinement/types';

const trace = createTracer('cli.refine');
// JSONL tracing — emit start/end events from dispatch entry points.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
void trace;

export type RefineCliOptions = {
  businessName?: string;
  websiteUrl?: string;
  vertical?: string;
  mock?: boolean;
  sessionId?: string;
  outDir?: string;
  personaIds?: string[];
  agentId?: string;
  out?: (line: string) => void;
};

export async function runRefine(options: RefineCliOptions): Promise<number> {
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });

  if (!options.businessName && !options.websiteUrl && !options.agentId) {
    out('usage: voice-evals refine [--agent-id <id> | --business-name "Name"] [--website https://...] [--vertical hvac|dental|restaurant|legal] [--mock]');
    out('Refinement requires --agent-id (live mode), --business-name, or --website.');
    return 2;
  }

  const isLive = Boolean(options.agentId) && !options.mock;
  let client: unknown;
  if (isLive) {
    if (!process.env.ELEVENLABS_API_KEY) {
      out('error: --agent-id requires ELEVENLABS_API_KEY in the environment (use --mock to override).');
      return 2;
    }
    const {createVoiceEvalsClient} = await import('../../wrapper');
    client = createVoiceEvalsClient({apiKey: process.env.ELEVENLABS_API_KEY});
  }

  out('');
  out(`  refining: ${options.agentId ? `agent ${options.agentId}` : options.businessName ?? options.websiteUrl}`);
  out(`  mode:     ${isLive ? 'live (ElevenLabs simulateConversation)' : options.mock ? 'mock (deterministic fixtures)' : 'mock (no agent id given)'}`);
  if (options.vertical) {
    out(`  vertical: ${options.vertical} (override)`);
  }
  out('');

  const refineOpts: RefineOptions = {
    business_name: options.businessName,
    website_url: options.websiteUrl,
    vertical_override: options.vertical,
    mock: options.mock || !isLive,
    session_id: options.sessionId,
    out_dir: options.outDir,
    persona_ids: options.personaIds,
    agent_id: options.agentId,
    client,
  };

  const session = await runRefinement(refineOpts, event => {
    out(`  ${renderEventForConsole(event)}`);
  });

  out('');
  out(`  scoreboard: ${(session.scoreboard.before * 100).toFixed(0)}% → ${(session.scoreboard.after * 100).toFixed(0)}% (+${((session.scoreboard.after - session.scoreboard.before) * 100).toFixed(0)} points)`);
  out(`  defects:    ${session.detected_failures.length} detected → ${session.prompt_diffs.length} fixes proposed`);
  out(`  regression: ${session.regression_suite_size} cases captured for re-runs`);
  out('');
  out(`  artifacts (proof/sessions/${session.session_id}/):`);
  out('    session.json           — full event log + scoreboard + defects + diffs');
  out('    system-prompt.md       — rendered prompt for the agent');
  out('    regression-suite.json  — re-runnable assertion suite');
  out('    after-calls.json       — persona transcripts after fixes applied');
  out('    compliance.html        — one-page artifact (print to PDF)');
  out('');
  out(`  surfaced experience:   open proof/refine.html?session=${session.session_id}`);

  return session.detected_failures.length === session.prompt_diffs.length ? 0 : 1;
}
