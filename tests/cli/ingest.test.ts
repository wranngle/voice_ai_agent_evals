import {
  describe, expect, it, vi,
} from 'vitest';
import {runIngest} from '../../src/cli/commands/ingest';
import type {LlmCompleteCallback, ProposedTestCase} from '../../src/ingestion/types';

const PROPOSED: ProposedTestCase = {
  suggested_id: 'hours-on-saturday',
  name: 'Hours on Saturday',
  description: 'Verifies the agent surfaces Saturday hours.',
  intent: 'State Saturday opening hours.',
  simulated_user: {first_message: 'Are you open Saturday?'},
  draft_assertions: [
    'Agent provides a Saturday open time.',
    'Total turn under 3 seconds.',
  ],
  persona: 'polite-elderly',
};

function makeLlm(propose: unknown, design: unknown = []): LlmCompleteCallback {
  let call = 0;
  return vi.fn(async () => {
    call++;
    return call === 1 ? JSON.stringify(propose) : JSON.stringify(design);
  });
}

describe('runIngest', () => {
  it('prints proposed test cases + designed assertions on a real transcript', async () => {
    const lines: string[] = [];
    const llm = makeLlm([PROPOSED], [
      {type: 'contains', needle: '9 AM'},
      {type: 'latency_max_ms', budgetMs: 3000, metric: 'total_turn'},
    ]);
    const code = await runIngest({
      path: '',
      text: 'Caller: Are you open Saturday?\nAgent: Yes, 9 AM to 3 PM.',
      llm,
      out: line => lines.push(line),
    });
    expect(code).toBe(0);
    const joined = lines.join('\n');
    expect(joined).toContain('hours-on-saturday');
    expect(joined).toContain('Hours on Saturday');
    expect(joined).toContain('Are you open Saturday?');
    expect(joined).toContain('polite-elderly');
    expect(joined).toContain('contains');
    expect(joined).toContain('latency_max_ms');
  });

  it('handles LLM returning no proposed cases', async () => {
    const lines: string[] = [];
    const llm: LlmCompleteCallback = vi.fn().mockResolvedValue('[]');
    const code = await runIngest({
      path: '', text: 'something', llm, out: line => lines.push(line),
    });
    expect(code).toBe(0);
    expect(lines.some(l => l.includes('No proposed test cases'))).toBe(true);
  });

  it('errors when no path or text given', async () => {
    const lines: string[] = [];
    const code = await runIngest({
      path: '',
      llm: vi.fn(),
      out: line => lines.push(line),
    });
    expect(code).toBe(1);
    expect(lines.some(l => l.includes('requires a path'))).toBe(true);
  });

  it('errors when file is missing', async () => {
    const lines: string[] = [];
    const code = await runIngest({
      path: '/nonexistent/transcript.txt',
      llm: vi.fn(),
      out: line => lines.push(line),
    });
    expect(code).toBe(1);
    expect(lines.some(l => l.includes('file not found'))).toBe(true);
  });
});
