/**
 * Reference responder for ElevenLabs `conversation_initiation_client_data` webhook.
 *
 * Per official docs: response MUST be HTTP 200 with `{ type, dynamic_variables, ... }`
 * and `dynamic_variables` MUST include every variable defined for the agent.
 * Overrides (`conversation_config_override`) are optional.
 *
 * Two concerns:
 *   1. `buildClientInitiationResponse` — pure builder that guarantees the
 *      response shape is valid no matter what enrichment is (or isn't) available.
 *      Missing keys are filled with their typed defaults; bad types are
 *      coerced or rejected.
 *   2. `respondFast` — async wrapper that races enrichment against a hard
 *      timeout. On any failure (slow upstream, exception, missing keys) it
 *      falls back to defaults. The response still validates.
 *
 * The n8n workflow mirrors this contract in node form — this is the TS
 * reference + test surface.
 */

export type ClientInitiationInput = {
  caller_id?: string;
  agent_id?: string;
  called_number?: string;
  call_sid?: string;
};

export type DynamicVariableSpec = {
  identifier: string;
  type: 'string' | 'number' | 'boolean';
  default: string | number | boolean;
};

export type ConversationConfigOverride = {
  agent?: {prompt?: string; first_message?: string; language?: string};
  tts?: {voice_id?: string; stability?: number; speed?: number; similarity_boost?: number};
  text_only?: boolean;
};

export type ClientInitiationResponse = {
  type: 'conversation_initiation_client_data';
  dynamic_variables: Record<string, string | number | boolean>;
  conversation_config_override?: ConversationConfigOverride;
  branch_id?: string;
  environment?: string;
};

export type BuildArgs = {
  specs: DynamicVariableSpec[];
  enrichments?: Record<string, unknown>;
  conversation_config_override?: ConversationConfigOverride;
  branch_id?: string;
  environment?: string;
};

/**
 * Pure builder. Always returns a valid response with all defined dynamic
 * variables populated. Missing or wrongly-typed enrichments fall back to the
 * spec's `default`.
 */
export function buildClientInitiationResponse(args: BuildArgs): ClientInitiationResponse {
  const dynamic_variables: Record<string, string | number | boolean> = {};
  for (const spec of args.specs) {
    const candidate = args.enrichments?.[spec.identifier];
    dynamic_variables[spec.identifier] = isValidValue(candidate, spec.type)
      ? candidate as string | number | boolean
      : spec.default;
  }

  const response: ClientInitiationResponse = {
    type: 'conversation_initiation_client_data',
    dynamic_variables,
  };
  if (args.conversation_config_override) response.conversation_config_override = args.conversation_config_override;
  if (args.branch_id) response.branch_id = args.branch_id;
  if (args.environment) response.environment = args.environment;
  return response;
}

function isValidValue(v: unknown, t: 'string' | 'number' | 'boolean'): boolean {
  if (v === undefined || v === null) return false;
  if (t === 'string') return typeof v === 'string';
  if (t === 'number') return typeof v === 'number' && Number.isFinite(v);
  if (t === 'boolean') return typeof v === 'boolean';
  return false;
}

export type RespondFastArgs = {
  input: ClientInitiationInput;
  specs: DynamicVariableSpec[];
  enrich?: (input: ClientInitiationInput) => Promise<Record<string, unknown>>;
  conversation_config_override?: ConversationConfigOverride;
  branch_id?: string;
  environment?: string;
  enrichmentTimeoutMs?: number;
};

/**
 * Race enrichment against a hard timeout. On timeout / error / exception,
 * fall back to defaults. Caller gets a valid response either way.
 */
export async function respondFast(args: RespondFastArgs): Promise<ClientInitiationResponse> {
  const {
    input, specs, enrich, conversation_config_override, branch_id, environment,
    enrichmentTimeoutMs = 2000,
  } = args;

  let enrichments: Record<string, unknown> = {};
  if (enrich) {
    try {
      enrichments = await Promise.race([
        enrich(input),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('enrichment_timeout')), enrichmentTimeoutMs);
        }),
      ]);
    } catch {
      // Swallow. Defaults are the floor.
      enrichments = {};
    }
  }

  return buildClientInitiationResponse({
    specs,
    enrichments,
    conversation_config_override,
    branch_id,
    environment,
  });
}
