/**
 * @wranngle/voice-evals/wrapper/tests — thin wrapper over the SDK's
 * `client.conversationalAi.tests.*` and `agents.runTests` surfaces.
 *
 * Adds convenience over the bare SDK:
 *   - `list()` paginates automatically (default `{all: true}`)
 *   - `runBatch(agentId, testIds)` maps an id-list to the SDK's `{tests: [{testId}]}` shape
 *   - `pollInvocation(invocationId)` polls + returns aggregated pass/fail/pending stats
 *
 * Tests are NOT gated by `[PHASE]` governance — they are independent entities.
 * Governance applies only to AGENT mutations (see `src/wrapper/agents.ts`).
 */

import type {ElevenLabsClient} from '@elevenlabs/elevenlabs-js';

export type TestStatus = 'pending' | 'passed' | 'failed';

export type TestSummary = {
  id: string;
  name?: string;
  type?: string;
  /** Raw SDK passthrough for fields we haven't widened. */
  raw: unknown;
};

export type TestWithConfig = TestSummary & {
  config: unknown;
};

export type TestRunSummary = {
  testRunId: string;
  testId: string;
  testName?: string;
  status: TestStatus;
};

export type TestInvocationResult = {
  id: string;
  agentId?: string;
  testRuns: TestRunSummary[];
  stats: {
    total: number;
    passed: number;
    failed: number;
    pending: number;
  };
  /** Raw invocation response from the SDK. */
  raw: unknown;
};

export type PollInvocationOptions = {
  /** Time between poll attempts, ms. Default 5000. */
  intervalMs?: number;
  /** Max time before throwing, ms. Default 600000 (10 min). */
  timeoutMs?: number;
};

export type RunBatchResult = {
  invocationId: string;
};

// SDK types vary; use Parameters<> so we don't duplicate request/response shapes.
export type TestCreateInput = Parameters<ElevenLabsClient['conversationalAi']['tests']['create']>[0];
export type TestUpdateInput = Parameters<ElevenLabsClient['conversationalAi']['tests']['update']>[1];
export type TestListOptions = Parameters<ElevenLabsClient['conversationalAi']['tests']['list']>[0] & {
  /** If false, return only the first page; otherwise paginate. Default true. */
  all?: boolean;
};

export type TestsApi = {
  create(payload: TestCreateInput): Promise<TestSummary>;
  get(testId: string): Promise<TestWithConfig>;
  list(options?: TestListOptions): Promise<TestSummary[]>;
  update(testId: string, patch: TestUpdateInput): Promise<TestSummary>;
  delete(testId: string): Promise<void>;
  runBatch(agentId: string, testIds: readonly string[]): Promise<RunBatchResult>;
  pollInvocation(invocationId: string, options?: PollInvocationOptions): Promise<TestInvocationResult>;
  resubmitFailed(invocationId: string, agentId: string, testRunIds: readonly string[]): Promise<void>;
};

type TestsApiDeps = {
  raw: ElevenLabsClient;
};

export function createTestsApi({raw}: TestsApiDeps): TestsApi {
  return {
    async create(payload) {
      const response = await raw.conversationalAi.tests.create(payload);
      return {
        id: pickString((response as unknown as Record<string, unknown>)?.id) ?? '',
        name: pickString((payload as {name?: unknown}).name),
        type: pickString((payload as {type?: unknown}).type),
        raw: response,
      };
    },

    async get(testId) {
      const response = await raw.conversationalAi.tests.get(testId);
      return toAgentSummaryWithConfig(response, testId);
    },

    async list(options = {}) {
      const {all: wantAll = true, ...rest} = options;
      const collected: TestSummary[] = [];
      let {cursor} = rest;
      let safety = 0;

      while (safety < 100) {
        const requestOptions = cursor === undefined ? rest : {...rest, cursor};
        const page = await raw.conversationalAi.tests.list(requestOptions);
        const items = extractListItems(page);
        for (const item of items) {
          collected.push(toSummary(item));
        }

        cursor = extractNextCursor(page);
        if (!wantAll || cursor === undefined || cursor === '') {
          break;
        }

        safety++;
      }

      return collected;
    },

    async update(testId, patch) {
      const response = await raw.conversationalAi.tests.update(testId, patch);
      return {
        id: testId,
        name: pickString((patch as {name?: unknown}).name),
        type: pickString((patch as {type?: unknown}).type),
        raw: response,
      };
    },

    async delete(testId) {
      await raw.conversationalAi.tests.delete(testId);
    },

    async runBatch(agentId, testIds) {
      if (testIds.length === 0) {
        throw new Error('runBatch: testIds must be non-empty');
      }

      const invocation = await raw.conversationalAi.agents.runTests(agentId, {
        tests: testIds.map(testId => ({testId})),
      });
      return {
        invocationId: pickString((invocation as unknown as Record<string, unknown>)?.id) ?? '',
      };
    },

    async pollInvocation(invocationId, options = {}) {
      const interval = options.intervalMs ?? 5000;
      const timeout = options.timeoutMs ?? 600_000;
      const start = Date.now();

      while (Date.now() - start < timeout) {
        const inv = await raw.conversationalAi.tests.invocations.get(invocationId);
        const aggregated = aggregateInvocation(inv);

        if (aggregated.stats.pending === 0) {
          return aggregated;
        }

        await new Promise<void>(resolve => {
          setTimeout(resolve, interval);
        });
      }

      throw new Error(`pollInvocation timed out after ${timeout}ms (invocation: ${invocationId})`);
    },

    async resubmitFailed(invocationId, agentId, testRunIds) {
      await raw.conversationalAi.tests.invocations.resubmit(invocationId, {
        testRunIds: [...testRunIds],
        agentId,
      });
    },
  };
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function toSummary(raw: unknown): TestSummary {
  const item = (raw ?? {}) as Record<string, unknown>;
  return {
    id: pickString(item.id) ?? pickString(item.test_id) ?? pickString(item.testId) ?? '',
    name: pickString(item.name),
    type: pickString(item.type),
    raw,
  };
}

function toAgentSummaryWithConfig(raw: unknown, fallbackId: string): TestWithConfig {
  const summary = toSummary(raw);
  return {
    ...summary,
    id: summary.id || fallbackId,
    config: raw,
  };
}

function extractListItems(response: unknown): unknown[] {
  if (Array.isArray(response)) {
    return response;
  }

  if (response && typeof response === 'object') {
    const envelope = response as Record<string, unknown>;
    for (const key of ['tests', 'items', 'data', 'results']) {
      if (Array.isArray(envelope[key])) {
        return envelope[key] as unknown[];
      }
    }
  }

  return [];
}

function extractNextCursor(response: unknown): string | undefined {
  if (response && typeof response === 'object') {
    const envelope = response as Record<string, unknown>;
    const candidates = [envelope.nextCursor, envelope.next_cursor, envelope.cursor];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate !== '') {
        return candidate;
      }
    }
  }

  return undefined;
}

function aggregateInvocation(raw: unknown): TestInvocationResult {
  const inv = (raw ?? {}) as Record<string, unknown>;
  const rawRuns = Array.isArray(inv.testRuns) ? inv.testRuns : [];
  const runs: TestRunSummary[] = rawRuns.map(r => {
    const run = (r ?? {}) as Record<string, unknown>;
    return {
      testRunId: pickString(run.testRunId) ?? '',
      testId: pickString(run.testId) ?? '',
      testName: pickString(run.testName),
      status: normalizeStatus(run.status),
    };
  });

  const passed = runs.filter(r => r.status === 'passed').length;
  const failed = runs.filter(r => r.status === 'failed').length;
  const pending = runs.filter(r => r.status === 'pending').length;

  return {
    id: pickString(inv.id) ?? '',
    agentId: pickString(inv.agentId),
    testRuns: runs,
    stats: {
      total: runs.length, passed, failed, pending,
    },
    raw,
  };
}

function normalizeStatus(value: unknown): TestStatus {
  if (value === 'passed' || value === 'failed' || value === 'pending') {
    return value;
  }

  // Defensive fallback if SDK adds new statuses (e.g. 'running', 'error').
  if (typeof value === 'string' && ['running', 'queued', 'in_progress'].includes(value.toLowerCase())) {
    return 'pending';
  }

  return 'failed';
}
