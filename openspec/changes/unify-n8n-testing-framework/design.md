# Design: Unified n8n Testing Framework

## Overview

This document captures the architectural decisions, trade-offs, and technical design for the unified testing framework.

## The Sausage Factory Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         VITEST (The Beautiful Skin)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Terminal   │  │  Web UI     │  │  Coverage   │  │  Watch Mode         │ │
│  │  Reporter   │  │  Dashboard  │  │  Reports    │  │  Smart Re-runs      │ │
│  │  ✓ ✗ ⊘     │  │  localhost  │  │  HTML/JSON  │  │  File filtering     │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│                         VITEST WORKSPACES                                    │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌────────────┐ │
│  │ workspace:      │ │ workspace:      │ │ workspace:      │ │ workspace: │ │
│  │ webhook         │ │ elevenlabs      │ │ n8n-eval        │ │ mcp        │ │
│  │ tests/**/*.ts   │ │ tests/el/**     │ │ tests/eval/**   │ │ tests/mcp  │ │
│  └────────┬────────┘ └────────┬────────┘ └────────┬────────┘ └─────┬──────┘ │
├───────────┴────────────────────┴────────────────────┴───────────────┴───────┤
│                         TEST RUNNER ADAPTERS                                 │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌────────────┐ │
│  │ WebhookRunner   │ │ ElevenLabsRunner│ │ N8nEvalRunner   │ │ McpRunner  │ │
│  │ fetch() HTTP    │ │ Native Test API │ │ n8n_test_wf MCP │ │ MCP tools  │ │
│  └────────┬────────┘ └────────┬────────┘ └────────┬────────┘ └─────┬──────┘ │
├───────────┴────────────────────┴────────────────────┴───────────────┴───────┤
│                         DATA LAYER (n8n Data Tables)                         │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────────┐│
│  │ Requirements  │ │ Test Cases    │ │ Test Results  │ │ Execution Runs    ││
│  │ REQ-XXX-NNN   │ │ TC-XXX-NNN    │ │ pass/fail     │ │ aggregated stats  ││
│  └───────────────┘ └───────────────┘ └───────────────┘ └───────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

## Design Principles

### 1. Data Tables as Single Source of Truth

**Decision:** All test data flows through n8n Data Tables.

**Rationale:**
- Google Sheets is banned
- Data Tables integrate natively with n8n Eval Node
- REST API available for external access (Bun tests, ElevenLabs factory)
- UI for manual inspection and editing

**Trade-off:** Data Tables cannot be created via API (platform limitation). Mitigation: Browser automation or manual creation with documented schema.

### 2. Greedy Requirement Capture

**Decision:** Every testable user intent is captured as a requirement record.

**Rationale:**
- User stated: "Every attribute of what the human desires needs to be greedily consumed for tracking"
- Prevents requirements from being lost between sessions
- Creates audit trail for test coverage
- Enables requirement → test → result traceability

**Implementation:**
```typescript
interface Requirement {
  requirement_id: string;       // Auto-generated UUID
  user_intent: string;          // Verbatim quote from user
  source: 'chat' | 'ticket' | 'spec' | 'inferred';
  priority: 'critical' | 'high' | 'medium' | 'low';
  captured_at: string;          // ISO timestamp
  captured_by: string;          // Session ID or agent
  status: 'captured' | 'test_created' | 'implemented' | 'verified';
  test_ids: string[];           // Links to test cases
  tags: string[];               // Categorization
}
```

### 3. Adapter Pattern for Test Runners

**Decision:** Each test system (webhook, ElevenLabs, n8n eval, MCP) has a dedicated adapter implementing a common interface.

**Interface:**
```typescript
interface TestRunner {
  name: string;

  // Load test cases from Data Table
  loadTests(filter?: TestFilter): Promise<TestCase[]>;

  // Execute a single test
  runTest(test: TestCase): Promise<TestResult>;

  // Execute batch with parallelism control
  runBatch(tests: TestCase[], options?: BatchOptions): Promise<TestResult[]>;

  // Write results back to Data Table
  reportResults(results: TestResult[]): Promise<void>;
}
```

**Adapters:**

| Adapter | System | Execution Method |
|---------|--------|------------------|
| `WebhookTestRunner` | Bun HTTP tests | `fetch()` to webhook URLs |
| `ElevenLabsTestRunner` | Voice agent tests | ElevenLabs Native Testing API |
| `N8nEvalRunner` | n8n Evaluations | Trigger via MCP `n8n_test_workflow` |
| `McpExecutionRunner` | Direct workflow execution | MCP `n8n_test_workflow` + `n8n_executions` |

### 4. Unified Result Schema

**Decision:** All test results normalize to a common schema regardless of source system.

```typescript
interface TestResult {
  result_id: string;            // Auto-generated UUID
  test_id: string;              // FK to test case
  requirement_id?: string;      // FK to requirement (traceability)
  execution_id: string;         // Batch/run identifier
  runner: string;               // Which adapter ran this
  status: 'pass' | 'fail' | 'error' | 'skip';
  actual_output: string;        // JSON stringified
  expected_output: string;      // JSON stringified
  diff?: string;                // Computed difference
  latency_ms: number;
  error_message?: string;
  timestamp: string;            // ISO timestamp
  metadata: Record<string, any>; // Runner-specific data
}
```

### 5. Orchestration via CLI

**Decision:** Single CLI entry point (`test-orchestrator.ts`) for all test operations.

**Commands:**
```bash
# Run all tests across all systems
bun run test:all

# Run specific system
bun run test:webhooks
bun run test:elevenlabs
bun run test:n8n-eval
bun run test:mcp

# Run tests for specific requirement
bun run test --requirement REQ-001

# Run tests by tag
bun run test --tag regression

# Generate coverage report
bun run test:report

# Capture new requirement
bun run test:capture "User wants X to happen when Y"
```

## Data Table Schemas

### 1. Requirements Table (`testing-requirements`)

| Column | Type | Description |
|--------|------|-------------|
| id | Number | Auto-increment PK |
| requirement_id | String | UUID (e.g., REQ-001) |
| user_intent | String | Verbatim user quote |
| source | String | chat, ticket, spec, inferred |
| priority | String | critical, high, medium, low |
| captured_at | String | ISO timestamp |
| captured_by | String | Session/agent ID |
| status | String | captured, test_created, implemented, verified |
| test_ids | String | JSON array of test IDs |
| tags | String | JSON array of tags |

### 2. Test Cases Table (`testing-cases`)

| Column | Type | Description |
|--------|------|-------------|
| id | Number | Auto-increment PK |
| test_id | String | UUID (e.g., TC-001) |
| requirement_id | String | FK to requirement |
| name | String | Human-readable name |
| description | String | What this tests |
| type | String | webhook, elevenlabs, n8n-eval, mcp |
| category | String | Grouping (e.g., happy_path, error) |
| priority | String | critical, high, medium, low |
| input | String | JSON stringified input data |
| expected_output | String | JSON stringified expected |
| timeout_ms | Number | Max execution time |
| tags | String | JSON array of tags |
| enabled | String | true/false |
| created_at | String | ISO timestamp |
| updated_at | String | ISO timestamp |

### 3. Test Results Table (`testing-results`)

| Column | Type | Description |
|--------|------|-------------|
| id | Number | Auto-increment PK |
| result_id | String | UUID |
| test_id | String | FK to test case |
| requirement_id | String | FK to requirement |
| execution_id | String | Batch/run identifier |
| runner | String | webhook, elevenlabs, n8n-eval, mcp |
| status | String | pass, fail, error, skip |
| actual_output | String | JSON stringified |
| expected_output | String | JSON stringified |
| diff | String | Computed difference |
| latency_ms | Number | Execution time |
| error_message | String | If status is error/fail |
| timestamp | String | ISO timestamp |
| metadata | String | JSON stringified runner-specific data |

### 4. Execution Runs Table (`testing-runs`)

| Column | Type | Description |
|--------|------|-------------|
| id | Number | Auto-increment PK |
| execution_id | String | UUID for the run |
| started_at | String | ISO timestamp |
| completed_at | String | ISO timestamp |
| runners | String | JSON array of runners used |
| total_tests | Number | Count of tests |
| passed | Number | Count passed |
| failed | Number | Count failed |
| errors | Number | Count errors |
| skipped | Number | Count skipped |
| pass_rate | Number | Percentage |
| avg_latency_ms | Number | Average latency |
| triggered_by | String | manual, ci, scheduled |
| commit_sha | String | Git commit if CI |

## Integration Points

### n8n MCP Tools

```typescript
// Execute workflow and get results
const execution = await mcp.n8n_test_workflow({
  workflow_id: 'abc123',
  mode: 'webhook',
  payload: testCase.input
});

// Get execution details
const results = await mcp.n8n_executions({
  execution_id: execution.id,
  mode: 'full'
});
```

### n8n Data Table API

```typescript
// Insert test result
await fetch('https://your-n8n-host.example.com/webhook/data-table/testing-results', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(testResult)
});

// Query test cases
const cases = await fetch(
  'https://your-n8n-host.example.com/webhook/data-table/testing-cases?type=webhook'
);
```

### ElevenLabs Native Testing API

Existing `test-factory` already implements this. Adapter wraps it:

```typescript
class ElevenLabsTestRunner implements TestRunner {
  private factory: TestFactory;

  async runBatch(tests: TestCase[]): Promise<TestResult[]> {
    // Convert to ElevenLabs format
    const elTests = tests.map(t => this.toElevenLabsFormat(t));

    // Use existing factory
    await this.factory.upload(elTests);
    const invocation = await this.factory.execute();
    const results = await this.factory.getResults(invocation.id);

    // Convert back to unified format
    return results.map(r => this.toUnifiedResult(r));
  }
}
```

## Migration Strategy

### Phase 1: Create Data Tables (Browser Automation)
1. Create 4 tables: requirements, cases, results, runs
2. Document schemas in `docs/testing-data-tables.md`

### Phase 2: Migrate Existing Test Data
1. Convert `workflow-evaluations.yaml` → testing-cases table
2. Convert `tests/*.test.ts` fixtures → testing-cases table
3. Convert `test-factory/templates/*.yaml` → testing-cases table
4. Generate requirement stubs for existing tests

### Phase 3: Build Adapters
1. WebhookTestRunner (wraps existing Bun tests)
2. ElevenLabsTestRunner (wraps existing test-factory)
3. N8nEvalRunner (new, uses n8n Eval Node)
4. McpExecutionRunner (new, uses MCP tools)

### Phase 4: Build Orchestrator
1. CLI with commands
2. Parallel execution
3. Result aggregation
4. Report generation

### Phase 5: Requirement Capture Hook
1. Session hook for detecting testable requirements
2. Auto-creates requirement record
3. Suggests test case skeleton

## Alternatives Considered

### Alternative 1: Keep Google Sheets for ElevenLabs Tests
**Rejected:** User explicitly banned Google Sheets. All systems must use Data Tables.

### Alternative 2: Separate Test Databases
**Rejected:** Defeats the purpose of unified framework. Traceability requires single data layer.

### Alternative 3: File-Based Test Storage (JSON/YAML)
**Rejected:**
- No native n8n Eval Node integration
- Harder to query and filter
- No UI for manual editing
- Version control complexity

### Alternative 4: External Test Management Tool (TestRail, Xray)
**Rejected:**
- Additional dependency
- Cost
- Doesn't integrate with n8n ecosystem
- Overkill for current scale

## Vitest Configuration

### Why Vitest

| Requirement | Vitest Capability |
|-------------|-------------------|
| Beautiful output | Default reporter with colors, progress, summary |
| Web dashboard | `vitest ui` serves interactive dashboard |
| Watch mode | Smart file watching, only re-runs affected tests |
| Workspaces | Test different systems with different configs |
| Coverage | c8/istanbul integration, HTML reports |
| Jest compat | Same `describe/it/expect` API |
| Speed | Vite-powered transforms, parallel by default |
| TypeScript | Native support, no config needed |

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Global settings
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 10000,

    // Reporter configuration (the beautiful skin)
    reporters: ['verbose', 'html', 'json'],
    outputFile: {
      html: './coverage/test-report.html',
      json: './coverage/test-results.json',
    },

    // Coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['lib/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
    },

    // Workspaces for different test types
    workspace: [
      {
        extends: true,
        test: {
          name: 'webhook',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/el/**', 'tests/eval/**', 'tests/mcp/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'elevenlabs',
          include: ['tests/el/**/*.test.ts'],
          testTimeout: 120000, // Voice tests are slow
        },
      },
      {
        extends: true,
        test: {
          name: 'n8n-eval',
          include: ['tests/eval/**/*.test.ts'],
          testTimeout: 60000,
        },
      },
      {
        extends: true,
        test: {
          name: 'mcp',
          include: ['tests/mcp/**/*.test.ts'],
        },
      },
    ],

    // Pool configuration for parallelism
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        maxThreads: 5,
        minThreads: 1,
      },
    },
  },
});
```

### Package.json Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:run": "vitest run",
    "test:watch": "vitest --watch",
    "test:coverage": "vitest run --coverage",
    "test:webhook": "vitest --project webhook",
    "test:elevenlabs": "vitest --project elevenlabs",
    "test:n8n-eval": "vitest --project n8n-eval",
    "test:mcp": "vitest --project mcp",
    "test:report": "vitest run --reporter=html"
  }
}
```

### Test File Structure

```
tests/
├── webhook/                    # Workspace: webhook
│   ├── post-call.test.ts
│   ├── client-initiation.test.ts
│   └── fixtures/
├── el/                         # Workspace: elevenlabs
│   ├── voice-agent.test.ts
│   ├── tool-calls.test.ts
│   └── scenarios/
├── eval/                       # Workspace: n8n-eval
│   ├── workflow-eval.test.ts
│   └── data-table.test.ts
├── mcp/                        # Workspace: mcp
│   ├── workflow-execution.test.ts
│   └── execution-history.test.ts
└── setup/
    ├── global-setup.ts         # Data Table client init
    └── vitest.setup.ts         # Global hooks
```

### Custom Reporter (Optional Enhancement)

```typescript
// lib/testing/vitest-reporter.ts
import type { Reporter } from 'vitest';

export class DataTableReporter implements Reporter {
  async onFinished(files: File[]) {
    // Write results to n8n Data Table
    const results = files.flatMap(f => f.tasks.map(t => ({
      test_id: t.id,
      name: t.name,
      status: t.result?.state,
      duration: t.result?.duration,
      error: t.result?.error?.message,
    })));

    await dataTableClient.insertResults(results);
  }
}
```

### Commands Cheat Sheet

```bash
# Run all tests with beautiful output
vitest

# Open web UI dashboard
vitest --ui

# Run specific workspace
vitest --project webhook

# Run single file
vitest tests/webhook/post-call.test.ts

# Run tests matching pattern
vitest -t "should process completed call"

# Watch mode (re-runs on file change)
vitest --watch

# Coverage report
vitest run --coverage

# Run failed tests only
vitest --failed

# Parallel with 10 threads
vitest --pool threads --poolOptions.threads.maxThreads=10
```

## Performance Considerations

- **Batch writes:** Results written in batches (50 records) not individually
- **Parallel execution:** Vitest threads pool (default: 5 threads)
- **Caching:** Test cases cached in memory during run
- **Incremental runs:** `vitest --failed` runs only previously failed tests
- **Watch mode:** Smart re-runs only affected tests

## Security Considerations

- Data Tables accessed via n8n webhooks (authenticated via n8n)
- No sensitive data (API keys, passwords) stored in test tables
- Test payloads may contain mock PII - documented as test data only
