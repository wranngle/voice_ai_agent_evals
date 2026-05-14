import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  describe, expect, it, vi,
} from 'vitest';
import {
  evaluateAndLogFrictions, evaluateWorkflows, type WorkflowEvalConfig,
} from '../../src/n8n/workflow-eval';

function makeConfig(): WorkflowEvalConfig {
  return {
    base_url: 'https://n8n.example.com',
    workflows: [
      {
        id: 'lead_intake',
        name: 'Lead intake',
        webhook_path: '/webhook/lead-intake',
        test_cases: [
          {
            id: 'lead_intake_happy',
            name: 'Happy path',
            input: {name: 'Sarah', email: 'sarah@example.com'},
            expected: {status: 'ok', queued: true},
          },
          {
            id: 'lead_intake_missing_email',
            name: 'Missing email',
            input: {name: 'Bob'},
            expected: {status: 'error'},
          },
        ],
      },
    ],
  };
}

describe('evaluateWorkflows', () => {
  it('reports pass/fail per test case + workflow summary', async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => {
      n++;
      // First test passes, second fails on `status` mismatch.
      const body = n === 1 ? {status: 'ok', queued: true} : {status: 'success'};
      return new Response(JSON.stringify(body), {status: 200});
    }) as unknown as typeof globalThis.fetch;

    const result = await evaluateWorkflows(makeConfig(), {fetchImpl});
    expect(result.summary.total_tests).toBe(2);
    expect(result.summary.passed).toBe(1);
    expect(result.summary.failed).toBe(1);
    expect(result.summary.pass_rate).toBe(50);

    const wf = result.workflows[0];
    expect(wf.summary.pass_rate).toBe(50);
    expect(wf.test_cases[0].passed).toBe(true);
    expect(wf.test_cases[1].passed).toBe(false);
    expect(wf.test_cases[1].checks.find(c => c.field === 'status')?.passed).toBe(false);
  });

  it('records errors separately from assertion failures', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof globalThis.fetch;
    const result = await evaluateWorkflows(makeConfig(), {fetchImpl});
    expect(result.summary.errors).toBe(2);
    expect(result.summary.failed).toBe(0);
    expect(result.workflows[0].test_cases[0].error).toContain('ECONNREFUSED');
  });

  it('filters to a single workflow via options.workflowId', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', {status: 200})) as unknown as typeof globalThis.fetch;
    const result = await evaluateWorkflows(makeConfig(), {fetchImpl, workflowId: 'lead_intake'});
    expect(result.workflows).toHaveLength(1);
    expect(result.workflows[0].id).toBe('lead_intake');
  });

  it('skips unknown workflowId (returns empty results)', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', {status: 200})) as unknown as typeof globalThis.fetch;
    const result = await evaluateWorkflows(makeConfig(), {fetchImpl, workflowId: 'ghost'});
    expect(result.workflows).toHaveLength(0);
    expect(result.summary.total_tests).toBe(0);
  });

  it('honors a per-test timeout', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          resolve(new Response('{}', {status: 200}));
        }, 50);
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new Error('aborted'));
        });
      });
      return new Response('{}', {status: 200});
    }) as unknown as typeof globalThis.fetch;

    const config: WorkflowEvalConfig = {
      base_url: 'https://x',
      workflows: [{
        id: 'slow', name: 'slow', webhook_path: '/p',
        test_cases: [{
          id: 't', name: 't', input: {}, timeout_ms: 1, expected: {ok: true},
        }],
      }],
    };
    const result = await evaluateWorkflows(config, {fetchImpl});
    expect(result.workflows[0].test_cases[0].passed).toBe(false);
  });

  it('evaluateAndLogFrictions appends a friction event for every failed test', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'voice-evals-eval-friction-'));
    const frictionLogPath = join(dir, 'friction.jsonl');
    try {
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify({status: 'WRONG'}), {status: 200})) as unknown as typeof globalThis.fetch;
      const result = await evaluateAndLogFrictions(makeConfig(), {fetchImpl, frictionLogPath});
      expect(result.summary.failed).toBe(2);

      const lines = readFileSync(frictionLogPath, 'utf8').trim().split('\n');
      expect(lines).toHaveLength(2);
      const events = lines.map(l => JSON.parse(l) as Record<string, unknown>);
      for (const e of events) {
        expect(e.type).toBe('WORKFLOW_TEST_FAILURE');
        expect(e.pattern).toBe('lead_intake');
      }
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
});
