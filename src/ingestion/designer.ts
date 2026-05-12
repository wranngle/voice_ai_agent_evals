/**
 * TestChain Designer — convert ProposedTestCase.draft_assertions (free-form
 * strings) into structured DesignedAssertion specs the scoring engine can
 * execute.
 *
 * Companion to llm-data-layer.ts (the Proposer). The full TestChain shape:
 *
 *   raw transcript -> proposeTestCases -> ProposedTestCase[]
 *                                       \
 *                                        designAssertions(case, {llm})
 *                                       /
 *   DesignedAssertion[] -> scoring engine consumers
 *
 * Like the Proposer, the Designer is LLM-bound by callback so consumers
 * plug their preferred provider.
 */

import type {LlmCompleteCallback, ProposedTestCase} from './types';

export type DesignedAssertion =
  | {type: 'contains'; needle: string; name?: string; caseSensitive?: boolean}
  | {type: 'not_contains'; needle: string; name?: string; caseSensitive?: boolean}
  | {type: 'regex'; pattern: string; name?: string}
  | {type: 'equals'; expected: string; name?: string}
  | {type: 'llm_rubric'; rubric: string; threshold?: number; name?: string}
  | {type: 'latency_max_ms'; budgetMs: number; metric: 'ttfb' | 'end_to_first_audio' | 'total_turn' | 'tool_round_trip'; name?: string}
  | {type: 'tool_call_emitted'; tool_name: string; name?: string}
  | {type: 'tool_call_not_emitted'; tool_name: string; name?: string};

const DESIGNER_SYSTEM = `You convert free-form QA assertions into structured assertion specs. Output a JSON array of objects.

Each object MUST have a "type" field plus type-specific fields:

  { "type": "contains", "needle": "...", "name"?: "...", "caseSensitive"?: false }
  { "type": "not_contains", "needle": "...", "name"?: "...", "caseSensitive"?: false }
  { "type": "regex", "pattern": "...", "name"?: "..." }
  { "type": "equals", "expected": "...", "name"?: "..." }
  { "type": "llm_rubric", "rubric": "...", "threshold"?: 0.7, "name"?: "..." }
  { "type": "latency_max_ms", "budgetMs": 2000, "metric": "ttfb" | "end_to_first_audio" | "total_turn" | "tool_round_trip", "name"?: "..." }
  { "type": "tool_call_emitted", "tool_name": "...", "name"?: "..." }
  { "type": "tool_call_not_emitted", "tool_name": "...", "name"?: "..." }

Rules:
  - For each free-form assertion, emit the most specific type that captures the intent. Prefer deterministic types (contains/regex/latency) over llm_rubric.
  - Phrasing like "agent should say X" -> contains; "agent should NOT say X" -> not_contains.
  - "responds within Nms" / "TTFB under N" -> latency_max_ms with the appropriate metric.
  - "calls send_sms" / "invokes the booking tool" -> tool_call_emitted.
  - Tone / empathy / professionalism / faithfulness -> llm_rubric with the rubric as a one-sentence question.

Output ONLY the JSON array. No prose. No code fences. No commentary.`;

export async function designAssertions(
  testCase: Pick<ProposedTestCase, 'name' | 'intent' | 'draft_assertions'>,
  options: {llm: LlmCompleteCallback},
): Promise<DesignedAssertion[]> {
  if (testCase.draft_assertions.length === 0) {
    return [];
  }

  const user = `Test case: ${testCase.name}
Intent: ${testCase.intent}

Free-form assertions:
${testCase.draft_assertions.map((a, i) => `  ${i + 1}. ${a}`).join('\n')}

Convert each assertion into a structured assertion spec.`;

  const raw = await options.llm({system: DESIGNER_SYSTEM, user, responseFormat: 'json'});
  const parsed = parseDesignerResponse(raw);
  return parsed
    .filter(item => isValidDesignedAssertion(item))
    .map(item => item);
}

function parseDesignerResponse(raw: string): unknown[] {
  const cleaned = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    const value = JSON.parse(cleaned) as unknown;
    if (Array.isArray(value)) {
      return value;
    }

    if (value && typeof value === 'object') {
      const envelope = value as Record<string, unknown>;
      for (const key of ['assertions', 'designed', 'results']) {
        if (Array.isArray(envelope[key])) {
          return envelope[key] as unknown[];
        }
      }
    }

    return [];
  } catch {
    return [];
  }
}

const LATENCY_METRICS = new Set(['ttfb', 'end_to_first_audio', 'total_turn', 'tool_round_trip']);

function isValidDesignedAssertion(item: unknown): item is DesignedAssertion {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const obj = item as Record<string, unknown>;
  if (typeof obj.type !== 'string') {
    return false;
  }

  switch (obj.type) {
    case 'contains':
    case 'not_contains': {
      return typeof obj.needle === 'string';
    }

    case 'regex': {
      if (typeof obj.pattern !== 'string') {
        return false;
      }

      try {
        // eslint-disable-next-line no-new
        new RegExp(obj.pattern);
        return true;
      } catch {
        return false;
      }
    }

    case 'equals': {
      return typeof obj.expected === 'string';
    }

    case 'llm_rubric': {
      return typeof obj.rubric === 'string'
        && (obj.threshold === undefined || (typeof obj.threshold === 'number' && obj.threshold >= 0 && obj.threshold <= 1));
    }

    case 'latency_max_ms': {
      return typeof obj.budgetMs === 'number'
        && obj.budgetMs > 0
        && typeof obj.metric === 'string'
        && LATENCY_METRICS.has(obj.metric);
    }

    case 'tool_call_emitted':
    case 'tool_call_not_emitted': {
      return typeof obj.tool_name === 'string';
    }

    default: {
      return false;
    }
  }
}
