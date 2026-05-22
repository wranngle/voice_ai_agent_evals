/**
 * JSONL trace utility for .mjs operational scripts.
 *
 * Mirrors src/internal/jsonl-trace.ts for runtime TS consumers. One file per
 * UTC day at `logs/voice-evals-<ISO-date>.jsonl` rooted at process.cwd().
 *
 * Event shape:
 *   {ts, channel, level, run_id, key?, msg, fields?}
 *
 * Public API:
 *   const tracer = createTracer('script.harden', {key: agentId});
 *   tracer.info('start', {args});
 *   tracer.warn('retry', {attempt: 2});
 *   tracer.error('fatal', {http: 400});
 *   tracer.child('substep').info('did thing');
 *
 * Set VOICE_EVALS_DISABLE_TRACE=1 to suppress.
 */

import {appendFileSync, existsSync, mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

const SUPPRESS = process.env.VOICE_EVALS_DISABLE_TRACE === '1';

function logPathForToday() {
  const dir = path.join(process.cwd(), 'logs');
  if (!existsSync(dir)) {
    mkdirSync(dir, {recursive: true});
  }

  const date = new Date().toISOString().slice(0, 10);
  return path.join(dir, `voice-evals-${date}.jsonl`);
}

function emit(input) {
  if (SUPPRESS) {
    return;
  }

  const event = {
    ts: new Date().toISOString(),
    channel: input.channel,
    level: input.level,
    run_id: input.runId,
    ...(input.key === undefined ? {} : {key: input.key}),
    msg: input.msg,
    ...(input.fields === undefined ? {} : {fields: input.fields}),
  };
  try {
    appendFileSync(logPathForToday(), `${JSON.stringify(event)}\n`);
  } catch {
    // Tracing must never throw into business logic.
  }
}

export function createTracer(channel, options = {}) {
  const runId = options.runId ?? randomUUID();
  const {key} = options;
  return {
    channel,
    runId,
    info: (msg, fields) => emit({
      channel, runId, level: 'info', msg, fields, key,
    }),
    warn: (msg, fields) => emit({
      channel, runId, level: 'warn', msg, fields, key,
    }),
    error: (msg, fields) => emit({
      channel, runId, level: 'error', msg, fields, key,
    }),
    child: sub => createTracer(`${channel}.${sub}`, {runId, key}),
  };
}
