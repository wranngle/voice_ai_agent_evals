#!/usr/bin/env bun
/**
 * Monitor n8n workflow executions
 * Usage: bun scripts/monitor-executions.ts [workflow_id] [limit]
 */

const WORKFLOW_ID = process.argv[2] || '81W6PAGZfSi81ZQ9';
const LIMIT = Number.parseInt(process.argv[3] || '10', 10);
const API_KEY = process.env.N8N_API_KEY || '';
const API_URL = process.env.N8N_API_URL || 'https://your-n8n-host.example.com';

if (!API_KEY) {
  console.error('Error: N8N_API_KEY environment variable not set');
  process.exit(1);
}

type Execution = {
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

async function fetchExecutions(): Promise<ApiResponse> {
  const url = `${API_URL}/api/v1/executions?workflowId=${WORKFLOW_ID}&limit=${LIMIT}`;
  const response = await fetch(url, {
    headers: {'X-N8N-API-KEY': API_KEY},
  });
  return (await response.json()) as ApiResponse;
}

function formatDuration(start: string, stop: string | undefined): string {
  if (!stop) {
    return 'running';
  }

  const ms = new Date(stop).getTime() - new Date(start).getTime();
  return `${ms}ms`;
}

async function main() {
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

    const execs = data.data;
    const total = execs.length;
    const success = execs.filter(e => e.status === 'success').length;
    const failed = execs.filter(e => e.status === 'error').length;

    const durations = execs
      .filter(e => e.stoppedAt)
      .map(e => new Date(e.stoppedAt!).getTime() - new Date(e.startedAt).getTime());

    const avgDuration = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;
    const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;
    const minDuration = durations.length > 0 ? Math.min(...durations) : 0;

    console.log(`Total executions: ${total}`);
    console.log(`Success: ${success} (${Math.round(success / total * 100)}%)`);
    console.log(`Failed: ${failed} (${Math.round(failed / total * 100)}%)`);
    console.log('');
    console.log('Duration (completed only):');
    console.log(`  Average: ${avgDuration}ms`);
    console.log(`  Min: ${minDuration}ms`);
    console.log(`  Max: ${maxDuration}ms`);

    if (avgDuration > 500) {
      console.log('');
      console.log('⚠️  WARNING: Average duration exceeds 500ms target');
    }

    // Success rate check
    const successRate = success / total;
    if (successRate < 0.95) {
      console.log('');
      console.log(`⚠️  WARNING: Success rate ${Math.round(successRate * 100)}% below 95% target`);
    }
  } catch (error) {
    console.error('Error fetching executions:', error);
    process.exit(1);
  }
}

void main();

export {};
