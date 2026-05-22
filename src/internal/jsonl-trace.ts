/**
 * JSONL trace emission — the project-wide runtime logging standard.
 *
 * Per AGENTS.md ("Greenfield Development & Testing Policy"): all runtime
 * files obey JSONL standards. Trace events are newline-delimited JSON
 * objects appended to `logs/voice-evals-<ISO-date>.jsonl` at the consumer
 * project root (CWD), not inside node_modules.
 *
 * Event shape (single line per call, no pretty-print):
 *   {
 *     "ts": "2026-05-13T11:23:45.678Z",  // ISO 8601 UTC
 *     "channel": "webhooks.provision",     // dotted command path
 *     "level": "info" | "warn" | "error",  // optional, default info
 *     "run_id": "uuid-v4",                 // groups events from one invocation
 *     "key": "<artifact key>",             // e.g. agent_id, webhook_id
 *     "msg": "human-readable summary",     // optional
 *     "fields": { ...arbitrary structured fields },
 *   }
 *
 * Public API: `createTracer(channel)` returns a tracer bound to one channel
 * with a stable run_id. Tracers expose `info`, `warn`, `error`, and a `child`
 * method for nested channels.
 *
 * File naming: `logs/voice-evals-<ISO-date>.jsonl`. One file per UTC day.
 * Old files are not rotated by this module — operators rotate as needed.
 */

import {randomUUID} from 'node:crypto';
import {appendFileSync, existsSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';

export type TraceLevel = 'info' | 'warn' | 'error';

export type TraceFields = Record<string, unknown>;

export type TraceEmit = (msg: string, fields?: TraceFields) => void;

export type Tracer = {
  channel: string;
  runId: string;
  info: TraceEmit;
  warn: TraceEmit;
  error: TraceEmit;
  child: (subChannel: string) => Tracer;
};

const SUPPRESS = process.env.VOICE_EVALS_DISABLE_TRACE === '1';

function logPathForToday(): string {
  const dir = join(process.cwd(), 'logs');
  if (!existsSync(dir)) {
    mkdirSync(dir, {recursive: true});
  }

  const date = new Date().toISOString().slice(0, 10);
  return join(dir, `voice-evals-${date}.jsonl`);
}

type TraceEventInput = {
  channel: string;
  runId: string;
  level: TraceLevel;
  msg: string;
  fields?: TraceFields;
  key?: string;
};

function emit(input: TraceEventInput): void {
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
    // Tracing must never throw into business logic. Drop the event silently.
  }
}

export function createTracer(channel: string, options: {runId?: string; key?: string} = {}): Tracer {
  const runId = options.runId ?? randomUUID();
  const {key} = options;
  return {
    channel,
    runId,
    info(msg, fields) {
      emit({
        channel, runId, level: 'info', msg, fields, key,
      });
    },
    warn(msg, fields) {
      emit({
        channel, runId, level: 'warn', msg, fields, key,
      });
    },
    error(msg, fields) {
      emit({
        channel, runId, level: 'error', msg, fields, key,
      });
    },
    child: subChannel => createTracer(`${channel}.${subChannel}`, {runId, key}),
  };
}
