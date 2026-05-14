import {
  describe, expect, it, vi,
} from 'vitest';
import {dispatchAgent} from '../../src/cli/commands/agent';
import {dispatchFriction} from '../../src/cli/commands/friction';
import {dispatchN8n} from '../../src/cli/commands/n8n';
import {dispatchScenarios} from '../../src/cli/commands/scenarios';

describe('dispatchAgent', () => {
  it('--help lists every subcommand', async () => {
    const out = vi.fn();
    const code = await dispatchAgent({argv: ['--help'], out});
    expect(code).toBe(0);
    const text = out.mock.calls.map(c => c[0]).join('\n');
    for (const sub of ['list', 'create', 'clone', 'archive', 'promote']) {
      expect(text).toContain(sub);
    }
  });

  it('rejects unknown subcommand', async () => {
    const out = vi.fn();
    // Avoid hitting buildClientFromEnv with a fake env var
    process.env.ELEVENLABS_API_KEY = 'sk_test_offline';
    try {
      const code = await dispatchAgent({argv: ['borked'], out});
      expect(code).toBe(1);
    } finally {
      delete process.env.ELEVENLABS_API_KEY;
    }
  });

  it('promote requires --approved-by and --reason', async () => {
    process.env.ELEVENLABS_API_KEY = 'sk_test_offline';
    const out = vi.fn();
    try {
      const code = await dispatchAgent({argv: ['promote', 'agent_x', 'ALPHA'], out});
      expect(code).toBe(1);
      expect(out.mock.calls.map(c => c[0]).join('\n')).toContain('--approved-by');
    } finally {
      delete process.env.ELEVENLABS_API_KEY;
    }
  });
});

describe('dispatchFriction', () => {
  it('--help lists subcommands', async () => {
    const out = vi.fn();
    const code = await dispatchFriction({argv: ['--help'], out});
    expect(code).toBe(0);
    const text = out.mock.calls.map(c => c[0]).join('\n');
    for (const sub of ['tail', 'list', 'resolve']) {
      expect(text).toContain(sub);
    }
  });

  it('resolve refuses to run without any matcher', async () => {
    const out = vi.fn();
    const code = await dispatchFriction({argv: ['resolve'], out});
    expect(code).toBe(1);
    expect(out.mock.calls.map(c => c[0]).join('\n')).toContain('at least one of');
  });
});

describe('dispatchN8n', () => {
  it('--help lists subcommands', async () => {
    const out = vi.fn();
    const code = await dispatchN8n({argv: ['--help'], out});
    expect(code).toBe(0);
    const text = out.mock.calls.map(c => c[0]).join('\n');
    for (const sub of ['diagnose', 'fix', 'eval']) {
      expect(text).toContain(sub);
    }
  });

  it('diagnose works without N8N_* env vars (no network required)', async () => {
    delete process.env.N8N_API_KEY;
    delete process.env.N8N_BASE_URL;
    process.env.N8N_API_KEY = 'sk_test';
    process.env.N8N_BASE_URL = 'https://x';
    const out = vi.fn();
    try {
      const code = await dispatchN8n({
        argv: ['diagnose', 'wf_1', 'ETIMEDOUT: timeout', '--node', 'HTTP'], out,
      });
      expect(code).toBe(0); // operations were emitted
      const text = out.mock.calls.map(c => c[0]).join('\n');
      expect(text).toContain('retryOnFail');
    } finally {
      delete process.env.N8N_API_KEY;
      delete process.env.N8N_BASE_URL;
    }
  });
});

describe('dispatchScenarios', () => {
  it('--help lists subcommands', async () => {
    const out = vi.fn();
    const code = await dispatchScenarios({argv: ['--help'], out});
    expect(code).toBe(0);
    expect(out.mock.calls.map(c => c[0]).join('\n')).toContain('generate');
  });

  it('generate emits scenarios to stdout', async () => {
    const out = vi.fn();
    const code = await dispatchScenarios({argv: ['generate', '--count', '3', '--seed', '1'], out});
    expect(code).toBe(0);
    const text = out.mock.calls.map(c => c[0]).join('');
    const parsed = JSON.parse(text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(3);
  });
});
