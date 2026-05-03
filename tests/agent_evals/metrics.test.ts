import {
  afterAll, beforeAll, describe, expect, test,
} from 'vitest';
import {
  NoopMetricsSink,
  createPrometheusMetricsSink,
} from '../../lib/agent_evals/providers/metrics';

describe('NoopMetricsSink', () => {
  test('incrementCounter and flush are no-ops', async () => {
    NoopMetricsSink.incrementCounter('any', 5, {rule: 'x'});
    await NoopMetricsSink.flush();
    expect(true).toBe(true);
  });
});

describe('PrometheusMetricsSink', () => {
  let captured: Array<{url: string; body: string}> = [];
  let nextStatus = 200;

  beforeAll(() => {
    captured = [];
    nextStatus = 200;
  });

  afterAll(() => {
    captured = [];
  });

  function fakeFetch(): typeof fetch {
    return (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const body = (init?.body as string) ?? '';
      captured.push({url, body});
      return new Response('', {status: nextStatus});
    }) as typeof fetch;
  }

  test('flush sends one Prometheus exposition payload with merged service_name label', async () => {
    captured = [];
    nextStatus = 200;

    const sink = createPrometheusMetricsSink({
      endpoint: 'http://vm/api/v1/import/prometheus',
      serviceName: 'agent-evals-test',
      fetchImpl: fakeFetch(),
    });

    sink.incrementCounter('agent_evals_evaluations_total', 3);
    sink.incrementCounter('agent_evals_findings_failed_total', 1, {
      rule: 'turn-duration-cap',
    });
    sink.incrementCounter('agent_evals_findings_failed_total', 1, {
      rule: 'turn-duration-cap',
    });
    sink.incrementCounter('agent_evals_findings_failed_total', 1, {
      rule: 'agent-turn-ratio',
    });

    await sink.flush();
    expect(captured).toHaveLength(1);

    const [hit] = captured;
    expect(hit?.url).toBe('http://vm/api/v1/import/prometheus');

    const body = hit?.body ?? '';

    expect(body).toContain('# TYPE agent_evals_evaluations_total counter');
    expect(body).toContain('agent_evals_evaluations_total{service_name="agent-evals-test"} 3');

    expect(body).toContain('# TYPE agent_evals_findings_failed_total counter');
    expect(body).toContain('agent_evals_findings_failed_total{rule="turn-duration-cap",service_name="agent-evals-test"} 2');
    expect(body).toContain('agent_evals_findings_failed_total{rule="agent-turn-ratio",service_name="agent-evals-test"} 1');
  });

  test('flush throws when the endpoint returns non-2xx', async () => {
    captured = [];
    nextStatus = 503;

    const sink = createPrometheusMetricsSink({
      endpoint: 'http://vm/api/v1/import/prometheus',
      fetchImpl: fakeFetch(),
    });

    sink.incrementCounter('c', 1);
    await expect(sink.flush()).rejects.toThrow(/metrics export failed: 503/);
  });

  test('flush is a no-op when no counters have been recorded', async () => {
    captured = [];
    nextStatus = 200;

    const sink = createPrometheusMetricsSink({
      endpoint: 'http://vm/api/v1/import/prometheus',
      fetchImpl: fakeFetch(),
    });

    await sink.flush();
    expect(captured).toHaveLength(0);
  });
});
