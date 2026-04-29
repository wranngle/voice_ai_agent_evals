/** LLM Extraction Engine — Type definitions and schemas */

// ─── Extraction Config (Input) ───

export type FieldType = 'string' | 'enum' | 'boolean' | 'phone' | 'email' | 'number';
export type StrictnessLevel = 'high' | 'medium' | 'low';

export interface ExtractionField {
	field_id: string;
	type: FieldType;
	prompt?: string;
	strictness?: StrictnessLevel;
	required?: boolean;
	default_value?: unknown;
	values?: string[]; // for enum type
	validation?: { pattern?: string };
}

export interface CategoryContextRules {
	default_strictness: StrictnessLevel;
	require_rationale: boolean;
	null_behavior?: 'return_null_with_rationale' | 'return_default' | 'omit';
}

export interface ExtractionCategory {
	category_id: string;
	description: string;
	context_rules: CategoryContextRules;
	fields: ExtractionField[];
}

export interface GlobalContext {
	agent_identity?: string;
	business_domain?: string;
	language?: string;
}

export interface ExtractionConfig {
	categories: ExtractionCategory[];
	global_context?: GlobalContext;
}

// ─── Subworkflow Input ───

export interface ExtractionInput {
	transcript: string;
	agent_system_prompt: string;
	extraction_config: ExtractionConfig;
	metadata?: {
		conversation_id?: string;
		agent_id?: string;
	};
}

// ─── Output Envelope ───

export interface FieldEnvelope {
	category: string;
	field_id: string;
	value: unknown;
	rationale: string | null;
	original_prompt: string;
	confidence: number;
	strictness_applied: StrictnessLevel;
	validation_passed: boolean;
}

export interface ExtractionError {
	type: 'validation' | 'llm_error' | 'parse_error' | 'timeout';
	category?: string;
	message: string;
}

export interface ExtractionOutput {
	extraction_id: string;
	timestamp: string;
	model: string;
	categories_processed: number;
	fields: FieldEnvelope[];
	errors: ExtractionError[];
}
