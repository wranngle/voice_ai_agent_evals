import {describe, it, expect} from 'vitest';
import {inferStrictness} from '../../lib/extraction/strictness.js';
import {defaultCategories} from '../../lib/extraction/categories.js';
import {buildPrompt} from '../../lib/extraction/prompt-builder.js';
import {repairValue, validateValue} from '../../lib/extraction/validation.js';
import type {ExtractionField, ExtractionCategory, ExtractionConfig, ExtractionOutput, FieldEnvelope} from '../../lib/extraction/types.js';

// ─── Task 6.3: Strictness inference ───

describe('inferStrictness', () => {
	it('returns explicit strictness when set', () => {
		expect(inferStrictness({field_id: 'x', type: 'string', strictness: 'low'})).toBe('low');
	});

	it('infers high for boolean, phone, email', () => {
		expect(inferStrictness({field_id: 'a', type: 'boolean'})).toBe('high');
		expect(inferStrictness({field_id: 'b', type: 'phone'})).toBe('high');
		expect(inferStrictness({field_id: 'c', type: 'email'})).toBe('high');
	});

	it('infers high for enum with ≤5 values', () => {
		expect(inferStrictness({field_id: 'x', type: 'enum', values: ['a', 'b', 'c']})).toBe('high');
	});

	it('infers high when validation.pattern exists', () => {
		expect(inferStrictness({field_id: 'x', type: 'string', validation: {pattern: '^\\d+$'}})).toBe('high');
	});

	it('infers medium for enum with >5 values', () => {
		expect(inferStrictness({field_id: 'x', type: 'enum', values: ['a', 'b', 'c', 'd', 'e', 'f']})).toBe('medium');
	});

	it('infers medium for required string', () => {
		expect(inferStrictness({field_id: 'x', type: 'string', required: true})).toBe('medium');
	});

	it('infers low for optional string', () => {
		expect(inferStrictness({field_id: 'x', type: 'string', required: false})).toBe('low');
	});

	it('infers low for summary/notes/description fields', () => {
		expect(inferStrictness({field_id: 'call_summary', type: 'string'})).toBe('low');
		expect(inferStrictness({field_id: 'agent_notes', type: 'string'})).toBe('low');
		expect(inferStrictness({field_id: 'issue_description', type: 'string'})).toBe('low');
	});
});

// ─── Task 6.1: Config schema validation ───

describe('extraction config validation', () => {
	it('default categories have valid structure', () => {
		expect(defaultCategories.length).toBe(6);
		for (const cat of defaultCategories) {
			expect(cat.category_id).toBeTruthy();
			expect(cat.description).toBeTruthy();
			expect(cat.context_rules).toBeDefined();
			expect(cat.fields.length).toBeGreaterThan(0);
			for (const f of cat.fields) {
				expect(f.field_id).toBeTruthy();
				expect(f.type).toBeTruthy();
				if (f.type === 'enum') expect(f.values?.length).toBeGreaterThan(0);
			}
		}
	});

	it('all default categories have unique IDs', () => {
		const ids = defaultCategories.map(c => c.category_id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('all fields within a category have unique IDs', () => {
		for (const cat of defaultCategories) {
			const ids = cat.fields.map(f => f.field_id);
			expect(new Set(ids).size).toBe(ids.length);
		}
	});
});

// ─── Task 6.2: Output envelope validation ───

describe('output envelope schema', () => {
	const validEnvelope: FieldEnvelope = {
		category: 'sales',
		field_id: 'deal_stage',
		value: 'qualification',
		rationale: 'Caller discussed pricing',
		original_prompt: 'What stage?',
		confidence: 0.87,
		strictness_applied: 'high',
		validation_passed: true,
	};

	it('valid envelope has all required fields', () => {
		expect(validEnvelope.category).toBeTruthy();
		expect(validEnvelope.field_id).toBeTruthy();
		expect(typeof validEnvelope.confidence).toBe('number');
		expect(validEnvelope.confidence).toBeGreaterThanOrEqual(0);
		expect(validEnvelope.confidence).toBeLessThanOrEqual(1);
		expect(['high', 'medium', 'low']).toContain(validEnvelope.strictness_applied);
		expect(typeof validEnvelope.validation_passed).toBe('boolean');
	});

	const validOutput: ExtractionOutput = {
		extraction_id: 'ext_123',
		timestamp: new Date().toISOString(),
		model: 'gemini-3-pro',
		categories_processed: 1,
		fields: [validEnvelope],
		errors: [],
	};

	it('valid output has all required top-level fields', () => {
		expect(validOutput.extraction_id).toBeTruthy();
		expect(validOutput.timestamp).toBeTruthy();
		expect(validOutput.model).toBeTruthy();
		expect(validOutput.categories_processed).toBeGreaterThanOrEqual(0);
		expect(Array.isArray(validOutput.fields)).toBe(true);
		expect(Array.isArray(validOutput.errors)).toBe(true);
	});
});

// ─── Validation & repair ───

describe('repairValue', () => {
	it('trims string whitespace', () => {
		expect(repairValue({field_id: 'x', type: 'string'}, '  hello  ')).toBe('hello');
	});

	it('coerces string booleans', () => {
		expect(repairValue({field_id: 'x', type: 'boolean'}, 'true')).toBe(true);
		expect(repairValue({field_id: 'x', type: 'boolean'}, 'False')).toBe(false);
	});

	it('normalizes enum case', () => {
		const field: ExtractionField = {field_id: 'x', type: 'enum', values: ['discovery', 'qualification']};
		expect(repairValue(field, 'Discovery')).toBe('discovery');
		expect(repairValue(field, 'QUALIFICATION')).toBe('qualification');
	});

	it('returns null for null/undefined', () => {
		expect(repairValue({field_id: 'x', type: 'string'}, null)).toBeNull();
		expect(repairValue({field_id: 'x', type: 'string'}, undefined)).toBeNull();
	});
});

describe('validateValue', () => {
	it('validates booleans', () => {
		expect(validateValue({field_id: 'x', type: 'boolean'}, true)).toBe(true);
		expect(validateValue({field_id: 'x', type: 'boolean'}, 'yes')).toBe(false);
	});

	it('validates phone (E.164)', () => {
		expect(validateValue({field_id: 'x', type: 'phone'}, '+15551234567')).toBe(true);
		expect(validateValue({field_id: 'x', type: 'phone'}, '555-1234')).toBe(false);
	});

	it('validates email', () => {
		expect(validateValue({field_id: 'x', type: 'email'}, 'a@b.com')).toBe(true);
		expect(validateValue({field_id: 'x', type: 'email'}, 'not-email')).toBe(false);
	});

	it('validates enum membership', () => {
		const field: ExtractionField = {field_id: 'x', type: 'enum', values: ['a', 'b']};
		expect(validateValue(field, 'a')).toBe(true);
		expect(validateValue(field, 'c')).toBe(false);
	});

	it('null passes for optional, fails for required', () => {
		expect(validateValue({field_id: 'x', type: 'string', required: false}, null)).toBe(true);
		expect(validateValue({field_id: 'x', type: 'string', required: true}, null)).toBe(false);
	});
});

// ─── Prompt builder ───

describe('buildPrompt', () => {
	const category: ExtractionCategory = {
		category_id: 'test',
		description: 'Test category',
		context_rules: {default_strictness: 'medium', require_rationale: true},
		fields: [
			{field_id: 'name', type: 'string', prompt: 'Extract the name.', required: true},
			{field_id: 'happy', type: 'boolean', prompt: 'Is the caller happy?'},
		],
	};

	it('includes all 5 components', () => {
		const prompt = buildPrompt('agent: Hi\nuser: Hello', 'You are a bot.', category);
		expect(prompt).toContain('== TRANSCRIPT ==');
		expect(prompt).toContain('== CONTEXT ==');
		expect(prompt).toContain('== RESPONSE SCHEMA ==');
		expect(prompt).toContain('== FIELD INSTRUCTIONS ==');
		expect(prompt).toContain('== EXTRACTION RULES ==');
	});

	it('includes transcript and agent prompt', () => {
		const prompt = buildPrompt('agent: Hi\nuser: Hello', 'You are a bot.', category);
		expect(prompt).toContain('agent: Hi');
		expect(prompt).toContain('You are a bot.');
	});

	it('includes field instructions', () => {
		const prompt = buildPrompt('transcript', 'context', category);
		expect(prompt).toContain('**name**');
		expect(prompt).toContain('Extract the name.');
		expect(prompt).toContain('**happy**');
	});

	it('includes global context when provided', () => {
		const prompt = buildPrompt('transcript', 'context', category, {agent_identity: 'SDR', business_domain: 'sales'});
		expect(prompt).toContain('Agent identity: SDR');
		expect(prompt).toContain('Business domain: sales');
	});
});
