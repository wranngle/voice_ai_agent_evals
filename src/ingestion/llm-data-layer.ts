/**
 * @wranngle/voice-evals/ingestion/llm-data-layer — TestChain proposer.
 *
 * Pattern (from research synthesis, May 2026):
 *   Proposer  — LLM reads a transcript and proposes test scenarios it implies.
 *   Designer  — LLM converts proposed scenarios into structured assertions.
 *   Judge     — separate LLM scores the agent's output against assertions.
 *
 * This module ships the Proposer. The Designer is deferred to Phase 3.x;
 * the Judge already exists as `llmRubric` in src/scoring/assertions.ts.
 *
 * The Proposer is LLM-bound by callback (LlmCompleteCallback). Consumers
 * plug Anthropic / OpenAI / local Llama / Lynx without us pinning a SDK.
 */

import type {ProposedTestCase, IngestionOptions} from './types';

const PROPOSER_SYSTEM_PROMPT = `You analyze a voice agent conversation transcript and propose 1-5 follow-up regression test cases that would catch any bug demonstrated in the transcript, plus adjacent failure modes worth probing.

Output a JSON array of objects. Each object MUST have these keys:
  suggested_id: kebab-case slug (lowercase, hyphenated, <= 48 chars)
  name: short title (<= 80 chars)
  description: one-paragraph rationale of what this test exercises
  intent: what the agent must DO in this test (one sentence)
  simulated_user: { first_message: string, profile?: string }
  draft_assertions: array of one-line strings describing what should be checked
  persona: optional one-word persona slug (e.g. "polite-elderly", "frustrated-rusher")

Output ONLY the JSON array. No prose. No code fences. No commentary.`;

export async function proposeTestCases(
  transcript: string,
  options: IngestionOptions,
): Promise<ProposedTestCase[]> {
  if (!transcript.trim()) {
    return [];
  }

  const raw = await options.llm({
    system: PROPOSER_SYSTEM_PROMPT,
    user: `Transcript:\n${transcript}\n\nPropose 1-5 regression test cases.`,
    responseFormat: 'json',
  });

  const parsed = parseProposerResponse(raw);
  return parsed.filter(item => isValidProposedTestCase(item));
}

function parseProposerResponse(raw: string): unknown[] {
  // Tolerate code-fence wrapping that some LLMs still emit despite the
  // "no code fences" instruction. Strip ```json ... ``` and ``` ... ```.
  const cleaned = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    const value = JSON.parse(cleaned) as unknown;
    if (Array.isArray(value)) {
      return value;
    }

    // Some LLMs wrap in `{"cases": [...]}` despite explicit array request.
    if (value && typeof value === 'object') {
      const envelope = value as Record<string, unknown>;
      for (const key of ['cases', 'test_cases', 'tests', 'proposals', 'results']) {
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

function isValidProposedTestCase(item: unknown): item is ProposedTestCase {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const obj = item as Record<string, unknown>;
  const simulatedUser = obj.simulated_user as Record<string, unknown> | undefined;
  return (
    typeof obj.suggested_id === 'string'
    && typeof obj.name === 'string'
    && typeof obj.description === 'string'
    && typeof obj.intent === 'string'
    && simulatedUser !== undefined
    && typeof simulatedUser === 'object'
    && typeof simulatedUser.first_message === 'string'
    && Array.isArray(obj.draft_assertions)
    && obj.draft_assertions.every(a => typeof a === 'string')
  );
}
