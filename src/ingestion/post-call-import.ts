/**
 * @wranngle/voice-evals/ingestion/post-call-import — deterministic converter
 * from ElevenLabs post-call webhook payloads to TestCase[].
 *
 * Pure function. No LLM. No I/O. The caller passes the parsed JSON of a
 * post-call webhook (`post_call_transcription` event); the function emits
 * one TestCase per evaluation_criteria_result if `analysis` is present, or
 * a single TestCase representing the conversation as a whole otherwise.
 *
 * Use this when you want every live call to seed a regression test ("trace
 * to test" — the Braintrust pattern from the research synthesis).
 */

import type {TestCase} from '../testing/types';
import {slugify} from '../internal/slug';
import type {ElevenLabsPostCallPayload, ImportedTestCases} from './types';

type ImportOptions = {
  /** Tag(s) to apply to every produced TestCase. Default: `['ingested']`. */
  tags?: string[];
  /** Id prefix. Default: `'TC-POSTCALL'`. */
  idPrefix?: string;
  /** Override the timestamp baked into created_at / updated_at. For tests. */
  now?: () => string;
};

export function importPostCallWebhook(
  payload: ElevenLabsPostCallPayload,
  options: ImportOptions = {},
): ImportedTestCases {
  const tags = options.tags ?? ['ingested', 'post-call'];
  const idPrefix = options.idPrefix ?? 'TC-POSTCALL';
  const now = (options.now ?? defaultNow)();

  const data = payload.data ?? {};
  const conversationId = data.conversation_id ?? 'unknown';
  const agentId = data.agent_id;
  const summary = data.analysis?.transcript_summary;
  const criteriaResults = data.analysis?.evaluation_criteria_results;

  const cases: TestCase[] = [];

  if (criteriaResults && Object.keys(criteriaResults).length > 0) {
    for (const [criterionId, result] of Object.entries(criteriaResults)) {
      cases.push({
        test_id: `${idPrefix}-${slug(conversationId)}-${slug(criterionId)}`,
        type: 'elevenlabs',
        name: `${criterionId} — ${conversationId}`,
        description: result.rationale
          ?? `Evaluation criterion "${criterionId}" from conversation ${conversationId}.`,
        input: {
          agent_id: agentId,
          conversation_id: conversationId,
          replay_transcript: data.transcript ?? [],
        },
        expected_output: {
          [criterionId]: result.result ?? 'unknown',
          analysis_evaluation_pass: result.result === 'success',
        },
        tags: [...tags, `criterion:${criterionId}`],
        enabled: true,
        created_at: now,
        updated_at: now,
      });
    }
  } else {
    // No analysis present — emit a single placeholder test for the whole conversation.
    cases.push({
      test_id: `${idPrefix}-${slug(conversationId)}`,
      type: 'elevenlabs',
      name: `Conversation ${conversationId}`,
      description: summary
        ?? `Post-call import for conversation ${conversationId}. No analysis present.`,
      input: {
        agent_id: agentId,
        conversation_id: conversationId,
        replay_transcript: data.transcript ?? [],
      },
      expected_output: {
        call_successful: data.analysis?.call_successful ?? 'unknown',
      },
      tags,
      enabled: true,
      created_at: now,
      updated_at: now,
    });
  }

  return {
    cases,
    source: {
      agent_id: agentId,
      conversation_id: conversationId,
      transcript_summary: summary,
    },
  };
}

function slug(value: string): string {
  // Defer to the linear ReDoS-safe slugify helper.
  return slugify(value, {maxLength: 48});
}

function defaultNow(): string {
  return new Date().toISOString();
}
