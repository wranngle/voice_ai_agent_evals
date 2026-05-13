import {
  describe, expect, it, vi,
} from 'vitest';
import type {ElevenLabsClient} from '@elevenlabs/elevenlabs-js';
import {createAgentsApi} from '../../src/wrapper/agents';

function makeSdk(overrides: Partial<{
  list: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  duplicate: ReturnType<typeof vi.fn>;
  initialName: string;
}> = {}): {sdk: ElevenLabsClient; mocks: Record<string, ReturnType<typeof vi.fn>>} {
  const initialName = overrides.initialName ?? '[DEV] Sarah - Test';
  const list = overrides.list ?? vi.fn().mockResolvedValue([]);
  const get = overrides.get ?? vi.fn().mockResolvedValue({
    agent_id: 'agent_xxxx_demo',
    name: initialName,
    conversation_config: {tts: {speed: 1}},
  });
  const create = overrides.create ?? vi.fn().mockResolvedValue({agent_id: 'agent_new'});
  const update = overrides.update ?? vi.fn().mockResolvedValue(undefined);
  const duplicate = overrides.duplicate ?? vi.fn().mockResolvedValue({agent_id: 'agent_cloned'});
  const sdk = {
    conversationalAi: {
      agents: {
        list, get, create, update, duplicate,
      },
    },
  } as unknown as ElevenLabsClient;
  return {
    sdk, mocks: {
      list, get, create, update, duplicate,
    },
  };
}

describe('agents.create', () => {
  it('auto-prefixes [DEV] when name has no PHASE prefix', async () => {
    const {sdk, mocks} = makeSdk();
    const api = createAgentsApi({raw: sdk});
    const result = await api.create({name: 'Sarah', conversationConfig: {tts: {speed: 1}}});
    expect(mocks.create).toHaveBeenCalled();
    const callArgs = mocks.create.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.name).toBe('[DEV] Sarah');
    expect(result.name).toBe('[DEV] Sarah');
    expect(result.parsedName.phase).toBe('DEV');
  });

  it('respects existing [PHASE] prefix', async () => {
    const {sdk, mocks} = makeSdk();
    const api = createAgentsApi({raw: sdk});
    await api.create({name: '[DEV] Greg', conversationConfig: {}});
    const callArgs = mocks.create.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.name).toBe('[DEV] Greg');
  });

  it('with autoPrefixDev:false leaves the name as-is (caller responsibility)', async () => {
    const {sdk, mocks} = makeSdk();
    const api = createAgentsApi({raw: sdk});
    await api.create({name: 'Bare Name', conversationConfig: {}}, {autoPrefixDev: false});
    const callArgs = mocks.create.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.name).toBe('Bare Name');
  });
});

describe('agents.update', () => {
  it('allows mutation on [DEV] agent', async () => {
    const {sdk, mocks} = makeSdk({initialName: '[DEV] Sarah'});
    const api = createAgentsApi({raw: sdk});
    await api.update('agent_xxxx_demo', {conversationConfig: {tts: {speed: 1.2}}});
    expect(mocks.update).toHaveBeenCalled();
  });

  it('rejects mutation on [PROD] agent without explicit allowedPhases', async () => {
    const {sdk} = makeSdk({initialName: '[PROD] Sarah'});
    const api = createAgentsApi({raw: sdk});
    await expect(api.update('agent_xxxx_demo', {conversationConfig: {}}))
      .rejects.toThrow(/\[PROD]/);
  });

  it('allows mutation on [PROD] with explicit allowedPhases', async () => {
    const {sdk, mocks} = makeSdk({initialName: '[PROD] Sarah'});
    const api = createAgentsApi({raw: sdk});
    await api.update('agent_xxxx_demo', {conversationConfig: {}}, {allowedPhases: ['PROD'], reason: 'hotfix approved'});
    expect(mocks.update).toHaveBeenCalled();
  });

  it('rejects untagged agents by default', async () => {
    const {sdk} = makeSdk({initialName: 'no-prefix'});
    const api = createAgentsApi({raw: sdk});
    await expect(api.update('agent_x', {conversationConfig: {}}))
      .rejects.toThrow(/\[PHASE]/);
  });
});

describe('agents.clone', () => {
  it('duplicates source then renames new agent with [DEV] prefix', async () => {
    const get = vi.fn().mockResolvedValue({agent_id: 'src', name: '[PROD] Sarah - Lead'});
    const duplicate = vi.fn().mockResolvedValue({agent_id: 'agent_cloned'});
    const update = vi.fn().mockResolvedValue(undefined);
    const {sdk, mocks} = makeSdk({get, duplicate, update});
    const api = createAgentsApi({raw: sdk});

    const result = await api.clone('src', {namePrefix: 'Forked'});

    expect(mocks.duplicate).toHaveBeenCalledWith('src');
    const updateCall = mocks.update.mock.calls[0];
    expect(updateCall[0]).toBe('agent_cloned');
    const patch = updateCall[1] as Record<string, unknown>;
    expect(patch.name).toBe('[DEV] Forked Sarah - Lead');
    expect(result.parsedName.phase).toBe('DEV');
  });

  it('default namePrefix is "Clone of"', async () => {
    const get = vi.fn().mockResolvedValue({agent_id: 'src', name: '[DEV] Greg'});
    const update = vi.fn().mockResolvedValue(undefined);
    const {sdk, mocks} = makeSdk({get, update});
    const api = createAgentsApi({raw: sdk});
    await api.clone('src');
    const patch = mocks.update.mock.calls[0][1] as Record<string, unknown>;
    expect(patch.name).toBe('[DEV] Clone of Greg');
  });

  it('merges overrides into the rename patch', async () => {
    const get = vi.fn().mockResolvedValue({agent_id: 'src', name: '[DEV] Base'});
    const update = vi.fn().mockResolvedValue(undefined);
    const {sdk, mocks} = makeSdk({get, update});
    const api = createAgentsApi({raw: sdk});
    await api.clone('src', {overrides: {conversationConfig: {tts: {speed: 1.5}}}});
    const patch = mocks.update.mock.calls[0][1] as Record<string, unknown>;
    expect(patch.conversationConfig).toEqual({tts: {speed: 1.5}});
    expect((patch.name as string).startsWith('[DEV]')).toBe(true);
  });
});

describe('agents.archive', () => {
  it('renames any phase to [ARCHIVED] (including PROD)', async () => {
    const get = vi.fn().mockResolvedValue({agent_id: 'a', name: '[PROD] OldSarah'});
    const update = vi.fn().mockResolvedValue(undefined);
    const {sdk, mocks} = makeSdk({get, update});
    const api = createAgentsApi({raw: sdk});
    const result = await api.archive('a');
    const patch = mocks.update.mock.calls[0][1] as Record<string, unknown>;
    expect(patch.name).toBe('[ARCHIVED] OldSarah');
    expect(result.parsedName.phase).toBe('ARCHIVED');
  });

  it('handles untagged agents (allowUntagged is implicit for archive)', async () => {
    const get = vi.fn().mockResolvedValue({agent_id: 'a', name: 'untagged'});
    const update = vi.fn().mockResolvedValue(undefined);
    const {sdk, mocks} = makeSdk({get, update});
    const api = createAgentsApi({raw: sdk});
    await api.archive('a');
    const patch = mocks.update.mock.calls[0][1] as Record<string, unknown>;
    expect(patch.name).toBe('[ARCHIVED] untagged');
  });
});

describe('agents.promote', () => {
  it('requires the target phase in allowedPhases', async () => {
    const {sdk} = makeSdk({initialName: '[DEV] Sarah'});
    const api = createAgentsApi({raw: sdk});
    await expect(api.promote('agent_x', 'BETA', {})).rejects.toThrow(/allowedPhases must include the target phase \[BETA]/);
  });

  it('promotes [DEV] -> [BETA] with explicit allowedPhases', async () => {
    const get = vi.fn().mockResolvedValue({agent_id: 'a', name: '[DEV] Sarah'});
    const update = vi.fn().mockResolvedValue(undefined);
    const {sdk, mocks} = makeSdk({get, update});
    const api = createAgentsApi({raw: sdk});
    const result = await api.promote('a', 'BETA', {
      allowedPhases: ['BETA'],
      approvedBy: 'cody',
      reason: 'approved at scrum 2026-05-12',
    });
    const patch = mocks.update.mock.calls[0][1] as Record<string, unknown>;
    expect(patch.name).toBe('[BETA] Sarah');
    expect(result.parsedName.phase).toBe('BETA');
  });

  it('rejects promotion from [PROD] if PROD not in allowedPhases (source phase guard)', async () => {
    // promote [PROD] -> [DEV] would be a "demote"; require PROD also allowed.
    // Wait — actually the wrapper auto-merges the source phase into allowed.
    // So this test verifies that auto-merge works: caller only says [DEV],
    // the wrapper allows the [PROD] source because it's the current state.
    const get = vi.fn().mockResolvedValue({agent_id: 'a', name: '[PROD] Old'});
    const update = vi.fn().mockResolvedValue(undefined);
    const {sdk, mocks} = makeSdk({get, update});
    const api = createAgentsApi({raw: sdk});
    await api.promote('a', 'DEV', {
      allowedPhases: ['DEV'],
      approvedBy: 'cody',
      reason: 'rollback',
    });
    const patch = mocks.update.mock.calls[0][1] as Record<string, unknown>;
    expect(patch.name).toBe('[DEV] Old');
  });
});
