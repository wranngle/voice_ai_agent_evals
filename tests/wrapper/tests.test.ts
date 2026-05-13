import {
  describe, expect, it, vi,
} from 'vitest';
import type {ElevenLabsClient} from '@elevenlabs/elevenlabs-js';
import {createTestsApi} from '../../src/wrapper/tests';

function makeMockSdk(overrides: Partial<{
  create: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  runTests: ReturnType<typeof vi.fn>;
  invocationsGet: ReturnType<typeof vi.fn>;
  invocationsResubmit: ReturnType<typeof vi.fn>;
}> = {}): ElevenLabsClient {
  return {
    conversationalAi: {
      tests: {
        create: overrides.create ?? vi.fn().mockResolvedValue({id: 'test_xxxx'}),
        get: overrides.get ?? vi.fn().mockResolvedValue({id: 'test_xxxx', name: 'X', type: 'llm'}),
        list: overrides.list ?? vi.fn().mockResolvedValue({tests: [], nextCursor: undefined}),
        update: overrides.update ?? vi.fn().mockResolvedValue({id: 'test_xxxx'}),
        delete: overrides.del ?? vi.fn().mockResolvedValue(undefined),
        invocations: {
          get: overrides.invocationsGet ?? vi.fn().mockResolvedValue({id: 'inv_xxx', testRuns: []}),
          resubmit: overrides.invocationsResubmit ?? vi.fn().mockResolvedValue(undefined),
        },
      },
      agents: {
        runTests: overrides.runTests ?? vi.fn().mockResolvedValue({id: 'inv_xxx', testRuns: []}),
      },
    },
  } as unknown as ElevenLabsClient;
}

describe('createTestsApi', () => {
  it('create returns the SDK-assigned id + echoes name/type', async () => {
    const create = vi.fn().mockResolvedValue({id: 'test_new_id'});
    const api = createTestsApi({raw: makeMockSdk({create})});
    const result = await api.create({type: 'llm', name: 'My test'} as never);
    expect(result.id).toBe('test_new_id');
    expect(result.name).toBe('My test');
    expect(result.type).toBe('llm');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('get returns id + raw + config envelope', async () => {
    const get = vi.fn().mockResolvedValue({id: 'test_g', name: 'Gettable', type: 'tool'});
    const api = createTestsApi({raw: makeMockSdk({get})});
    const result = await api.get('test_g');
    expect(result.id).toBe('test_g');
    expect(result.name).toBe('Gettable');
    expect(result.config).toMatchObject({id: 'test_g', name: 'Gettable'});
  });

  it('list paginates by default', async () => {
    const list = vi.fn()
      .mockResolvedValueOnce({tests: [{id: 't1'}, {id: 't2'}], nextCursor: 'c1'})
      .mockResolvedValueOnce({tests: [{id: 't3'}], nextCursor: undefined});
    const api = createTestsApi({raw: makeMockSdk({list})});
    const result = await api.list();
    expect(result).toHaveLength(3);
    expect(result.map(t => t.id)).toEqual(['t1', 't2', 't3']);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('list with {all: false} returns only the first page', async () => {
    const list = vi.fn().mockResolvedValueOnce({tests: [{id: 't1'}], nextCursor: 'c1'});
    const api = createTestsApi({raw: makeMockSdk({list})});
    const result = await api.list({all: false});
    expect(result).toHaveLength(1);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('list handles array-shaped responses (no envelope)', async () => {
    const list = vi.fn().mockResolvedValue([{id: 'a'}, {id: 'b'}]);
    const api = createTestsApi({raw: makeMockSdk({list})});
    const result = await api.list();
    expect(result).toHaveLength(2);
  });

  it('update calls SDK with id+patch', async () => {
    const update = vi.fn().mockResolvedValue({id: 'test_u'});
    const api = createTestsApi({raw: makeMockSdk({update})});
    await api.update('test_u', {type: 'llm', name: 'Updated'} as never);
    expect(update).toHaveBeenCalledWith('test_u', {type: 'llm', name: 'Updated'});
  });

  it('delete calls SDK and resolves void', async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const api = createTestsApi({raw: makeMockSdk({del})});
    await expect(api.delete('test_d')).resolves.toBeUndefined();
    expect(del).toHaveBeenCalledWith('test_d');
  });

  it('runBatch maps testIds[] to {tests:[{testId}]} and returns invocationId', async () => {
    const runTests = vi.fn().mockResolvedValue({id: 'inv_99', testRuns: []});
    const api = createTestsApi({raw: makeMockSdk({runTests})});
    const result = await api.runBatch('agent_xxxx_demo', ['t1', 't2', 't3']);
    expect(result.invocationId).toBe('inv_99');
    expect(runTests).toHaveBeenCalledWith('agent_xxxx_demo', {
      tests: [{testId: 't1'}, {testId: 't2'}, {testId: 't3'}],
    });
  });

  it('runBatch throws on empty testIds', async () => {
    const api = createTestsApi({raw: makeMockSdk()});
    await expect(api.runBatch('agent', [])).rejects.toThrow(/non-empty/);
  });

  it('pollInvocation returns aggregated stats once pending is 0', async () => {
    const invocationsGet = vi.fn()
      .mockResolvedValueOnce({
        id: 'inv_42', testRuns: [
          {testRunId: 'r1', testId: 't1', status: 'pending'},
          {testRunId: 'r2', testId: 't2', status: 'passed'},
        ],
      })
      .mockResolvedValueOnce({
        id: 'inv_42', testRuns: [
          {testRunId: 'r1', testId: 't1', status: 'passed'},
          {testRunId: 'r2', testId: 't2', status: 'passed'},
        ],
      });
    const api = createTestsApi({raw: makeMockSdk({invocationsGet})});
    const result = await api.pollInvocation('inv_42', {intervalMs: 1, timeoutMs: 5000});
    expect(result.stats).toEqual({
      total: 2, passed: 2, failed: 0, pending: 0,
    });
    expect(invocationsGet).toHaveBeenCalledTimes(2);
  });

  it('pollInvocation aggregates passed + failed', async () => {
    const invocationsGet = vi.fn().mockResolvedValue({
      id: 'inv', testRuns: [
        {testRunId: 'r1', testId: 't1', status: 'passed'},
        {testRunId: 'r2', testId: 't2', status: 'failed'},
        {testRunId: 'r3', testId: 't3', status: 'failed'},
      ],
    });
    const api = createTestsApi({raw: makeMockSdk({invocationsGet})});
    const result = await api.pollInvocation('inv', {intervalMs: 1});
    expect(result.stats).toEqual({
      total: 3, passed: 1, failed: 2, pending: 0,
    });
  });

  it('pollInvocation times out when pending never clears', async () => {
    const invocationsGet = vi.fn().mockResolvedValue({
      id: 'inv', testRuns: [
        {testRunId: 'r1', testId: 't1', status: 'pending'},
      ],
    });
    const api = createTestsApi({raw: makeMockSdk({invocationsGet})});
    await expect(api.pollInvocation('inv', {intervalMs: 1, timeoutMs: 20}))
      .rejects.toThrow(/timed out/);
  });

  it('resubmitFailed forwards args to SDK', async () => {
    const invocationsResubmit = vi.fn().mockResolvedValue(undefined);
    const api = createTestsApi({raw: makeMockSdk({invocationsResubmit})});
    await api.resubmitFailed('inv_x', 'agent_y', ['r1', 'r2']);
    expect(invocationsResubmit).toHaveBeenCalledWith('inv_x', {testRunIds: ['r1', 'r2'], agentId: 'agent_y'});
  });

  it('normalizes unusual statuses (running -> pending, unknown -> failed)', async () => {
    const invocationsGet = vi.fn().mockResolvedValueOnce({
      id: 'inv', testRuns: [
        {testRunId: 'r1', testId: 't1', status: 'running'}, // -> pending
        {testRunId: 'r2', testId: 't2', status: 'mystery'}, // -> failed
      ],
    }).mockResolvedValueOnce({
      id: 'inv', testRuns: [
        {testRunId: 'r1', testId: 't1', status: 'passed'},
        {testRunId: 'r2', testId: 't2', status: 'failed'},
      ],
    });
    const api = createTestsApi({raw: makeMockSdk({invocationsGet})});
    const result = await api.pollInvocation('inv', {intervalMs: 1});
    expect(result.stats).toEqual({
      total: 2, passed: 1, failed: 1, pending: 0,
    });
  });
});
