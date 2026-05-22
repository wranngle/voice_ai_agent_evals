#!/usr/bin/env bun
/**
 * One-off remediation: PATCH the system prompt on both [DEV] template
 * agents to forbid v3 TTS bracket-directive emissions like `[calm]`.
 *
 * Surfaced by `voice-evals ceo-demo` 2026-05-14 — `[calm]` appeared in
 * 4/15 trial transcripts. The model (qwen36-35b-a3b) hallucinates v3
 * conversational TTS markup tags because the system prompt didn't
 * forbid them. On a real call those would be either spoken or
 * mis-routed by the v3 TTS pipeline.
 */

export {};

const API_BASE = 'https://api.elevenlabs.io/v1';
const AGENTS = [
  {id: 'agent_8401krfj3xrqek2bfw71fyw2nzq0', label: '[TEMPLATE] (source)'},
  {id: 'agent_7601krfykfpwfjxrjqcshg64pcby', label: '[DEV] INBOUND TEMPLATE'},
  {id: 'agent_3701krfykgvvep8r9vwwjk033p5k', label: '[DEV] OUTBOUND TEMPLATE'},
];

const NEW_TONE_LINE = 'Never emit bracketed style directives like `[calm]`, `[laughs]`, `[sighs]`, or any `[word]` tag — those are TTS markup, not your words. Speak in plain text only.';

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error('ELEVENLABS_API_KEY not set');
  process.exit(2);
}

type Agent = {
  conversation_config: {
    agent: {
      prompt: {prompt: string; tools?: unknown[]; tool_ids?: unknown[]};
    };
  };
  name: string;
};

for (const a of AGENTS) {
  const r = await fetch(`${API_BASE}/convai/agents/${a.id}`, {
    headers: {'xi-api-key': apiKey},
  });
  if (!r.ok) {
    console.error(`GET ${a.id} HTTP ${r.status}`);
    process.exit(1);
  }

  const agent = await r.json() as Agent;
  const oldPrompt = agent.conversation_config.agent.prompt.prompt;

  if (oldPrompt.includes(NEW_TONE_LINE)) {
    console.log(`${a.label}: already patched, skipping`);
    continue;
  }

  // Append the new rule at the END of the # Tone section.
  // The # Tone block lives between "# Tone" and the next "# " heading.
  const toneStart = oldPrompt.indexOf('# Tone');
  if (toneStart === -1) {
    console.error(`${a.label}: cannot find "# Tone" section`);
    process.exit(1);
  }

  // Find the next "# " heading after # Tone.
  const afterTone = oldPrompt.slice(toneStart + 6);
  const nextHeadingRel = afterTone.search(/\n# [A-Z]/);
  const nextHeading = nextHeadingRel === -1 ? oldPrompt.length : toneStart + 6 + nextHeadingRel;
  const before = oldPrompt.slice(0, nextHeading).trimEnd();
  const after = oldPrompt.slice(nextHeading);
  const newPrompt = `${before}\n\n${NEW_TONE_LINE}\n${after}`;

  // PATCH with full conversation_config; strip mutually-exclusive tool_ids.
  const cc = structuredClone(agent.conversation_config);
  cc.agent.prompt.prompt = newPrompt;
  if (cc.agent.prompt.tools && cc.agent.prompt.tool_ids) {
    delete cc.agent.prompt.tool_ids;
  }

  const p = await fetch(`${API_BASE}/convai/agents/${a.id}`, {
    method: 'PATCH',
    headers: {'xi-api-key': apiKey, 'content-type': 'application/json'},
    body: JSON.stringify({conversation_config: cc}),
  });
  if (!p.ok) {
    console.error(`PATCH ${a.id} HTTP ${p.status}: ${await p.text()}`);
    process.exit(1);
  }

  console.log(`${a.label}: PATCH OK (+${NEW_TONE_LINE.length} chars in # Tone)`);
}

console.log('\nDone.');
