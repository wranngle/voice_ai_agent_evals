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
  | 'TOMBSTONE'
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
  return applyTombstones(readFrictionLog(path)).filter(e => !e.resolved);
}

export type ResolveMatcher = {timestamp?: string; pattern?: string; type?: FrictionEventType};

/**
 * Append-only resolve: write a TOMBSTONE event referencing the original by
 * timestamp/pattern/type. O(1) IO per call, no rewrite. `readFrictionLog`
 * still returns the raw stream; use `compactFrictionLog()` or
 * `getUnresolvedFrictions()` to apply tombstones at read time.
 *
 * Preferred over `resolveFriction()` for high-throughput logs (10k+ events).
 * `resolveFriction()` is kept for backward compatibility — it rewrites the
 * entire file, which is fine at small scale but O(N) IO at large scale.
 */
export function resolveFrictionAppend(
  matcher: ResolveMatcher,
  options: LogFrictionOptions = {},
): FrictionEvent {
  const path = options.path ?? DEFAULT_PATH;
  const stamped: FrictionEvent = {
    timestamp: (options.now ?? defaultNow)(),
    type: 'TOMBSTONE',
    pattern: matcher.pattern,
    success: true,
    resolved: true,
    detail: JSON.stringify({matcher}),
  };
  appendFileSync(path, `${JSON.stringify(stamped)}\n`, 'utf8');
  return stamped;
}

/**
 * Apply tombstones to a stream of events. Returns the events with `resolved`
 * flipped to true on any record matched by a TOMBSTONE event. Tombstones
 * themselves are filtered from the output unless `includeTombstones: true`.
 */
export function applyTombstones(
  events: readonly FrictionEvent[],
  options: {includeTombstones?: boolean} = {},
): FrictionEvent[] {
  const tombstones: ResolveMatcher[] = [];
  const out: FrictionEvent[] = [];
  for (const event of events) {
    if (event.type === 'TOMBSTONE') {
      try {
        const parsed = JSON.parse(event.detail ?? '{}') as {matcher?: ResolveMatcher};
        if (parsed.matcher) {
          tombstones.push(parsed.matcher);
        }
      } catch {
        // Malformed tombstone — drop.
      }

      if (options.includeTombstones) {
        out.push(event);
      }

      continue;
    }

    out.push(event);
  }

  return out.map(event => {
    if (event.resolved) {
      return event;
    }

    const matched = tombstones.some(m => matchesEvent(event, m));
    return matched ? {...event, resolved: true} : event;
  });
}

function matchesEvent(event: FrictionEvent, matcher: ResolveMatcher): boolean {
  return (
    (!matcher.timestamp || event.timestamp === matcher.timestamp)
    && (!matcher.pattern || event.pattern === matcher.pattern)
    && (!matcher.type || event.type === matcher.type)
  );
}

/**
 * Mark a friction event as resolved (by timestamp+type match). Rewrites the
 * file. Returns the count of events updated.
 *
 * Use `resolveFrictionAppend()` for large logs — this implementation is
 * O(N) IO per call.
 */
export function resolveFriction(
  matcher: ResolveMatcher,
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
