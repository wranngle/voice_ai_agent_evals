/**
 * @wranngle/voice-evals/wrapper — public type surface.
 *
 * Most ElevenLabs SDK types are re-exported as-is from
 * `@elevenlabs/elevenlabs-js` rather than redefined here. We only define
 * types for governance / cleaning / convenience that the SDK does not
 * expose.
 */

import type {ElevenLabsClient} from '@elevenlabs/elevenlabs-js';
import type {VerifyOptions, VerifyResult} from '../security/elevenlabs-signature';
import type {TestsApi} from './tests';

export type Phase = 'DEV' | 'ALPHA' | 'BETA' | 'PROD' | 'ARCHIVED';

export const PHASES: readonly Phase[] = ['DEV', 'ALPHA', 'BETA', 'PROD', 'ARCHIVED'];

/**
 * Result of parsing an agent's display name against the project's
 * `[PHASE] Name - Role` naming standard.
 */
export type ParsedAgentName = {
  phase: Phase | undefined;
  baseName: string;
  raw: string;
  isTagged: boolean;
};

/**
 * Governance options for any operation that mutates ElevenLabs state.
 *
 * The wrapper enforces a `[DEV]`-only default — any other phase requires
 * explicit `allowedPhases` opt-in, mirroring the rule in AGENTS.md.
 */
export type GovernanceOptions = {
  /** Phases the operation is allowed to mutate. Default: `['DEV']`. */
  allowedPhases?: readonly Phase[];
  /** Permit operations on agents without a `[PHASE]` prefix. Default: `false`. */
  allowUntagged?: boolean;
  /** Reason string surfaced on rejection — useful in audit trails. */
  reason?: string;
};

export type ModelRankings = {
  default: string;
  recommended: readonly string[];
  banned: readonly string[];
};

export type VoiceEvalsClientOptions =
  | {
    apiKey: string;
    baseUrl?: string;
    modelRankings?: ModelRankings;
    modelRankingsPath?: string;
  }
  | {
    /** Inject a constructed SDK client. Mostly for tests; production code uses apiKey. */
    client: ElevenLabsClient;
    modelRankings?: ModelRankings;
    modelRankingsPath?: string;
  };

export type AgentSummary = {
  id: string;
  name: string;
  parsedName: ParsedAgentName;
  /** SDK shape — passthrough. Use `client.raw.conversationalAi.agents.get()` to widen later. */
  raw: unknown;
};

export type AgentWithConfig = AgentSummary & {
  /** Full agent configuration as returned by the SDK. */
  config: unknown;
};

export type AgentCreateInput = {
  [extra: string]: unknown;
  name: string;
  conversationConfig?: unknown;
};

export type AgentCreateOptions = {
  /** Permit `name` without a `[PHASE]` prefix. The wrapper auto-prefixes `[DEV]`. Default true. */
  autoPrefixDev?: boolean;
};

export type AgentUpdateInput = {
  [extra: string]: unknown;
  name?: string;
  conversationConfig?: unknown;
};

export type AgentCloneOptions = {
  /** Prefix for the new agent's base name. Default: `Clone of`. */
  namePrefix?: string;
  /** Patch to apply to the cloned agent right after creation. */
  overrides?: AgentUpdateInput;
};

export type AgentPromoteOptions = GovernanceOptions & {
  /** Who approved the promotion (audit trail). */
  approvedBy?: string;
};

export type AgentsApi = {
  list: () => Promise<AgentSummary[]>;
  get: (agentId: string) => Promise<AgentWithConfig>;
  create: (spec: AgentCreateInput, options?: AgentCreateOptions) => Promise<AgentSummary>;
  update: (agentId: string, patch: AgentUpdateInput, options?: GovernanceOptions) => Promise<AgentWithConfig>;
  clone: (sourceAgentId: string, options?: AgentCloneOptions) => Promise<AgentSummary>;
  archive: (agentId: string, options?: GovernanceOptions) => Promise<AgentSummary>;
  promote: (agentId: string, toPhase: Phase, options: AgentPromoteOptions) => Promise<AgentSummary>;
};

export type AgentTool = {
  [extra: string]: unknown;
  name: string;
  description: string;
  api_schema?: {
    url?: string;
    method?: string;
    request_body_schema?: {
      type: 'object';
      properties?: Record<string, ToolProperty>;
      required?: string[];
    };
  };
};

/**
 * A single property in a tool's request_body_schema.
 *
 * The ElevenLabs API enforces a mutual exclusion: each property must have
 * EXACTLY ONE of `description`, `is_system_provided`, `dynamic_variable`,
 * or `constant_value` set. PATCH requests that violate this rejected with
 * `value_error: Can only set one of: description, dynamic_variable,
 * is_system_provided, or constant_value`. `cleanToolProperty` enforces
 * this before send.
 */
export type ToolProperty = {
  [extra: string]: unknown;
  type: string;
  description?: string;
  is_system_provided?: boolean;
  dynamic_variable?: string;
  constant_value?: unknown;
  enum?: readonly unknown[];
};

export type ToolsApi = {
  /** Pure function: strip a single tool property to the API-accepted shape. */
  cleanProperty: (property: ToolProperty) => Pick<ToolProperty, 'type' | 'description'>;
  /** Pure function: strip every property in a tools array; safe to send via PATCH. */
  cleanTools: (tools: AgentTool[]) => AgentTool[];
};

export type WebhooksApi = {
  /**
   * Verify the ElevenLabs HMAC-SHA256 signature on a post-call webhook
   * payload. Re-exports `verifyElevenLabsSignature` from `src/security/`.
   */
  verify: VerifyElevenLabsSignature;
};

export type VerifyElevenLabsSignature = (
  rawBody: string | Uint8Array,
  headerValue: string | undefined,
  sharedSecret: string,
  options?: VerifyOptions,
) => VerifyResult;

export type {VerifyOptions, VerifyResult} from '../security/elevenlabs-signature';

export type VoiceEvalsClient = {
  /** Raw ElevenLabs SDK client. Escape hatch for endpoints we have not wrapped. */
  raw: ElevenLabsClient;
  modelRankings: ModelRankings;
  agents: AgentsApi;
  tools: ToolsApi;
  webhooks: WebhooksApi;
  /** ElevenLabs Tests API — bulk test CRUD + invocation polling. */
  tests: TestsApi;
};

export type {TestsApi} from './tests';
