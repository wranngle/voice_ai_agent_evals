#!/usr/bin/env bun
export {};

/**
 * One-off remediation: strip the `[kindred] ` leak from first_message on both
 * [DEV] template clones (inbound + outbound) and every language_preset
 * override beneath them.
 *
 * Surfaced by `voice-evals ceo-demo` 2026-05-14 — the simulate-conversation
 * transcripts opened with `agent: [kindred] Hello!`, where `kindred` is a
 * literal token (not the assigned voice "Charlotte"). On the v3 conversational
 * TTS model bracketed directives are spoken or treated as unknown markup —
 * either way a CEO would hear the defect on the first call.
 *
 * This script does NOT touch the bare [TEMPLATE] source agent — that agent
 * has no [PHASE] prefix and per AGENTS.md is out of scope for autonomous
 * mutation until renamed.
 */

const API_BASE = 'https://api.elevenlabs.io/v1';
// The leak is `[kindred]<NBSP>` (U+00A0), not `[kindred]<SP>` — verified via
// codePointAt 0x00A0 at position 9 of the live first_message.
const KINDRED_RE = /^\[kindred][\u00A0\s]+/;
const AGENTS = [
  {id: 'agent_8401krfj3xrqek2bfw71fyw2nzq0', label: '[TEMPLATE] (source)'},
  {id: 'agent_7601krfykfpwfjxrjqcshg64pcby', label: '[DEV] INBOUND TEMPLATE'},
  {id: 'agent_3701krfykgvvep8r9vwwjk033p5k', label: '[DEV] OUTBOUND TEMPLATE'},
];

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error('ELEVENLABS_API_KEY not set');
  process.exit(2);
}

type ConversationConfig = {
  agent?: {
    first_message?: string;
    prompt?: {tools?: unknown[]; tool_ids?: unknown[]};
  };
  language_presets?: Record<string, {
    overrides?: {agent?: {first_message?: string}};
    first_message_translation?: {text?: string; source_hash?: string};
  }>;
};

function stripPrefix(s: string | undefined): string | undefined {
  if (typeof s !== 'string') {
    return s;
  }

  return KINDRED_RE.test(s) ? s.replace(KINDRED_RE, '') : s;
}

async function get(agentId: string): Promise<{conversation_config: ConversationConfig; name: string}> {
  const r = await fetch(`${API_BASE}/convai/agents/${agentId}`, {
    headers: {'xi-api-key': apiKey!},
  });
  if (!r.ok) {
    throw new Error(`GET ${agentId} HTTP ${r.status}: ${await r.text()}`);
  }

  return await r.json() as {conversation_config: ConversationConfig; name: string};
}

async function patch(agentId: string, conversationConfig: ConversationConfig): Promise<void> {
  // PATCH semantics per project AGENTS.md: send full conversation_config.
  // tools AND tool_ids are mutually exclusive — if both present, drop tool_ids.
  const cleaned: ConversationConfig = structuredClone(conversationConfig);
  if (cleaned.agent?.prompt?.tools && cleaned.agent.prompt.tool_ids) {
    delete cleaned.agent.prompt.tool_ids;
  }

  const r = await fetch(`${API_BASE}/convai/agents/${agentId}`, {
    method: 'PATCH',
    headers: {'xi-api-key': apiKey!, 'content-type': 'application/json'},
    body: JSON.stringify({conversation_config: cleaned}),
  });
  if (!r.ok) {
    throw new Error(`PATCH ${agentId} HTTP ${r.status}: ${await r.text()}`);
  }
}

async function strip(agentId: string, label: string): Promise<{changed: number}> {
  const {conversation_config: cc, name} = await get(agentId);
  console.log(`${label} (${name})`);

  let changed = 0;

  // 1. Top-level first_message.
  if (cc.agent?.first_message?.match(KINDRED_RE)) {
    const before = cc.agent.first_message;
    cc.agent.first_message = stripPrefix(cc.agent.first_message)!;
    console.log(`  agent.first_message: "${before.slice(0, 60)}..." → "${cc.agent.first_message.slice(0, 60)}..."`);
    changed++;
  }

  // The canonical English first_message after the strip — used to rebuild source_hash
  // for every language preset (ElevenLabs requires source_hash to be present and
  // valid; it is the JSON of {firstMessage, language:'en'}).
  const newEnglish = cc.agent?.first_message ?? '';
  const newSourceHash = JSON.stringify({firstMessage: newEnglish, language: 'en'});

  // 2. language_presets[*].overrides.agent.first_message + first_message_translation.
  if (cc.language_presets) {
    for (const [lang, preset] of Object.entries(cc.language_presets)) {
      const fm = preset.overrides?.agent?.first_message;
      if (typeof fm === 'string' && KINDRED_RE.test(fm)) {
        preset.overrides!.agent!.first_message = stripPrefix(fm)!;
        console.log(`  language_presets.${lang}.overrides.agent.first_message: stripped`);
        changed++;
      }

      const tx = preset.first_message_translation;
      if (tx?.text?.match(KINDRED_RE)) {
        tx.text = stripPrefix(tx.text)!;
        // Rewrite source_hash to point at the new English source — required by API.
        tx.source_hash = newSourceHash;
        console.log(`  language_presets.${lang}.first_message_translation.text: stripped + source_hash rebuilt`);
        changed++;
      }
    }
  }

  if (changed === 0) {
    console.log('  (no `[kindred] ` prefix found — already clean)');
    return {changed: 0};
  }

  await patch(agentId, cc);
  console.log(`  PATCH OK — ${changed} fields updated`);
  return {changed};
}

let total = 0;
for (const a of AGENTS) {
  const {changed} = await strip(a.id, a.label);
  total += changed;
}

console.log(`\nDone. ${total} fields stripped across ${AGENTS.length} agents.`);
