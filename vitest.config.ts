import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vitest/config';

const srcDir = fileURLToPath(new URL('src', import.meta.url));

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
      name: 'templates',
      root: '.',
      include: ['tests/templates/**/*.test.ts'],
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
  {
    // v1.0 regression namespace (versioned baselines, Braintrust-shaped diff).
    // Tests use mkdtemp/rm for filesystem isolation.
    test: {
      name: 'regression',
      root: '.',
      include: ['tests/regression/**/*.test.ts'],
      environment: 'node' as const,
      testTimeout: 30_000,
    },
  },
  {
    // v1.0 closed-loop remediation (proposer, apply with governance gate,
    // polish loop, GEPA bridge contract). LLM + SDK calls mocked; no network.
    test: {
      name: 'remediation',
      root: '.',
      include: ['tests/remediation/**/*.test.ts'],
      environment: 'node' as const,
      testTimeout: 30_000,
    },
  },
  {
    // v1.0 CLI commands (init, doctor, baseline). Tests use mkdtemp/rm so
    // they don't write outside the test sandbox.
    test: {
      name: 'cli',
      root: '.',
      include: ['tests/cli/**/*.test.ts'],
      environment: 'node' as const,
      testTimeout: 30_000,
    },
  },
  {
    // HTML scorecard renderer. Pure string + filesystem unit tests using
    // mkdtemp; no network, no DOM runtime needed.
    test: {
      name: 'report',
      root: '.',
      include: ['tests/report/**/*.test.ts'],
      environment: 'node' as const,
      testTimeout: 30_000,
    },
  },
  {
    // v1.1 combinatorial test factory (cartesian, pairwise IPO, sample
    // strategies + YAML template loader/expander). Pure unit tests.
    test: {
      name: 'factory',
      root: '.',
      include: ['tests/factory/**/*.test.ts'],
      environment: 'node' as const,
      testTimeout: 30_000,
    },
  },
  {
    // v1.1 n8n workflow auto-corrector. Mocked fetch; no real n8n needed.
    test: {
      name: 'n8n',
      root: '.',
      include: ['tests/n8n/**/*.test.ts'],
      environment: 'node' as const,
      testTimeout: 30_000,
    },
  },
  {
    // Meta-audit suite: tests that highlight design + architecture
    // shortcomings, not feature correctness. See docs/META-AUDIT.md.
    // Some tests use `it.fails` or `it.todo` to mark known-broken-by-design
    // contracts. These should be promoted to real tests as the underlying
    // gaps get fixed.
    //
    // Also the home for unified [TEMPLATE]-hardening tests: shipping-check
    // suite (passing) + aspirational contracts (`it.fails`) live side-by-side
    // here. The README in tests/_meta_audit/ explains the dual purpose.
    test: {
      name: '_meta_audit',
      root: '.',
      include: ['tests/_meta_audit/**/*.test.ts'],
      environment: 'node' as const,
      testTimeout: 60_000,
    },
  },
];

(offlineProjects as any[]).push({
  resolve: {
    alias: {
      '@wranngle/voice-evals/scenarios': `${srcDir}/scenarios/index.ts`,
    },
  },
  test: {
    name: 'scenarios',
    root: '.',
    include: ['tests/scenarios/**/*.test.ts'],
    environment: 'node' as const,
    testTimeout: 30_000,
  },
});

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
  resolve: {
    alias: {
      '@wranngle/voice-evals/scenarios': `${srcDir}/scenarios/index.ts`,
    },
  },
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
