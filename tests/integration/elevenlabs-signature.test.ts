import {describe, expect, test} from 'vitest';
import {
  verifyElevenLabsSignature,
  signElevenLabsPayload,
} from '../../src/security/elevenlabs-signature';

const SECRET = 'test_shared_secret_xxx';
const BODY = '{"type":"post_call","conversation_id":"conv_123"}';
const NOW_MS = 1_700_000_000_000;
const NOW_SECS = Math.floor(NOW_MS / 1000);
const fakeNow = () => NOW_MS;

describe('verifyElevenLabsSignature', () => {
  test('accepts a freshly signed payload', () => {
    const header = signElevenLabsPayload(BODY, SECRET, NOW_SECS);
    const result = verifyElevenLabsSignature(BODY, header, SECRET, {now: fakeNow});
    expect(result).toEqual({ok: true});
  });

  test('rejects when header missing', () => {
    const result = verifyElevenLabsSignature(BODY, undefined, SECRET, {now: fakeNow});
    expect(result).toEqual({ok: false, reason: 'malformed_header'});
  });

  test('rejects header with no t= field', () => {
    const result = verifyElevenLabsSignature(BODY, 'v0=abc123', SECRET, {now: fakeNow});
    expect(result).toEqual({ok: false, reason: 'malformed_header'});
  });

  test('rejects header with no v0= field', () => {
    const result = verifyElevenLabsSignature(BODY, `t=${NOW_SECS}`, SECRET, {now: fakeNow});
    expect(result).toEqual({ok: false, reason: 'malformed_header'});
  });

  test('accepts optional spaces around comma-separated signature fields', () => {
    const header = signElevenLabsPayload(BODY, SECRET, NOW_SECS).replace(',', ', ');
    const result = verifyElevenLabsSignature(BODY, header, SECRET, {now: fakeNow});
    expect(result).toEqual({ok: true});
  });

  test('rejects non-numeric timestamp suffixes instead of parsing a prefix', () => {
    const header = signElevenLabsPayload(BODY, SECRET, NOW_SECS).replace(
      `t=${NOW_SECS}`,
      `t=${NOW_SECS}junk`,
    );
    const result = verifyElevenLabsSignature(BODY, header, SECRET, {now: fakeNow});
    expect(result).toEqual({ok: false, reason: 'malformed_header'});
  });

  test('rejects header with non-hex v0', () => {
    const result = verifyElevenLabsSignature(BODY, `t=${NOW_SECS},v0=NOT_HEX!!`, SECRET, {now: fakeNow});
    expect(result).toEqual({ok: false, reason: 'malformed_header'});
  });

  test('rejects timestamps older than tolerance', () => {
    const oldTimestamp = NOW_SECS - (60 * 60); // 1 hour ago, default tolerance is 30 min
    const header = signElevenLabsPayload(BODY, SECRET, oldTimestamp);
    const result = verifyElevenLabsSignature(BODY, header, SECRET, {now: fakeNow});
    expect(result).toEqual({ok: false, reason: 'stale_or_missing_signature'});
  });

  test('rejects timestamps far in the future', () => {
    const futureTimestamp = NOW_SECS + (60 * 60);
    const header = signElevenLabsPayload(BODY, SECRET, futureTimestamp);
    const result = verifyElevenLabsSignature(BODY, header, SECRET, {now: fakeNow});
    expect(result).toEqual({ok: false, reason: 'stale_or_missing_signature'});
  });

  test('respects custom tolerance', () => {
    const oldTimestamp = NOW_SECS - 60; // 1 minute ago
    const header = signElevenLabsPayload(BODY, SECRET, oldTimestamp);
    // Tolerance 30s → reject
    expect(verifyElevenLabsSignature(BODY, header, SECRET, {now: fakeNow, toleranceSeconds: 30})).toEqual({
      ok: false, reason: 'stale_or_missing_signature',
    });
    // Tolerance 120s → accept
    expect(verifyElevenLabsSignature(BODY, header, SECRET, {now: fakeNow, toleranceSeconds: 120})).toEqual({
      ok: true,
    });
  });

  test('rejects when signed with a different secret', () => {
    const header = signElevenLabsPayload(BODY, 'OTHER_SECRET', NOW_SECS);
    const result = verifyElevenLabsSignature(BODY, header, SECRET, {now: fakeNow});
    expect(result).toEqual({ok: false, reason: 'signature_mismatch'});
  });

  test('rejects when body is mutated after signing (whitespace included)', () => {
    const header = signElevenLabsPayload(BODY, SECRET, NOW_SECS);
    const tamperedBody = BODY + ' '; // trailing space changes the digest
    const result = verifyElevenLabsSignature(tamperedBody, header, SECRET, {now: fakeNow});
    expect(result).toEqual({ok: false, reason: 'signature_mismatch'});
  });

  test('accepts Buffer body', () => {
    const header = signElevenLabsPayload(BODY, SECRET, NOW_SECS);
    const result = verifyElevenLabsSignature(Buffer.from(BODY, 'utf8'), header, SECRET, {now: fakeNow});
    expect(result).toEqual({ok: true});
  });

  test('verifies Uint8Array raw bytes without UTF-8 normalization', () => {
    const rawBody = Uint8Array.from([0x7B, 0x22, 0xFF, 0x00, 0x22, 0x7D]);
    const header = signElevenLabsPayload(rawBody, SECRET, NOW_SECS);
    const result = verifyElevenLabsSignature(rawBody, header, SECRET, {now: fakeNow});
    expect(result).toEqual({ok: true});
  });

  test('rejects v0 with mismatched length', () => {
    // Truncated v0 — same prefix, different length
    const header = signElevenLabsPayload(BODY, SECRET, NOW_SECS).slice(0, -2);
    const result = verifyElevenLabsSignature(BODY, header, SECRET, {now: fakeNow});
    expect(result).toEqual({ok: false, reason: 'signature_mismatch'});
  });

  test('throws on empty shared secret instead of silently verifying with an empty key', () => {
    const header = signElevenLabsPayload(BODY, SECRET, NOW_SECS);
    expect(() => verifyElevenLabsSignature(BODY, header, '', {now: fakeNow}))
      .toThrow(/sharedSecret is empty/);
  });
});

describe('signElevenLabsPayload', () => {
  test('throws on empty shared secret', () => {
    expect(() => signElevenLabsPayload(BODY, '', NOW_SECS))
      .toThrow(/sharedSecret is empty/);
  });
});
