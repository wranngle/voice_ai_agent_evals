import {defineConfig} from 'vitest/config';

/*
 * CONVENTION-BASED TEST CLASSIFICATION
 *
 * Drop a .test.ts file in the right directory and it auto-classifies:
 *
 *   tests/governance/**  → File/config validation, no network
 *   tests/ingestion/**   → Parser tests, no network
 *   tests/integration/** → Cross-module, may need local storage
 *   tests/agent_evals/** → agent_evals runtime tests, no network
 *   tests/el/**          → ElevenLabs runner UNIT tests (mocked fetch)
 *   tests/eval/**        → n8n-eval runner UNIT tests (mocked fetch)
 *   tests/mcp/**         → MCP runner UNIT tests (mocked fetch)
 *   tests/webhook/**     → MIXED: skipIf(CI)-guarded live HTTP + some mocked
 *   tests/*.test.ts      → Legacy root-level (treated as integration)
 *
 * CI runs the offline projects only. The webhook project's live tests are
 * gated by `describe.skipIf(process.env.CI)` so they auto-skip in CI; the
 * unguarded mocked tests in tests/webhook/ still run.
 *
 * Live API exercise — i.e. actually hitting ElevenLabs / n8n / MCP — happens
 * via the `bun run testing:live:el|n8n|mcp` scripts in package.json, which
 * call scripts/test-*-runner.ts. Those are NOT vitest tests; they require
 * real API keys and run locally or via workflow_dispatch.
 */

// Offline projects (no network calls — fetch is mocked everywhere these run)
const offlineProjects = [
  {
    test: {
      name: 'ingestion',
      root: '.',
      include: ['tests/ingestion/**/*.test.ts'],
      environment: 'node' as const,
      testTimeout: 30_000,
    },
  },
  {
    test: {
      name: 'integration',
      root: '.',
      include: ['tests/integration/**/*.test.ts'],
      environment: 'node' as const,
      testTimeout: 60_000,
    },
  },
  {
    test: {
      name: 'governance',
      root: '.',
      include: ['tests/governance/**/*.test.ts'],
      environment: 'node' as const,
      testTimeout: 30_000,
    },
  },
  {
    test: {
      name: 'agent_evals',
      root: '.',
      include: ['tests/agent_evals/**/*.test.ts'],
      environment: 'node' as const,
      testTimeout: 30_000,
    },
  },
  {
    // Despite the name, these are runner UNIT tests with mocked fetch — no
    // ElevenLabs API key required. The live ElevenLabs exercise lives in
    // scripts/test-elevenlabs-runner.ts (not a vitest test).
    test: {
      name: 'elevenlabs',
      root: '.',
      include: ['tests/el/**/*.test.ts'],
      environment: 'node' as const,
      testTimeout: 30_000,
    },
  },
  {
    // Same: runner UNIT tests with mocked fetch — no n8n credentials needed.
    test: {
      name: 'n8n-eval',
      root: '.',
      include: ['tests/eval/**/*.test.ts'],
      environment: 'node' as const,
      testTimeout: 30_000,
    },
  },
  {
    // Same: runner UNIT tests with mocked fetch.
    test: {
      name: 'mcp',
      root: '.',
      include: ['tests/mcp/**/*.test.ts'],
      environment: 'node' as const,
      testTimeout: 30_000,
    },
  },
  {
    // v1.0 wrapper namespace (governance, tools schema cleaning, client
    // factory). Pure unit tests with mocked SDK clients; no network.
    test: {
      name: 'wrapper',
      root: '.',
      include: ['tests/wrapper/**/*.test.ts'],
      environment: 'node' as const,
      testTimeout: 30_000,
    },
  },
  {
    // v1.0 scoring namespace (composer, assertions DSL, audio-native scorers).
    // Pure unit tests; audio fixtures synthesized in-test so no binary commits.
    test: {
      name: 'scoring',
      root: '.',
      include: ['tests/scoring/**/*.test.ts'],
      environment: 'node' as const,
      testTimeout: 30_000,
    },
  },
  {
    // v1.0 LLM data layer / ingestion (post-call importer, TestChain proposer,
    // persona generator). The 'ingestion' name is taken by the legacy vitest
    // file parser; we suffix '-llm' to disambiguate. Tests use mock LLM
    // callbacks — no network.
    test: {
      name: 'ingestion-llm',
      root: '.',
      include: ['tests/ingestion-llm/**/*.test.ts'],
      environment: 'node' as const,
      testTimeout: 30_000,
    },
  },
];

// Mixed-live projects: at least one describe block calls real HTTP behind a
// `describe.skipIf(process.env.CI)` guard. CI runs the unguarded portion
// (mocked); local runs hit the real endpoint when env vars are configured.
const liveProjects = [
  {
    test: {
      name: 'webhook',
      root: '.',
      include: ['tests/webhook/**/*.test.ts'],
      environment: 'node' as const,
      testTimeout: 30_000,
    },
  },
];

// Export project name lists for CI to consume programmatically
export const OFFLINE_PROJECTS = offlineProjects.map(p => p.test.name);
export const LIVE_PROJECTS = liveProjects.map(p => p.test.name);

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 10_000,

    reporters: [
      'verbose',
      ['html', {outputFile: './reports/html/index.html'}],
    ],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts', 'scripts/**/*.ts', 'tests/governance/lib/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', 'node_modules/**'],
    },

    // All projects combined — local runs everything, CI selects by --project flag
    projects: [...offlineProjects, ...liveProjects],
  },
});
