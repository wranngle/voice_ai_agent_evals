import {
  describe, expect, it, vi,
} from 'vitest';
import type {ElevenLabsClient} from '@elevenlabs/elevenlabs-js';
import {runPolish} from '../../src/cli/commands/polish';
import {createVoiceEvalsClient} from '../../src/wrapper/client';
import type {DimensionScore} from '../../src/scoring/types';
import type {LlmCompleteCallback} from '../../src/ingestion/types';
import type {ModelRankings} from '../../src/wrapper/types';

const rankings: ModelRankings = {
  default: 'gemini-3-flash-preview',
  recommended: [],
  banned: [],
};

function buildClient(): ReturnType<typeof createVoiceEvalsClient> {
  const raw = {
    conversationalAi: {
      agents: {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue({
          agent_id: 'agent_xxxx_demo',
          name: '[DEV] Sarah',
          conversation_config: {tts: {speed: 1}},
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
    },
  } as unknown as ElevenLabsClient;
  return createVoiceEvalsClient({client: raw, modelRankings: rankings});
}

const PASS: DimensionScore = {name: 'voice_activity', status: 'passed'};

describe('runPolish', () => {
  it('runs polishLoop via injected override and reports stop reason', async () => {
    const lines: string[] = [];
    const client = buildClient();
    const evaluate = vi.fn().mockResolvedValue([PASS]);
    const llm: LlmCompleteCallback = vi.fn();
    const code = await runPolish({
      agentId: 'agent_xxxx_demo',
      out: line => lines.push(line),
      override: {
        client, agentId: 'agent_xxxx_demo', evaluate, llm,
      },
    });
    expect(code).toBe(0);
    const joined = lines.join('\n');
    expect(joined).toContain('Polishing');
    expect(joined).toContain('all_passing');
    expect(joined).toContain('Final failing dimensions: 0');
  });

  it('errors when agent_id missing', async () => {
    const lines: string[] = [];
    const code = await runPolish({agentId: '', out: line => lines.push(line)});
    expect(code).toBe(1);
    expect(lines.some(l => l.includes('requires an agent_id'))).toBe(true);
  });

  it('reports proposal applied in history when iteration finds failures', async () => {
    const lines: string[] = [];
    const client = buildClient();
    const evaluate = vi.fn()
      .mockResolvedValueOnce([{name: 'voice_activity', status: 'failed', detail: 'silent'}])
      .mockResolvedValueOnce([PASS]);
    const llm: LlmCompleteCallback = vi.fn().mockResolvedValue(JSON.stringify([{
      target: 'voice_speed',
      locator: '',
      proposed_value: '1.1',
      rationale: 'pace up',
      addresses: ['voice_activity'],
    }]));
    const code = await runPolish({
      agentId: 'agent_xxxx_demo',
      out: line => lines.push(line),
      override: {
        client, agentId: 'agent_xxxx_demo', evaluate, llm,
      },
    });
    expect(code).toBe(0);
    const joined = lines.join('\n');
    expect(joined).toContain('iter 1');
    expect(joined).toContain('applied');
    expect(joined).toContain('voice_speed');
  });
});
