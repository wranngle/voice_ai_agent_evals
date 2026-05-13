#!/usr/bin/env node
/**
 * Clone hardened [TEMPLATE] into INBOUND + OUTBOUND variants.
 * Inbound: initial_wait_time=0, trust_context=low
 * Outbound: initial_wait_time=12, trust_context=low
 *
 * Uses direct HTTPS (mirrors src/wrapper/agents.ts:clone semantics).
 */

import {writeFileSync, existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const ROOT = process.cwd();
const SOURCE_AGENT_ID = 'agent_8401krfj3xrqek2bfw71fyw2nzq0';
const REGISTRY_PATH = join(ROOT, 'snapshots', 'inbound-outbound-clones-2026-05-12.json');

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error('ELEVENLABS_API_KEY required');
  process.exit(2);
}

async function duplicateAgent(sourceId, namePrefix, initialWaitTime) {
  console.log(`\nDuplicating ${sourceId} → [DEV] ${namePrefix} [TEMPLATE]`);

  // 1. POST /v1/convai/agents/{id}/duplicate
  const dupResponse = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${sourceId}/duplicate`, {
    method: 'POST',
    headers: {'xi-api-key': API_KEY, 'content-type': 'application/json'},
    body: JSON.stringify({}),
  });
  if (!dupResponse.ok) {
    console.error(`Duplicate failed: HTTP ${dupResponse.status}`);
    console.error(await dupResponse.text());
    return null;
  }
  const dup = await dupResponse.json();
  const newId = dup.agent_id ?? dup.id;
  console.log(`  Created new agent: ${newId}`);

  // 2. GET the new agent to get its full config
  const getResponse = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${newId}`, {
    headers: {'xi-api-key': API_KEY},
  });
  const newAgent = await getResponse.json();

  // 3. PATCH name + initial_wait_time + trust_context
  const conv = JSON.parse(JSON.stringify(newAgent.conversation_config));
  conv.turn.initial_wait_time = initialWaitTime;

  // Strip tool_ids if tools array present (API mutex rule)
  if (Array.isArray(conv.agent.prompt.tools) && conv.agent.prompt.tools.length > 0
      && Array.isArray(conv.agent.prompt.tool_ids)) {
    delete conv.agent.prompt.tool_ids;
  }

  const platform = JSON.parse(JSON.stringify(newAgent.platform_settings));
  platform.trust_context = 'low'; // external_caller

  const newName = `[DEV] ${namePrefix} [TEMPLATE]`;
  const patchResponse = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${newId}`, {
    method: 'PATCH',
    headers: {'xi-api-key': API_KEY, 'content-type': 'application/json'},
    body: JSON.stringify({name: newName, conversation_config: conv, platform_settings: platform}),
  });
  if (!patchResponse.ok) {
    console.error(`PATCH failed for ${newId}: HTTP ${patchResponse.status}`);
    console.error(await patchResponse.text());
    return null;
  }

  // 4. Verify
  const verifyResponse = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${newId}`, {
    headers: {'xi-api-key': API_KEY},
  });
  const verified = await verifyResponse.json();
  console.log(`  Name: ${verified.name}`);
  console.log(`  initial_wait_time: ${verified.conversation_config.turn.initial_wait_time}`);
  console.log(`  trust_context: ${verified.platform_settings.trust_context}`);

  return {
    agent_id: newId,
    name: verified.name,
    initial_wait_time: verified.conversation_config.turn.initial_wait_time,
    trust_context: verified.platform_settings.trust_context,
    cloned_from: sourceId,
    cloned_at: new Date().toISOString(),
  };
}

// initial_wait_time constraint: must be -1 OR between 1.0 and 300.0 seconds.
// 0 is rejected. Use -1 for INBOUND (= "speak immediately") and 12 for OUTBOUND.
const inbound = await duplicateAgent(SOURCE_AGENT_ID, 'INBOUND TEMPLATE', -1);
const outbound = await duplicateAgent(SOURCE_AGENT_ID, 'OUTBOUND TEMPLATE', 12.0);

const registry = {
  source: SOURCE_AGENT_ID,
  clones: {
    inbound,
    outbound,
  },
};

writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
console.log(`\nClone registry written to ${REGISTRY_PATH}`);
