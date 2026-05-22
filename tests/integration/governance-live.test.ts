/**
 * Live governance enforcement — closes spiritual E4.
 *
 * Asserts that the wrapper rejects a mutation on an explicitly configured
 * `[PROD]`-prefixed agent against the real ElevenLabs API (not a mocked
 * client). This test intentionally does not synthesize a PROD fixture by
 * renaming a cloud agent; promotions require explicit operator approval.
 *
 * skipIf(CI || !ELEVENLABS_API_KEY || !VOICE_EVALS_TEST_PROD_AGENT_ID).
 * The no-op allowedPhases mutation is further gated behind
 * VOICE_EVALS_LIVE_GOVERNANCE_MUTATE_PROD=1.
 */

import {
  beforeAll, describe, expect, it,
} from 'vitest';
import {createVoiceEvalsClient} from '../../src/wrapper/client';
import {GovernanceError} from '../../src/wrapper/governance';

const PROD_AGENT_ID = process.env.VOICE_EVALS_TEST_PROD_AGENT_ID;
const MUTATE_PROD = process.env.VOICE_EVALS_LIVE_GOVERNANCE_MUTATE_PROD === '1';
const SKIP = process.env.CI === 'true' || !process.env.ELEVENLABS_API_KEY || !PROD_AGENT_ID;

describe.skipIf(SKIP)('META-AUDIT: governance enforcement against live API', () => {
  let client: ReturnType<typeof createVoiceEvalsClient>;

  beforeAll(async () => {
    client = createVoiceEvalsClient({apiKey: process.env.ELEVENLABS_API_KEY!});
  });

  it('rejects update on a real [PROD] agent without explicit allowedPhases', async () => {
    const fetched = await client.raw.conversationalAi.agents.get(PROD_AGENT_ID!);
    expect(fetched.name.startsWith('[PROD] ')).toBe(true);

    await expect(async () => {
      await client.agents.update(PROD_AGENT_ID!, {name: 'should not be allowed'});
    }).rejects.toBeInstanceOf(GovernanceError);
  });

  it.skipIf(!MUTATE_PROD)('permits update on the same agent when allowedPhases includes PROD with a reason', async () => {
    // Pass the explicit allowedPhases + reason that opts in to mutating PROD.
    // The mutation itself is a no-op rename to the same name to avoid
    // disturbing other state.
    const fetched = await client.raw.conversationalAi.agents.get(PROD_AGENT_ID!);
    const currentName = fetched.name;
    await expect(client.agents.update(
      PROD_AGENT_ID!,
      {name: currentName},
      {allowedPhases: ['PROD'], reason: 'live governance test'},
    )).resolves.toBeTruthy();
  });
});
