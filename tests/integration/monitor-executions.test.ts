import {describe, expect, test} from 'vitest';
import {
  buildExecutionsUrl,
  normalizeN8nApiUrl,
  parseLimit,
  summarizeExecutions,
  type Execution,
} from '../../scripts/monitor-executions';

describe('monitor-executions helpers', () => {
  test('normalizes documented n8n API URLs without duplicating /api/v1', () => {
    expect(normalizeN8nApiUrl('https://n8n.example.com/api/v1')).toBe('https://n8n.example.com/api/v1');
    expect(normalizeN8nApiUrl('https://n8n.example.com/api/v1/')).toBe('https://n8n.example.com/api/v1');
    expect(normalizeN8nApiUrl('https://n8n.example.com')).toBe('https://n8n.example.com/api/v1');
  });

  test('builds an encoded executions URL from host or /api/v1 inputs', () => {
    const fromApiUrl = buildExecutionsUrl('https://n8n.example.com/api/v1', 'wf post-call', 25);
    const fromHostUrl = buildExecutionsUrl('https://n8n.example.com/', 'wf post-call', 25);

    expect(fromApiUrl).toBe('https://n8n.example.com/api/v1/executions?workflowId=wf+post-call&limit=25');
    expect(fromHostUrl).toBe(fromApiUrl);
    expect(fromApiUrl).not.toContain('/api/v1/api/v1/');
  });

  test('falls back to the default execution limit for invalid input', () => {
    expect(parseLimit(undefined)).toBe(10);
    expect(parseLimit('')).toBe(10);
    expect(parseLimit('0')).toBe(10);
    expect(parseLimit('not-a-number')).toBe(10);
    expect(parseLimit('50oops')).toBe(10);
    expect(parseLimit('50')).toBe(50);
  });

  test('summarizes last success and current failure streak from completed executions', () => {
    const executions: Execution[] = [
      execution({
        id: 'older-success', status: 'success', startedAt: '2026-05-05T10:00:00.000Z', durationMs: 100,
      }),
      execution({id: 'newest-running', status: 'running', startedAt: '2026-05-05T10:04:00.000Z'}),
      execution({
        id: 'newest-failure', status: 'error', startedAt: '2026-05-05T10:03:00.000Z', durationMs: 300,
      }),
      execution({
        id: 'middle-failure', status: 'failed', startedAt: '2026-05-05T10:02:00.000Z', durationMs: 200,
      }),
    ];

    expect(summarizeExecutions(executions)).toMatchObject({
      total: 4,
      success: 1,
      failed: 2,
      running: 1,
      failure_streak: 2,
      last_success_at: '2026-05-05T10:00:00.000Z',
      last_failure_at: '2026-05-05T10:03:00.000Z',
      avg_duration_ms: 200,
      min_duration_ms: 100,
      max_duration_ms: 300,
    });
  });

  test('resets failure streak when the newest completed execution succeeds', () => {
    const executions: Execution[] = [
      execution({
        id: 'older-failure', status: 'error', startedAt: '2026-05-05T10:00:00.000Z', durationMs: 100,
      }),
      execution({
        id: 'newer-success', status: 'success', startedAt: '2026-05-05T10:02:00.000Z', durationMs: 100,
      }),
    ];

    expect(summarizeExecutions(executions).failure_streak).toBe(0);
  });
});

function execution(options: {
  id: string;
  status: string;
  startedAt: string;
  durationMs?: number;
}): Execution {
  const stoppedAt = typeof options.durationMs === 'number'
    ? new Date(new Date(options.startedAt).getTime() + options.durationMs).toISOString()
    : undefined;

  return {
    id: options.id,
    status: options.status,
    startedAt: options.startedAt,
    stoppedAt,
    mode: 'webhook',
    finished: Boolean(stoppedAt),
  };
}
