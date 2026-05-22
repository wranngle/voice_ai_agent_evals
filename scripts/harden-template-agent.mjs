#!/usr/bin/env node
/**
 * One-shot hardening PATCH for the [TEMPLATE] agent.
 * Reads the pre-hardening snapshot, applies remaining knobs, PATCHes via
 * direct HTTPS (not MCP), verifies, and writes a post-hardening snapshot.
 *
 * Usage:  ELEVENLABS_API_KEY=... node scripts/harden-template-agent.mjs [--dry-run]
 */

import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {createTracer} from './lib/jsonl-trace.mjs';

const ROOT = process.cwd();
const trace = createTracer('script.harden-template-agent', {key: 'agent_8401krfj3xrqek2bfw71fyw2nzq0'});
trace.info('start');
const AGENT_ID = 'agent_8401krfj3xrqek2bfw71fyw2nzq0';
const SNAPSHOT_PATH = path.join(ROOT, 'snapshots', 'template-pre-hardening-2026-05-12.json');
const PROMPT_V1_PATH = path.join(ROOT, 'templates', 'elevenlabs-agents', 'template-system-prompt-v1.md');
const DATA_COLLECTION_PATH = path.join(ROOT, 'templates', 'ai_conversation_data_collection_fields_template.json');
const POST_SNAPSHOT_PATH = path.join(ROOT, 'snapshots', 'template-post-hardening-2026-05-12.json');

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error('ELEVENLABS_API_KEY env var required');
  process.exit(2);
}

const DRY_RUN = process.argv.includes('--dry-run');

// 1. Load source artifacts
const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
const promptMd = readFileSync(PROMPT_V1_PATH, 'utf8');
const dataCollectionTemplate = JSON.parse(readFileSync(DATA_COLLECTION_PATH, 'utf8'));

// 2. Extract the v1 prompt body from the first fenced code block in the md file
const codeBlockMatch = promptMd.match(/```\n([\s\S]+?)\n```/);
if (!codeBlockMatch) {
  throw new Error('could not find prompt code block in template-system-prompt-v1.md');
}

const promptV1Body = codeBlockMatch[1].trim();

// 3. Build the new conversation_config: deep-copy the snapshot, then mutate
const conv = structuredClone(snapshot.conversation_config);

// 3a. Replace system prompt with v1
conv.agent.prompt.prompt = promptV1Body;

// 3b. Extend dynamic_variable_placeholders to cover the new template variables
conv.agent.dynamic_variables.dynamic_variable_placeholders = {
  system_prompt_context: 'none',
  agent_name: 'the assistant',
  company_name: 'this business',
  primary_language: 'English',
  transfer_enabled: false,
  agent_voice_marker: '',
};

// 3c. Turn settings
conv.turn.interruption_ignore_terms = [
  'uh', 'um', 'okay', 'ok', 'mmhm', 'mhm', 'uh-huh', 'right', 'yeah', 'sure', 'got it',
];

// 3d. TTS suggested audio tags — DEFERRED. API expects SuggestedAudioTag
//     object shape (not bare strings). Schema undocumented. Will set via
//     dashboard or after user surfaces the exact shape.

// 3e. Conversation monitoring — ENTERPRISE-ONLY. Cannot enable on current plan.
//     Surface to user; defer until subscription tier confirmed.

// 3f. Strip `tool_ids` if both `tools` and `tool_ids` are present (API mutex rule)
if (Array.isArray(conv.agent.prompt.tools) && conv.agent.prompt.tools.length > 0
  && Array.isArray(conv.agent.prompt.tool_ids)) {
  delete conv.agent.prompt.tool_ids;
}

// 4. Build platform_settings updates (deep copy snapshot then mutate)
const platform = structuredClone(snapshot.platform_settings);

// 4a. Privacy redaction — ENTERPRISE-ONLY on this workspace. Cannot enable.
//     Surface to user; recommend upgrade if PII storage is a concern given
//     record_voice=true and retention_days=-1 (infinite).

// 4b. Summary language → 'en' (must be a specific ISO code per API; 'auto' rejected)
platform.summary_language = 'en';

// 4c. Trust context: 'unknown' | 'low' | 'high'. Template = 'high' (internal);
//     INBOUND/OUTBOUND clones flip to 'low' (external_caller).
platform.trust_context = 'high';

// 4d. Alerting — best-effort schema guess (undocumented field).
//     If PATCH rejects, we strip it and retry. cody@wranngle.com.
platform.alerting = {
  email_recipients: ['cody@wranngle.com'],
  alert_on: ['failure', 'guardrail_triggered'],
};

// 4e. Data collection — flatten the nested category template into a flat map
//     keyed by identifier. Each value retains its {type, description}.
const flatDataCollection = {};
for (const [_category, fields] of Object.entries(dataCollectionTemplate)) {
  for (const [identifier, spec] of Object.entries(fields)) {
    flatDataCollection[identifier] = spec;
  }
}

platform.data_collection = flatDataCollection;

// 5. Compose final PATCH body
const body = {
  conversation_config: conv,
  platform_settings: platform,
};

if (DRY_RUN) {
  console.log(JSON.stringify(body, null, 2));
  console.log(`\nDRY RUN — would PATCH agent ${AGENT_ID}`);
  console.log(`conversation_config bytes: ${JSON.stringify(conv).length}`);
  console.log(`platform_settings bytes: ${JSON.stringify(platform).length}`);
  console.log(`data_collection field count: ${Object.keys(flatDataCollection).length}`);
  process.exit(0);
}

// 6. PATCH it
console.log(`PATCHing agent ${AGENT_ID}...`);
const patchResponse = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}`, {
  method: 'PATCH',
  headers: {
    'xi-api-key': API_KEY,
    'content-type': 'application/json',
  },
  body: JSON.stringify(body),
});

if (!patchResponse.ok) {
  const errorBody = await patchResponse.text();
  console.error(`PATCH failed: HTTP ${patchResponse.status}`);
  console.error(errorBody);

  // If it's the alerting field that fails, retry without it
  if (errorBody.includes('alerting') || errorBody.includes('alert')) {
    console.log('\nRetrying without alerting block...');
    delete body.platform_settings.alerting;
    const retry = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}`, {
      method: 'PATCH',
      headers: {'xi-api-key': API_KEY, 'content-type': 'application/json'},
      body: JSON.stringify(body),
    });
    if (!retry.ok) {
      console.error(`Retry also failed: HTTP ${retry.status}`);
      console.error(await retry.text());
      process.exit(1);
    }

    console.log('Retry succeeded — alerting field is unsupported via API (manual setup required)');
  } else {
    process.exit(1);
  }
}

console.log('PATCH OK');

// 7. Verify via GET
const getResponse = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}`, {
  headers: {'xi-api-key': API_KEY},
});
const verified = await getResponse.json();
writeFileSync(POST_SNAPSHOT_PATH, JSON.stringify(verified, null, 2));

console.log('\nVerification:');
console.log(`  turn.interruption_ignore_terms count: ${verified.conversation_config.turn.interruption_ignore_terms?.length}`);
console.log(`  conversation.monitoring_enabled: ${verified.conversation_config.conversation.monitoring_enabled}`);
console.log(`  tts.suggested_audio_tags count: ${verified.conversation_config.tts.suggested_audio_tags?.length}`);
console.log(`  privacy.redaction.enabled: ${verified.platform_settings.privacy.conversation_history_redaction?.enabled}`);
console.log(`  summary_language: ${verified.platform_settings.summary_language}`);
console.log(`  trust_context: ${verified.platform_settings.trust_context}`);
console.log(`  data_collection field count: ${Object.keys(verified.platform_settings.data_collection ?? {}).length}`);
console.log(`  alerting set: ${verified.platform_settings.alerting !== null}`);
console.log(`  prompt size: ${verified.conversation_config.agent.prompt.prompt?.length} chars`);
console.log(`\nPost-hardening snapshot: ${POST_SNAPSHOT_PATH}`);
