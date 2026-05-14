# How ElevenLabs post-call webhook auth works

Pattern documentation for verifying signatures on the ElevenLabs post-call webhook in this repo. Defensive only — this doc shows how to **verify** signatures, not how to forge them.

## Header format

ElevenLabs sends the signature in the `ElevenLabs-Signature` header:

```
ElevenLabs-Signature: t=<unix-timestamp>,v0=<hex-hmac-sha256>
```

The timestamp is the Unix-epoch second the request was signed at the ElevenLabs side. The `v0` field is the hex-encoded HMAC-SHA256 digest.

## What's signed

The HMAC input is the **timestamp** and **raw request body** joined by a literal `.`:

```
hmac_input = "<timestamp>" + "." + raw_body
```

`raw_body` is the byte-for-byte request body before any JSON parsing or whitespace normalization. Re-serializing the body changes the digest; verify before parsing.

## Verification — pseudocode

```ts
function verifyElevenLabsSignature(
  rawBody: Buffer,
  headerValue: string,
  sharedSecret: string,
  toleranceSeconds = 30 * 60,    // 30 minutes; tighten if your network allows
): { ok: true } | { ok: false; reason: string } {
  const parts = parseHeader(headerValue);          // → { t, v0 }
  if (!parts) return { ok: false, reason: "malformed_header" };

  const skew = Math.abs(Math.floor(Date.now() / 1000) - parts.t);
  if (skew > toleranceSeconds) return { ok: false, reason: "stale_or_missing_signature" };

  const expected = hmacSha256Hex(`${parts.t}.${rawBody.toString("utf8")}`, sharedSecret);
  if (!constantTimeEqual(parts.v0, expected)) return { ok: false, reason: "signature_mismatch" };

  return { ok: true };
}
```

A working implementation lives in [`src/security/elevenlabs-signature.ts`](../src/security/elevenlabs-signature.ts) — `verifyElevenLabsSignature(rawBody, headerValue, sharedSecret, options?)` returns `{ok: true}` on success or `{ok: false, reason: 'malformed_header' | 'stale_or_missing_signature' | 'signature_mismatch'}`. Both verify and sign throw on an empty `sharedSecret` rather than silently HMAC'ing with an empty key. Test coverage lives at `tests/integration/elevenlabs-signature.test.ts` (16 cases — header parsing, tolerance window, body-tampering detection, custom-clock injection, empty-secret guard).

## Signed replay tests

Webhook replay tests can ask the generic webhook runner to sign the exact JSON body it sends:

```ts
input: {
  url: 'https://example.com/post-call',
  method: 'POST',
  body: {type: 'post_call_transcription', data: {conversation_id: 'conv_replay_001'}},
  sign_elevenlabs_payload: true,
  elevenlabs_signature_secret_env: 'ELEVENLABS_POST_CALL_SECRET',
}
```

The runner reads the secret from the named environment variable, computes `ElevenLabs-Signature` over the same `JSON.stringify(input.body)` bytes used as the request body, and never stores the secret in the test case. Omit `elevenlabs_signature_secret_env` to use `ELEVENLABS_POST_CALL_SECRET`.

## Timestamp tolerance (replay defense)

A signature is valid only if `|now − t| ≤ tolerance`. The default in this repo is **30 minutes** — wide enough to absorb clock drift and ElevenLabs-side queuing, narrow enough to reject obviously stale replays. Tighten on networks where you control both endpoints.

If you accept a signature outside the tolerance window, you accept replay forever. Don't.

## Post-call payload fields actually consumed

The harness in this repo reads these fields from the verified payload:

| Field | Type | Consumer |
|---|---|---|
| `transcript` | array of turns | scenario regression set |
| `analysis` | object (ElevenLabs-side conversation summary) | scoring rubric input |
| `evaluation_criteria_results` | object | per-criterion pass/fail |
| `conversation_id` | string | run identity for `tests/runs/<id>/` |
| `metadata.start_time_unix_secs` | int | latency calculations |
| `metadata.call_duration_secs` | int | turn-rate sanity check |

Other fields exist on the wire but aren't consumed — they're available if a future scenario needs them.

## On verification failure

- **Drop and log.** Return `401 Unauthorized` with body `{"error": "UNAUTHORIZED", "message": "<reason>"}` where `<reason>` is the verification result (`malformed_header` | `stale_or_missing_signature` | `signature_mismatch`).
- **Do not retry.** A failed signature is either an attack or a misconfiguration; retries don't fix either.
- **Do not include verification diagnostics in the response body** beyond the single reason string. Server-side logs may include the timestamp and the truncated `v0` prefix; never the shared secret, never the expected digest, never the request body.

## What this doc deliberately does NOT include

- The shared secret (lives in `${ELEVENLABS_POST_CALL_SECRET}` only)
- The rotation cadence of the secret in production (operational metadata)
- Forge / replay attack payloads
- Exfil-friendly diagnostic responses

## Rotating the shared secret

ElevenLabs returns a webhook's HMAC secret only at creation time. The webhook URL itself is **immutable**, so rotation = create new webhook + repoint references + delete old. Operators run this manually against the ElevenLabs API; this repo only ships the verifier (`src/security/elevenlabs-signature.ts`), not the create/rotate orchestration.
