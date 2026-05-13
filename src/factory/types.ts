/**
 * @wranngle/voice-evals/factory — types for combinatorial test expansion.
 *
 * Mirrors the archive's `supersystem/test-factory/templates/*.yaml` schemas:
 *   - Industry: ported from `industries.yaml`
 *   - Variant:  ported from `variants.yaml`
 *   - Template: ported from `base-scenarios.yaml`
 */

export type ExpansionStrategy = 'cartesian' | 'pairwise' | 'sample';

export type Industry = {
  id: string;
  name: string;
  greeting: string;
  pain_point: string;
  emergency_example?: string;
  routine_example?: string;
  keywords?: string[];
};

export type Variant = {
  id: string;
  name: string;
  response: string;
  expected_behavior?: string;
  test_type?: 'llm' | 'tool';
  response_style?: string;
  example_responses?: string[];
};

export type VariantBucket =
  | 'demo_close_variants'
  | 'objection_variants'
  | 'personality_variants'
  | 'edge_case_variants';

export type ChatHistoryTurn = {
  role: 'agent' | 'user';
  message: string;
  time_in_call_secs?: number;
  tool_calls?: unknown[];
  tool_results?: unknown[];
};

export type TestExample = {
  response: string;
  type: 'success' | 'failure';
};

/**
 * A single template — possibly placeholder-laden. Combinatorial expansion
 * via `expand_with` turns it into N concrete tests.
 */
export type Template = {
  id: string;
  name: string;
  type: 'llm' | 'tool' | 'simulation';
  category?: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  /** Variable names to combinatorially expand across. */
  expand_with?: string[];
  chat_history?: ChatHistoryTurn[];
  success_condition?: string;
  success_examples?: TestExample[];
  failure_examples?: TestExample[];
  dynamic_variables?: Record<string, unknown>;
  /** Used by the YAML loader for overlay merging. */
  inherit?: string;
  /** Free-form overrides applied after inherit-resolution. */
  overrides?: Partial<Template>;
};

/**
 * A concrete test, ready to upload to the ElevenLabs Tests API
 * (`client.conversationalAi.tests.create`).
 */
export type GeneratedTest = {
  /** Stable id derived from template + variable assignment. */
  id: string;
  name: string;
  type: 'llm' | 'tool' | 'simulation';
  category?: string;
  priority?: string;
  chat_history?: ChatHistoryTurn[];
  success_condition?: string;
  success_examples?: TestExample[];
  failure_examples?: TestExample[];
  dynamic_variables?: Record<string, unknown>;
  /** Names of the variables that drove this expansion (for grouping in reports). */
  expanded_with?: string[];
  /** Values picked for each expansion variable (for grouping in reports). */
  variable_assignment?: Record<string, unknown>;
};

export type ExpansionContext = {
  [variableBucket: string]: unknown;
  industries?: Industry[];
  demo_close_variants?: Variant[];
  objection_variants?: Variant[];
  personality_variants?: Variant[];
  edge_case_variants?: Variant[];
};

export type ExpandOptions = {
  strategy: ExpansionStrategy;
  /** RNG seed for `sample` and pairwise's greedy candidate selection. */
  seed?: number;
  /** Sample count when strategy === 'sample'. Default 100. */
  sampleCount?: number;
};
