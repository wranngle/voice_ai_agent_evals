import {describe, expect, it} from 'vitest';
import {importPostCallWebhook} from '../../src/ingestion/post-call-import';
import type {ElevenLabsPostCallPayload} from '../../src/ingestion/types';

const FIXED_NOW = '2026-05-11T23:00:00.000Z';
const now = () => FIXED_NOW;

describe('importPostCallWebhook', () => {
  it('emits one TestCase per evaluation_criteria_result', () => {
    const payload: ElevenLabsPostCallPayload = {
      type: 'post_call_transcription',
      data: {
        agent_id: 'agent_xxxx_demo',
        conversation_id: 'conv_abc_123',
        transcript: [{role: 'agent', message: 'hi'}],
        analysis: {
          evaluation_criteria_results: {
            tone_friendly: {criteria_id: 'tone_friendly', result: 'success', rationale: 'warm opening'},
            asked_for_callback: {criteria_id: 'asked_for_callback', result: 'failure', rationale: 'never asked'},
          },
          transcript_summary: 'caller asked about hours',
        },
      },
    };

    const {cases, source} = importPostCallWebhook(payload, {now});
    expect(cases).toHaveLength(2);
    expect(source.agent_id).toBe('agent_xxxx_demo');
    expect(source.conversation_id).toBe('conv_abc_123');

    const toneTest = cases.find(c => c.test_id.includes('tone-friendly'));
    expect(toneTest).toBeDefined();
    expect(toneTest!.expected_output).toMatchObject({tone_friendly: 'success', analysis_evaluation_pass: true});
    expect(toneTest!.description).toContain('warm opening');

    const callbackTest = cases.find(c => c.test_id.includes('asked-for-callback'));
    expect(callbackTest!.expected_output).toMatchObject({asked_for_callback: 'failure', analysis_evaluation_pass: false});
  });

  it('falls back to a single placeholder TestCase when no analysis is present', () => {
    const payload: ElevenLabsPostCallPayload = {
      type: 'post_call_transcription',
      data: {
        agent_id: 'agent_xxxx_demo',
        conversation_id: 'conv_no_analysis',
        transcript: [],
      },
    };

    const {cases} = importPostCallWebhook(payload, {now});
    expect(cases).toHaveLength(1);
    expect(cases[0].name).toContain('conv_no_analysis');
    expect(cases[0].expected_output).toMatchObject({call_successful: 'unknown'});
  });

  it('respects the custom tag list and id prefix', () => {
    const payload: ElevenLabsPostCallPayload = {
      type: 'post_call_transcription',
      data: {
        conversation_id: 'conv_x',
        analysis: {evaluation_criteria_results: {ok: {result: 'success'}}},
      },
    };

    const {cases} = importPostCallWebhook(payload, {
      tags: ['regression-2026-05'],
      idPrefix: 'TC-REG',
      now,
    });
    expect(cases[0].test_id).toMatch(/^TC-REG-conv-x-ok$/);
    expect(cases[0].tags).toContain('regression-2026-05');
    expect(cases[0].tags).toContain('criterion:ok');
  });

  it('slugs non-ASCII conversation IDs safely', () => {
    const payload: ElevenLabsPostCallPayload = {
      type: 'post_call_transcription',
      data: {
        conversation_id: 'conv Ω 漢 123',
        analysis: {evaluation_criteria_results: {x: {result: 'success'}}},
      },
    };

    const {cases} = importPostCallWebhook(payload, {now});
    expect(cases[0].test_id).toMatch(/^tc-postcall-conv-{3,}-123-x$|^tc-postcall-conv-\d+-x$/i);
    // The slug must not contain whitespace or non-ASCII chars.
    expect(cases[0].test_id).not.toMatch(/\s/);
    expect(cases[0].test_id).toMatch(/^[\da-z-]+$/i);
  });

  it('stamps created_at and updated_at from the injected clock', () => {
    const payload: ElevenLabsPostCallPayload = {
      type: 'post_call_transcription',
      data: {conversation_id: 'c', analysis: {evaluation_criteria_results: {a: {result: 'success'}}}},
    };

    const {cases} = importPostCallWebhook(payload, {now});
    expect(cases[0].created_at).toBe(FIXED_NOW);
    expect(cases[0].updated_at).toBe(FIXED_NOW);
  });
});
