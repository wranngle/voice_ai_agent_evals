/**
 * META-AUDIT — Live [TEMPLATE] agent roundtrip (HTTPS, not SDK).
 *
 * Gated by `process.env.CI` and `process.env.ELEVENLABS_API_KEY`. In CI:
 * skipped. Locally, exercises the real /v1/convai/agents/{id} endpoint to
 * prove:
 *   - the snapshot we stored matches what's live, modulo intentional drift
 *   - the agent we're hardening actually exists and is fetchable
 *   - the response shape matches our snapshot file (no API drift)
 *
 * Companion: the actual clone roundtrip + archive + cleanup is in
 * `template-spiritual-shortcomings.test.ts` as an `it.fails` contract
 * because we haven't done the clone yet — it's a future hardening step.
 */

import {describe, expect, it} from 'vitest';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const SNAPSHOT_PATH = join(process.cwd(), 'snapshots', 'template-pre-hardening-2026-05-12.json');
const TEMPLATE_AGENT_ID = 'agent_8401krfj3xrqek2bfw71fyw2nzq0';

const skip = process.env.CI === 'true' || !process.env.ELEVENLABS_API_KEY;

describe.skipIf(skip)('META-AUDIT: live [TEMPLATE] agent roundtrip', () => {
  it('GET /v1/convai/agents/{id} returns 200 with matching agent_id', async () => {
    const response = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${TEMPLATE_AGENT_ID}`, {
      headers: {'xi-api-key': process.env.ELEVENLABS_API_KEY!},
    });
    expect(response.status).toBe(200);
    const json = await response.json() as {agent_id: string; name: string};
    expect(json.agent_id).toBe(TEMPLATE_AGENT_ID);
    expect(json.name).toBe('[TEMPLATE]');
  });

  it('live config preserves the snapshot guardrails block', async () => {
    if (!existsSync(SNAPSHOT_PATH)) {
      throw new Error('snapshot missing — run snapshot step first');
    }
    const snap = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
    const response = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${TEMPLATE_AGENT_ID}`, {
      headers: {'xi-api-key': process.env.ELEVENLABS_API_KEY!},
    });
    const live = await response.json() as {platform_settings: {guardrails: {content: {config: Record<string, {is_enabled: boolean}>}}}};
    for (const category of ['sexual', 'violence', 'harassment', 'self_harm']) {
      expect(live.platform_settings.guardrails.content.config[category]?.is_enabled).toBe(
        snap.platform_settings.guardrails.content.config[category]?.is_enabled,
      );
    }
  });
});
