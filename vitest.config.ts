import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Global settings
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 10000,

    // Reporter configuration
    // - verbose: CLI output
    // - html: @vitest/ui static dashboard (open reports/html/index.html)
    // - allure-vitest/reporter: Allure multi-project dashboard (run: bun run test:report)
    reporters: [
      'verbose',
      ['html', { outputFile: './reports/html/index.html' }],
      ['allure-vitest/reporter', { resultsDir: './allure-results' }],
    ],

    // Allure setup for metadata/labels
    setupFiles: ['allure-vitest/setup'],

    // Coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['lib/**/*.ts', 'scripts/**/*.ts', 'tests/governance/lib/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', 'node_modules/**'],
    },

    // Vitest 4 projects - each project runs its own test files
    projects: [
      // Webhook tests - HTTP contract validation
      {
        test: {
          name: 'webhook',
          root: '.',
          include: ['tests/webhook/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30000,
        },
      },
      // ElevenLabs voice agent tests (future)
      {
        test: {
          name: 'elevenlabs',
          root: '.',
          include: ['tests/el/**/*.test.ts'],
          environment: 'node',
          testTimeout: 120000,
        },
      },
      // n8n evaluation tests (future)
      {
        test: {
          name: 'n8n-eval',
          root: '.',
          include: ['tests/eval/**/*.test.ts'],
          environment: 'node',
          testTimeout: 60000,
        },
      },
      // MCP execution tests (future)
      {
        test: {
          name: 'mcp',
          root: '.',
          include: ['tests/mcp/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30000,
        },
      },
      // Ingestion tests - Vitest file parsing and test import
      {
        test: {
          name: 'ingestion',
          root: '.',
          include: ['tests/ingestion/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30000,
        },
      },
      // Integration tests - Data Table API, cross-system tests
      {
        test: {
          name: 'integration',
          root: '.',
          include: ['tests/*.test.ts', 'tests/integration/**/*.test.ts'],
          environment: 'node',
          testTimeout: 60000,
        },
      },
      // Governance tests - Enforce project rules
      {
        test: {
          name: 'governance',
          root: '.',
          include: ['tests/governance/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30000,
        },
      },
    ],
  },
});
