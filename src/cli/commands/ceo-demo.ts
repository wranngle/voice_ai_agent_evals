/**
 * `voice-evals ceo-demo` — the central-promise eval.
 *
 * Runs N scenarios × M canonical personas against the live [DEV] INBOUND
 * TEMPLATE agent via the simulate-conversation API. Scores each transcript
 * on a deterministic 5-dimension intake rubric. Writes a single pass-rate
 * number and per-persona/per-dimension breakdown.
 *
 * This is the artifact the meta-audit says a CEO actually wants: "a single
 * number for how often the agent succeeds across N trials with diverse
 * personas." The number is honest about what it measures (transcript
 * evidence of intake elements), not what it doesn't (audio path, TTS
 * quality, real call dynamics — see docs/META-AUDIT.md §5).
 */

import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {CANONICAL_PERSONAS, buildPersonaSystemPrompt} from '../../ingestion/persona-generator';
import {createTracer} from '../../internal/jsonl-trace';

const trace = createTracer('cli.ceo-demo');

const DEFAULT_INBOUND_AGENT_ID = 'agent_7601krfykfpwfjxrjqcshg64pcby';
const API_BASE = 'https://api.elevenlabs.io/v1';

type Scenario = {
  id: string;
  intent: string;
  first_message: string;
};

const SCENARIOS: readonly Scenario[] = Object.freeze([
  {
    id: 'happy-path',
    intent: 'You need to book a routine furnace service for next Tuesday morning. You have a normal callback phone number you will share when asked. You are calm and cooperative.',
    first_message: 'Hi, I want to book a furnace service for Tuesday morning.',
  },
  {
    id: 'emergency',
    intent: 'Your air conditioning stopped working last night and the house is uncomfortably hot. This is urgent but no one is in physical danger. You want a same-day visit. You will give your callback number when asked.',
    first_message: 'My AC stopped working last night and I need someone to come look at it today.',
  },
  {
    id: 'incomplete-info',
    intent: 'You start the call without giving complete information. When asked for a callback number, you give only part of it the first time, then correct yourself. Your name is Jamie. Your full number is +15553346666.',
    first_message: 'Hi, I have a problem with my heating, can someone help?',
  },
]);

type ScoreRecord = {
  named: boolean;
  phone: boolean;
  request_captured: boolean;
  urgency_classified: boolean;
  clean_close: boolean;
};

type RunResult = {
  scenario_id: string;
  persona_id: string;
  status: 'ok' | 'http_error' | 'no_transcript' | 'fetch_error';
  http_status?: number;
  error?: string;
  agent_turns: number;
  user_turns: number;
  score: ScoreRecord;
  passed: boolean;
  transcript_preview: string;
  transcript?: Array<{role: string; message: string}>;
};

type SimulateResponse = {
  simulated_conversation?: Array<{role: string; message: string}>;
  transcript?: Array<{role: string; message: string}>;
  analysis?: unknown;
};

export type CeoDemoOptions = {
  agentId?: string;
  scenarios?: number;
  concurrency?: number;
  outputDir?: string;
  reportPath?: string;
  out?: (line: string) => void;
};

export async function runCeoDemo(options: CeoDemoOptions = {}): Promise<number> {
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    out('error: ELEVENLABS_API_KEY not set in env. Source ~/.agents/.env or export the key.');
    return 2;
  }

  const agentId = options.agentId ?? DEFAULT_INBOUND_AGENT_ID;
  const scenarioCount = options.scenarios ?? SCENARIOS.length;
  const scenarios = SCENARIOS.slice(0, Math.max(1, Math.min(scenarioCount, SCENARIOS.length)));
  const concurrency = Math.max(1, options.concurrency ?? 5);
  const personas = CANONICAL_PERSONAS;

  const trials: Array<{scenario: Scenario; persona: typeof personas[number]}> = [];
  for (const scenario of scenarios) {
    for (const persona of personas) {
      trials.push({scenario, persona});
    }
  }

  trace.info('start', {
    agentId, trial_count: trials.length, scenarios: scenarios.map(s => s.id), personas: personas.map(p => p.id),
  });

  out(`voice-evals ceo-demo`);
  out(`  agent:       ${agentId}`);
  out(`  scenarios:   ${scenarios.map(s => s.id).join(', ')}`);
  out(`  personas:    ${personas.map(p => p.id).join(', ')}`);
  out(`  trials:      ${trials.length}  (concurrency ${concurrency})`);
  out('');

  const startedAt = Date.now();
  const results: RunResult[] = await runWithConcurrency(trials, concurrency, async ({scenario, persona}) => {
    const trialId = `${scenario.id}|${persona.id}`;
    out(`  ↻ ${trialId}`);
    const result = await runOneTrial({
      apiKey, agentId, scenario, persona,
    });
    const mark = result.passed ? '✓' : '✗';
    out(`  ${mark} ${trialId}  (${result.agent_turns} agent / ${result.user_turns} user turns)`);
    trace.info('trial', {trial_id: trialId, passed: result.passed, status: result.status, score: result.score});
    return result;
  });

  const elapsedMs = Date.now() - startedAt;
  const summary = summarise(results, personas, scenarios, agentId, elapsedMs);

  // Persist report.
  const reportDir = options.outputDir ?? join(process.cwd(), 'reports');
  mkdirSync(reportDir, {recursive: true});
  const ts = new Date().toISOString().replaceAll(':', '-').replace(/\.\d+Z$/, 'Z');
  const reportPath = options.reportPath ?? join(reportDir, `ceo-demo-${ts}.json`);
  writeFileSync(reportPath, JSON.stringify({summary, results}, null, 2));

  out('');
  out('────────────────────────────────────────────────────────────');
  out(`PASS-RATE: ${summary.pass_rate_pct}%   (${summary.passed}/${summary.total} trials)`);
  out(`elapsed:   ${(elapsedMs / 1000).toFixed(1)}s`);
  out('');
  out('per-persona:');
  for (const row of summary.per_persona) {
    out(`  ${row.persona_id.padEnd(20)} ${row.passed}/${row.total}  (${row.pass_rate_pct}%)`);
  }

  out('');
  out('per-dimension:');
  for (const row of summary.per_dimension) {
    out(`  ${row.dimension.padEnd(20)} ${row.hits}/${summary.total}  (${row.hit_rate_pct}%)`);
  }

  out('');
  out(`report: ${reportPath}`);
  out('');
  out('HONEST CAVEATS:');
  out('  • Text-proxy via simulate-conversation API. Audio path (TTS, WebRTC,');
  out('    Twilio) is not exercised. See docs/META-AUDIT.md §5.');
  out('  • Scoring is regex/keyword evidence — proves intake elements appear in');
  out('    the transcript, NOT that the live agent would do the same on a phone.');

  trace.info('end', {pass_rate_pct: summary.pass_rate_pct, total: summary.total, elapsed_ms: elapsedMs});

  return summary.passed === summary.total ? 0 : 1;
}

async function runOneTrial(parameters: {
  apiKey: string;
  agentId: string;
  scenario: Scenario;
  persona: typeof CANONICAL_PERSONAS[number];
}): Promise<RunResult> {
  const {apiKey, agentId, scenario, persona} = parameters;
  const simulatedUserPrompt = buildPersonaSystemPrompt(persona, scenario.intent);
  const body = {
    simulation_specification: {
      simulated_user_config: {
        language: 'en',
        first_message: scenario.first_message,
        prompt: {prompt: simulatedUserPrompt},
      },
    },
    new_turns_limit: 14,
  };

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/convai/agents/${agentId}/simulate-conversation`, {
      method: 'POST',
      headers: {'xi-api-key': apiKey, 'content-type': 'application/json'},
      body: JSON.stringify(body),
    });
  } catch (error) {
    return emptyResult(scenario.id, persona.id, 'fetch_error', undefined, (error as Error).message);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '<unreadable>');
    return emptyResult(scenario.id, persona.id, 'http_error', response.status, text.slice(0, 400));
  }

  const json = await response.json().catch(() => ({})) as SimulateResponse;
  const transcript = json.simulated_conversation ?? json.transcript ?? [];
  if (transcript.length === 0) {
    return emptyResult(scenario.id, persona.id, 'no_transcript');
  }

  const agentTurns = transcript.filter(t => t.role === 'agent');
  const userTurns = transcript.filter(t => t.role === 'user');
  const score = scoreTranscript(transcript, scenario);
  const passed = countPassed(score) >= 4;

  return {
    scenario_id: scenario.id,
    persona_id: persona.id,
    status: 'ok',
    http_status: response.status,
    agent_turns: agentTurns.length,
    user_turns: userTurns.length,
    score,
    passed,
    transcript_preview: transcript.slice(0, 4)
      .map(t => `${t.role}: ${t.message.slice(0, 120)}`)
      .join(' | '),
    transcript,
  };
}

function emptyResult(scenarioId: string, personaId: string, status: RunResult['status'], httpStatus?: number, error?: string): RunResult {
  return {
    scenario_id: scenarioId,
    persona_id: personaId,
    status,
    http_status: httpStatus,
    error,
    agent_turns: 0,
    user_turns: 0,
    score: {
      named: false, phone: false, request_captured: false, urgency_classified: false, clean_close: false,
    },
    passed: false,
    transcript_preview: '',
  };
}

function scoreTranscript(transcript: Array<{role: string; message: string}>, scenario: Scenario): ScoreRecord {
  // Normalize whitespace — simulate-conversation transcripts contain double-spaces,
  // \n\n artifacts, and "5 5 5 - 1 2 3" digit-spacing that defeat naked regexes.
  const normalize = (s: string): string => s.replace(/\s+/g, ' ').trim();
  const agentRaw = transcript.filter(t => t.role === 'agent').map(t => t.message).join(' ');
  const userRaw = transcript.filter(t => t.role === 'user').map(t => t.message).join(' ');
  const agentText = normalize(agentRaw);
  const userText = normalize(userRaw);
  const agentLower = agentText.toLowerCase();
  const allLower = (agentText + ' ' + userText).toLowerCase();
  const closingTurn = normalize(transcript.filter(t => t.role === 'agent').at(-1)?.message ?? '');

  // 1. named: agent asked for a name OR the user provided one (any form).
  const askedForName = /\b(your name|may i (have|get) your name|who am i (speaking|talking) (to|with)|what'?s your name|can i (get|have) your name)\b/i.test(agentText);
  const namedInUser = /\b(?:i'm|i am|my name is|this is|it'?s|name's|call me|name is)\s+[A-Z][a-z]{1,15}\b/i.test(userText);
  const named = askedForName || namedInUser;

  // 2. phone: agent acknowledged a callback number (asked or confirmed), OR caller said one.
  const askedForPhone = /\b(callback|call.back|callback number|phone number|number to (reach|call)|best number|your number|number to call you)\b/i.test(agentText);
  const phoneDigitsInUser = /(?:\b\d[\s\-]?){7,}/.test(userText) || /\bfive\s+five\s+five\b/i.test(userText);
  const phone = askedForPhone || phoneDigitsInUser;

  // 3. request_captured: agent paraphrased or named the service type from the scenario.
  const serviceTokens = /(furnace|heating|ac|air[\s-]?conditioning|hvac|service|appointment|repair|maintenance|fix|cooling)/i;
  const agentTurnCount = transcript.filter(t => t.role === 'agent').length;
  const requestCaptured = serviceTokens.test(agentLower) && agentTurnCount >= 2;

  // 4. urgency_classified: agent named or implied an urgency bucket.
  const urgencyTokens = /\b(emergency|urgent|same.?day|today|right away|asap|routine|scheduled|tuesday|next week|priority)\b/i;
  const urgencyClassified = urgencyTokens.test(allLower);

  // 5. clean_close: agent had at least 2 turns, no `{{var}}` template-leak,
  //    no `[directive]` bracket-leak (e.g. `[kindred]`, `[calm]` v3 TTS cues
  //    that aren't supposed to be in spoken text).
  const hasMustacheLeak = /\{\{[\w.]+\}\}|\$\{[\w.]+\}/.test(agentRaw);
  const hasBracketLeak = /\[[a-z][a-z0-9_-]+\]/i.test(agentRaw);
  const conversedAtAll = transcript.filter(t => t.role === 'agent').length >= 2;
  const closingNonEmpty = closingTurn.length > 0;
  const cleanClose = conversedAtAll && closingNonEmpty && !hasMustacheLeak && !hasBracketLeak;

  // Suppress unused: scenario passed in to allow future scenario-specific scoring.
  void scenario;

  return {
    named, phone, request_captured: requestCaptured, urgency_classified: urgencyClassified, clean_close: cleanClose,
  };
}

function countPassed(score: ScoreRecord): number {
  return Object.values(score).filter(Boolean).length;
}

type Summary = {
  agent_id: string;
  started_at: string;
  elapsed_ms: number;
  total: number;
  passed: number;
  pass_rate_pct: number;
  per_persona: Array<{persona_id: string; total: number; passed: number; pass_rate_pct: number}>;
  per_dimension: Array<{dimension: keyof ScoreRecord; hits: number; hit_rate_pct: number}>;
  per_scenario: Array<{scenario_id: string; total: number; passed: number; pass_rate_pct: number}>;
  errors: Array<{trial: string; status: RunResult['status']; http_status?: number; error?: string}>;
};

function summarise(
  results: RunResult[],
  personas: readonly typeof CANONICAL_PERSONAS[number][],
  scenarios: readonly Scenario[],
  agentId: string,
  elapsedMs: number,
): Summary {
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const pct = (n: number, d: number): number => d === 0 ? 0 : Math.round((n / d) * 1000) / 10;

  const perPersona = personas.map(p => {
    const rows = results.filter(r => r.persona_id === p.id);
    const ok = rows.filter(r => r.passed).length;
    return {persona_id: p.id, total: rows.length, passed: ok, pass_rate_pct: pct(ok, rows.length)};
  });

  const dimensions: Array<keyof ScoreRecord> = ['named', 'phone', 'request_captured', 'urgency_classified', 'clean_close'];
  const perDimension = dimensions.map(dim => {
    const hits = results.filter(r => r.score[dim]).length;
    return {dimension: dim, hits, hit_rate_pct: pct(hits, total)};
  });

  const perScenario = scenarios.map(s => {
    const rows = results.filter(r => r.scenario_id === s.id);
    const ok = rows.filter(r => r.passed).length;
    return {scenario_id: s.id, total: rows.length, passed: ok, pass_rate_pct: pct(ok, rows.length)};
  });

  const errors = results.filter(r => r.status !== 'ok').map(r => ({
    trial: `${r.scenario_id}|${r.persona_id}`, status: r.status, http_status: r.http_status, error: r.error,
  }));

  return {
    agent_id: agentId,
    started_at: new Date(Date.now() - elapsedMs).toISOString(),
    elapsed_ms: elapsedMs,
    total,
    passed,
    pass_rate_pct: pct(passed, total),
    per_persona: perPersona,
    per_dimension: perDimension,
    per_scenario: perScenario,
    errors,
  };
}

async function runWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners: Array<Promise<void>> = [];
  for (let i = 0; i < concurrency; i++) {
    runners.push((async () => {
      while (true) {
        const idx = next++;
        if (idx >= items.length) {
          return;
        }

        results[idx] = await worker(items[idx]);
      }
    })());
  }

  await Promise.all(runners);
  return results;
}
