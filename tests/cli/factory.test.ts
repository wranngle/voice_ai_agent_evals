import {
  existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  describe, expect, it, vi,
} from 'vitest';
import {runFactoryCleanup} from '../../src/cli/commands/factory/cleanup';
import {runFactoryExecute} from '../../src/cli/commands/factory/execute';
import {runFactoryGenerate} from '../../src/cli/commands/factory/generate';
import {dispatchFactory} from '../../src/cli/commands/factory/index';
import {runFactoryList} from '../../src/cli/commands/factory/list';
import {runFactoryReport} from '../../src/cli/commands/factory/report';
import {runFactoryRun} from '../../src/cli/commands/factory/run';
import {runFactoryUpload} from '../../src/cli/commands/factory/upload';
import {generatedToCreatePayload} from '../../src/factory/to-elevenlabs';
import type {VoiceEvalsClient} from '../../src/wrapper/types';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'voice-evals-factory-'));
}

function makeClient(overrides: Partial<VoiceEvalsClient['tests']> = {}): VoiceEvalsClient {
  const tests = {
    create: vi.fn().mockResolvedValue({id: 'test_remote_1', name: 'Test', raw: {}}),
    get: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
    runBatch: vi.fn().mockResolvedValue({invocationId: 'inv_1'}),
    pollInvocation: vi.fn().mockResolvedValue({
      id: 'inv_1', testRuns: [], stats: {
        total: 0, passed: 0, failed: 0, pending: 0,
      }, raw: {},
    }),
    resubmitFailed: vi.fn(),
    ...overrides,
  };
  return {tests} as unknown as VoiceEvalsClient;
}

describe('generatedToCreatePayload', () => {
  it('translates snake_case fields to camelCase', () => {
    const payload = generatedToCreatePayload({
      id: 'g1',
      name: 'My test',
      type: 'llm',
      chat_history: [{role: 'user', message: 'hi'}],
      success_condition: 'response includes hello',
      success_examples: [{response: 'hello!', type: 'success'}],
      failure_examples: [{response: 'rude', type: 'failure'}],
      dynamic_variables: {industry: 'hvac'},
    }) as unknown as Record<string, unknown>;
    expect(payload.type).toBe('llm');
    expect(payload.name).toBe('My test');
    expect(payload.chatHistory).toBeDefined();
    expect(payload.successCondition).toBe('response includes hello');
    expect(payload.successExamples).toEqual([{response: 'hello!', type: 'success'}]);
    expect(payload.failureExamples).toEqual([{response: 'rude', type: 'failure'}]);
    expect(payload.dynamicVariables).toEqual({industry: 'hvac'});
  });

  it('omits absent fields cleanly', () => {
    const payload = generatedToCreatePayload({
      id: 'g1', name: 'M', type: 'llm',
    }) as unknown as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['name', 'type']);
  });
});

describe('runFactoryGenerate', () => {
  it('errors with hint when template files are missing', async () => {
    const dir = makeTempDir();
    const out = vi.fn();
    try {
      const code = await runFactoryGenerate({templatesDir: dir, out});
      expect(code).toBe(1);
      const allLines = out.mock.calls.map(c => c[0] as string).join('\n');
      expect(allLines).toContain('industries.yaml');
      expect(allLines).toContain('hint');
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('writes JSON output and reports count when --output is set', async () => {
    const dir = makeTempDir();
    const outFile = join(dir, 'tests.json');
    const out = vi.fn();
    try {
      const code = await runFactoryGenerate({
        templatesDir: 'templates/factory',
        strategy: 'sample',
        count: 5,
        seed: 42,
        output: outFile,
        out,
      });
      expect(code).toBe(0);
      expect(existsSync(outFile)).toBe(true);
      const parsed = JSON.parse(readFileSync(outFile, 'utf8'));
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeLessThanOrEqual(5);
      expect(out.mock.calls.some(c => (c[0] as string).includes('Wrote'))).toBe(true);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
});

describe('runFactoryUpload', () => {
  it('errors when --input is missing', async () => {
    const out = vi.fn();
    const code = await runFactoryUpload({input: '', client: makeClient(), out});
    expect(code).toBe(1);
    expect(out.mock.calls[0][0]).toContain('--input');
  });

  it('errors when file does not exist', async () => {
    const out = vi.fn();
    const code = await runFactoryUpload({
      input: '/no/such/file.json', client: makeClient(), out,
    });
    expect(code).toBe(1);
    expect(out.mock.calls[0][0]).toContain('not found');
  });

  it('errors when --clean-first is set without --clean-manifest', async () => {
    const dir = makeTempDir();
    const input = join(dir, 'tests.json');
    writeFileSync(input, '[]');
    const out = vi.fn();
    try {
      const code = await runFactoryUpload({
        input, cleanFirst: true, client: makeClient(), out,
      });
      expect(code).toBe(1);
      expect(out.mock.calls.map(c => c[0]).join('\n')).toContain('--clean-manifest');
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('--clean-first deletes IDs listed in --clean-manifest', async () => {
    const dir = makeTempDir();
    const input = join(dir, 'tests.json');
    const cleanManifest = join(dir, 'prior.json');
    writeFileSync(input, '[]');
    writeFileSync(cleanManifest, JSON.stringify([
      {generatedId: 'g1', remoteId: 'remote_old_1', name: 'old1'},
      {generatedId: 'g2', remoteId: 'remote_old_2', name: 'old2'},
    ]));
    const del = vi.fn().mockResolvedValue(undefined);
    const client = makeClient({delete: del});
    const out = vi.fn();
    try {
      const code = await runFactoryUpload({
        input, cleanFirst: true, cleanManifest, client, out,
      });
      expect(code).toBe(0);
      expect(del).toHaveBeenCalledTimes(2);
      expect(del.mock.calls.map(c => c[0])).toEqual(['remote_old_1', 'remote_old_2']);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('uploads each test and writes a manifest', async () => {
    const dir = makeTempDir();
    const input = join(dir, 'tests.json');
    const manifestPath = join(dir, 'manifest.json');
    const tests = [
      {id: 'g1', name: 'T1', type: 'llm'},
      {id: 'g2', name: 'T2', type: 'llm'},
    ];
    writeFileSync(input, JSON.stringify(tests));
    const create = vi.fn()
      .mockResolvedValueOnce({id: 'remote_1', raw: {}})
      .mockResolvedValueOnce({id: 'remote_2', raw: {}});
    const client = makeClient({create});
    const out = vi.fn();
    try {
      const code = await runFactoryUpload({
        input, manifestPath, client, out,
      });
      expect(code).toBe(0);
      expect(create).toHaveBeenCalledTimes(2);
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      expect(manifest).toHaveLength(2);
      expect(manifest[0].remoteId).toBe('remote_1');
      expect(manifest[1].remoteId).toBe('remote_2');
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('returns 1 when any upload fails but continues processing the rest', async () => {
    const dir = makeTempDir();
    const input = join(dir, 'tests.json');
    writeFileSync(input, JSON.stringify([
      {id: 'g1', name: 'T1', type: 'llm'},
      {id: 'g2', name: 'T2', type: 'llm'},
    ]));
    const create = vi.fn()
      .mockRejectedValueOnce(new Error('first failed'))
      .mockResolvedValueOnce({id: 'remote_2', raw: {}});
    const client = makeClient({create});
    const out = vi.fn();
    try {
      const code = await runFactoryUpload({input, client, out});
      expect(code).toBe(1);
      expect(create).toHaveBeenCalledTimes(2); // didn't bail on first failure
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
});

describe('runFactoryList + runFactoryCleanup', () => {
  it('list prints each test id and name', async () => {
    const list = vi.fn().mockResolvedValue([
      {
        id: 'remote_1', name: 'first', type: 'llm', raw: {},
      },
      {
        id: 'remote_2', name: 'second', type: 'tool', raw: {},
      },
    ]);
    const client = makeClient({list});
    const out = vi.fn();
    const code = await runFactoryList({agentId: 'agent_x', client, out});
    expect(code).toBe(0);
    const lines = out.mock.calls.map(c => c[0] as string);
    expect(lines.join('\n')).toContain('remote_1');
    expect(lines.join('\n')).toContain('remote_2');
  });

  it('cleanup errors without --manifest or --all', async () => {
    const out = vi.fn();
    const code = await runFactoryCleanup({client: makeClient(), out});
    expect(code).toBe(1);
    expect(out.mock.calls.map(c => c[0]).join('\n')).toContain('--manifest');
  });

  it('cleanup --all requires --yes confirmation', async () => {
    const out = vi.fn();
    const code = await runFactoryCleanup({all: true, client: makeClient(), out});
    expect(code).toBe(1);
    expect(out.mock.calls.map(c => c[0]).join('\n')).toContain('--yes');
  });

  it('cleanup --manifest deletes IDs from the manifest only', async () => {
    const dir = makeTempDir();
    const manifest = join(dir, 'manifest.json');
    writeFileSync(manifest, JSON.stringify([
      {generatedId: 'g1', remoteId: 'remote_1', name: 't1'},
      {generatedId: 'g2', remoteId: 'remote_2', name: 't2'},
    ]));
    const del = vi.fn().mockResolvedValue(undefined);
    const client = makeClient({delete: del});
    const out = vi.fn();
    try {
      const code = await runFactoryCleanup({manifest, client, out});
      expect(code).toBe(0);
      expect(del).toHaveBeenCalledTimes(2);
      expect(del.mock.calls.map(c => c[0])).toEqual(['remote_1', 'remote_2']);
      expect(out.mock.calls.map(c => c[0]).join('\n')).toContain('Deleted 2/2');
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('cleanup --all --yes wipes every test visible to the API key', async () => {
    const list = vi.fn().mockResolvedValue([
      {id: 'remote_1', raw: {}},
      {id: 'remote_2', raw: {}},
    ]);
    const del = vi.fn().mockResolvedValue(undefined);
    const client = makeClient({list, delete: del});
    const out = vi.fn();
    const code = await runFactoryCleanup({all: true, yes: true, client, out});
    expect(code).toBe(0);
    expect(del).toHaveBeenCalledTimes(2);
    expect(out.mock.calls.map(c => c[0]).join('\n')).toContain('Deleted 2/2');
  });
});

describe('runFactoryExecute', () => {
  it('errors without --agent-id', async () => {
    const out = vi.fn();
    const code = await runFactoryExecute({
      agentId: '', testIds: ['t1'], client: makeClient(), out,
    });
    expect(code).toBe(1);
  });

  it('errors when no test ids supplied', async () => {
    const out = vi.fn();
    const code = await runFactoryExecute({
      agentId: 'agent_x', client: makeClient(), out,
    });
    expect(code).toBe(1);
    expect(out.mock.calls.map(c => c[0]).join('\n')).toContain('no test ids resolved');
  });

  it('runs batch + polls when ids provided synchronously', async () => {
    const runBatch = vi.fn().mockResolvedValue({invocationId: 'inv_42'});
    const pollInvocation = vi.fn().mockResolvedValue({
      id: 'inv_42',
      testRuns: [{testRunId: 'r1', testId: 't1', status: 'passed'}],
      stats: {
        total: 1, passed: 1, failed: 0, pending: 0,
      },
      raw: {},
    });
    const client = makeClient({runBatch, pollInvocation});
    const out = vi.fn();
    const code = await runFactoryExecute({
      agentId: 'agent_x', testIds: ['t1'], client, out,
    });
    expect(code).toBe(0);
    expect(runBatch).toHaveBeenCalledWith('agent_x', ['t1']);
    expect(pollInvocation).toHaveBeenCalledWith('inv_42', expect.any(Object));
  });

  it('--async returns the invocationId without polling', async () => {
    const runBatch = vi.fn().mockResolvedValue({invocationId: 'inv_async'});
    const pollInvocation = vi.fn();
    const client = makeClient({runBatch, pollInvocation});
    const out = vi.fn();
    const code = await runFactoryExecute({
      agentId: 'agent_x', testIds: ['t1'], asyncMode: true, client, out,
    });
    expect(code).toBe(0);
    expect(pollInvocation).not.toHaveBeenCalled();
    expect(out.mock.calls.map(c => c[0]).join('\n')).toContain('inv_async');
  });

  it('resolves test ids from a manifest file', async () => {
    const dir = makeTempDir();
    const manifestPath = join(dir, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify([
      {generatedId: 'g1', remoteId: 'remote_1', name: 'A'},
      {generatedId: 'g2', remoteId: 'remote_2', name: 'B'},
    ]));
    const runBatch = vi.fn().mockResolvedValue({invocationId: 'inv_m'});
    const client = makeClient({runBatch});
    const out = vi.fn();
    try {
      await runFactoryExecute({
        agentId: 'agent_x', manifestPath, asyncMode: true, client, out,
      });
      expect(runBatch).toHaveBeenCalledWith('agent_x', ['remote_1', 'remote_2']);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('returns 1 when any test failed', async () => {
    const runBatch = vi.fn().mockResolvedValue({invocationId: 'inv_x'});
    const pollInvocation = vi.fn().mockResolvedValue({
      id: 'inv_x',
      testRuns: [{testRunId: 'r1', testId: 't1', status: 'failed'}],
      stats: {
        total: 1, passed: 0, failed: 1, pending: 0,
      },
      raw: {},
    });
    const client = makeClient({runBatch, pollInvocation});
    const out = vi.fn();
    const code = await runFactoryExecute({
      agentId: 'agent_x', testIds: ['t1'], client, out,
    });
    expect(code).toBe(1);
  });
});

describe('runFactoryReport', () => {
  it('errors without --invocation-id', async () => {
    const out = vi.fn();
    const code = await runFactoryReport({
      invocationId: '', client: makeClient(), out,
    });
    expect(code).toBe(1);
  });

  it('prints summary for an invocation', async () => {
    const pollInvocation = vi.fn().mockResolvedValue({
      id: 'inv_99',
      testRuns: [{testRunId: 'r1', testId: 't1', status: 'passed'}],
      stats: {
        total: 1, passed: 1, failed: 0, pending: 0,
      },
      raw: {},
    });
    const client = makeClient({pollInvocation});
    const out = vi.fn();
    const code = await runFactoryReport({invocationId: 'inv_99', client, out});
    expect(code).toBe(0);
    expect(out.mock.calls.map(c => c[0]).join('\n')).toContain('Total: 1');
  });
});

describe('runFactoryRun (end-to-end)', () => {
  it('runs generate -> upload -> execute -> poll with the in-process client', async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({id: 'remote_1', raw: {}})
      .mockResolvedValueOnce({id: 'remote_2', raw: {}});
    const runBatch = vi.fn().mockResolvedValue({invocationId: 'inv_full'});
    const pollInvocation = vi.fn().mockResolvedValue({
      id: 'inv_full',
      testRuns: [],
      stats: {
        total: 2, passed: 2, failed: 0, pending: 0,
      },
      raw: {},
    });
    const client = makeClient({create, runBatch, pollInvocation});
    const out = vi.fn();
    const code = await runFactoryRun({
      agentId: 'agent_x', count: 2, strategy: 'sample', seed: 7, client, out,
    });
    expect(code).toBe(0);
    expect(create).toHaveBeenCalledTimes(2);
    expect(runBatch).toHaveBeenCalledWith('agent_x', expect.arrayContaining(['remote_1', 'remote_2']));
    expect(pollInvocation).toHaveBeenCalled();
  });
});

describe('dispatchFactory router', () => {
  it('--help prints the subcommand list and returns 0', async () => {
    const out = vi.fn();
    const code = await dispatchFactory({argv: ['--help'], out});
    expect(code).toBe(0);
    expect(out.mock.calls.map(c => c[0]).join('\n')).toContain('generate');
  });

  it('returns 1 on unknown subcommand', async () => {
    const out = vi.fn();
    const code = await dispatchFactory({argv: ['borked'], out});
    expect(code).toBe(1);
    expect(out.mock.calls.map(c => c[0]).join('\n')).toContain('unknown factory subcommand');
  });
});
