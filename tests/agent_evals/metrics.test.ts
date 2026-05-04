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
      // String(URL) → URL string. Request needs `.url` because its default
      // toString yields "[object Request]". Bare string passes through.
      const url = typeof input === 'string'
        ? input
        : (input instanceof URL ? input.href : input.url);
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

  test('payload groups samples by metric name even when increments are interleaved', async () => {
    // Prometheus exposition format requires samples for the same metric to
    // be contiguous. Map iteration follows insertion order, so an interleaved
    // call sequence (foo, bar, foo, bar) would otherwise produce a malformed
    // payload where foo's second sample comes after a different metric's
    // header + sample.
    captured = [];
    nextStatus = 200;

    const sink = createPrometheusMetricsSink({
      endpoint: 'http://vm/api/v1/import/prometheus',
      fetchImpl: fakeFetch(),
    });

    sink.incrementCounter('foo', 1, {x: '1'});
    sink.incrementCounter('bar', 1, {y: '1'});
    sink.incrementCounter('foo', 1, {x: '2'});
    sink.incrementCounter('bar', 1, {y: '2'});

    await sink.flush();
    const body = captured[0]?.body ?? '';
    const lines = body.trim().split('\n');

    // Each `# TYPE` line must come exactly once and must precede every
    // sample of that metric. After the type line, all samples for that
    // metric must be contiguous before the next `# TYPE` line.
    const typeIndices = lines
      .map((line, i) => (line.startsWith('# TYPE ') ? {name: line.split(' ')[2], i} : null))
      .filter((x): x is {name: string; i: number} => x !== null);

    expect(typeIndices).toHaveLength(2);
    for (const {name, i} of typeIndices) {
      // Walk forward until we hit the next # TYPE; everything before that
      // must start with this metric's name.
      const nextTypeIdx = lines.slice(i + 1).findIndex(line => line.startsWith('# TYPE '));
      const groupEnd = nextTypeIdx === -1 ? lines.length : i + 1 + nextTypeIdx;
      const groupSamples = lines.slice(i + 1, groupEnd);
      for (const sample of groupSamples) {
        expect(sample.startsWith(`${name}{`), `sample "${sample}" should belong to metric "${name}"`).toBe(true);
      }
    }
  });
});
