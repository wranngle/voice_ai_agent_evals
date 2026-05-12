import {
  describe, expect, it, vi,
} from 'vitest';
import {designAssertions, type DesignedAssertion} from '../../src/ingestion/designer';
import type {ProposedTestCase} from '../../src/ingestion/types';

const TEST_CASE: Pick<ProposedTestCase, 'name' | 'intent' | 'draft_assertions'> = {
  name: 'Caller asks for hours',
  intent: 'Surface business hours within 2 turns.',
  draft_assertions: [
    'Agent states the hours.',
    'Agent does not transfer to human.',
    'Total turn under 3 seconds.',
    'Calls send_sms tool with phone in E.164.',
  ],
};

const VALID_OUTPUT: DesignedAssertion[] = [
  {type: 'contains', needle: '9 AM', name: 'states_hours'},
  {type: 'not_contains', needle: 'transferring you'},
  {type: 'latency_max_ms', budgetMs: 3000, metric: 'total_turn'},
  {type: 'tool_call_emitted', tool_name: 'send_sms'},
];

describe('designAssertions', () => {
  it('returns parsed assertions on a valid LLM response', async () => {
    const llm = vi.fn().mockResolvedValue(JSON.stringify(VALID_OUTPUT));
    const result = await designAssertions(TEST_CASE, {llm});
    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({type: 'contains', needle: '9 AM'});
    expect(result[2]).toMatchObject({type: 'latency_max_ms', metric: 'total_turn', budgetMs: 3000});
    expect(llm).toHaveBeenCalledWith(expect.objectContaining({responseFormat: 'json'}));
  });

  it('returns [] when there are no draft_assertions', async () => {
    const llm = vi.fn();
    const result = await designAssertions({...TEST_CASE, draft_assertions: []}, {llm});
    expect(result).toEqual([]);
    expect(llm).not.toHaveBeenCalled();
  });

  it('tolerates code-fence wrappers', async () => {
    const llm = vi.fn().mockResolvedValue(`\`\`\`json\n${JSON.stringify(VALID_OUTPUT)}\n\`\`\``);
    expect((await designAssertions(TEST_CASE, {llm}))).toHaveLength(4);
  });

  it('tolerates {assertions: [...]} envelopes', async () => {
    const llm = vi.fn().mockResolvedValue(JSON.stringify({assertions: VALID_OUTPUT}));
    expect((await designAssertions(TEST_CASE, {llm}))).toHaveLength(4);
  });

  it('drops items missing required type-specific fields', async () => {
    const malformed = [
      {type: 'contains'}, // missing needle
      {type: 'unknown_type'},
      {type: 'regex', pattern: '[invalid'}, // unparseable
      {type: 'latency_max_ms', budgetMs: -5, metric: 'ttfb'}, // negative
      {type: 'latency_max_ms', budgetMs: 1000, metric: 'bogus_metric'},
      {type: 'llm_rubric', rubric: 'tone is professional', threshold: 1.5}, // out of range
      VALID_OUTPUT[0], // valid one
    ];
    const llm = vi.fn().mockResolvedValue(JSON.stringify(malformed));
    const result = await designAssertions(TEST_CASE, {llm});
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({type: 'contains'});
  });

  it('keeps llm_rubric without threshold (uses default)', async () => {
    const llm = vi.fn().mockResolvedValue(JSON.stringify([
      {type: 'llm_rubric', rubric: 'is the tone professional?'},
    ]));
    const result = await designAssertions(TEST_CASE, {llm});
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({type: 'llm_rubric', rubric: 'is the tone professional?'});
  });

  it('returns [] on invalid JSON', async () => {
    const llm = vi.fn().mockResolvedValue('not json');
    expect(await designAssertions(TEST_CASE, {llm})).toEqual([]);
  });

  it('accepts all four latency metrics', async () => {
    const metrics: DesignedAssertion[] = [
      {type: 'latency_max_ms', budgetMs: 800, metric: 'ttfb'},
      {type: 'latency_max_ms', budgetMs: 1400, metric: 'end_to_first_audio'},
      {type: 'latency_max_ms', budgetMs: 3000, metric: 'total_turn'},
      {type: 'latency_max_ms', budgetMs: 2000, metric: 'tool_round_trip'},
    ];
    const llm = vi.fn().mockResolvedValue(JSON.stringify(metrics));
    const result = await designAssertions(TEST_CASE, {llm});
    expect(result).toHaveLength(4);
  });
});
