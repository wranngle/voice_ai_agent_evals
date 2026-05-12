import {
  describe, expect, it, vi,
} from 'vitest';
import type {ElevenLabsClient} from '@elevenlabs/elevenlabs-js';
import {createVoiceEvalsClient} from '../../src/wrapper/client';
import type {ModelRankings} from '../../src/wrapper/types';

const rankings: ModelRankings = {
  default: 'gemini-3-flash-preview',
  recommended: ['gemini-3-flash-preview'],
  banned: ['gpt-4o-mini'],
};

function makeMockSdk(overrides: Partial<{
  list: () => Promise<unknown>;
  get: (id: string) => Promise<unknown>;
}> = {}): ElevenLabsClient {
  return {
    conversationalAi: {
      agents: {
        list: overrides.list ?? vi.fn().mockResolvedValue([]),
        get: overrides.get ?? vi.fn().mockResolvedValue({}),
      },
    },
  } as unknown as ElevenLabsClient;
}

describe('createVoiceEvalsClient', () => {
  it('wires raw SDK + agents + tools + webhooks namespaces', () => {
    const client = createVoiceEvalsClient({
      client: makeMockSdk(),
      modelRankings: rankings,
    });

    expect(client.raw).toBeDefined();
    expect(client.agents.list).toBeTypeOf('function');
    expect(client.agents.get).toBeTypeOf('function');
    expect(client.tools.cleanProperty).toBeTypeOf('function');
    expect(client.tools.cleanTools).toBeTypeOf('function');
    expect(client.webhooks.verify).toBeTypeOf('function');
    expect(client.modelRankings).toEqual(rankings);
  });

  it('agents.list parses [PHASE] from each agent name', async () => {
    const client = createVoiceEvalsClient({
      client: makeMockSdk({
        list: vi.fn().mockResolvedValue([
          {agent_id: 'a1', name: '[DEV] Sarah - Lead'},
          {agent_id: 'a2', name: '[PROD] Greg - Receptionist'},
          {agent_id: 'a3', name: 'untagged-agent'},
        ]),
      }),
      modelRankings: rankings,
    });

    const agents = await client.agents.list();
    expect(agents).toHaveLength(3);
    expect(agents[0]?.parsedName.phase).toBe('DEV');
    expect(agents[1]?.parsedName.phase).toBe('PROD');
    expect(agents[2]?.parsedName.isTagged).toBe(false);
  });

  it('agents.list handles envelope responses ({agents: [...]})', async () => {
    const client = createVoiceEvalsClient({
      client: makeMockSdk({
        list: vi.fn().mockResolvedValue({agents: [{agent_id: 'a1', name: '[DEV] X'}]}),
      }),
      modelRankings: rankings,
    });

    const agents = await client.agents.list();
    expect(agents).toHaveLength(1);
    expect(agents[0]?.id).toBe('a1');
  });

  it('agents.list handles {data: [...]} envelope', async () => {
    const client = createVoiceEvalsClient({
      client: makeMockSdk({
        list: vi.fn().mockResolvedValue({data: [{agent_id: 'a1', name: '[DEV] X'}]}),
      }),
      modelRankings: rankings,
    });

    expect(await client.agents.list()).toHaveLength(1);
  });

  it('agents.get returns parsed name + full config', async () => {
    const client = createVoiceEvalsClient({
      client: makeMockSdk({
        get: vi.fn().mockResolvedValue({
          agent_id: 'a1',
          name: '[DEV] Sarah',
          conversation_config: {agent: {prompt: {llm: 'gemini-3-flash-preview'}}},
        }),
      }),
      modelRankings: rankings,
    });

    const agent = await client.agents.get('a1');
    expect(agent.id).toBe('a1');
    expect(agent.parsedName.phase).toBe('DEV');
    expect(agent.config).toEqual({agent: {prompt: {llm: 'gemini-3-flash-preview'}}});
  });
});
