# Tasks: Unify n8n Testing Framework

## Phase 0: Vitest Setup (The Beautiful Skin)

### 0.1 Install Vitest
- [ ] `bun add -D vitest @vitest/ui @vitest/coverage-v8`
- [ ] `bun add -D @types/node` (if not present)
- [ ] Create `vitest.config.ts` with workspace configuration
- [ ] Create `tests/setup/vitest.setup.ts` for global hooks

**Validation:** `bun run vitest --version` shows installed version

### 0.2 Configure Workspaces
- [ ] Create workspace for `webhook` tests
- [ ] Create workspace for `elevenlabs` tests
- [ ] Create workspace for `n8n-eval` tests
- [ ] Create workspace for `mcp` tests
- [ ] Configure different timeouts per workspace

**Validation:** `vitest --project webhook` runs only webhook tests

### 0.3 Migrate Existing Tests
- [ ] Move `tests/post-call-webhook.test.ts` to `tests/webhook/`
- [ ] Move `tests/client-initiation-webhook.test.ts` to `tests/webhook/`
- [ ] Replace `import { describe, it, expect } from "bun:test"` with `vitest`
- [ ] Verify all existing tests pass under Vitest

**Validation:** `vitest run` passes all migrated tests

### 0.4 Configure Reporters
- [ ] Enable verbose terminal reporter
- [ ] Enable HTML report output to `coverage/`
- [ ] Enable JSON report for CI parsing
- [ ] Create custom `DataTableReporter` for result persistence

**Validation:** `vitest run` produces `coverage/test-report.html`

### 0.5 Package Scripts
- [ ] Add `"test": "vitest"` to package.json
- [ ] Add `"test:ui": "vitest --ui"`
- [ ] Add `"test:run": "vitest run"`
- [ ] Add `"test:watch": "vitest --watch"`
- [ ] Add `"test:coverage": "vitest run --coverage"`
- [ ] Add workspace-specific scripts (`test:webhook`, etc.)

**Validation:** All scripts execute correctly

---

## Phase 1: Data Layer Foundation

### 1.1 Create Testing Data Tables
- [ ] Create `testing-requirements` Data Table via browser automation
- [ ] Create `testing-cases` Data Table via browser automation
- [ ] Create `testing-results` Data Table via browser automation
- [ ] Create `testing-runs` Data Table via browser automation
- [ ] Document table schemas in `docs/testing-data-tables.md`
- [ ] Create webhook endpoints for CRUD operations on each table

**Validation:** All 4 tables exist in n8n UI with correct columns

### 1.2 Build Data Table Client
- [ ] Create `lib/testing/data-table-client.ts`
- [ ] Implement CRUD operations for requirements
- [ ] Implement CRUD operations for test cases
- [ ] Implement CRUD operations for test results
- [ ] Implement CRUD operations for execution runs
- [ ] Add batch insert/update support
- [ ] Add query filtering (by type, status, tags)
- [ ] Write unit tests for client

**Validation:** `bun test lib/testing/data-table-client.test.ts` passes

## Phase 2: Migrate Existing Test Data

### 2.1 Migrate Workflow Evaluations
- [ ] Create migration script `scripts/migrate-workflow-evals.ts`
- [ ] Parse `supersystem/tests/workflow-evaluations.yaml`
- [ ] Generate requirement stubs (REQ-WE-001, etc.)
- [ ] Convert test cases to unified schema
- [ ] Insert into `testing-cases` table
- [ ] Link to generated requirements

**Validation:** All workflow evaluation tests appear in Data Table

### 2.2 Migrate Webhook Test Fixtures
- [ ] Create migration script `scripts/migrate-webhook-tests.ts`
- [ ] Extract fixtures from `tests/post-call-webhook.test.ts`
- [ ] Extract fixtures from `tests/client-initiation-webhook.test.ts`
- [ ] Generate requirement stubs (REQ-WH-001, etc.)
- [ ] Convert to unified schema
- [ ] Insert into `testing-cases` table

**Validation:** Webhook test cases appear in Data Table

### 2.3 Migrate ElevenLabs Test Templates
- [ ] Create migration script `scripts/migrate-elevenlabs-tests.ts`
- [ ] Parse `supersystem/test-factory/templates/*.yaml`
- [ ] Generate requirement stubs (REQ-EL-001, etc.)
- [ ] Convert to unified schema (preserve category, priority)
- [ ] Insert into `testing-cases` table

**Validation:** ElevenLabs template tests appear in Data Table

## Phase 3: Build Test Runner Adapters

### 3.1 Common Interface
- [ ] Create `lib/testing/types.ts` with TestRunner interface
- [ ] Define TestCase, TestResult, TestFilter types
- [ ] Define BatchOptions for parallel execution
- [ ] Create base class `AbstractTestRunner`

**Validation:** Types compile without errors

### 3.2 Webhook Test Runner
- [ ] Create `lib/testing/runners/webhook-runner.ts`
- [ ] Implement loadTests() - query from Data Table
- [ ] Implement runTest() - fetch() to webhook URL
- [ ] Implement runBatch() - parallel execution with limit
- [ ] Implement reportResults() - write to Data Table
- [ ] Handle timeouts, errors, retries
- [ ] Write tests `lib/testing/runners/webhook-runner.test.ts`

**Validation:** Can run webhook tests and see results in Data Table

### 3.3 ElevenLabs Test Runner
- [ ] Create `lib/testing/runners/elevenlabs-runner.ts`
- [ ] Wrap existing `test-factory` functionality
- [ ] Implement loadTests() - query from Data Table
- [ ] Implement runTest() - single test via ElevenLabs API
- [ ] Implement runBatch() - use existing factory batch logic
- [ ] Implement reportResults() - write to Data Table
- [ ] Map ElevenLabs result format to unified schema
- [ ] Write tests

**Validation:** Can run ElevenLabs tests and see results in Data Table

### 3.4 n8n Eval Runner
- [ ] Create `lib/testing/runners/n8n-eval-runner.ts`
- [ ] Implement loadTests() - query from Data Table by type='n8n-eval'
- [ ] Implement runTest() - trigger workflow via MCP
- [ ] Implement runBatch() - sequential (n8n eval limitation)
- [ ] Implement reportResults() - write to Data Table
- [ ] Integrate with n8n Eval Node data flow

**Validation:** Can trigger n8n evaluation and see results in Data Table

### 3.5 MCP Execution Runner
- [ ] Create `lib/testing/runners/mcp-runner.ts`
- [ ] Implement loadTests() - query from Data Table by type='mcp'
- [ ] Implement runTest() - use `n8n_test_workflow` MCP tool
- [ ] Implement runBatch() - parallel with rate limiting
- [ ] Implement reportResults() - write to Data Table
- [ ] Use `n8n_executions` to fetch detailed results

**Validation:** Can execute workflows via MCP and see results in Data Table

## Phase 4: Build Orchestrator CLI

### 4.1 Core CLI Structure
- [ ] Create `lib/testing/orchestrator.ts`
- [ ] Implement runner registry (load all adapters)
- [ ] Implement test discovery (query Data Table)
- [ ] Implement parallel execution coordinator
- [ ] Implement result aggregator

**Validation:** Orchestrator can load runners and discover tests

### 4.2 CLI Commands
- [ ] Create `scripts/test-orchestrator.ts` (CLI entry point)
- [ ] Implement `test:all` - run all enabled tests
- [ ] Implement `test:webhooks` - run webhook tests only
- [ ] Implement `test:elevenlabs` - run ElevenLabs tests only
- [ ] Implement `test:n8n-eval` - run n8n eval tests only
- [ ] Implement `test:mcp` - run MCP execution tests only
- [ ] Implement `test --requirement <id>` - run tests for requirement
- [ ] Implement `test --tag <tag>` - run tests by tag
- [ ] Implement `test:report` - generate execution report
- [ ] Implement `test:capture "<intent>"` - capture new requirement

**Validation:** All CLI commands work from terminal

### 4.3 Package.json Scripts
- [ ] Add `"test:all": "bun run scripts/test-orchestrator.ts all"`
- [ ] Add `"test:webhooks": "bun run scripts/test-orchestrator.ts webhooks"`
- [ ] Add `"test:elevenlabs": "bun run scripts/test-orchestrator.ts elevenlabs"`
- [ ] Add `"test:n8n-eval": "bun run scripts/test-orchestrator.ts n8n-eval"`
- [ ] Add `"test:mcp": "bun run scripts/test-orchestrator.ts mcp"`
- [ ] Add `"test:report": "bun run scripts/test-orchestrator.ts report"`
- [ ] Add `"test:capture": "bun run scripts/test-orchestrator.ts capture"`

**Validation:** `bun run test:all` executes full test suite

## Phase 5: Requirement Capture System

### 5.1 Capture Logic
- [ ] Create `lib/testing/requirement-capture.ts`
- [ ] Implement intent extraction from user messages
- [ ] Implement requirement ID generation (REQ-XXX-NNN)
- [ ] Implement priority inference from keywords
- [ ] Implement tag extraction
- [ ] Implement Data Table insert

**Validation:** Can capture requirement from string input

### 5.2 Test Case Generation
- [ ] Implement test case skeleton generator
- [ ] Generate `test_id` linked to requirement
- [ ] Infer test type from requirement context
- [ ] Generate placeholder input/expected
- [ ] Insert as disabled test (manual review needed)

**Validation:** Capturing requirement creates linked test case stub

### 5.3 Traceability Reporting
- [ ] Implement requirement coverage report
- [ ] Show requirements without tests
- [ ] Show test results per requirement
- [ ] Calculate requirement verification status

**Validation:** `test:report` shows requirement traceability

## Phase 6: CI/CD Integration

### 6.1 GitHub Actions Workflow
- [ ] Create `.github/workflows/test-suite.yml`
- [ ] Trigger on push to main, PR
- [ ] Run `bun run test:webhooks` (fast, always)
- [ ] Run `bun run test:n8n-eval` (medium, on PR)
- [ ] Optional: `bun run test:elevenlabs` (slow, manual trigger)
- [ ] Upload results artifact
- [ ] Post summary to PR comment

**Validation:** GitHub Actions runs tests on PR

### 6.2 Scheduled Runs
- [ ] Add cron trigger for nightly full suite
- [ ] Record `triggered_by: 'scheduled'` in runs table
- [ ] Send Slack notification on failures

**Validation:** Nightly test run executes and notifies

## Phase 7: Documentation & Cleanup

### 7.1 Documentation
- [ ] Update `supersystem/tests/N8N-EVALUATIONS-SETUP.md` - remove Google Sheets refs
- [ ] Create `docs/testing-framework.md` - comprehensive guide
- [ ] Update `README.md` - add testing section
- [ ] Document all CLI commands with examples

### 7.2 Cleanup
- [ ] Remove Google Sheets references from codebase
- [ ] Archive old evaluation scripts that used Sheets
- [ ] Update `project.md` tech stack (remove Google Sheets for testing)

**Validation:** `rg "Google Sheets" --type md` returns no test-related hits

---

## Parallelizable Work

These tasks can be worked on simultaneously:

| Track A | Track B | Track C |
|---------|---------|---------|
| **0.1-0.5 Vitest setup** | - | - |
| 1.1 Create tables | - | - |
| 1.2 Data Table client | 0.3 Migrate existing tests | - |
| 2.1 Migrate workflow evals | 2.2 Migrate webhook tests | 2.3 Migrate EL tests |
| 3.2 Webhook runner | 3.3 ElevenLabs runner | 3.4 n8n Eval runner |
| 4.1-4.3 Orchestrator | 3.5 MCP runner | 5.1-5.3 Requirement capture |
| 6.1 GitHub Actions | 6.2 Scheduled runs | 7.1-7.2 Docs & cleanup |

## Dependencies

```
0.* (Vitest) ─────────────────────────────┐
                                          ↓
1.1 → 1.2 → 2.* → 3.* → 4.* → 6.*
                  ↘       ↗
                   5.* → 7.*
```

**Phase 0 (Vitest)** should complete first - it's the foundation.
Phase 1 can start in parallel with Phase 0.
Phase 2 requires both Phase 0 (Vitest) and Phase 1 (Data Tables).
Phase 3 requires Phase 2.
Phase 4 requires Phase 3.
Phase 5 can start after Phase 3.
Phase 6 requires Phase 4.
Phase 7 can happen anytime after Phase 4.
