import { z } from "zod";

const SettingsSchema = z.object({
  maxTurnDurationMs: z.number().int().positive(),
  minAgentTurnRatio: z.number().min(0).max(1),
  fixturesDirectory: z.string().min(1),
  logFile: z.string().optional(),
  otlpEndpoint: z.string().url().optional(),
});

export type Settings = z.infer<typeof SettingsSchema>;

const DEFAULT_SETTINGS: Settings = {
  maxTurnDurationMs: 30_000,
  minAgentTurnRatio: 0.3,
  fixturesDirectory: "fixtures",
};

export function loadSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  const candidate = {
    maxTurnDurationMs: env.AGENT_EVALS_MAX_TURN_DURATION_MS
      ? Number(env.AGENT_EVALS_MAX_TURN_DURATION_MS)
      : DEFAULT_SETTINGS.maxTurnDurationMs,
    minAgentTurnRatio: env.AGENT_EVALS_MIN_AGENT_TURN_RATIO
      ? Number(env.AGENT_EVALS_MIN_AGENT_TURN_RATIO)
      : DEFAULT_SETTINGS.minAgentTurnRatio,
    fixturesDirectory:
      env.AGENT_EVALS_FIXTURES_DIRECTORY ?? DEFAULT_SETTINGS.fixturesDirectory,
    logFile: env.AGENT_EVALS_LOG_FILE,
    otlpEndpoint: env.AGENT_EVALS_OTLP_ENDPOINT,
  };
  return SettingsSchema.parse(candidate);
}
