import { defineConfig } from 'vitest/config';

/*
 * CONVENTION-BASED TEST CLASSIFICATION
 *
 * Drop a .test.ts file in the right directory and it auto-classifies:
 *
 *   tests/unit/**        → Pure logic, no network, runs everywhere
 *   tests/governance/**  → File/config validation, no network
 *   tests/ingestion/**   → Parser tests, no network
 *   tests/integration/** → Cross-module, may need local storage
 *   tests/webhook/**     → LIVE: hits real n8n endpoints
 *   tests/el/**          → LIVE: hits real ElevenLabs API
 *   tests/eval/**        → LIVE: hits real n8n API
 *   tests/mcp/**         → LIVE: hits real MCP server
 *   tests/*.test.ts      → Legacy root-level (treated as integration)
 *
 * CI runs:
 *   Unit job   → "offline" group (no network needed)
 *   Live job   → "live" group (needs secrets + network)
 *
 * Local `bun test` → runs ALL groups
 *
 * To add a new test domain:
 *   1. Create tests/<domain>/
 *   2. Add a project entry below
 *   3. Tag it needsNetwork: true/false in the comment
 *   That's it. CI exclusions are driven by vitest project names, not hardcoded paths.
 */

// Offline projects (no network, run in CI unit job)
const offlineProjects = [
  {
    test: {
      name: 'ingestion',
      root: '.',
      include: ['tests/ingestion/**/*.test.ts'],
      environment: 'node' as const,
      testTimeout: 30000,
    },
  },
  {
    test: {
      name: 'integration',
      root: '.',
      include: ['tests/integration/**/*.test.ts', 'tests/runners.test.ts', 'tests/data-table-api.test.ts'],
      environment: 'node' as const,
      testTimeout: 60000,
    },
  },
  {
    test: {
      name: 'governance',
      root: '.',
      include: ['tests/governance/**/*.test.ts'],
      environment: 'node' as const,
      testTimeout: 30000,
    },
  },
];

// Live projects (need network + secrets, only run in CI live job or locally)
const liveProjects = [
  {
    test: {
      name: 'webhook',
      root: '.',
      include: ['tests/webhook/**/*.test.ts', 'tests/post-call-webhook.test.ts', 'tests/client-initiation-webhook.test.ts'],
      environment: 'node' as const,
      testTimeout: 30000,
    },
  },
  {
    test: {
      name: 'elevenlabs',
      root: '.',
      include: ['tests/el/**/*.test.ts'],
      environment: 'node' as const,
      testTimeout: 120000,
    },
  },
  {
    test: {
      name: 'n8n-eval',
      root: '.',
      include: ['tests/eval/**/*.test.ts'],
      environment: 'node' as const,
      testTimeout: 60000,
    },
  },
  {
    test: {
      name: 'mcp',
      root: '.',
      include: ['tests/mcp/**/*.test.ts'],
      environment: 'node' as const,
      testTimeout: 30000,
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
    testTimeout: 30000,
    hookTimeout: 10000,

    reporters: [
      'verbose',
      ['html', { outputFile: './reports/html/index.html' }],
      ['allure-vitest/reporter', { resultsDir: './allure-results' }],
    ],

    setupFiles: ['allure-vitest/setup'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['lib/**/*.ts', 'scripts/**/*.ts', 'tests/governance/lib/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', 'node_modules/**'],
    },

    // All projects combined — local runs everything, CI selects by --project flag
    projects: [...offlineProjects, ...liveProjects],
  },
});
