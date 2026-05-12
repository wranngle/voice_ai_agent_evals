/**
 * @wranngle/voice-evals/scoring/assertions — Promptfoo-style assertion grammar.
 *
 * Every assertion has the shape `(value: string) => DimensionScore`. They
 * compose with `not(...)` to invert pass/fail (Promptfoo's `not-*` prefix
 * idiom — adopted because the API ergonomics around "this should NOT happen"
 * are otherwise leaky).
 *
 * LLM-rubric is a separate async assertion: `(value) => Promise<DimensionScore>`.
 * The caller supplies a judge callback; we don't hard-bind an LLM SDK so
 * consumers can plug Anthropic / OpenAI / Lynx / local model with the same API.
 */

import type {DimensionScore} from './types';

export type Assertion = (value: string) => DimensionScore;
export type AsyncAssertion = (value: string) => Promise<DimensionScore>;

export function contains(
  needle: string,
  options: {name?: string; caseSensitive?: boolean} = {},
): Assertion {
  const name = options.name ?? `contains:${needle.slice(0, 32)}`;
  return value => {
    const haystack = options.caseSensitive ? value : value.toLowerCase();
    const target = options.caseSensitive ? needle : needle.toLowerCase();
    const passed = haystack.includes(target);
    return {
      name,
      status: passed ? 'passed' : 'failed',
      detail: passed ? `found "${needle}"` : `missing "${needle}"`,
    };
  };
}

export function regex(pattern: RegExp, options: {name?: string} = {}): Assertion {
  const name = options.name ?? `regex:${pattern.source.slice(0, 32)}`;
  return value => {
    const passed = pattern.test(value);
    return {
      name,
      status: passed ? 'passed' : 'failed',
      detail: passed ? `matched ${pattern.source}` : `no match for ${pattern.source}`,
    };
  };
}

export function equals(expected: string, options: {name?: string} = {}): Assertion {
  const name = options.name ?? `equals:${expected.slice(0, 20)}`;
  return value => {
    const passed = value === expected;
    return {
      name,
      status: passed ? 'passed' : 'failed',
      detail: passed ? 'equals match' : `expected "${expected}", got "${value.slice(0, 80)}"`,
    };
  };
}

/**
 * Promptfoo-style negation. Wraps any assertion to invert pass/fail.
 *
 * Skipped and error statuses are passed through unchanged — inverting an
 * error state would mask actual bugs.
 */
export function not(assertion: Assertion, options: {name?: string} = {}): Assertion {
  return value => {
    const result = assertion(value);
    let inverted: DimensionScore['status'] = result.status;
    if (result.status === 'passed') {
      inverted = 'failed';
    } else if (result.status === 'failed') {
      inverted = 'passed';
    }

    return {
      ...result,
      name: options.name ?? `not:${result.name}`,
      status: inverted,
      detail: `inverted: ${result.detail ?? ''}`,
    };
  };
}

/** Async wrapper of `not` for AsyncAssertion. */
export function notAsync(
  assertion: AsyncAssertion,
  options: {name?: string} = {},
): AsyncAssertion {
  return async value => {
    const result = await assertion(value);
    let inverted: DimensionScore['status'] = result.status;
    if (result.status === 'passed') {
      inverted = 'failed';
    } else if (result.status === 'failed') {
      inverted = 'passed';
    }

    return {
      ...result,
      name: options.name ?? `not:${result.name}`,
      status: inverted,
      detail: `inverted: ${result.detail ?? ''}`,
    };
  };
}

/**
 * LLM-rubric assertion. The caller supplies a judge callback that returns
 * a 0-1 score plus reasoning. The wrapper converts that into a DimensionScore
 * with a configurable pass threshold.
 *
 * For G-Eval semantics, pair this with a CoT-prompted judge in your callback.
 * For pairwise ArenaGEval, see `pairwise()` (coming in Phase 2.x).
 */
export type LlmJudgeCallback = (rubric: string, output: string) => Promise<{
  score: number;
  reasoning: string;
}>;

export function llmRubric(
  rubric: string,
  judge: LlmJudgeCallback,
  options: {name?: string; threshold?: number} = {},
): AsyncAssertion {
  const threshold = options.threshold ?? 0.7;
  const name = options.name ?? `llm-rubric:${rubric.slice(0, 32)}`;
  return async value => {
    try {
      const result = await judge(rubric, value);
      return {
        name,
        status: result.score >= threshold ? 'passed' : 'failed',
        score: result.score,
        detail: result.reasoning,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        name,
        status: 'error',
        detail: `judge callback failed: ${message}`,
      };
    }
  };
}
