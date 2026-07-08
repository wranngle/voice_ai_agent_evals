/**
 * Refinement orchestrator — the one-button pipeline the pitch promises.
 *
 * Flow:
 *   1. Enrich (business name + website → vertical hint + service area + hours)
 *   2. Select vertical template
 *   3. Fill system prompt
 *   4. Run persona calls — `--mock` uses deterministic fixtures, `--agent-id`
 *      routes through `agents.simulateConversation` via live-adapter.ts.
 *      (Native Tests-API integration lands when refinement ships inside
 *      the ElevenLabs agent builder; today the CLI uses simulateConversation.)
 *   5. Detect failures against the catalog
 *   6. Build plain-language prompt diffs
 *   7. Re-run personas with fixes applied; score before / after
 *   8. Generate compliance artifact + regression suite + write session JSON
 */

import {
  existsSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import {join} from 'node:path';
import type {VoiceEvalsClient} from '../wrapper/types';
import type {LlmCompleteCallback} from '../ingestion/types';
import {renderComplianceArtifact} from './compliance';
import {enrich, enrichFromAgentPrompt} from './enrich';
import {detectFailures, detectRubricFailures, loadCatalog} from './failure-detector';
import {inferBusinessContextFromAgent, runLivePersonaCalls} from './live-adapter';
import {CANONICAL_PERSONA_IDS, getPersonaCalls} from './persona-fixtures';
import {buildPromptDiffs} from './prompt-diff';
import {normalizeReplayState} from './replay-state';
import {SessionLog} from './session-log';
import {fillSystemPrompt, loadVerticalTemplates, selectTemplate} from './template-selector';
import type {
  PersonaCall, RefineOptions, RefinementSession, VerticalTemplate,
} from './types';

function newSessionId(): string {
  const ts = new Date().toISOString().replaceAll(/[:.]/g, '-');
  return `refine-${ts}`;
}

function scoreCall(call: PersonaCall, failures: number): number {
  const ttfbPenalty = (call.ttfb_ms ?? 0) > 800 ? 0.15 : 0;
  const failurePenalty = Math.min(0.7, failures * 0.18);
  return Math.max(0, 1 - ttfbPenalty - failurePenalty);
}

function aggregateScore(
  calls: PersonaCall[],
  failuresByPersona: Map<string, number>,
): number {
  if (calls.length === 0) {
    return 0;
  }

  let total = 0;
  for (const call of calls) {
    total += scoreCall(call, failuresByPersona.get(call.persona_id) ?? 0);
  }

  return total / calls.length;
}

function countFailuresByPersona(failures: ReturnType<typeof detectFailures>): Map<string, number> {
  const map = new Map<string, number>();
  for (const failure of failures) {
    map.set(failure.persona_id, (map.get(failure.persona_id) ?? 0) + 1);
  }

  return map;
}

/**
 * Deterministic per-dimension score. Failures whose mode id appears in the
 * dimension's `related_failure_modes` count against it with the same 0.18
 * per-failure penalty `scoreCall` uses; `latency_floor_breach` dimensions
 * additionally fold in the measured TTFB (fraction of calls over 800ms at the
 * same 0.15 penalty). No randomness — same inputs, same scoreboard.
 */
function dimensionScore(
  relatedModes: string[] | undefined,
  calls: PersonaCall[],
  failures: ReturnType<typeof detectFailures>,
): number {
  if (calls.length === 0) {
    return 0;
  }

  const related = new Set(relatedModes ?? []);
  const hits = failures.filter(f => related.has(f.mode_id)).length;
  const failureComponent = Math.max(0, 1 - Math.min(0.7, hits * 0.18));
  if (related.has('latency_floor_breach')) {
    const slow = calls.filter(c => (c.ttfb_ms ?? 0) > 800).length;
    const latencyComponent = 1 - (0.15 * (slow / calls.length));
    return Math.min(failureComponent, latencyComponent);
  }

  return failureComponent;
}

function buildRegressionSuite(
  template: VerticalTemplate,
  beforeCalls: PersonaCall[],
  failures: ReturnType<typeof detectFailures>,
): Array<Record<string, unknown>> {
  const suite: Array<Record<string, unknown>> = [];

  for (const call of beforeCalls) {
    suite.push({
      test_id: `regression.persona.${call.persona_id}`,
      persona_id: call.persona_id,
      kind: 'persona_call',
      prompt: call.turns.find(t => t.role === 'caller')?.text ?? '(persona script)',
      assertions: template.evaluation_rubric.map(r => ({
        dimension: r.dimension,
        rubric: r.pass,
      })),
    });
  }

  // turn_index + occurrence counter disambiguate repeated hits of the same
  // mode on the same persona (even two patterns matching one turn) — without
  // them, suite entries collide and any result store keyed by test_id
  // silently clobbers.
  const seen = new Map<string, number>();
  for (const failure of failures) {
    const base = `regression.failure.${failure.mode_id}.${failure.persona_id}.t${failure.evidence.turn_index}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    suite.push({
      test_id: n === 1 ? base : `${base}.${n}`,
      kind: 'failure_mode_regression',
      mode_id: failure.mode_id,
      persona_id: failure.persona_id,
      negative_phrase: failure.evidence.matched_phrase,
      assertion: `Agent transcript MUST NOT contain "${failure.evidence.matched_phrase ?? failure.evidence.surrounding_text.slice(0, 40)}" or equivalent.`,
    });
  }

  return suite;
}

export async function runRefinement(
  options: RefineOptions,
  onEvent?: (event: ReturnType<SessionLog['snapshot']>[number]) => void,
): Promise<RefinementSession> {
  const log = new SessionLog();
  if (onEvent) {
    log.subscribe(onEvent);
  }

  const sessionId = options.session_id ?? newSessionId();
  const outRoot = options.out_dir ?? join(process.cwd(), 'proof', 'sessions');
  const sessionDir = join(outRoot, sessionId);
  mkdirSync(sessionDir, {recursive: true});

  log.emit('session.start', 'start', `session ${sessionId} initialized`);

  const liveClient = options.client as VoiceEvalsClient | undefined;
  const isLive = Boolean(options.agent_id && liveClient && !options.mock);

  let enrichment;
  let ttsModelId: string | undefined;
  if (isLive && liveClient && options.agent_id) {
    log.emit('enrichment.start', 'start', `fetching agent ${options.agent_id} from ElevenLabs`);
    const ctx = await inferBusinessContextFromAgent(liveClient, options.agent_id);
    enrichment = await enrichFromAgentPrompt({agentName: ctx.name, systemPrompt: ctx.systemPrompt});
    // Capture the live agent's TTS model so the detector can suppress model-version
    // false positives (e.g. voice_marker_leakage flagging v3 cue tags that a
    // v3 model performs rather than speaks).
    const cfg = (ctx.rawConfig as Record<string, unknown> | undefined) ?? {};
    const conv = (cfg.conversation_config ?? cfg.conversationConfig) as Record<string, unknown> | undefined;
    const tts = conv?.tts as Record<string, unknown> | undefined;
    ttsModelId = typeof tts?.model_id === 'string' ? tts.model_id : undefined;
    log.emit('enrichment.done', 'ok', `inferred ${enrichment.vertical_label} from agent system prompt`, {sources: enrichment.sources, agent_id: options.agent_id, tts_model_id: ttsModelId});
  } else {
    log.emit('enrichment.start', 'start', `looking up ${options.business_name ?? '(no name)'}`);
    enrichment = await enrich({
      businessName: options.business_name,
      websiteUrl: options.website_url,
      mock: options.mock,
    });
    log.emit(
      'enrichment.done',
      enrichment.confidence > 0.7 ? 'ok' : 'warn',
      `classified as ${enrichment.vertical_label} (confidence ${enrichment.confidence.toFixed(2)})`,
      {sources: enrichment.sources, category: enrichment.category_hint},
    );
  }

  log.emit('template.select', 'start', 'matching vertical template');
  const template = selectTemplate(enrichment, options.vertical_override);
  log.emit('template.selected', 'ok', `using template ${template.id} (${template.display_name})`, {
    integrations: template.integrations.map(i => i.id),
    priority_failure_modes: template.priority_failure_modes,
  });

  const filledPrompt = fillSystemPrompt(template, enrichment);
  log.emit('prompt.fill', 'ok', `system prompt rendered (${filledPrompt.length} chars)`);

  log.emit('personas.before.start', 'start', isLive ? 'simulating 5 canonical personas against live agent' : 'exercising 5 canonical personas (before)');
  const personaIds = options.persona_ids ?? CANONICAL_PERSONA_IDS;
  const beforeCalls: PersonaCall[] = isLive && liveClient && options.agent_id
    ? await runLivePersonaCalls({
      client: liveClient,
      agentId: options.agent_id,
      businessContext: `${enrichment.business_name} — ${enrichment.vertical_label}; ${enrichment.services_summary}`,
      personaIds: [...personaIds],
    })
    : getPersonaCalls(template.id, 'before', [...personaIds]);
  log.emit('personas.before.done', 'ok', `captured ${beforeCalls.length} persona calls`, {
    personas: beforeCalls.map(c => c.persona_id),
    mode: isLive ? 'live' : 'mock',
  });

  log.emit('detect.start', 'start', 'applying failure-mode catalog');
  const catalog = loadCatalog();
  const beforeFailures = detectFailures(beforeCalls, catalog, template.priority_failure_modes, ttsModelId);

  const judgeLlm = options.llm as LlmCompleteCallback | undefined;
  if (judgeLlm) {
    log.emit('detect.rubric', 'start', 'routing rubric_judge modes through LLM judge');
    const rubricFailures = await detectRubricFailures(beforeCalls, catalog, judgeLlm, {
      filterByModeIds: template.priority_failure_modes,
      // Ground the judge: overclaiming/hallucination rubrics instruct it to
      // cross-check agent statements against this block rather than infer.
      businessContext: `${enrichment.business_name} — ${enrichment.vertical_label}; ${enrichment.services_summary}`,
    });
    beforeFailures.push(...rubricFailures);
    log.emit('detect.rubric.done', rubricFailures.length > 0 ? 'warn' : 'ok', `LLM judge flagged ${rubricFailures.length} additional defect(s)`);
  }

  const severityCounts: Record<string, number> = {};
  for (const failure of beforeFailures) {
    severityCounts[failure.severity] = (severityCounts[failure.severity] ?? 0) + 1;
  }

  log.emit('detect.done', beforeFailures.length > 0 ? 'warn' : 'ok', `${beforeFailures.length} defects detected`, severityCounts);

  log.emit('diff.start', 'start', 'building plain-language fix proposals');
  const promptDiffs = buildPromptDiffs(beforeFailures);
  log.emit('diff.done', 'ok', `${promptDiffs.length} fix proposals authored`);

  // Live phase-1 runs propose fixes but do NOT replay personas against a
  // patched agent — there is no honest after-measurement, so none is invented.
  // Mock runs replay against the 'after' fixtures and measure for real.
  const replay: 'measured' | 'deferred' = isLive ? 'deferred' : 'measured';
  let afterCalls: PersonaCall[] = [];
  let afterFailures: ReturnType<typeof detectFailures> = [];
  if (replay === 'measured') {
    log.emit('personas.after.start', 'start', 'replaying personas with fixes applied');
    afterCalls = getPersonaCalls(template.id, 'after', [...personaIds]);
    afterFailures = detectFailures(afterCalls, catalog, template.priority_failure_modes, ttsModelId);
    log.emit(
      'personas.after.done',
      afterFailures.length === 0 ? 'ok' : 'warn',
      `replay produced ${afterFailures.length} residual defects`,
    );
  } else {
    log.emit('personas.after.skipped', 'warn', 'live replay deferred to phase 2 — fixes are proposed, not yet applied or re-measured');
  }

  const beforeByPersona = countFailuresByPersona(beforeFailures);
  const before = aggregateScore(beforeCalls, beforeByPersona);
  const after = replay === 'measured'
    ? aggregateScore(afterCalls, countFailuresByPersona(afterFailures))
    : null;

  const dimensions = template.evaluation_rubric.map(r => ({
    dimension: r.dimension,
    before: dimensionScore(r.related_failure_modes, beforeCalls, beforeFailures),
    after: replay === 'measured'
      ? dimensionScore(r.related_failure_modes, afterCalls, afterFailures)
      : null,
  }));

  log.emit(
    'scoreboard',
    'ok',
    after === null
      ? `overall ${(before * 100).toFixed(0)}% before — ${promptDiffs.length} fix(es) proposed, after-score pending replay`
      : `overall ${(before * 100).toFixed(0)}% → ${(after * 100).toFixed(0)}% (${after >= before ? '+' : ''}${((after - before) * 100).toFixed(0)} points)`,
  );

  const regressionSuite = buildRegressionSuite(template, beforeCalls, beforeFailures);
  writeFileSync(join(sessionDir, 'regression-suite.json'), JSON.stringify(regressionSuite, null, 2));
  log.emit('regression.persist', 'ok', `${regressionSuite.length}-case regression suite captured`, {path: `proof/sessions/${sessionId}/regression-suite.json`});

  writeFileSync(join(sessionDir, 'system-prompt.md'), filledPrompt);
  log.emit('artifact.prompt', 'ok', 'rendered system prompt persisted', {path: `proof/sessions/${sessionId}/system-prompt.md`});

  const session: RefinementSession = {
    session_id: sessionId,
    started_at: log.snapshot()[0].at,
    finished_at: new Date().toISOString(),
    status: 'complete',
    enrichment,
    vertical_template_id: template.id,
    persona_calls: beforeCalls,
    detected_failures: beforeFailures,
    prompt_diffs: promptDiffs,
    regression_suite_size: regressionSuite.length,
    scoreboard: {
      before, after, replay, dimensions,
    },
    events: log.snapshot(),
  };

  const compliance = renderComplianceArtifact(session);
  const compliancePath = join(sessionDir, 'compliance.html');
  writeFileSync(compliancePath, compliance);
  session.compliance_artifact_path = `proof/sessions/${sessionId}/compliance.html`;
  log.emit('compliance.persist', 'ok', 'one-page compliance artifact generated', {path: session.compliance_artifact_path});

  // Deferred replay ⇒ no after-calls artifact. Writing the before-transcripts
  // under an "after" filename is exactly the lie the console would then render.
  if (replay === 'measured') {
    writeFileSync(join(sessionDir, 'after-calls.json'), JSON.stringify(afterCalls, null, 2));
  }

  writeFileSync(join(sessionDir, 'session.json'), JSON.stringify({...session, events: log.snapshot()}, null, 2));
  log.emit('session.persist', 'ok', 'session manifest written', {path: `proof/sessions/${sessionId}/session.json`});

  log.emit('session.complete', 'ok', `refinement complete in ${log.snapshot().length} steps`);
  session.events = log.snapshot();
  writeFileSync(join(sessionDir, 'session.json'), JSON.stringify(session, null, 2));
  updateSessionIndex(outRoot, {
    session_id: sessionId,
    business_name: enrichment.business_name,
    vertical_template_id: template.id,
    vertical_label: enrichment.vertical_label,
    finished_at: session.finished_at ?? new Date().toISOString(),
    defects_detected: session.detected_failures.length,
    fixes_proposed: session.prompt_diffs.length,
    regression_suite_size: session.regression_suite_size,
    score_before: session.scoreboard.before,
    score_after: session.scoreboard.after,
  });

  return session;
}

/**
 * Re-derive every analytic artifact of a stored session from its RECORDED
 * transcripts using the CURRENT failure-mode catalog + detector. The
 * transcripts (persona_calls) are the immutable evidence; detected failures,
 * fix proposals, scoreboard, regression suite, and compliance artifact are
 * derived views that must track the shipped detector — a session published
 * with findings the current code classifies as false positives is a lie.
 *
 * `ttsModelId` supplies the agent's TTS model for sessions recorded before
 * the orchestrator captured it (enables the model-aware voice_marker guard).
 */
export function rescoreSession(options: {
  sessionDir: string;
  ttsModelId?: string;
}): RefinementSession {
  const sessionPath = join(options.sessionDir, 'session.json');
  const session = JSON.parse(readFileSync(sessionPath, 'utf8')) as RefinementSession;
  const template = loadVerticalTemplates().find(t => t.id === session.vertical_template_id);
  if (!template) {
    throw new Error(`rescoreSession: unknown vertical template '${session.vertical_template_id}'`);
  }

  const catalog = loadCatalog();
  const beforeCalls = session.persona_calls;
  const beforeFailures = detectFailures(beforeCalls, catalog, template.priority_failure_modes, options.ttsModelId);
  const promptDiffs = buildPromptDiffs(beforeFailures);

  // Sessions recorded before the honest-replay change lack scoreboard.replay:
  // the shared normalizer infers it from the recorded run mode. Live phase-1
  // runs never had a real replay — any after-calls.json they carry is the
  // fabricated before-copy, which gets removed rather than re-scored.
  const recordedReplay = normalizeReplayState(session);
  const afterCallsPath = join(options.sessionDir, 'after-calls.json');
  if (recordedReplay === 'deferred' && existsSync(afterCallsPath)) {
    rmSync(afterCallsPath);
  }

  const measuredAfter = recordedReplay === 'measured' && existsSync(afterCallsPath);
  const afterCalls: PersonaCall[] = measuredAfter
    ? JSON.parse(readFileSync(afterCallsPath, 'utf8')) as PersonaCall[]
    : [];
  const afterFailures = measuredAfter
    ? detectFailures(afterCalls, catalog, template.priority_failure_modes, options.ttsModelId)
    : [];

  const before = aggregateScore(beforeCalls, countFailuresByPersona(beforeFailures));
  const after = measuredAfter
    ? aggregateScore(afterCalls, countFailuresByPersona(afterFailures))
    : null;
  const dimensions = template.evaluation_rubric.map(r => ({
    dimension: r.dimension,
    before: dimensionScore(r.related_failure_modes, beforeCalls, beforeFailures),
    after: measuredAfter
      ? dimensionScore(r.related_failure_modes, afterCalls, afterFailures)
      : null,
  }));

  const regressionSuite = buildRegressionSuite(template, beforeCalls, beforeFailures);

  session.detected_failures = beforeFailures;
  session.prompt_diffs = promptDiffs;
  session.regression_suite_size = regressionSuite.length;
  session.scoreboard = {
    before, after, replay: measuredAfter ? 'measured' : 'deferred', dimensions,
  };
  // Events fall in two classes: EVIDENCE (what the original run observed —
  // enrichment, template selection, the before persona calls) and DERIVED
  // (detection counts, diffs, after-state, scoreboard — claims computed by
  // whatever detector version ran). Evidence is kept verbatim; derived events
  // are REBUILT from the recomputed analytics. Keeping the old derived lines
  // would render stale (and, for pre-#184 live sessions, fabricated) claims
  // like "overall 89% → 100%" in the console's timeline. Repeated rescores
  // stay idempotent: each pass drops the previous derived tail and re-emits.
  const DERIVED_STEPS = new Set([
    'detect.start',
    'detect.done',
    'detect.rubric',
    'detect.rubric.done',
    'diff.start',
    'diff.done',
    'personas.after.start',
    'personas.after.done',
    'personas.after.skipped',
    'scoreboard',
    'regression.persist',
    'compliance.persist',
    'session.persist',
    'session.complete',
    'session.rescore',
  ]);
  const rescoredAt = new Date().toISOString();
  const scoreboardDetail = after === null
    ? `overall ${(before * 100).toFixed(0)}% before — ${promptDiffs.length} fix(es) proposed, after-score pending replay`
    : `overall ${(before * 100).toFixed(0)}% → ${(after * 100).toFixed(0)}% (${after >= before ? '+' : ''}${((after - before) * 100).toFixed(0)} points)`;
  session.events = [
    ...session.events.filter(e => !DERIVED_STEPS.has(e.step)),
    {
      at: rescoredAt, step: 'detect.done', status: beforeFailures.length > 0 ? 'warn' : 'ok', detail: `${beforeFailures.length} defects detected`,
    },
    {
      at: rescoredAt, step: 'diff.done', status: 'ok', detail: `${promptDiffs.length} fix proposals authored`,
    },
    measuredAfter
      ? {
        at: rescoredAt, step: 'personas.after.done', status: afterFailures.length === 0 ? 'ok' : 'warn', detail: `replay produced ${afterFailures.length} residual defects`,
      }
      : {
        at: rescoredAt, step: 'personas.after.skipped', status: 'warn', detail: 'live replay deferred to phase 2 — fixes are proposed, not yet applied or re-measured',
      },
    {
      at: rescoredAt, step: 'scoreboard', status: 'ok', detail: scoreboardDetail,
    },
    {
      at: rescoredAt, step: 'regression.persist', status: 'ok', detail: `${regressionSuite.length}-case regression suite captured`,
    },
    {
      at: rescoredAt,
      step: 'session.rescore',
      status: 'ok',
      detail: `re-scored against catalog ${catalog.version} with the current detector`
        + `${options.ttsModelId ? ` (tts_model_id ${options.ttsModelId})` : ''}; transcripts unchanged, derived events rebuilt`,
      data: {defects: beforeFailures.length, fixes_proposed: promptDiffs.length},
    },
  ];

  writeFileSync(join(options.sessionDir, 'regression-suite.json'), JSON.stringify(regressionSuite, null, 2));
  writeFileSync(join(options.sessionDir, 'compliance.html'), renderComplianceArtifact(session));
  writeFileSync(sessionPath, JSON.stringify(session, null, 2));
  updateSessionIndex(join(options.sessionDir, '..'), {
    session_id: session.session_id,
    business_name: session.enrichment.business_name,
    vertical_template_id: session.vertical_template_id,
    vertical_label: session.enrichment.vertical_label,
    finished_at: session.finished_at ?? session.started_at,
    defects_detected: beforeFailures.length,
    fixes_proposed: promptDiffs.length,
    regression_suite_size: regressionSuite.length,
    score_before: before,
    score_after: after,
  });

  return session;
}

type SessionIndexEntry = {
  session_id: string;
  business_name: string;
  vertical_template_id: string;
  vertical_label: string;
  finished_at: string;
  defects_detected: number;
  fixes_proposed: number;
  regression_suite_size: number;
  score_before: number;
  /**
   * Null when the session's replay is deferred (live phase-1) — no measured
   * after-score exists. `null` not `undefined`: survives JSON.stringify.
   */
  // eslint-disable-next-line @typescript-eslint/no-restricted-types
  score_after: number | null;
};

function updateSessionIndex(outRoot: string, entry: SessionIndexEntry): void {
  const indexPath = join(outRoot, 'index.json');
  let entries: SessionIndexEntry[] = [];
  if (existsSync(indexPath)) {
    try {
      entries = JSON.parse(readFileSync(indexPath, 'utf8')) as SessionIndexEntry[];
    } catch {
      entries = [];
    }
  }

  entries = entries.filter(e => e.session_id !== entry.session_id);
  entries.push(entry);
  entries.sort((a, b) => b.finished_at.localeCompare(a.finished_at));
  writeFileSync(indexPath, JSON.stringify(entries, null, 2));
}
