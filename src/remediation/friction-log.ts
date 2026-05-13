/**
 * @wranngle/voice-evals/remediation/friction-log — append-only JSONL audit log.
 *
 * Ports the archive's `data/friction-log.jsonl` pattern. Every event is a
 * single line of JSON; resolution is tracked by marking events as
 * `resolved: true` and rewriting the file (one rare write vs millions of
 * appends).
 *
 * Schema (matches archive):
 *   { timestamp, type, pattern?, agentId?, success, resolved, resolvedAt? }
 */

import {
  appendFileSync, existsSync, readFileSync, writeFileSync,
} from 'node:fs';

export type FrictionEventType =
  | 'REMEDIATION_APPLIED'
  | 'PATTERN_DETECTED'
  | 'VERIFICATION_FAILED'
  | 'AUTO_FIX'
  | 'CYCLE_START'
  | 'CYCLE_END'
  | string;

export type FrictionEvent = {
  /** ISO-8601 timestamp. Auto-stamped if omitted on log. */
  timestamp: string;
  type: FrictionEventType;
  pattern?: string;
  agentId?: string;
  success: boolean;
  resolved: boolean;
  resolvedAt?: string;
  detail?: string;
};

export type LogFrictionOptions = {
  /** Path to the JSONL log. Default: `data/friction-log.jsonl`. */
  path?: string;
  /** Inject a clock for tests. */
  now?: () => string;
};

const DEFAULT_PATH = 'data/friction-log.jsonl';

export function logFriction(
  event: Omit<FrictionEvent, 'timestamp' | 'resolved'> & Partial<Pick<FrictionEvent, 'timestamp' | 'resolved'>>,
  options: LogFrictionOptions = {},
): FrictionEvent {
  const path = options.path ?? DEFAULT_PATH;
  const stamped: FrictionEvent = {
    ...event,
    timestamp: event.timestamp ?? (options.now ?? defaultNow)(),
    resolved: event.resolved ?? false,
  };
  appendFileSync(path, `${JSON.stringify(stamped)}\n`, 'utf8');
  return stamped;
}

export function readFrictionLog(path: string = DEFAULT_PATH): FrictionEvent[] {
  if (!existsSync(path)) {
    return [];
  }

  const text = readFileSync(path, 'utf8');
  const out: FrictionEvent[] = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      continue;
    }

    try {
      out.push(JSON.parse(line) as FrictionEvent);
    } catch {
      // Skip malformed lines — append-only logs can occasionally have
      // truncated entries from crashed processes. Stay forward-compatible.
    }
  }

  return out;
}

export function getUnresolvedFrictions(path: string = DEFAULT_PATH): FrictionEvent[] {
  return readFrictionLog(path).filter(e => !e.resolved);
}

/**
 * Mark a friction event as resolved (by timestamp+type match). Rewrites the
 * file. Returns the count of events updated.
 */
export function resolveFriction(
  matcher: {timestamp?: string; pattern?: string; type?: FrictionEventType},
  options: LogFrictionOptions = {},
): number {
  const path = options.path ?? DEFAULT_PATH;
  if (!existsSync(path)) {
    return 0;
  }

  const events = readFrictionLog(path);
  const resolvedAt = (options.now ?? defaultNow)();
  let updated = 0;

  const next = events.map(event => {
    if (event.resolved) {
      return event;
    }

    const matches
      = (!matcher.timestamp || event.timestamp === matcher.timestamp)
        && (!matcher.pattern || event.pattern === matcher.pattern)
        && (!matcher.type || event.type === matcher.type);
    if (matches) {
      updated++;
      return {...event, resolved: true, resolvedAt};
    }

    return event;
  });

  writeFileSync(path, next.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');
  return updated;
}

function defaultNow(): string {
  return new Date().toISOString();
}
