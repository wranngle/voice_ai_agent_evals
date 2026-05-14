/**
 * Live governance enforcement — closes spiritual E4.
 *
 * Asserts that the wrapper rejects a mutation on a `[PROD]`-prefixed agent
 * against the real ElevenLabs API (not a mocked client). We synthesize the
 * fixture by cloning [TEMPLATE], renaming to `[PROD] _voice-evals-gov-test-…`,
 * attempting the mutation (must reject), then archiving the temp agent.
 *
 * skipIf(CI) — costs an API roundtrip + leaves a transient `[ARCHIVED]`
 * agent behind. Local runs only.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {createVoiceEvalsClient} from '../../src/wrapper/client';
import {GovernanceError} from '../../src/wrapper/governance';

const SKIP = process.env.CI === 'true' || !process.env.ELEVENLABS_API_KEY;
const TEMPLATE_AGENT_ID = process.env.VOICE_EVALS_TEST_TEMPLATE_AGENT_ID ?? 'agent_8401krfj3xrqek2bfw71fyw2nzq0';

describe.skipIf(SKIP)('META-AUDIT: governance enforcement against live API', () => {
  let client: ReturnType<typeof createVoiceEvalsClient>;
  let tempAgentId: string | undefined;
  let cleanupName: string | undefined;

  beforeAll(async () => {
    client = createVoiceEvalsClient({apiKey: process.env.ELEVENLABS_API_KEY!});

    // Clone the template into a fresh [DEV] agent.
    const cloned = await client.agents.clone(TEMPLATE_AGENT_ID, {
      namePrefix: `_voice-evals-gov-test-${Date.now()}`,
    });
    tempAgentId = cloned.id;

    // Manually rename it to [PROD] via the raw SDK so we bypass our own
    // governance gate — we need a real [PROD] agent existing in the cloud
    // to test that subsequent calls through the wrapper are rejected.
    const newName = `[PROD] _voice-evals-gov-test-${Date.now()}`;
    await client.raw.conversationalAi.agents.update(
      tempAgentId!,
      {name: newName} as unknown as Parameters<typeof client.raw.conversationalAi.agents.update>[1],
    );
    cleanupName = newName;
  }, 60_000);

  afterAll(async () => {
    if (!tempAgentId) return;
    // Archive the temp agent: rename to [ARCHIVED] via raw SDK (skipping
    // governance, since [PROD] would otherwise reject it).
    try {
      const baseName = (cleanupName ?? '').replace(/^\[PROD]\s+/, '');
      await client.raw.conversationalAi.agents.update(
        tempAgentId,
        {name: `[ARCHIVED] ${baseName}`} as unknown as Parameters<typeof client.raw.conversationalAi.agents.update>[1],
      );
    } catch {
      // Best-effort cleanup; surface as a noisy archive script run later if needed.
    }
  }, 30_000);

  it('rejects update on a real [PROD] agent without explicit allowedPhases', async () => {
    expect(tempAgentId).toBeTruthy();
    await expect(async () => {
      await client.agents.update(tempAgentId!, {name: 'should not be allowed'} as never);
    }).rejects.toBeInstanceOf(GovernanceError);
  });

  it('permits update on the same agent when allowedPhases includes PROD with a reason', async () => {
    expect(tempAgentId).toBeTruthy();
    // Pass the explicit allowedPhases + reason that opts in to mutating PROD.
    // The mutation itself is a no-op rename to the same name to avoid
    // disturbing other state.
    const fetched = await client.raw.conversationalAi.agents.get(tempAgentId!);
    const currentName = (fetched as unknown as {name: string}).name;
    await expect(
      client.agents.update(
        tempAgentId!,
        {name: currentName} as never,
        {allowedPhases: ['PROD'], reason: 'live governance test'},
      ),
    ).resolves.toBeTruthy();
  });
});
