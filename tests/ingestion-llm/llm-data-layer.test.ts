import {
  describe, expect, it, vi,
} from 'vitest';
import {proposeTestCases} from '../../src/ingestion/llm-data-layer';
import type {ProposedTestCase} from '../../src/ingestion/types';

const VALID_RESPONSE: ProposedTestCase[] = [
  {
    suggested_id: 'caller-asks-for-hours',
    name: 'Caller asks for business hours',
    description: 'Probes whether the agent surfaces the correct opening hours.',
    intent: 'Surface the open hours from the KB.',
    simulated_user: {first_message: 'What time are you open today?', profile: 'polite-regular'},
    draft_assertions: ['Agent states the hours within 2 turns.', 'No hallucinated closing time.'],
    persona: 'polite-elderly',
  },
];

describe('proposeTestCases', () => {
  it('returns parsed proposed test cases on a valid LLM response', async () => {
    const llm = vi.fn().mockResolvedValue(JSON.stringify(VALID_RESPONSE));
    const result = await proposeTestCases('Caller: When do you open? Agent: 9 AM.', {llm});
    expect(result).toHaveLength(1);
    expect(result[0].suggested_id).toBe('caller-asks-for-hours');
    expect(result[0].simulated_user.first_message).toContain('open');
    expect(llm).toHaveBeenCalledWith(expect.objectContaining({
      responseFormat: 'json',
    }));
  });

  it('returns [] when transcript is empty', async () => {
    const llm = vi.fn();
    const result = await proposeTestCases('   ', {llm});
    expect(result).toHaveLength(0);
    expect(llm).not.toHaveBeenCalled();
  });

  it('tolerates LLM responses wrapped in ```json``` code fences', async () => {
    const wrapped = `\`\`\`json\n${JSON.stringify(VALID_RESPONSE)}\n\`\`\``;
    const llm = vi.fn().mockResolvedValue(wrapped);
    const result = await proposeTestCases('any transcript', {llm});
    expect(result).toHaveLength(1);
  });

  it('tolerates {cases: [...]} envelopes', async () => {
    const wrapped = JSON.stringify({cases: VALID_RESPONSE});
    const llm = vi.fn().mockResolvedValue(wrapped);
    const result = await proposeTestCases('any transcript', {llm});
    expect(result).toHaveLength(1);
  });

  it('drops items that fail schema validation', async () => {
    const malformed = [
      {
        suggested_id: 'good', name: 'g', description: 'd', intent: 'i',
        simulated_user: {first_message: 'hi'}, draft_assertions: ['a'],
      },
      {suggested_id: 'bad-missing-fields'},
      'not even an object',
      null,
    ];
    const llm = vi.fn().mockResolvedValue(JSON.stringify(malformed));
    const result = await proposeTestCases('any transcript', {llm});
    expect(result).toHaveLength(1);
    expect(result[0].suggested_id).toBe('good');
  });

  it('returns [] when LLM emits invalid JSON', async () => {
    const llm = vi.fn().mockResolvedValue('not JSON, sorry');
    const result = await proposeTestCases('any transcript', {llm});
    expect(result).toHaveLength(0);
  });
});
