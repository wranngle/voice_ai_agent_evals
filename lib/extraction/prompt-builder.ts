/** 5-Component prompt builder — Tasks 2.1–2.3 */

import type {ExtractionCategory, ExtractionField, GlobalContext} from './types.js';
import {inferStrictness} from './strictness.js';

function buildComponentA(transcript: string): string {
	return `== TRANSCRIPT ==\n${transcript}`;
}

function buildComponentB(agentPrompt: string): string {
	return `== CONTEXT ==\n${agentPrompt}`;
}

function buildComponentC(fields: ExtractionField[]): string {
	const schema: Record<string, string> = {};
	for (const f of fields) {
		if (f.type === 'boolean') schema[f.field_id] = 'boolean | null';
		else if (f.type === 'enum') schema[f.field_id] = f.values?.join(' | ') ?? 'string';
		else if (f.type === 'number') schema[f.field_id] = 'number | null';
		else schema[f.field_id] = 'string | null';
	}

	return `== RESPONSE SCHEMA ==\nReturn a JSON object with exactly these keys:\n${JSON.stringify(schema, null, 2)}\n\nAlso include a "_rationale" object with the same keys, where each value explains your reasoning.\nAlso include a "_confidence" object with the same keys, where each value is a number 0.0–1.0.`;
}

function buildComponentD(fields: ExtractionField[]): string {
	const instructions = fields.map(f => {
		const prompt = f.prompt ?? `Extract the ${f.field_id} from the transcript.`;
		const strictness = inferStrictness(f);
		const parts = [`- **${f.field_id}** (${f.type}): ${prompt}`];
		if (f.type === 'enum' && f.values) parts.push(`  Allowed values: ${f.values.join(', ')}`);
		if (f.required) parts.push(`  Required. Default: ${JSON.stringify(f.default_value ?? null)}`);
		parts.push(`  Strictness: ${strictness}`);
		return parts.join('\n');
	});

	return `== FIELD INSTRUCTIONS ==\n${instructions.join('\n\n')}`;
}

function buildComponentE(category: ExtractionCategory, global?: GlobalContext): string {
	const rules = category.context_rules;
	const lines = [
		'== EXTRACTION RULES ==',
		`Default strictness: ${rules.default_strictness}`,
		`Rationale required: ${rules.require_rationale}`,
		`Null behavior: ${rules.null_behavior ?? 'return_null_with_rationale'}`,
		'',
		'Strictness guide:',
		'- HIGH: Exact match only. Return null if ambiguous. Enums must match exactly.',
		'- MEDIUM: Best-effort extraction. Use "unknown" if unsure. Enums allow closest match.',
		'- LOW: Flexible summarization. Creative interpretation OK.',
		'',
		'Confidence scoring: 0.0 = pure guess, 0.5 = some evidence, 0.8 = strong evidence, 1.0 = explicitly stated.',
		'If a field is not mentioned in the transcript at all, return null with confidence 0.0.',
	];

	if (global?.agent_identity) lines.push(`\nAgent identity: ${global.agent_identity}`);
	if (global?.business_domain) lines.push(`Business domain: ${global.business_domain}`);

	return lines.join('\n');
}

export function buildPrompt(
	transcript: string,
	agentPrompt: string,
	category: ExtractionCategory,
	globalContext?: GlobalContext,
): string {
	return [
		'You are a structured data extraction engine. Extract fields from the transcript below.',
		'',
		buildComponentA(transcript),
		'',
		buildComponentB(agentPrompt),
		'',
		buildComponentC(category.fields),
		'',
		buildComponentD(category.fields),
		'',
		buildComponentE(category, globalContext),
	].join('\n');
}
