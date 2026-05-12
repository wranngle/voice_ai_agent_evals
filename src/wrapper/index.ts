/**
 * @wranngle/voice-evals/wrapper
 *
 * Thin layer over `@elevenlabs/elevenlabs-js` that adds:
 *   - `[PHASE]` governance enforcement (AGENTS.md naming standard)
 *   - Tool-property schema cleaning before PATCH (mutual-exclusion safe)
 *   - HMAC signature verification for post-call webhooks
 *   - SDK escape hatch via `.raw`
 *
 * Re-exports SDK types directly (`AgentSimulatedChatTestResponseModel`,
 * `ConversationalAiClient`, etc.). Do not redefine them here.
 */

export {createVoiceEvalsClient} from './client';
export {
  GovernanceError, assertModelAllowed, enforceMutation, isPhase, parseAgentName,
} from './governance';
export {
  cleanProperty, cleanTools, hasMutualExclusionViolation,
} from './tools';
export {signElevenLabsPayload, verifyElevenLabsSignature} from './webhooks';

export type {
  AgentSummary,
  AgentTool,
  AgentWithConfig,
  AgentsApi,
  GovernanceOptions,
  ModelRankings,
  ParsedAgentName,
  Phase,
  ToolProperty,
  ToolsApi,
  VerifyElevenLabsSignature,
  VerifyOptions,
  VerifyResult,
  VoiceEvalsClient,
  VoiceEvalsClientOptions,
  WebhooksApi,
} from './types';
export {PHASES} from './types';
