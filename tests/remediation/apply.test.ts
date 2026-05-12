import {
  describe, expect, it, vi,
} from 'vitest';
import type {ElevenLabsClient} from '@elevenlabs/elevenlabs-js';
import {applyFix} from '../../src/remediation/apply';
import {createVoiceEvalsClient} from '../../src/wrapper/client';
import type {FixProposal} from '../../src/remediation/types';
import type {ModelRankings} from '../../src/wrapper/types';

const rankings: ModelRankings = {
  default: 'gemini-3-flash-preview',
  recommended: ['gemini-3-flash-preview'],
  banned: ['gpt-4o-mini'],
};

function buildMockClient(opts: {
  agentName?: string;
  agentConfig?: Record<string, unknown>;
  updateImpl?: (id: string, body: unknown) => Promise<void>;
}): ReturnType<typeof createVoiceEvalsClient> {
  const updateMock = vi.fn(opts.updateImpl ?? (async () => undefined));
  const raw = {
    conversationalAi: {
      agents: {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue({
          agent_id: 'agent_xxxx_demo',
          name: opts.agentName ?? '[DEV] Sarah - Test',
          conversation_config: opts.agentConfig ?? {
            agent: {prompt: {prompt: 'You are helpful.', tools: [{name: 'send_sms', description: 'old'}]}, first_message: 'hi'},
            tts: {stability: 0.5, speed: 1, similarity_boost: 0.8},
            turn: {turn_eagerness: 'normal'},
          },
        }),
        update: updateMock,
      },
    },
  } as unknown as ElevenLabsClient;
  return createVoiceEvalsClient({client: raw, modelRankings: rankings});
}

function basicFix(overrides: Partial<FixProposal> = {}): FixProposal {
  return {
    target: 'voice_speed',
    locator: '',
    proposed_value: '1.2',
    rationale: 'pace up the response',
    addresses: ['voice_activity'],
    ...overrides,
  };
}

describe('applyFix', () => {
  it('rejects mutation when agent is not [DEV]', async () => {
    const client = buildMockClient({agentName: '[PROD] Sarah'});
    await expect(applyFix({client, agentId: 'agent_xxxx_demo', fix: basicFix()}))
      .rejects.toThrow(/\[PROD]/);
  });

  it('rejects untagged agents by default', async () => {
    const client = buildMockClient({agentName: 'untagged-agent'});
    await expect(applyFix({client, agentId: 'agent_xxxx_demo', fix: basicFix()}))
      .rejects.toThrow(/\[PHASE] prefix/);
  });

  it('applies a voice_speed fix on [DEV] agent and PATCHes via SDK', async () => {
    const updateMock = vi.fn().mockResolvedValue(undefined);
    const client = buildMockClient({updateImpl: updateMock});
    const result = await applyFix({client, agentId: 'agent_xxxx_demo', fix: basicFix({proposed_value: '1.5'})});
    expect(result.applied).toBe(true);
    expect(updateMock).toHaveBeenCalledTimes(1);
    const [, body] = updateMock.mock.calls[0];
    const config = (body as {conversationConfig: Record<string, unknown>}).conversationConfig;
    const tts = (config.tts as Record<string, unknown>);
    expect(tts.speed).toBe(1.5);
  });

  it('dryRun does not PATCH but returns the would-be config', async () => {
    const updateMock = vi.fn();
    const client = buildMockClient({updateImpl: updateMock});
    const result = await applyFix({
      client,
      agentId: 'agent_xxxx_demo',
      fix: basicFix({proposed_value: '1.5'}),
      dryRun: true,
    });
    expect(result.applied).toBe(false);
    expect(result.dryRun).toBe(true);
    expect(updateMock).not.toHaveBeenCalled();
    const tts = (result.patch.tts as Record<string, unknown>);
    expect(tts.speed).toBe(1.5);
  });

  it('updates the targeted tool description by name', async () => {
    const updateMock = vi.fn();
    const client = buildMockClient({updateImpl: updateMock});
    await applyFix({
      client,
      agentId: 'agent_xxxx_demo',
      fix: basicFix({target: 'tool_description', locator: 'send_sms', proposed_value: 'new tightened description'}),
    });
    const [, body] = updateMock.mock.calls[0];
    const config = (body as {conversationConfig: Record<string, unknown>}).conversationConfig;
    const agentObj = config.agent as Record<string, unknown>;
    const promptObj = agentObj.prompt as Record<string, unknown>;
    const tools = promptObj.tools as Array<{name: string; description: string}>;
    expect(tools[0].description).toBe('new tightened description');
  });

  it('replaces the system prompt on system_prompt target', async () => {
    const updateMock = vi.fn();
    const client = buildMockClient({updateImpl: updateMock});
    await applyFix({
      client,
      agentId: 'agent_xxxx_demo',
      fix: basicFix({target: 'system_prompt', proposed_value: 'You are extremely helpful.'}),
    });
    const [, body] = updateMock.mock.calls[0];
    const cfg = (body as {conversationConfig: Record<string, unknown>}).conversationConfig;
    const agentObj = cfg.agent as Record<string, unknown>;
    const promptObj = agentObj.prompt as Record<string, unknown>;
    expect(promptObj.prompt).toBe('You are extremely helpful.');
  });

  it('honors allowedPhases governance override', async () => {
    const updateMock = vi.fn();
    const client = buildMockClient({agentName: '[ALPHA] Sarah', updateImpl: updateMock});
    const result = await applyFix({
      client,
      agentId: 'agent_xxxx_demo',
      fix: basicFix(),
      governance: {allowedPhases: ['ALPHA'], reason: 'explicit alpha test'},
    });
    expect(result.applied).toBe(true);
    expect(updateMock).toHaveBeenCalled();
  });
});
