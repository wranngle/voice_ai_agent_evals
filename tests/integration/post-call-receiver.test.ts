/**
 * End-to-end test for src/ingestion/post-call-receiver.ts — the local
 * HMAC-verifying NDJSON sink that closes the loop on E2 (post-call payload
 * reaches a persistent sink within 30s of delivery).
 *
 * Starts the HTTP receiver on an OS-assigned port, fires signed + tampered
 * + replayed payloads, and asserts the right things land on disk (or get
 * rejected at the wire) within the budget.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {mkdtempSync, rmSync, existsSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHmac} from 'node:crypto';
import {startPostCallReceiver, type RunningReceiver} from '../../src/ingestion/post-call-receiver';
import {createReplayCache} from '../../src/security/elevenlabs-signature';

const SECRET = 'integration_test_secret';

function sign(body: string, secret: string, timestamp: number): string {
  const v0 = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v0=${v0}`;
}

describe('post-call receiver — persistent sink', () => {
  let tempDir: string;
  let receiver: RunningReceiver;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'voice-evals-post-call-'));
    receiver = await startPostCallReceiver({
      port: 0,
      secret: SECRET,
      logsDir: tempDir,
      replayCache: createReplayCache(),
    });
  });

  afterEach(async () => {
    await receiver.close();
    rmSync(tempDir, {recursive: true, force: true});
  });

  it('persists a signed post_call_transcription payload as NDJSON within 1s', async () => {
    const body = JSON.stringify({
      type: 'post_call_transcription',
      event_timestamp: Math.floor(Date.now() / 1000),
      data: {conversation_id: 'tx_test_001', agent_id: 'agent_X', status: 'done', transcript: [{role: 'agent', message: 'Hi'}]},
    });
    const ts = Math.floor(Date.now() / 1000);
    const start = Date.now();
    const res = await fetch(receiver.url, {
      method: 'POST',
      headers: {'content-type': 'application/json', 'elevenlabs-signature': sign(body, SECRET, ts)},
      body,
    });
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(1000);
    const result = await res.json() as {ok: boolean; conversation_id?: string};
    expect(result.ok).toBe(true);
    expect(result.conversation_id).toBe('tx_test_001');

    const today = new Date().toISOString().slice(0, 10);
    const file = join(tempDir, `post-call-${today}.ndjson`);
    expect(existsSync(file)).toBe(true);
    const content = readFileSync(file, 'utf8');
    expect(content).toContain('tx_test_001');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(1);
    const event = JSON.parse(lines[0]) as {received_at: string; payload: {type: string}};
    expect(event.payload.type).toBe('post_call_transcription');
    expect(event.received_at).toBeTruthy();
  });

  it('rejects a tampered signature with 401 and writes nothing', async () => {
    const body = JSON.stringify({type: 'post_call_transcription', data: {conversation_id: 'evil'}});
    const ts = Math.floor(Date.now() / 1000);
    const goodSig = sign(body, SECRET, ts);
    const tamperedSig = goodSig.replace(/v0=.{4}/, 'v0=dead');

    const res = await fetch(receiver.url, {
      method: 'POST',
      headers: {'content-type': 'application/json', 'elevenlabs-signature': tamperedSig},
      body,
    });

    expect(res.status).toBe(401);
    const today = new Date().toISOString().slice(0, 10);
    expect(existsSync(join(tempDir, `post-call-${today}.ndjson`))).toBe(false);
  });

  it('rejects a replayed signature with 401', async () => {
    const body = JSON.stringify({type: 'post_call_transcription', data: {conversation_id: 'replay'}});
    const ts = Math.floor(Date.now() / 1000);
    const sig = sign(body, SECRET, ts);

    const first = await fetch(receiver.url, {
      method: 'POST',
      headers: {'content-type': 'application/json', 'elevenlabs-signature': sig},
      body,
    });
    expect(first.status).toBe(200);

    const second = await fetch(receiver.url, {
      method: 'POST',
      headers: {'content-type': 'application/json', 'elevenlabs-signature': sig},
      body,
    });
    expect(second.status).toBe(401);
    const reasonBody = await second.json() as {ok: boolean; reason: string};
    expect(reasonBody.reason).toBe('signature_replayed');
  });

  it('rejects unsigned requests with 401', async () => {
    const res = await fetch(receiver.url, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({type: 'post_call_transcription'}),
    });
    expect(res.status).toBe(401);
  });

  it('rejects non-POST methods with 405', async () => {
    const res = await fetch(receiver.url, {method: 'GET'});
    expect(res.status).toBe(405);
  });
});
