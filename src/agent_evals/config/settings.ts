import {type} from 'arktype';

const SettingsSchema = type({
  maxTurnDurationMs: 'number.integer > 0',
  minAgentTurnRatio: '0 <= number <= 1',
  'logFile?': 'string',
  // Endpoint that accepts Prometheus exposition format (NOT OTLP — see
  // src/agent_evals/providers/metrics.ts for the wire-format rationale).
  'metricsEndpoint?': 'string.url',
});

export type Settings = typeof SettingsSchema.infer;

const DEFAULT_SETTINGS: Settings = {
  maxTurnDurationMs: 30_000,
  minAgentTurnRatio: 0.3,
};

export function loadSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  const candidate: Record<string, unknown> = {
    maxTurnDurationMs: env.AGENT_EVALS_MAX_TURN_DURATION_MS
      ? Number(env.AGENT_EVALS_MAX_TURN_DURATION_MS)
      : DEFAULT_SETTINGS.maxTurnDurationMs,
    minAgentTurnRatio: env.AGENT_EVALS_MIN_AGENT_TURN_RATIO
      ? Number(env.AGENT_EVALS_MIN_AGENT_TURN_RATIO)
      : DEFAULT_SETTINGS.minAgentTurnRatio,
  };
  if (env.AGENT_EVALS_LOG_FILE !== undefined) {
    candidate.logFile = env.AGENT_EVALS_LOG_FILE;
  }

  if (env.AGENT_EVALS_METRICS_ENDPOINT !== undefined) {
    candidate.metricsEndpoint = env.AGENT_EVALS_METRICS_ENDPOINT;
  }

  return SettingsSchema.assert(candidate);
}
