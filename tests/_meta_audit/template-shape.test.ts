/**
 * META-AUDIT — [TEMPLATE] hardening: config + prompt + data_collection shape checks.
 *
 * Passing assertions about the pre-hardening snapshot of the [TEMPLATE] agent
 * (`snapshots/template-pre-hardening-2026-05-12.json`), the v1 system prompt
 * (`templates/elevenlabs-agents/template-system-prompt-v1.md`), and the
 * data_collection template (`templates/ai_conversation_data_collection_fields_template.json`).
 *
 * Companion to the `it.fails` aspirational contracts in
 * `template-spiritual-shortcomings.test.ts`. Read the README in this directory
 * for what these tests prove vs. what they don't.
 */

import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

const ROOT = process.cwd();
const SNAPSHOT_PATH = join(ROOT, 'snapshots', 'template-pre-hardening-2026-05-12.json');
const PROMPT_V1_PATH = join(ROOT, 'templates', 'elevenlabs-agents', 'template-system-prompt-v1.md');
const DATA_COLLECTION_PATH = join(ROOT, 'templates', 'ai_conversation_data_collection_fields_template.json');
const MODEL_RANKINGS_PATH = join(ROOT, 'config', 'model-rankings.json');

describe('META-AUDIT: [TEMPLATE] agent snapshot has production-grade shape', () => {
  it('snapshot file exists and is well-formed JSON', () => {
    expect(existsSync(SNAPSHOT_PATH)).toBe(true);
    const snap = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
    expect(snap.agent_id).toBe('agent_8401krfj3xrqek2bfw71fyw2nzq0');
    expect(snap.name).toBe('[TEMPLATE]');
  });

  it('agent.prompt.llm is not a banned model', () => {
    const snap = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
    const rankings = JSON.parse(readFileSync(MODEL_RANKINGS_PATH, 'utf8'));
    const llm = snap.conversation_config.agent.prompt.llm;
    expect(llm).toBeTypeOf('string');
    const banned: string[] = rankings.banned ?? [];
    expect(banned).not.toContain(llm);
  });

  it('end_call built-in tool is enabled', () => {
    const snap = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
    expect(snap.conversation_config.agent.prompt.built_in_tools.end_call).not.toBeNull();
    expect(snap.conversation_config.agent.prompt.built_in_tools.end_call.name).toBe('end_call');
  });

  it('TTS model is the production v3 conversational target', () => {
    const snap = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
    expect(snap.conversation_config.tts.model_id).toBe('eleven_v3_conversational');
  });

  it('guardrails are enabled for sexual, violence, harassment, self_harm', () => {
    const snap = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
    const config = snap.platform_settings.guardrails.content.config;
    for (const category of ['sexual', 'violence', 'harassment', 'self_harm']) {
      expect(config[category]?.is_enabled, `${category} guardrail must be enabled`).toBe(true);
    }
  });

  it('focus + prompt_injection guardrails enabled', () => {
    const snap = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
    expect(snap.platform_settings.guardrails.focus.is_enabled).toBe(true);
    expect(snap.platform_settings.guardrails.prompt_injection.is_enabled).toBe(true);
  });

  it('voice recording on with retention_days -1 (infinite) → mandates redaction be the next step', () => {
    const snap = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
    expect(snap.platform_settings.privacy.record_voice).toBe(true);
    expect(snap.platform_settings.privacy.retention_days).toBe(-1);
    // We deliberately do NOT assert conversation_history_redaction.enabled === true
    // here — that's a hardening step that lands in A3/A4, after this snapshot
    // was taken. The follow-on spiritual test will check the post-hardening state.
  });
});

describe('META-AUDIT: v1 system prompt has the five canonical sections in order', () => {
  it('prompt file exists', () => {
    expect(existsSync(PROMPT_V1_PATH)).toBe(true);
  });

  it('contains the five canonical sections in ElevenLabs-recommended order', () => {
    const text = readFileSync(PROMPT_V1_PATH, 'utf8');
    const idxPersonality = text.indexOf('# Personality');
    const idxGoal = text.indexOf('# Goal');
    const idxGuardrails = text.indexOf('# Guardrails');
    const idxTone = text.indexOf('# Tone');
    const idxTools = text.indexOf('# Tools');

    for (const [name, idx] of [['Personality', idxPersonality], ['Goal', idxGoal], ['Guardrails', idxGuardrails], ['Tone', idxTone], ['Tools', idxTools]] as const) {
      expect(idx, `# ${name} section missing`).toBeGreaterThan(-1);
    }
    expect(idxPersonality).toBeLessThan(idxGoal);
    expect(idxGoal).toBeLessThan(idxGuardrails);
    expect(idxGuardrails).toBeLessThan(idxTone);
    expect(idxTone).toBeLessThan(idxTools);
  });

  it('uses parameterized dynamic variables, not hardcoded values', () => {
    const text = readFileSync(PROMPT_V1_PATH, 'utf8');
    expect(text).toContain('{{system_prompt_context}}');
    expect(text).toContain('{{agent_name}}');
    expect(text).toContain('{{company_name}}');
  });

  it('total size under ElevenLabs 2MB prompt cap', () => {
    const text = readFileSync(PROMPT_V1_PATH, 'utf8');
    const bytes = Buffer.byteLength(text, 'utf8');
    expect(bytes).toBeLessThan(2 * 1024 * 1024);
  });
});

describe('META-AUDIT: data_collection template matches ElevenLabs shape', () => {
  it('file is valid JSON', () => {
    expect(existsSync(DATA_COLLECTION_PATH)).toBe(true);
    const json = JSON.parse(readFileSync(DATA_COLLECTION_PATH, 'utf8'));
    expect(json).toBeTypeOf('object');
  });

  it('every leaf field has {type, description}', () => {
    const json = JSON.parse(readFileSync(DATA_COLLECTION_PATH, 'utf8')) as Record<string, Record<string, {type?: string; description?: string}>>;
    for (const [category, fields] of Object.entries(json)) {
      for (const [identifier, spec] of Object.entries(fields)) {
        expect(spec.type, `${category}.${identifier}.type`).toBeTypeOf('string');
        expect(spec.description, `${category}.${identifier}.description`).toBeTypeOf('string');
        expect(['string', 'boolean', 'integer', 'number']).toContain(spec.type);
      }
    }
  });

  it('total identifier count ≤25 (non-enterprise ElevenLabs cap)', () => {
    const json = JSON.parse(readFileSync(DATA_COLLECTION_PATH, 'utf8')) as Record<string, Record<string, unknown>>;
    const totalFields = Object.values(json).reduce((acc, fields) => acc + Object.keys(fields).length, 0);
    expect(totalFields).toBeLessThanOrEqual(25);
  });

  it('no identifier collisions across categories', () => {
    const json = JSON.parse(readFileSync(DATA_COLLECTION_PATH, 'utf8')) as Record<string, Record<string, unknown>>;
    const seen = new Set<string>();
    const collisions: string[] = [];
    for (const fields of Object.values(json)) {
      for (const id of Object.keys(fields)) {
        if (seen.has(id)) collisions.push(id);
        seen.add(id);
      }
    }
    expect(collisions).toEqual([]);
  });
});
