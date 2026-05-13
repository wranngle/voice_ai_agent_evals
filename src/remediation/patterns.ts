/**
 * @wranngle/voice-evals/remediation/patterns — deterministic failure-pattern
 * detection.
 *
 * Ports the archive's `FAILURE_PATTERNS` from
 * `supersystem/autorefinement-engine.js`. Five canonical patterns drive the
 * ANALYZE phase of the autorefinement loop:
 *
 *   1. SMS_AFTER_DECLINE     — agent called send_sms after user said no
 *   2. TOOL_NOT_CALLED       — expected tool not invoked
 *   3. CONTEXT_LOST          — agent re-asks for info already given
 *   4. HOSTILE_RESPONSE      — agent matched caller's negative tone
 *   5. INCONSISTENT_BEHAVIOR — failingAfter varies across iterations
 *
 * Each pattern is a *deterministic* check: cheap, no LLM call, no false-
 * negative on the obvious cases. When a pattern fires, the polish-loop can
 * skip the LLM proposer and apply the pattern's canonical `promptAddition`
 * directly. The LLM proposer remains the fallback for failures that don't
 * match any known pattern.
 *
 * Patterns intentionally err on the side of false-positives over false-
 * negatives: it is better to apply a redundant "be polite" addendum than
 * to miss an actually-hostile agent.
 */

import type {DimensionScore} from '../scoring/types';
import type {FixTarget} from './types';

export type TranscriptTurn = {
  role: 'user' | 'agent' | 'system' | 'tool';
  message?: string;
  toolCalls?: ReadonlyArray<{name?: string; tool_name?: string}>;
};

export type DetectionInput = {
  /** Structured conversation turns (preferred). */
  turns?: readonly TranscriptTurn[];
  /** Flat list of all tool calls observed in this run. */
  toolCalls?: ReadonlyArray<{name?: string; tool_name?: string}>;
  /** Tools the agent was *expected* to call. */
  expectedTools?: readonly string[];
  /** Plain-text transcript (fallback). */
  transcript?: string;
  /** Failing dimension scores for this run. */
  failures?: readonly DimensionScore[];
  /**
   * History of `failingAfter` counts for previous iterations. When variance
   * is high across runs, INCONSISTENT_BEHAVIOR fires.
   */
  iterationHistory?: readonly number[];
};

export type FailurePatternId =
  | 'SMS_AFTER_DECLINE'
  | 'TOOL_NOT_CALLED'
  | 'CONTEXT_LOST'
  | 'HOSTILE_RESPONSE'
  | 'INCONSISTENT_BEHAVIOR';

export type FailurePattern = {
  id: FailurePatternId;
  description: string;
  detect: (input: DetectionInput) => boolean;
  fixTarget: FixTarget;
  /** Canonical prompt addition for the deterministic shortcut. */
  promptAddition: string;
};

export type DetectedPattern = {
  pattern: FailurePatternId;
  description: string;
  /** What evidence triggered the match (one-line, surfaced to operators). */
  evidence?: string;
};

const DECLINE_RE = /\b(no|don't|stop|never mind|cancel|do not)\b/i;
const REASK_RE = /(what(?:'s| is) your name again|who are you with|what company|can you remind me|sorry,? what was your|tell me your name again)/i;
const HOSTILE_RE = /\b(annoying|ridiculous|frustrating|rude|stupid|useless|terrible|wasting my time)\b/i;
const AGENT_DEFENSIVE_RE = /\b(calm down|relax|i told you|like i said|as i mentioned)\b/i;

export const FAILURE_PATTERNS: readonly FailurePattern[] = [
  {
    id: 'SMS_AFTER_DECLINE',
    description: 'Agent called send_sms after caller declined SMS contact.',
    fixTarget: 'system_prompt',
    detect(input) {
      const calledSms = collectToolNames(input).includes('send_sms');
      if (!calledSms) {
        return false;
      }

      const userText = collectUserText(input);
      return DECLINE_RE.test(userText);
    },
    promptAddition: `

[AUTOREFINEMENT] CRITICAL SMS CONSENT RULE:
- NEVER call send_sms after user says: no, don't, stop, never mind, cancel, do not.
- If there is ANY doubt about consent, ask once for explicit confirmation.
- Consent withdrawal is IMMEDIATE - stop all SMS operations until re-granted.`,
  },
  {
    id: 'TOOL_NOT_CALLED',
    description: 'An expected tool was not invoked during the conversation.',
    fixTarget: 'system_prompt',
    detect(input) {
      const expected = input.expectedTools ?? [];
      if (expected.length === 0) {
        return false;
      }

      const actual = new Set(collectToolNames(input));
      return expected.some(name => !actual.has(name));
    },
    promptAddition: `

[AUTOREFINEMENT] TOOL INVOCATION RULE:
- When the caller signals intent that matches a tool's purpose, call the tool.
- Do not narrate intent ("I'll text you the link") without invoking the corresponding tool.
- If a tool is listed in your available tools, treat its description as the precondition for use.`,
  },
  {
    id: 'CONTEXT_LOST',
    description: 'Agent re-asked for information the caller already provided.',
    fixTarget: 'system_prompt',
    detect(input) {
      const agentText = collectAgentText(input);
      return REASK_RE.test(agentText);
    },
    promptAddition: `

[AUTOREFINEMENT] CONTEXT RETENTION RULE:
- Remember ALL information provided by the caller throughout the call (name, company, callback number, problem domain).
- Never re-ask for information already given - reference it naturally.
- If unsure, paraphrase what you heard for confirmation, never re-prompt from scratch.`,
  },
  {
    id: 'HOSTILE_RESPONSE',
    description: 'Agent responded with hostile, defensive, or condescending tone.',
    fixTarget: 'system_prompt',
    detect(input) {
      const agentText = collectAgentText(input);
      if (HOSTILE_RE.test(agentText)) {
        return true;
      }

      return AGENT_DEFENSIVE_RE.test(agentText);
    },
    promptAddition: `

[AUTOREFINEMENT] PROFESSIONAL TONE RULE:
- Always remain calm and professional, even with hostile callers.
- Never match the caller's negative energy or use defensive phrasing.
- De-escalate: acknowledge the frustration, empathize briefly, redirect to a useful next step.`,
  },
  {
    id: 'INCONSISTENT_BEHAVIOR',
    description: 'Failing-test count varies significantly across iterations (high variance -> non-determinism).',
    fixTarget: 'temperature',
    detect(input) {
      const history = input.iterationHistory ?? [];
      if (history.length < 3) {
        return false;
      }

      const mean = history.reduce((a, b) => a + b, 0) / history.length;
      if (mean === 0) {
        return false;
      }

      const variance = history.reduce((sum, x) => sum + ((x - mean) ** 2), 0) / history.length;
      const stdDev = Math.sqrt(variance);
      const cv = stdDev / mean;
      return cv > 0.4;
    },
    promptAddition: '',
  },
];

/**
 * Run every pattern against the input. Returns one DetectedPattern per
 * matching pattern (zero or more). Patterns are independent — if both
 * SMS_AFTER_DECLINE and HOSTILE_RESPONSE fire on the same run, both
 * appear in the output.
 */
export function detectPatterns(input: DetectionInput): DetectedPattern[] {
  const out: DetectedPattern[] = [];
  for (const pattern of FAILURE_PATTERNS) {
    if (pattern.detect(input)) {
      out.push({
        pattern: pattern.id,
        description: pattern.description,
        evidence: gatherEvidence(pattern.id, input),
      });
    }
  }

  return out;
}

/** Look up a pattern by id. Returns undefined if unknown. */
export function getPattern(id: FailurePatternId): FailurePattern | undefined {
  return FAILURE_PATTERNS.find(p => p.id === id);
}

function collectToolNames(input: DetectionInput): string[] {
  const names: string[] = [];
  const flatCalls = input.toolCalls ?? [];
  for (const call of flatCalls) {
    const n = call.name ?? call.tool_name;
    if (n) {
      names.push(n);
    }
  }

  for (const turn of input.turns ?? []) {
    for (const call of turn.toolCalls ?? []) {
      const n = call.name ?? call.tool_name;
      if (n) {
        names.push(n);
      }
    }
  }

  return names;
}

function collectUserText(input: DetectionInput): string {
  if (input.turns) {
    return input.turns
      .filter(t => t.role === 'user')
      .map(t => t.message ?? '')
      .join(' ');
  }

  return input.transcript ?? '';
}

function collectAgentText(input: DetectionInput): string {
  if (input.turns) {
    return input.turns
      .filter(t => t.role === 'agent')
      .map(t => t.message ?? '')
      .join(' ');
  }

  return input.transcript ?? '';
}

function gatherEvidence(id: FailurePatternId, input: DetectionInput): string | undefined {
  switch (id) {
    case 'SMS_AFTER_DECLINE': {
      const match = DECLINE_RE.exec(collectUserText(input));
      return match ? `caller said "${match[0]}"` : undefined;
    }

    case 'TOOL_NOT_CALLED': {
      const expected = input.expectedTools ?? [];
      const actual = new Set(collectToolNames(input));
      const missing = expected.filter(n => !actual.has(n));
      return missing.length > 0 ? `missing: ${missing.join(', ')}` : undefined;
    }

    case 'CONTEXT_LOST': {
      const match = REASK_RE.exec(collectAgentText(input));
      return match ? `agent re-asked: "${match[0]}"` : undefined;
    }

    case 'HOSTILE_RESPONSE': {
      const agentText = collectAgentText(input);
      const match = HOSTILE_RE.exec(agentText) ?? AGENT_DEFENSIVE_RE.exec(agentText);
      return match ? `agent said: "${match[0]}"` : undefined;
    }

    case 'INCONSISTENT_BEHAVIOR': {
      const history = input.iterationHistory ?? [];
      return `failingAfter history: [${history.join(', ')}]`;
    }
  }
}
