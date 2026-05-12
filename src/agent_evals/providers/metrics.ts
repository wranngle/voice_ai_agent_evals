export type MetricsSink = {
  incrementCounter(name: string, value?: number, attributes?: Record<string, string>): void;
  flush(): Promise<void>;
};

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = (): void => {};

export const NoopMetricsSink: MetricsSink = {
  incrementCounter: noop,
  async flush(): Promise<void> {
    // no-op metrics sink
  },
};

type CounterPoint = {
  name: string;
  value: number;
  attributes: Record<string, string>;
  timeUnixNano: string;
  startTimeUnixNano: string;
};

type PrometheusMetricsSinkOptions = {
  /**
   * Endpoint that accepts Prometheus exposition format. For VictoriaMetrics:
   * `http://<host>:8428/api/v1/import/prometheus`.
   *
   * NOTE: this sink does NOT speak OTLP. Vector's `opentelemetry` source
   * and VictoriaMetrics's `/opentelemetry/api/v1/push` both reject the
   * JSON-encoded OTLP envelopes earlier slices were emitting, so the wire
   * format here is Prometheus exposition (text). To target the local
   * stack via Vector, point this sink at the Prometheus-import endpoint
   * directly, NOT at `http://127.0.0.1:4318/v1/metrics` — Vector's OTLP
   * intake won't accept exposition-format payloads.
   */
  endpoint: string;
  serviceName?: string;
  fetchImpl?: typeof fetch;
  /**
   * Per-flush timeout in ms. A hung metrics endpoint would otherwise block
   * `agent_evals/runtime/cli.ts` indefinitely after a successful run.
   * Default 5s — metrics export is best-effort, not in the critical path.
   */
  flushTimeoutMs?: number;
};

export function createPrometheusMetricsSink(options: PrometheusMetricsSinkOptions): MetricsSink {
  const startTime = Date.now() * 1_000_000;
  const startTimeNs = startTime.toString();
  const serviceName = options.serviceName ?? 'agent-evals';
  const fetchImpl = options.fetchImpl ?? fetch;
  const counters = new Map<string, CounterPoint>();

  return {
    incrementCounter(name, value = 1, attributes = {}): void {
      const merged = {...attributes, service_name: serviceName};
      const key = counterKey(name, merged);
      const existing = counters.get(key);
      if (existing) {
        existing.value += value;
        existing.timeUnixNano = (Date.now() * 1_000_000).toString();
      } else {
        counters.set(key, {
          name,
          value,
          attributes: merged,
          timeUnixNano: (Date.now() * 1_000_000).toString(),
          startTimeUnixNano: startTimeNs,
        });
      }
    },
    async flush(): Promise<void> {
      if (counters.size === 0) {
        return;
      }

      const payload = buildPrometheusPayload([...counters.values()]);
      const response = await fetchImpl(options.endpoint, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: payload,
        signal: AbortSignal.timeout(options.flushTimeoutMs ?? 5000),
      });
      if (!response.ok) {
        throw new Error(`metrics export failed: ${response.status} ${response.statusText}`);
      }
      // Counters are cumulative — leave values in place for the next flush.
    },
  };
}

function buildPrometheusPayload(points: CounterPoint[]): string {
  // Prometheus exposition format requires samples for the same metric to be
  // contiguous, with the optional # TYPE line preceding the group. Map
  // insertion order can interleave names (e.g. foo, bar, foo), so sort by
  // name before emission. Stable sort keeps within-name order deterministic.
  const sorted = [...points].sort((a, b) => a.name.localeCompare(b.name));

  const lines: string[] = [];
  const seenNames = new Set<string>();
  for (const point of sorted) {
    if (!seenNames.has(point.name)) {
      lines.push(`# TYPE ${point.name} counter`);
      seenNames.add(point.name);
    }

    const labelString = Object.entries(point.attributes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k.replaceAll(/\W/g, '_')}="${escapePromValue(v)}"`)
      .join(',');
    lines.push(`${point.name}{${labelString}} ${point.value}`);
  }

  return lines.join('\n') + '\n';
}

function escapePromValue(v: string): string {
  return v.replaceAll('\\', '\\\\').replaceAll('"', String.raw`\"`).replaceAll('\n', String.raw`\n`);
}

function counterKey(name: string, attributes: Record<string, string>): string {
  const sortedAttrs = Object.entries(attributes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
  return `${name}{${sortedAttrs}}`;
}

