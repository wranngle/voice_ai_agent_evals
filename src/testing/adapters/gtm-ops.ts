/**
 * gtm_ops adapter
 *
 * Consumes the app-owned harness manifest in gtm_ops and runs each declared
 * validation command through the generic external-command runner.
 */

import {existsSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import type {
  EvaluationArtifact,
  TestCase,
  TestResult,
  TestStatus,
} from '../types';
import {ExternalCommandRunner} from '../runners/external-command-runner';
import type {ExternalCommandExpectedOutput} from '../runners/types';

export type GtmOpsHarnessCommand = {
  id: string;
  name: string;
  command: string;
  tags?: string[];
  timeout_ms?: number;
  enabled?: boolean;
  expected_output?: ExternalCommandExpectedOutput;
  artifacts?: EvaluationArtifact[];
};

export type GtmOpsHarnessManifest = {
  schema_version: string;
  project: 'gtm_ops';
  description?: string;
  commands: GtmOpsHarnessCommand[];
};

export type GtmOpsAdapterOptions = {
  projectRoot?: string;
  tags?: string[];
  includeDisabled?: boolean;
};

export type GtmOpsAdapterRun = {
  project: 'gtm_ops';
  project_root: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  status: TestStatus;
  total: number;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  results: TestResult[];
};

const MANIFEST_FILE = 'eval-harness.manifest.json';

const DEFAULT_COMMANDS: GtmOpsHarnessCommand[] = [
  {
    id: 'knowledge-base',
    name: 'Knowledge base validator',
    command: 'bash scripts/validate-knowledge-base.sh',
    tags: ['gtm_ops', 'docs', 'knowledge-base'],
    timeout_ms: 60_000,
  },
  {
    id: 'architecture-lint',
    name: 'Layered architecture lint',
    command: 'bash scripts/lint-layered-architecture.sh',
    tags: ['gtm_ops', 'architecture'],
    timeout_ms: 60_000,
  },
  {
    id: 'docs-gardener',
    name: 'Docs gardener',
    command: 'bash scripts/gardener.sh',
    tags: ['gtm_ops', 'docs'],
    timeout_ms: 60_000,
  },
  {
    id: 'typecheck',
    name: 'TypeScript typecheck',
    command: 'bun run typecheck',
    tags: ['gtm_ops', 'typecheck'],
    timeout_ms: 120_000,
  },
  {
    id: 'unit',
    name: 'Vitest unit suite',
    command: 'bun run test:run',
    tags: ['gtm_ops', 'unit'],
    timeout_ms: 180_000,
  },
  {
    id: 'app-e2e',
    name: 'Playwright app E2E suite',
    command: 'bun run test:e2e',
    tags: ['gtm_ops', 'e2e', 'playwright'],
    timeout_ms: 300_000,
    artifacts: [
      {
        name: 'Playwright app report',
        path: 'playwright-report/index.html',
        kind: 'html',
        producer: 'bun run test:e2e',
      },
      {
        name: 'Playwright app results',
        path: 'test-results',
        kind: 'other',
        producer: 'bun run test:e2e',
      },
    ],
  },
  {
    id: 'console-e2e',
    name: 'Playwright console UI suite',
    command: 'bun run test:console',
    tags: ['gtm_ops', 'ui', 'playwright', 'a11y', 'action-coverage'],
    timeout_ms: 300_000,
    artifacts: [
      {
        name: 'Playwright console report',
        path: 'playwright-console-report/index.html',
        kind: 'html',
        producer: 'bun run test:console',
      },
      {
        name: 'Playwright console results',
        path: 'test-results-console',
        kind: 'other',
        producer: 'bun run test:console',
      },
    ],
  },
  {
    id: 'eval-quick',
    name: 'Quick GTM eval batch',
    command: 'mkdir -p logs/eval-harness && bun run eval:quick -- --output logs/eval-harness/evaluation-report.json',
    tags: ['gtm_ops', 'domain-eval'],
    timeout_ms: 180_000,
    expected_output: {
      stdout_not_contains: ['REGRESSION DETECTED'],
    },
    artifacts: [
      {
        name: 'Quick GTM eval report',
        path: 'logs/eval-harness/evaluation-report.json',
        kind: 'json',
        producer: 'bun run eval:quick',
      },
    ],
  },
];

function defaultProjectRoot(): string {
  return resolve(process.cwd(), '..', 'gtm_ops');
}

function manifestPath(projectRoot: string): string {
  return join(projectRoot, MANIFEST_FILE);
}

function isCommand(value: unknown): value is GtmOpsHarnessCommand {
  return typeof value === 'object'
    && value !== null
    && typeof (value as GtmOpsHarnessCommand).id === 'string'
    && typeof (value as GtmOpsHarnessCommand).name === 'string'
    && typeof (value as GtmOpsHarnessCommand).command === 'string';
}

function commandTags(command: GtmOpsHarnessCommand): string[] {
  return [...new Set(['gtm_ops', ...(command.tags ?? [])])];
}

export function loadGtmOpsHarnessManifest(projectRoot = defaultProjectRoot()): GtmOpsHarnessManifest {
  const file = manifestPath(projectRoot);
  if (!existsSync(file)) {
    return {
      schema_version: 'voice_ai_agent_evals.gtm_ops.v1',
      project: 'gtm_ops',
      description: 'Default gtm_ops adapter manifest used when eval-harness.manifest.json is absent.',
      commands: DEFAULT_COMMANDS,
    };
  }

  const parsed = JSON.parse(readFileSync(file, 'utf-8')) as GtmOpsHarnessManifest;
  if (parsed.project !== 'gtm_ops' || !Array.isArray(parsed.commands) || !parsed.commands.every(command => isCommand(command))) {
    throw new Error(`Invalid gtm_ops harness manifest: ${file}`);
  }

  // Duplicate `id`s collapse to the same `test_id` (`GTMOPS-${id}`) and
  // `result_id`, producing ambiguous result records the reports cannot
  // attribute back to a specific command. Fail loudly at load time.
  const seenIds = new Set<string>();
  const duplicates: string[] = [];
  for (const command of parsed.commands) {
    if (seenIds.has(command.id)) {
      duplicates.push(command.id);
    } else {
      seenIds.add(command.id);
    }
  }

  if (duplicates.length > 0) {
    const unique = [...new Set(duplicates)].join(', ');
    throw new Error(`Invalid gtm_ops harness manifest: duplicate command id(s) in ${file}: ${unique}`);
  }

  return parsed;
}

function commandToTestCase(command: GtmOpsHarnessCommand, projectRoot: string): TestCase {
  const now = new Date().toISOString();
  return {
    test_id: `GTMOPS-${command.id}`,
    type: 'external-command',
    name: command.name,
    description: `gtm_ops adapter command: ${command.command}`,
    input: {
      command: command.command,
      cwd: projectRoot,
      timeout_ms: command.timeout_ms,
      artifacts: command.artifacts,
      dimensions: [
        {
          name: command.id,
          status: 'pending',
          detail: command.name,
          weight: 1,
        },
      ],
    },
    expected_output: {exit_code: 0, ...command.expected_output},
    tags: commandTags(command),
    enabled: command.enabled !== false,
    created_at: now,
    updated_at: now,
  };
}

export function createGtmOpsTestCases(options: GtmOpsAdapterOptions = {}): TestCase[] {
  const projectRoot = resolve(options.projectRoot ?? defaultProjectRoot());
  const manifest = loadGtmOpsHarnessManifest(projectRoot);
  const tags = new Set(options.tags ?? []);
  return manifest.commands
    .filter(command => options.includeDisabled || command.enabled !== false)
    .filter(command => tags.size === 0 || commandTags(command).some(tag => tags.has(tag)))
    .map(command => commandToTestCase(command, projectRoot));
}

export async function runGtmOpsAdapter(options: GtmOpsAdapterOptions = {}): Promise<GtmOpsAdapterRun> {
  const projectRoot = resolve(options.projectRoot ?? defaultProjectRoot());
  const runner = new ExternalCommandRunner();
  const testCases = createGtmOpsTestCases({...options, projectRoot});
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const results: TestResult[] = [];

  for (const testCase of testCases) {
    const validation = runner.validate(testCase);
    if (!validation.valid) {
      results.push({
        result_id: `RES-${testCase.test_id}`,
        test_id: testCase.test_id,
        execution_id: 'gtm_ops-adapter',
        status: 'error',
        actual_output: {validation_errors: validation.errors},
        latency_ms: 0,
        error_message: `Validation failed: ${validation.errors.join(', ')}`,
        executed_at: new Date().toISOString(),
        assertions_passed: 0,
        assertions_failed: 1,
      });
      continue;
    }

    const execution = await runner.execute(testCase);
    const {status} = execution;
    results.push({
      result_id: `RES-${testCase.test_id}`,
      test_id: testCase.test_id,
      execution_id: 'gtm_ops-adapter',
      status,
      actual_output: execution.actual_output,
      latency_ms: execution.latency_ms,
      error_message: execution.error_message,
      executed_at: new Date().toISOString(),
      assertions_passed: execution.assertions_passed,
      assertions_failed: execution.assertions_failed,
      artifacts: execution.artifacts,
      dimensions: execution.dimensions?.map(dimension => ({...dimension, status})),
    });
  }

  const passed = results.filter(result => result.status === 'passed').length;
  const failed = results.filter(result => result.status === 'failed').length;
  const errors = results.filter(result => result.status === 'error').length;
  const skipped = results.filter(result => result.status === 'skipped').length;

  // A run with zero matching commands is almost always a typo in --tag /
  // --root or a misconfigured manifest. Reporting "passed" with zero
  // coverage hides the gap from any CI gate built on the exit code.
  const status: TestStatus = results.length === 0
    ? 'error'
    : (failed === 0 && errors === 0 ? 'passed' : 'failed');

  return {
    project: 'gtm_ops',
    project_root: projectRoot,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    duration_ms: Math.round(performance.now() - start),
    status,
    total: results.length,
    passed,
    failed,
    errors,
    skipped,
    results,
  };
}
