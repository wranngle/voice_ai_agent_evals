/**
 * Failure detector — applies the failure-mode catalog to a transcript.
 *
 * Two layers:
 *   - `detectFailures` (sync): regex_transcript, transcript_tool_coherence,
 *     transcript_repetition_count, audio_metric. Deterministic, offline.
 *   - `detectRubricFailures` (async): the rubric_judge modes, routed through
 *     an injected LlmCompleteCallback. Opt-in — when no llm is supplied the
 *     orchestrator simply skips this layer, preserving the offline contract.
 */

import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import type {LlmCompleteCallback} from '../ingestion/types';
import type {
  DetectedFailure, FailureModeCatalog, FailureModeEntry, PersonaCall, TranscriptTurn,
} from './types';

const CATALOG_PATHS = [
  join(process.cwd(), 'config', 'failure-mode-catalog.json'),
  join(__dirname, '..', '..', 'config', 'failure-mode-catalog.json'),
];

export function loadCatalog(): FailureModeCatalog {
  for (const path of CATALOG_PATHS) {
    try {
      const raw = readFileSync(path, 'utf8');
      return JSON.parse(raw) as FailureModeCatalog;
    } catch {
      // Try next path.
    }
  }

  throw new Error('config/failure-mode-catalog.json not found');
}

function turnEnvelope(turn: TranscriptTurn): string {
  const tools = turn.tool_calls?.map(t => `[tool:${t.tool}=${t.status}]`).join(' ') ?? '';
  return `${turn.text} ${tools}`.trim();
}

function detectRegex(
  call: PersonaCall,
  entry: FailureModeEntry,
): DetectedFailure[] {
  if (entry.detector.type !== 'regex_transcript') {
    return [];
  }

  const {detector} = entry;
  const flags = detector.case_insensitive ? 'gi' : 'g';
  const patterns = detector.patterns.map(p => new RegExp(p, flags));
  const findings: DetectedFailure[] = [];

  for (const [idx, turn] of call.turns.entries()) {
    if (turn.role !== detector.channel) {
      continue;
    }

    for (const pattern of patterns) {
      const match = pattern.exec(turn.text);
      if (match) {
        findings.push({
          mode_id: entry.id,
          severity: entry.severity,
          persona_id: call.persona_id,
          evidence: {
            turn_index: idx,
            role: turn.role,
            matched_phrase: match[0],
            surrounding_text: turn.text,
          },
          fix_proposal: entry.fix_proposal,
        });
      }
    }
  }

  return findings;
}

function detectToolCoherence(
  call: PersonaCall,
  entry: FailureModeEntry,
): DetectedFailure[] {
  if (entry.detector.type !== 'transcript_tool_coherence' || !entry.detector.patterns) {
    return [];
  }

  const patterns = entry.detector.patterns.map(p => new RegExp(p, 'gi'));
  const findings: DetectedFailure[] = [];

  for (const [idx, turn] of call.turns.entries()) {
    if (turn.role !== 'agent') {
      continue;
    }

    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(turn.text);
      if (!match) {
        continue;
      }

      const requiredTool = entry.id === 'sms_premature_confirmation' ? 'send_sms' : 'calendar_booking';
      const windowStart = Math.max(0, idx - 5);
      const hasTool = call.turns.slice(windowStart, idx + 1).some(t => (t.tool_calls ?? []).some(tc => tc.tool === requiredTool && tc.status === 'success'));
      if (!hasTool) {
        findings.push({
          mode_id: entry.id,
          severity: entry.severity,
          persona_id: call.persona_id,
          evidence: {
            turn_index: idx,
            role: 'agent',
            matched_phrase: match[0],
            surrounding_text: turnEnvelope(turn),
          },
          fix_proposal: entry.fix_proposal,
        });
      }
    }
  }

  return findings;
}

function detectRepetition(
  call: PersonaCall,
  entry: FailureModeEntry,
): DetectedFailure[] {
  if (entry.detector.type !== 'transcript_repetition_count') {
    return [];
  }

  const sensitiveTokens = new Set<string>();
  for (const turn of call.turns) {
    if (turn.role === 'caller') {
      for (const word of turn.text.split(/\s+/)) {
        if (/^\$?\d/.test(word) || /^[A-Z][a-z]+/.test(word)) {
          sensitiveTokens.add(word);
        }
      }
    }
  }

  let restateCount = 0;
  let firstIdx = -1;
  for (const [idx, turn] of call.turns.entries()) {
    if (turn.role !== 'agent') {
      continue;
    }

    let hits = 0;
    for (const token of sensitiveTokens) {
      if (turn.text.includes(token)) {
        hits += 1;
      }
    }

    if (hits >= 2) {
      restateCount += 1;
      if (firstIdx < 0) {
        firstIdx = idx;
      }
    }
  }

  if (restateCount > 2 && firstIdx >= 0) {
    return [{
      mode_id: entry.id,
      severity: entry.severity,
      persona_id: call.persona_id,
      evidence: {
        turn_index: firstIdx,
        role: 'agent',
        matched_phrase: `re-stated sensitive details ${restateCount}× across the call`,
        surrounding_text: call.turns[firstIdx].text,
      },
      fix_proposal: entry.fix_proposal,
    }];
  }

  return [];
}

function detectAudio(
  call: PersonaCall,
  entry: FailureModeEntry,
): DetectedFailure[] {
  if (entry.detector.type !== 'audio_metric') {
    return [];
  }

  if (entry.detector.metric === 'ttfb_ms_p95' && typeof call.ttfb_ms === 'number') {
    const threshold = entry.detector.threshold_max ?? Number.POSITIVE_INFINITY;
    if (call.ttfb_ms > threshold) {
      return [{
        mode_id: entry.id,
        severity: entry.severity,
        persona_id: call.persona_id,
        evidence: {
          turn_index: 0,
          role: 'agent',
          matched_phrase: `TTFB ${call.ttfb_ms}ms > ${threshold}ms`,
          surrounding_text: '(greeting turn)',
        },
        fix_proposal: entry.fix_proposal,
      }];
    }
  }

  return [];
}

export function detectFailures(
  calls: PersonaCall[],
  catalog: FailureModeCatalog,
  filterByModeIds?: string[],
): DetectedFailure[] {
  const modes = filterByModeIds
    ? catalog.modes.filter(m => filterByModeIds.includes(m.id))
    : catalog.modes;

  const findings: DetectedFailure[] = [];
  for (const call of calls) {
    for (const mode of modes) {
      switch (mode.detector.type) {
        case 'regex_transcript': {
          findings.push(...detectRegex(call, mode));
          break;
        }

        case 'transcript_tool_coherence': {
          findings.push(...detectToolCoherence(call, mode));
          break;
        }

        case 'transcript_repetition_count': {
          findings.push(...detectRepetition(call, mode));
          break;
        }

        case 'audio_metric': {
          findings.push(...detectAudio(call, mode));
          break;
        }

        case 'rubric_judge': {
          // Async — handled by detectRubricFailures when an llm is injected.
          break;
        }
      }
    }
  }

  return findings;
}

function renderTranscript(call: PersonaCall): string {
  return call.turns
    .map((t, i) => `${i}. ${t.role}: ${t.text}`)
    .join('\n');
}

const RUBRIC_JUDGE_SYSTEM = [
  'You are a strict QA judge for a business voice agent.',
  'You are given a failure-mode rubric, business grounding context, and a call transcript (numbered turns, agent + caller, both roles in one zero-indexed array).',
  'Decide whether the AGENT violated the rubric. Be conservative: only fail on clear violations.',
  'When the rubric mentions overclaiming, hallucination, hours, service area, or services, cross-check the agent statements against the BUSINESS CONTEXT block — do not infer beyond what is in that block.',
  'Respond with JSON only: {"fail": boolean, "turn_index": number, "evidence_phrase": string}.',
  'turn_index is the 0-based ABSOLUTE index into the numbered transcript array (count both agent and caller turns, in order); evidence_phrase is the exact offending substring (<=120 chars). If no violation, fail=false and the other fields may be empty.',
].join(' ');

type RubricVerdict = {
  fail?: boolean;
  turn_index?: number;
  evidence_phrase?: string;
};

function parseVerdict(raw: string): RubricVerdict | undefined {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed) as RubricVerdict;
  } catch {
    const match = /{[\s\S]*}/.exec(trimmed);
    if (match) {
      try {
        return JSON.parse(match[0]) as RubricVerdict;
      } catch {
        return undefined;
      }
    }

    return undefined;
  }
}

/**
 * Async layer for the rubric_judge detector modes. For each rubric mode ×
 * each persona call, asks the injected llm whether the agent violated the
 * rubric and, if so, emits a DetectedFailure with the evidence phrase the
 * judge identified. Failures from a single mis-shaped judge response are
 * swallowed (that mode just doesn't fire for that call) so one bad response
 * never aborts the run.
 */
export async function detectRubricFailures(
  calls: PersonaCall[],
  catalog: FailureModeCatalog,
  llm: LlmCompleteCallback,
  filterByModeIds?: string[],
  businessContext?: string,
): Promise<DetectedFailure[]> {
  const modes = (filterByModeIds
    ? catalog.modes.filter(m => filterByModeIds.includes(m.id))
    : catalog.modes
  ).filter(m => m.detector.type === 'rubric_judge');

  const tasks: Array<Promise<DetectedFailure | undefined>> = [];
  for (const call of calls) {
    const transcript = renderTranscript(call);
    for (const mode of modes) {
      if (mode.detector.type !== 'rubric_judge') {
        continue;
      }

      const {rubric} = mode.detector;
      tasks.push((async () => {
        try {
          const userBlocks = [`RUBRIC:\n${rubric}`];
          if (businessContext) userBlocks.push(`BUSINESS CONTEXT:\n${businessContext}`);
          userBlocks.push(`TRANSCRIPT:\n${transcript}`);
          const raw = await llm({
            system: RUBRIC_JUDGE_SYSTEM,
            user: userBlocks.join('\n\n'),
            responseFormat: 'json',
          });
          const verdict = parseVerdict(raw);
          if (!verdict?.fail) {
            return undefined;
          }

          // Verdict turn_index is an absolute index into call.turns (both roles).
          // If out-of-range or missing, fall back to the first agent turn so we
          // still attach evidence rather than swallowing the finding.
          const rawTurnIndex = typeof verdict.turn_index === 'number' && verdict.turn_index >= 0 && verdict.turn_index < call.turns.length
            ? verdict.turn_index
            : call.turns.findIndex(t => t.role === 'agent');
          const safeIndex = Math.max(rawTurnIndex, 0);
          const actualRole = call.turns[safeIndex]?.role ?? 'agent';
          return {
            mode_id: mode.id,
            severity: mode.severity,
            persona_id: call.persona_id,
            evidence: {
              turn_index: safeIndex,
              role: actualRole,
              matched_phrase: verdict.evidence_phrase?.slice(0, 120) ?? '(judge-flagged)',
              surrounding_text: call.turns[safeIndex]?.text ?? '',
            },
            fix_proposal: mode.fix_proposal,
          } satisfies DetectedFailure;
        } catch {
          return undefined;
        }
      })());
    }
  }

  const results = await Promise.all(tasks);
  return results.filter((f): f is DetectedFailure => f !== undefined);
}
