/**
 * ECS-shaped JSONL log channel.
 *
 * Emits newline-delimited JSON events conforming to a minimal subset of the
 * Elastic Common Schema (ECS) so downstream log shippers (Filebeat, Vector,
 * Logstash, Elastic Agent) can ingest voice-evals runtime traces without
 * field-mapping. Every line is guaranteed to contain the five ECS fields
 * required by spec item §1.6:
 *
 *   - `@timestamp`     ISO 8601 UTC
 *   - `event.dataset`  always `voice-evals`
 *   - `event.action`   short, verb-shaped (e.g. `score.start`, `score.parse`)
 *   - `service.name`   always `voice-evals`
 *   - `trace.id`       per-tracer UUID v4 grouping all events from one run
 *
 * Additional structured fields are merged at the top level under their own
 * dotted namespaces (e.g. `voice.dimension.name`) so consumers can stay in
 * the ECS-extension-fields convention. Nothing is pretty-printed — one event
 * per line, `JSON.parse`-able in isolation.
 *
 * The emitter NEVER throws into business logic. File-system errors during
 * write are caught and dropped; tracing is best-effort instrumentation, not
 * a hard dependency of any CLI command.
 *
 * Wire it up by passing `--json-log <path>` to the CLI; absent the flag the
 * sink is a no-op and zero bytes are written.
 */

import {randomUUID} from 'node:crypto';
import {
  appendFileSync, existsSync, mkdirSync,
} from 'node:fs';
import {dirname} from 'node:path';

export const SERVICE_NAME = 'voice-evals';
export const EVENT_DATASET = 'voice-evals';

export type EcsLevel = 'info' | 'warn' | 'error';

export type EcsFields = Record<string, unknown>;

export type EcsEvent = {
  [key: string]: unknown;
  '@timestamp': string;
  'event.dataset': string;
  'event.action': string;
  'service.name': string;
  'trace.id': string;
  'log.level': EcsLevel;
  message?: string;
};

export type EcsEmit = (action: string, fields?: EcsFields, message?: string) => void;

export type EcsLogger = {
  traceId: string;
  path: string | undefined;
  info: EcsEmit;
  warn: EcsEmit;
  error: EcsEmit;
  emit(action: string, level: EcsLevel, fields?: EcsFields, message?: string): void;
};

export type CreateEcsLoggerOptions = {
  /** NDJSON sink path. When undefined the logger is a no-op. */
  path?: string | undefined;
  /** Inject a stable trace.id (defaults to a fresh UUID v4). */
  traceId?: string;
  /** Override the wall clock — test seam only. */
  now?: () => Date;
};

function ensureParentDir(path: string): void {
  const dir = dirname(path);
  if (dir && dir !== '.' && !existsSync(dir)) {
    mkdirSync(dir, {recursive: true});
  }
}

export type BuildEcsEventInput = {
  action: string;
  level: EcsLevel;
  traceId: string;
  fields?: EcsFields;
  message?: string;
  now: Date;
};

export function buildEcsEvent(input: BuildEcsEventInput): EcsEvent {
  const event: EcsEvent = {
    '@timestamp': input.now.toISOString(),
    'event.dataset': EVENT_DATASET,
    'event.action': input.action,
    'service.name': SERVICE_NAME,
    'trace.id': input.traceId,
    'log.level': input.level,
  };
  if (input.message !== undefined) {
    event.message = input.message;
  }

  if (input.fields) {
    for (const [k, v] of Object.entries(input.fields)) {
      event[k] = v;
    }
  }

  return event;
}

export function createEcsLogger(options: CreateEcsLoggerOptions = {}): EcsLogger {
  const {path} = options;
  const traceId = options.traceId ?? randomUUID();
  const now = options.now ?? (() => new Date());

  const emit = (action: string, level: EcsLevel, fields?: EcsFields, message?: string): void => {
    if (!path) {
      return;
    }

    const event = buildEcsEvent({
      action, level, traceId, fields, message, now: now(),
    });
    try {
      ensureParentDir(path);
      appendFileSync(path, `${JSON.stringify(event)}\n`);
    } catch {
      // tracing is best-effort; never propagate sink errors.
    }
  };

  return {
    traceId,
    path,
    emit,
    info(action, fields, message) {
      emit(action, 'info', fields, message);
    },
    warn(action, fields, message) {
      emit(action, 'warn', fields, message);
    },
    error(action, fields, message) {
      emit(action, 'error', fields, message);
    },
  };
}

/** Fields every ECS event must carry. Drives the contract test. */
export const REQUIRED_ECS_FIELDS = [
  '@timestamp',
  'event.dataset',
  'event.action',
  'service.name',
  'trace.id',
] as const;
