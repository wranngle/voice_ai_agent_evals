/**
 * Failure detector — applies the failure-mode catalog to a transcript.
 * Currently implements regex_transcript + transcript_tool_coherence; the
 * rubric_judge / audio_metric / transcript_repetition_count paths return
 * deterministic results for the mock pipeline and stubs that production
 * builds will route to an LLM judge or audio scorer respectively.
 */

import {readFileSync} from 'node:fs';
import {join} from 'node:path';
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
          // Needs an LLM judge; skipped in deterministic mode.
          break;
        }
      }
    }
  }

  return findings;
}
