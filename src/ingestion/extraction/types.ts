/** LLM Extraction Engine — Type definitions and schemas */

// ─── Extraction Config (Input) ───

export type FieldType = 'string' | 'enum' | 'boolean' | 'phone' | 'email' | 'number';
export type StrictnessLevel = 'high' | 'medium' | 'low';

export type ExtractionField = {
  field_id: string;
  type: FieldType;
  prompt?: string;
  strictness?: StrictnessLevel;
  required?: boolean;
  default_value?: unknown;
  values?: string[]; // For enum type
  validation?: {pattern?: string};
};

export type CategoryContextRules = {
  default_strictness: StrictnessLevel;
  require_rationale: boolean;
  null_behavior?: 'return_null_with_rationale' | 'return_default' | 'omit';
};

export type ExtractionCategory = {
  category_id: string;
  description: string;
  context_rules: CategoryContextRules;
  fields: ExtractionField[];
};

export type GlobalContext = {
  agent_identity?: string;
  business_domain?: string;
  language?: string;
};

export type ExtractionConfig = {
  categories: ExtractionCategory[];
  global_context?: GlobalContext;
};

// ─── Subworkflow Input ───

export type ExtractionInput = {
  transcript: string;
  agent_system_prompt: string;
  extraction_config: ExtractionConfig;
  metadata?: {
    conversation_id?: string;
    agent_id?: string;
  };
};

// ─── Output Envelope ───

export type FieldEnvelope = {
  category: string;
  field_id: string;
  value: unknown;
  rationale: string | undefined;
  original_prompt: string;
  confidence: number;
  strictness_applied: StrictnessLevel;
  validation_passed: boolean;
};

export type ExtractionError = {
  type: 'validation' | 'llm_error' | 'parse_error' | 'timeout';
  category?: string;
  message: string;
};

export type ExtractionOutput = {
  extraction_id: string;
  timestamp: string;
  model: string;
  categories_processed: number;
  fields: FieldEnvelope[];
  errors: ExtractionError[];
};
