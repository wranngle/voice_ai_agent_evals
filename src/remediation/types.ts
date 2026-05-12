/**
 * @wranngle/voice-evals/remediation — closed-loop remediation types.
 *
 * Three primitives, building on Phase 1 (wrapper) + Phase 2 (scoring):
 *   - FixProposal: LLM-suggested edit to an agent's config (system prompt,
 *     tool description, voice config, first message).
 *   - applyFix: governance-gated PATCH that lands a proposal on the agent.
 *   - polishLoop: iterate evaluate -> propose -> apply -> evaluate until
 *     plateau, max iterations, or no further proposals.
 *
 * GEPA (reflective prompt evolution, ICLR 2026) is gated behind a Python
 * sidecar — see `gepa-bridge.ts`. When Python is unavailable, the loop
 * falls back to single-shot LLM proposals (still useful, just less
 * sample-efficient).
 */

import type {DimensionScore} from '../scoring/types';
import type {GovernanceOptions, VoiceEvalsClient} from '../wrapper/types';
import type {LlmCompleteCallback} from '../ingestion/types';

export type FixTarget =
  | 'system_prompt'
  | 'tool_description'
  | 'first_message'
  | 'voice_stability'
  | 'voice_similarity_boost'
  | 'voice_speed'
  | 'temperature'
  | 'turn_eagerness'
  | 'unknown';

export type FixProposal = {
  target: FixTarget;
  /**
   * Where the change applies. For `tool_description`, this is the tool's
   * `name`. For voice/turn/temperature targets, an empty string. For
   * `system_prompt` / `first_message`, an empty string.
   */
  locator: string;
  /** The proposed new value (string for prompts; numeric-as-string for floats). */
  proposed_value: string;
  /** Why this should help — surfaced to the human approver. */
  rationale: string;
  /** Dimension names this proposal addresses (cross-reference into eval output). */
  addresses: string[];
  /** Optional confidence (0-1) self-reported by the proposer. */
  confidence?: number;
};

export type ProposeFixOptions = {
  /** LLM callback (consumer-supplied). Required. */
  llm: LlmCompleteCallback;
  /** Current agent configuration snapshot (the `conversation_config` shape). */
  agentConfig: Record<string, unknown>;
  /** Failing dimensions to address. */
  failures: readonly DimensionScore[];
  /** Optional extra context — e.g., the failing transcript or diff summary. */
  context?: string;
};

export type ApplyFixOptions = {
  client: VoiceEvalsClient;
  agentId: string;
  fix: FixProposal;
  /** Governance overrides — defaults to [DEV]-only per AGENTS.md. */
  governance?: GovernanceOptions;
  /** If true, compute the patch but do not send. Default: false. */
  dryRun?: boolean;
};

export type ApplyFixResult = {
  applied: boolean;
  dryRun: boolean;
  /** The patch that was (or would be) sent to PATCH /agents/{id}. */
  patch: Record<string, unknown>;
  /** Snapshot of the agent config before the patch was computed. */
  before: Record<string, unknown> | undefined;
};

export type EvaluateCallback = () => Promise<readonly DimensionScore[]>;

export type PolishLoopOptions = {
  client: VoiceEvalsClient;
  agentId: string;
  /** Closure that runs the eval suite and returns failing dimensions. */
  evaluate: EvaluateCallback;
  /** LLM callback for the proposer. */
  llm: LlmCompleteCallback;
  /** Max remediation iterations. Default 3. */
  maxIterations?: number;
  /** Stop after this many consecutive iterations with no improvement. Default 2. */
  patience?: number;
  /** Dry-run every apply. Default false. */
  dryRun?: boolean;
  /** Pass through to wrapper governance. */
  governance?: GovernanceOptions;
};

export type PolishLoopStep = {
  iteration: number;
  failingBefore: number;
  proposal: FixProposal | undefined;
  applied: boolean;
  failingAfter: number;
};

export type PolishLoopResult = {
  iterations: number;
  applied: FixProposal[];
  history: PolishLoopStep[];
  stopped_because:
    | 'all_passing'
    | 'max_iterations'
    | 'patience_exhausted'
    | 'no_proposal';
  finalFailingCount: number;
};
