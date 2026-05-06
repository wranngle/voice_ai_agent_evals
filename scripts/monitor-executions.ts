#!/usr/bin/env bun
/**
 * Monitor n8n workflow executions.
 *
 * Usage:
 *   bun scripts/monitor-executions.ts <workflow_id> [limit]
 *
 * Required env: N8N_API_KEY, N8N_API_URL.
 *
 * Resolves the workflow id from (in order): argv[2], env
 * N8N_POST_CALL_WORKFLOW_ID, or fails with usage.
 */

import {normalizeN8nApiUrl} from '../lib/n8n-url';

const WORKFLOW_ID = process.argv[2] || process.env.N8N_POST_CALL_WORKFLOW_ID;
const LIMIT = parseLimit(process.argv[3]);
const API_KEY = process.env.N8N_API_KEY || '';
// `N8N_API_URL` is documented as required. Falling back to the placeholder
// host silently aimed past the user's actual n8n; surface the omission with
// usage instead.
const API_URL = process.env.N8N_API_URL || '';

export type Execution = {
  id: string;
  status: string;
  startedAt: string;
  stoppedAt: string | undefined;
  mode: string;
  finished: boolean;
};

type ApiResponse = {
  data: Execution[];
  nextCursor?: string;
};

export type ExecutionSummary = {
  total: number;
  success: number;
  failed: number;
  running: number;
  failure_streak: number;
  last_success_at?: string;
  last_failure_at?: string;
  avg_duration_ms: number;
  min_duration_ms: number;
  max_duration_ms: number;
};

export function parseLimit(rawLimit: string | undefined): number {
  if (!rawLimit) {
    return 10;
  }

  const value = rawLimit.trim();
  if (!/^\d+$/.test(value)) {
    return 10;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 10;
}

export function buildExecutionsUrl(apiUrl: string, workflowId: string, limit: number): string {
  const url = new URL(`${normalizeN8nApiUrl(apiUrl)}/executions`);
  url.searchParams.set('workflowId', workflowId);
  url.searchParams.set('limit', String(limit));
  return url.toString();
}

async function fetchExecutions(): Promise<ApiResponse> {
  const url = buildExecutionsUrl(API_URL, WORKFLOW_ID!, LIMIT);
  const response = await fetch(url, {
    headers: {'X-N8N-API-KEY': API_KEY},
  });

  if (!response.ok) {
    throw new Error(`n8n API ${response.status} ${response.statusText} for ${url}`);
  }

  return (await response.json()) as ApiResponse;
}

function formatDuration(start: string, stop: string | undefined): string {
  if (!stop) {
    return 'running';
  }

  const ms = new Date(stop).getTime() - new Date(start).getTime();
  return `${ms}ms`;
}

export function summarizeExecutions(execs: Execution[]): ExecutionSummary {
  const total = execs.length;
  const success = execs.filter(e => isSuccessExecution(e)).length;
  const failed = execs.filter(e => isFailedExecution(e)).length;
  const running = execs.filter(e => !e.stoppedAt || !e.finished).length;
  const completedNewestFirst = execs
    .filter(e => e.stoppedAt)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  let failureStreak = 0;
  for (const exec of completedNewestFirst) {
    if (isSuccessExecution(exec)) {
      break;
    }

    if (isFailedExecution(exec)) {
      failureStreak++;
    }
  }

  const lastSuccess = newestExecution(execs.filter(e => isSuccessExecution(e)));
  const lastFailure = newestExecution(execs.filter(e => isFailedExecution(e)));

  const durations = execs
    .filter(e => e.stoppedAt)
    .map(e => new Date(e.stoppedAt!).getTime() - new Date(e.startedAt).getTime())
    .filter(duration => Number.isFinite(duration) && duration >= 0);

  return {
    total,
    success,
    failed,
    running,
    failure_streak: failureStreak,
    last_success_at: lastSuccess?.startedAt,
    last_failure_at: lastFailure?.startedAt,
    avg_duration_ms: durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0,
    min_duration_ms: durations.length > 0 ? Math.min(...durations) : 0,
    max_duration_ms: durations.length > 0 ? Math.max(...durations) : 0,
  };
}

function isSuccessExecution(exec: Execution): boolean {
  return exec.status === 'success';
}

function isFailedExecution(exec: Execution): boolean {
  return exec.status === 'error' || exec.status === 'failed' || exec.status === 'crashed';
}

function newestExecution(execs: Execution[]): Execution | undefined {
  return [...execs]
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
}

async function main() {
  if (!API_KEY) {
    console.error('Error: N8N_API_KEY environment variable not set');
    process.exit(1);
  }

  if (!API_URL) {
    console.error('Error: N8N_API_URL environment variable not set');
    console.error('   Export the base URL of your n8n instance (e.g.');
    console.error('   https://n8n.your-host.example/api/v1) before running this script.');
    process.exit(1);
  }

  if (!WORKFLOW_ID) {
    console.error('Error: workflow id required as argv[2] or N8N_POST_CALL_WORKFLOW_ID env var');
    console.error('Usage: bun scripts/monitor-executions.ts <workflow_id> [limit]');
    process.exit(1);
  }

  console.log('========================================');
  console.log('n8n Execution Monitor');
  console.log('========================================');
  console.log(`Workflow: ${WORKFLOW_ID}`);
  console.log(`Last ${LIMIT} executions`);
  console.log('');

  try {
    const data = await fetchExecutions();

    if (!data.data || data.data.length === 0) {
      console.log('No executions found');
      return;
    }

    console.log('ID         | Status  | Duration | Mode    | Started');
    console.log('-----------|---------|----------|---------|-------------------------');

    for (const exec of data.data) {
      const duration = formatDuration(exec.startedAt, exec.stoppedAt);
      const started = new Date(exec.startedAt).toLocaleString();
      console.log(`${exec.id.padEnd(10)} | ${exec.status.padEnd(7)} | ${duration.padEnd(8)} | ${exec.mode.padEnd(7)} | ${started}`);
    }

    // Statistics
    console.log('');
    console.log('========================================');
    console.log('Summary Statistics');
    console.log('========================================');

    const summary = summarizeExecutions(data.data);

    console.log(`Total executions: ${summary.total}`);
    console.log(`Success: ${summary.success} (${Math.round(summary.success / summary.total * 100)}%)`);
    console.log(`Failed: ${summary.failed} (${Math.round(summary.failed / summary.total * 100)}%)`);
    console.log(`Running: ${summary.running}`);
    console.log(`Current failure streak: ${summary.failure_streak}`);
    console.log(`Last success: ${summary.last_success_at ?? 'none in window'}`);
    console.log(`Last failure: ${summary.last_failure_at ?? 'none in window'}`);
    console.log('');
    console.log('Duration (completed only):');
    console.log(`  Average: ${summary.avg_duration_ms}ms`);
    console.log(`  Min: ${summary.min_duration_ms}ms`);
    console.log(`  Max: ${summary.max_duration_ms}ms`);

    if (summary.avg_duration_ms > 500) {
      console.log('');
      console.log('⚠️  WARNING: Average duration exceeds 500ms target');
    }

    if (summary.failure_streak > 0) {
      console.log('');
      console.log(`⚠️  WARNING: Current failure streak is ${summary.failure_streak}`);
    }

    // Success rate check
    const successRate = summary.success / summary.total;
    if (successRate < 0.95) {
      console.log('');
      console.log(`⚠️  WARNING: Success rate ${Math.round(successRate * 100)}% below 95% target`);
    }
  } catch (error) {
    console.error('Error fetching executions:', error);
    process.exit(1);
  }
}

if (import.meta.main) {
  void main();
}

export {normalizeN8nApiUrl} from '../lib/n8n-url';
