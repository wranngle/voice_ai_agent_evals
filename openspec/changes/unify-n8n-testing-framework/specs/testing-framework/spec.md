# Spec: Unified Testing Framework

## ADDED Requirements

### Requirement: Vitest as Test Runner

The testing framework SHALL use Vitest as the unified test runner for all test types.

#### Scenario: Run all tests via Vitest
**Given** tests exist in `tests/` directory
**When** `vitest run` is executed
**Then** all test files SHALL be discovered and executed
**And** results SHALL be displayed with colored pass/fail indicators
**And** summary SHALL show total passed, failed, skipped counts

#### Scenario: Run tests by workspace
**Given** workspaces are configured for webhook, elevenlabs, n8n-eval, mcp
**When** `vitest --project webhook` is executed
**Then** only tests in the webhook workspace SHALL run
**And** other workspaces SHALL be skipped

#### Scenario: Web UI dashboard
**Given** Vitest UI is installed
**When** `vitest --ui` is executed
**Then** a web server SHALL start on localhost
**And** the dashboard SHALL display test status in real-time
**And** individual tests SHALL be runnable from the UI

#### Scenario: Watch mode
**Given** tests are running in watch mode
**When** a source file is modified
**Then** only affected tests SHALL re-run
**And** results SHALL update in terminal/UI

#### Scenario: Coverage report
**Given** coverage is configured
**When** `vitest run --coverage` is executed
**Then** code coverage SHALL be collected
**And** HTML report SHALL be generated in `coverage/`
**And** summary SHALL show line/branch/function coverage percentages

---

### Requirement: Test Data Storage via n8n Data Tables

The testing framework SHALL use n8n Data Tables as the ONLY storage mechanism for test data.

#### Scenario: Store test case in Data Table
**Given** a test case definition with input and expected output
**When** the test case is created
**Then** it SHALL be stored in the `testing-cases` Data Table
**And** it SHALL have a unique `test_id` (format: TC-XXX-NNN)
**And** it SHALL reference a `requirement_id` if linked

#### Scenario: Store test result in Data Table
**Given** a test execution completes
**When** the result is recorded
**Then** it SHALL be stored in the `testing-results` Data Table
**And** it SHALL include `test_id`, `execution_id`, `status`, `latency_ms`
**And** it SHALL include `actual_output` as JSON string

#### Scenario: No Google Sheets dependency
**Given** any testing operation
**When** test data is read or written
**Then** it SHALL NOT use Google Sheets API
**And** it SHALL NOT reference Google Sheets URLs or IDs

---

### Requirement: Multi-System Test Execution

The testing framework SHALL support executing tests across multiple systems via adapters.

#### Scenario: Execute webhook test
**Given** a test case with `type: 'webhook'`
**When** the test is executed
**Then** the WebhookTestRunner adapter SHALL send HTTP POST to the target URL
**And** it SHALL compare response against `expected_output`
**And** it SHALL record latency in milliseconds

#### Scenario: Execute ElevenLabs voice test
**Given** a test case with `type: 'elevenlabs'`
**When** the test is executed
**Then** the ElevenLabsTestRunner adapter SHALL use the Native Testing API
**And** it SHALL upload the test, trigger execution, and poll for results
**And** it SHALL map ElevenLabs results to unified schema

#### Scenario: Execute n8n evaluation test
**Given** a test case with `type: 'n8n-eval'`
**When** the test is executed
**Then** the N8nEvalRunner adapter SHALL trigger via `n8n_test_workflow` MCP tool
**And** it SHALL retrieve results via `n8n_executions` MCP tool
**And** it SHALL extract metrics from n8n Eval Node output

#### Scenario: Execute MCP workflow test
**Given** a test case with `type: 'mcp'`
**When** the test is executed
**Then** the McpExecutionRunner adapter SHALL use `n8n_test_workflow`
**And** it SHALL pass `test.input` as webhook payload
**And** it SHALL compare execution output against `expected_output`

---

### Requirement: Unified Test Orchestration

The testing framework SHALL provide a single CLI for orchestrating all test types.

#### Scenario: Run all tests
**Given** the command `bun run test:all` is executed
**When** tests are loaded from Data Table
**Then** all enabled test cases SHALL be executed
**And** results SHALL be written to `testing-results` table
**And** an execution run record SHALL be created in `testing-runs`

#### Scenario: Run tests by type
**Given** the command `bun run test:webhooks` is executed
**When** tests are loaded from Data Table
**Then** only test cases with `type: 'webhook'` SHALL be executed

#### Scenario: Run tests by requirement
**Given** the command `bun run test --requirement REQ-001` is executed
**When** tests are loaded from Data Table
**Then** only test cases with `requirement_id: 'REQ-001'` SHALL be executed

#### Scenario: Run tests by tag
**Given** the command `bun run test --tag regression` is executed
**When** tests are loaded from Data Table
**Then** only test cases with `tags` containing 'regression' SHALL be executed

---

### Requirement: Greedy Requirement Capture

The testing framework SHALL capture testable requirements from user input.

#### Scenario: Capture requirement from explicit request
**Given** a user provides a testable requirement statement
**When** `test:capture "Users should see X when Y happens"` is executed
**Then** a new record SHALL be created in `testing-requirements` table
**And** `user_intent` SHALL contain the verbatim quote
**And** `requirement_id` SHALL be auto-generated (REQ-XXX-NNN)
**And** `status` SHALL be 'captured'
**And** `captured_at` SHALL be current ISO timestamp

#### Scenario: Generate test skeleton from requirement
**Given** a requirement is captured
**When** the capture process completes
**Then** a test case skeleton MAY be created in `testing-cases`
**And** it SHALL be linked via `requirement_id`
**And** it SHALL have `enabled: false` (requires manual review)

---

### Requirement: Requirement Traceability

The testing framework SHALL provide traceability from requirements to test results.

#### Scenario: Report requirement coverage
**Given** requirements exist in `testing-requirements` table
**When** `test:report` is executed
**Then** the report SHALL show each requirement
**And** it SHALL show count of linked test cases
**And** it SHALL show pass/fail status from latest execution
**And** it SHALL highlight requirements with no tests

#### Scenario: Link test result to requirement
**Given** a test case has `requirement_id: 'REQ-001'`
**When** the test is executed
**Then** the result record SHALL include `requirement_id: 'REQ-001'`
**And** requirement verification status SHALL be computable

---

### Requirement: Execution Run Tracking

The testing framework SHALL track execution runs for historical analysis.

#### Scenario: Create execution run record
**Given** a batch of tests is triggered
**When** execution begins
**Then** a new record SHALL be created in `testing-runs`
**And** `execution_id` SHALL be a unique UUID
**And** `started_at` SHALL be current ISO timestamp
**And** `triggered_by` SHALL indicate source (manual, ci, scheduled)

#### Scenario: Complete execution run record
**Given** a batch of tests completes
**When** all results are recorded
**Then** the `testing-runs` record SHALL be updated
**And** `completed_at` SHALL be set
**And** `total_tests`, `passed`, `failed`, `errors`, `skipped` SHALL be calculated
**And** `pass_rate` SHALL be percentage of passed tests
**And** `avg_latency_ms` SHALL be average of all test latencies

---

## MODIFIED Requirements

### Requirement: ElevenLabs Test Factory Data Source

The existing ElevenLabs Test Factory SHALL read test definitions from n8n Data Tables instead of local YAML templates.

#### Scenario: Load tests from Data Table
**Given** the test factory is initialized
**When** tests are loaded for generation
**Then** it SHALL query `testing-cases` table with `type: 'elevenlabs'`
**And** it SHALL NOT read from `templates/*.yaml` files

---

### Requirement: Webhook Tests Data Source

The existing Bun webhook tests SHALL support loading fixtures from n8n Data Tables.

#### Scenario: Load webhook test fixtures
**Given** a webhook test file is executed
**When** test fixtures are needed
**Then** they MAY be loaded from `testing-cases` table
**Or** they MAY use inline fixtures (backwards compatibility)

---

## REMOVED Requirements

### Requirement: Google Sheets Evaluation Dataset

**REMOVED:** The n8n evaluation setup SHALL NOT use Google Sheets as data source.

Rationale: Google Sheets is banned per project governance. All evaluation data migrates to n8n Data Tables.

---

## Cross-References

- **Related Capability:** `supersystem/test-factory` - ElevenLabs testing
- **Related Capability:** `supersystem/tests/workflow-evaluations.yaml` - Test case definitions
- **Related Change:** `harden-post-call-webhook` - Webhook testing patterns
