import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {describe, it, expect} from 'vitest';
import {
  loadSchemaRegistry,
  parseJsonl,
  replayJsonl,
  validateToolCall,
} from '../../src/replay/tool-call';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const schemaDir = join(repoRoot, 'schemas', 'tool-calls');
const validFixture = join(repoRoot, 'fixtures', 'tool-calls.jsonl');
const invalidFixture = join(repoRoot, 'fixtures', 'tool-calls.invalid.jsonl');

describe('schema-validated tool-call replay', () => {
  it('loads a JSON Schema for every *.schema.json in the registry', () => {
    const registry = loadSchemaRegistry(schemaDir);
    const toolNames = Object.keys(registry).sort();
    expect(toolNames).toEqual(['book_appointment', 'send_sms', 'transfer_to_agent']);
    for (const name of toolNames) {
      expect(registry[name].$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(registry[name].type).toBe('object');
    }
  });

  it('validates every entry in fixtures/tool-calls.jsonl against its declared schema', () => {
    const registry = loadSchemaRegistry(schemaDir);
    const summary = replayJsonl(validFixture, registry);
    expect(summary.total).toBeGreaterThanOrEqual(3);
    expect(summary.failed).toBe(0);
    expect(summary.passed).toBe(summary.total);
    for (const result of summary.results) {
      expect(result.valid, `record ${result.record.conversation_id}#${result.record.turn_index} errors: ${JSON.stringify(result.errors)}`).toBe(true);
    }
  });

  it('rejects every entry in fixtures/tool-calls.invalid.jsonl', () => {
    const registry = loadSchemaRegistry(schemaDir);
    const summary = replayJsonl(invalidFixture, registry);
    expect(summary.total).toBeGreaterThanOrEqual(3);
    expect(summary.passed).toBe(0);
    expect(summary.failed).toBe(summary.total);
    for (const result of summary.results) {
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('flags unknown tool_name as a validation failure (not a thrown error)', () => {
    const registry = loadSchemaRegistry(schemaDir);
    const result = validateToolCall(
      {
        conversation_id: 'c1', turn_index: 0, tool_name: 'totally_made_up', arguments: {},
      },
      registry,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/no schema registered/);
  });

  it('parses JSONL with blank trailing lines without crashing', () => {
    const text = readFileSync(validFixture, 'utf8') + '\n\n';
    const records = parseJsonl(text);
    expect(records.length).toBeGreaterThanOrEqual(3);
    expect(records.every(r => typeof r.tool_name === 'string')).toBe(true);
  });

  it('catches the specific invalid patterns the fixture is meant to exercise', () => {
    const registry = loadSchemaRegistry(schemaDir);
    const summary = replayJsonl(invalidFixture, registry);
    const flat = summary.results.flatMap(r => r.errors.map(e => `${r.record.conversation_id}: ${e.message}`));
    expect(flat.some(s => s.includes('pattern'))).toBe(true);
    expect(flat.some(s => s.includes('enum'))).toBe(true);
    expect(flat.some(s => s.includes('minLength'))).toBe(true);
    expect(flat.some(s => s.includes('no schema registered'))).toBe(true);
  });
});
