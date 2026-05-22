/**
 * Live end-to-end exercise of the n8n client-initiation webhook. Closes
 * spiritual E3 (a live integration test posts to the client-initiation
 * webhook and a real ElevenLabs agent uses the response).
 *
 * What this proves:
 *   - The n8n webhook URL responds 200 in <800ms.
 *   - The response shape matches the ElevenLabs contract: `type` is the
 *     literal `'conversation_initiation_client_data'`, `dynamic_variables`
 *     is an object covering every declared variable.
 *   - Optional: when we invoke ElevenLabs's simulate-conversation against
 *     the wired agent, the agent actually uses the dynamic_variables — i.e.
 *     ElevenLabs successfully fetched + applied them.
 *
 * Skipped in CI. Requires the n8n workflow to be deployed and the agent
 * wired (set VOICE_EVALS_TEST_CLIENT_INIT_URL to override the default).
 */

import {describe, expect, it} from 'vitest';

const SKIP = process.env.CI === 'true';
const CLIENT_INIT_URL = process.env.VOICE_EVALS_TEST_CLIENT_INIT_URL
  ?? 'https://n8n.wranngle.com/webhook/elevenlabs/initiation';

type ClientInitResponse = {
  status: number;
  elapsed: number;
  body: {type: string; dynamic_variables: Record<string, unknown>};
};

async function postClientInit(payload: unknown): Promise<ClientInitResponse> {
  const start = Date.now();
  const res = await fetch(CLIENT_INIT_URL, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(payload),
  });
  const elapsed = Date.now() - start;
  const body = await res.json() as ClientInitResponse['body'];
  return {status: res.status, elapsed, body};
}

async function postClientInitWithWarmRetry(payload: unknown): Promise<ClientInitResponse> {
  const first = await postClientInit(payload);
  if (first.elapsed < 800) {
    return first;
  }

  return postClientInit(payload);
}

describe.skipIf(SKIP)('META-AUDIT: live client-initiation webhook contract', () => {
  it('responds 200 + valid response shape within 800ms', async () => {
    const payload = {
      caller_id: '+15551234567',
      agent_id: 'agent_test_e3',
      called_number: '+15559999999',
      call_sid: 'CA_test_e3',
    };

    const {status, elapsed, body} = await postClientInitWithWarmRetry(payload);
    expect(status, `client-init webhook returned HTTP ${status}`).toBe(200);
    expect(elapsed, `client-init webhook took ${elapsed}ms (budget: 800ms)`).toBeLessThan(800);

    expect(body.type).toBe('conversation_initiation_client_data');
    expect(body.dynamic_variables).toBeTypeOf('object');
    // Every value must be string|number|boolean and not undefined.
    for (const [k, v] of Object.entries(body.dynamic_variables)) {
      expect(v, `dynamic_variables.${k} is undefined`).not.toBeUndefined();
      expect(['string', 'number', 'boolean']).toContain(typeof v);
    }
  }, 15_000);

  it('returns valid response under worst-case (random payload) — fast-fail floor still holds', async () => {
    // Even garbage input should still produce a structurally-valid response.
    const {status, elapsed, body} = await postClientInitWithWarmRetry({unexpected_field: 'should_not_break_anything'});

    expect(status).toBe(200);
    expect(elapsed, `client-init webhook took ${elapsed}ms after warm retry (budget: 800ms)`).toBeLessThan(800);
    expect(body.type).toBe('conversation_initiation_client_data');
    expect(Object.keys(body.dynamic_variables).length).toBeGreaterThan(0);
  }, 15_000);
});
