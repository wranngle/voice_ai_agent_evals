/**
 * ElevenLabs post-call webhook signature verification.
 *
 * Pattern documented in `docs/webhook-security.md`. Defensive only —
 * this module verifies signatures, it does not produce them outside of
 * test fixtures.
 *
 * Header shape (sent by ElevenLabs):
 *   ElevenLabs-Signature: t=<unix-seconds>,v0=<hex-hmac-sha256>
 *
 * HMAC input: `${timestamp}.${rawBody}` — raw body bytes, before any
 * JSON parsing or whitespace normalization. Re-serializing changes the
 * digest, so verify before parsing.
 */

import {createHmac, timingSafeEqual} from 'node:crypto';

const DEFAULT_TOLERANCE_SECONDS = 30 * 60;

export type VerifyResult =
  | {ok: true}
  | {ok: false; reason: 'malformed_header' | 'stale_or_missing_signature' | 'signature_mismatch' | 'signature_replayed'};

export type ReplayCache = {
  has: (key: string) => boolean;
  add: (key: string) => void;
};

export type VerifyOptions = {
  /** Reject signatures whose `t=` is more than this many seconds away from now. Default 1800 (30 min). */
  toleranceSeconds?: number;
  /** Inject a clock for tests. Defaults to `Date.now`. */
  now?: () => number;
  /**
   * Replay cache: rejects a digest seen twice inside the tolerance window.
   * Defaults to a module-level in-memory cache shared across calls.
   * Provide your own (Redis-backed, etc.) for multi-process deployments.
   */
  replayCache?: ReplayCache;
};

/**
 * In-memory replay cache. Keys are `${t}:${v0}` (timestamp + digest).
 * Periodically evicts entries older than the max tolerance window so memory
 * stays bounded under steady load. Exported so callers (and tests) can
 * instantiate their own — production multi-process deployments should
 * provide a Redis-backed implementation matching the `ReplayCache` shape.
 */
export function createReplayCache(): ReplayCache {
  const seen = new Map<string, number>();
  const MAX_AGE_MS = 35 * 60 * 1000; // a touch above DEFAULT_TOLERANCE_SECONDS
  let lastSweep = Date.now();

  function maybeSweep(): void {
    const now = Date.now();
    if (now - lastSweep < 60_000) {
      return;
    } // sweep at most once per minute

    lastSweep = now;
    const cutoff = now - MAX_AGE_MS;
    for (const [key, addedAt] of seen) {
      if (addedAt < cutoff) {
        seen.delete(key);
      }
    }
  }

  return {
    has(key: string) {
      maybeSweep();
      return seen.has(key);
    },
    add(key: string) {
      seen.set(key, Date.now());
    },
  };
}

const DEFAULT_REPLAY_CACHE = createReplayCache();

type ParsedHeader = {t: number; v0: string};

function parseHeader(value: string): ParsedHeader | undefined {
  let timestamp: number | undefined;
  let v0: string | undefined;

  for (const part of value.split(',')) {
    const [rawKey, rawValue] = part.split('=', 2);
    const k = rawKey?.trim();
    const v = rawValue?.trim();
    if (k === 't' && v) {
      if (/^\d+$/.test(v)) {
        const n = Number(v);
        timestamp = n;
      }
    } else if (k === 'v0' && v) {
      v0 = v;
    }
  }

  if (typeof timestamp !== 'number' || !v0 || !/^[a-f\d]+$/i.test(v0)) {
    return undefined;
  }

  return {t: timestamp, v0};
}

function constantTimeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Verify an `ElevenLabs-Signature` header against the raw body and shared secret.
 *
 * @param rawBody       The byte-for-byte request body. Use a Buffer or the
 *                      original string — do not JSON-parse and re-stringify.
 * @param headerValue   Value of the `ElevenLabs-Signature` request header.
 * @param sharedSecret  The webhook secret returned by ElevenLabs at creation.
 * @param options       Tolerance + injectable clock for tests.
 */
export function verifyElevenLabsSignature(
  rawBody: string | Uint8Array,
  headerValue: string | undefined,
  sharedSecret: string,
  options: VerifyOptions = {},
): VerifyResult {
  // An empty shared secret is a developer/deployment error, not a runtime
  // auth failure. With `sharedSecret === ''` HMAC still runs but the "secret"
  // is now public, so any forger who knows it is empty can mint valid
  // signatures. Fail loudly so misconfigured receivers can't quietly accept
  // forgeries.
  if (typeof sharedSecret !== 'string' || sharedSecret === '') {
    throw new Error('verifyElevenLabsSignature: sharedSecret is empty — refusing to verify with an empty key');
  }

  if (!headerValue) {
    return {ok: false, reason: 'malformed_header'};
  }

  const parsed = parseHeader(headerValue);
  if (!parsed) {
    return {ok: false, reason: 'malformed_header'};
  }

  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const now = options.now ?? Date.now;
  const skew = Math.abs(Math.floor(now() / 1000) - parsed.t);
  if (skew > tolerance) {
    return {ok: false, reason: 'stale_or_missing_signature'};
  }

  const expected = createHmac('sha256', sharedSecret)
    .update(`${parsed.t}.`, 'utf8')
    .update(typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : Buffer.from(rawBody))
    .digest('hex');

  if (!constantTimeHexEqual(parsed.v0, expected)) {
    return {ok: false, reason: 'signature_mismatch'};
  }

  const replayCache = options.replayCache ?? DEFAULT_REPLAY_CACHE;
  const replayKey = `${parsed.t}:${parsed.v0}`;
  if (replayCache.has(replayKey)) {
    return {ok: false, reason: 'signature_replayed'};
  }

  replayCache.add(replayKey);
  return {ok: true};
}

/**
 * Produce a signature header value. Test-fixture helper — DO NOT call from
 * production receivers. Centralized here so test fixtures don't reinvent
 * the format and drift from the verifier.
 */
export function signElevenLabsPayload(
  rawBody: string | Uint8Array,
  sharedSecret: string,
  timestampSeconds: number,
): string {
  if (typeof sharedSecret !== 'string' || sharedSecret === '') {
    throw new Error('signElevenLabsPayload: sharedSecret is empty — refusing to sign with an empty key');
  }

  const v0 = createHmac('sha256', sharedSecret)
    .update(`${timestampSeconds}.`, 'utf8')
    .update(typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : Buffer.from(rawBody))
    .digest('hex');
  return `t=${timestampSeconds},v0=${v0}`;
}
