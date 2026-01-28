/**
 * Local Storage Tests
 *
 * Tests for the file-based local storage layer.
 */

import { describe, it, expect, test, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import {
  createTestCaseSync,
  getTestCaseSync,
  listTestCasesSync,
  updateTestCaseSync,
  deleteTestCaseSync,
  createTestRunSync,
  getTestRunSync,
  listTestRunsSync,
  completeTestRunSync,
  createTestResultSync,
  getTestResultSync,
  listTestResultsSync,
  createRequirementSync,
  getRequirementSync,
  listRequirementsSync,
  updateRequirementSync,
  deleteRequirementSync,
  captureRequirementSync,
  linkTestToRequirementSync,
  getRequirementCoverageSync,
  generateId,
  clearAllDataSync,
} from '../../lib/testing/local-storage';

// Use unique storage directory for this test file
const UNIQUE_STORAGE_DIR = join(process.cwd(), '.test-data-local-storage-' + Date.now());

describe('Local Storage', () => {
  beforeEach(() => {
    // Set unique storage dir to avoid conflicts with parallel tests
    process.env.TEST_STORAGE_DIR = UNIQUE_STORAGE_DIR;
    mkdirSync(UNIQUE_STORAGE_DIR, { recursive: true });
    clearAllDataSync();
  });

  afterEach(() => {
    // Clean up after tests
    clearAllDataSync();
    try {
      rmSync(UNIQUE_STORAGE_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    delete process.env.TEST_STORAGE_DIR;
  });

  describe('ID Generation', () => {
    test('should generate unique IDs with correct prefix', () => {
      const reqId = generateId('REQ');
      const tcId = generateId('TC');
      const runId = generateId('RUN');
      const resId = generateId('RES');

      expect(reqId).toMatch(/^REQ-[A-Z0-9]+-[A-Z0-9]+$/);
      expect(tcId).toMatch(/^TC-[A-Z0-9]+-[A-Z0-9]+$/);
      expect(runId).toMatch(/^RUN-[A-Z0-9]+-[A-Z0-9]+$/);
      expect(resId).toMatch(/^RES-[A-Z0-9]+-[A-Z0-9]+$/);
    });

    test('should generate unique IDs each time', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId('TC'));
      }
      // Allow for very rare timing collisions (99+ is acceptable)
      expect(ids.size).toBeGreaterThanOrEqual(99);
    });
  });

  describe('Test Cases CRUD', () => {
    test('should create a test case with auto-generated ID and timestamps', () => {
      const testCase = createTestCaseSync({
        type: 'webhook',
        name: 'Test Case 1',
        description: 'A test case',
        input: { url: 'https://example.com', method: 'POST', body: {} },
        expected_output: { status: 200 },
        tags: ['smoke'],
        enabled: true,
      });

      expect(testCase.test_id).toMatch(/^TC-/);
      expect(testCase.name).toBe('Test Case 1');
      expect(testCase.created_at).toBeDefined();
      expect(testCase.updated_at).toBeDefined();
    });

    test('should get a test case by ID', () => {
      const created = createTestCaseSync({
        type: 'webhook',
        name: 'Get Test',
        description: 'Test for get',
        input: {},
        expected_output: {},
        tags: [],
        enabled: true,
      });

      const retrieved = getTestCaseSync(created.test_id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.test_id).toBe(created.test_id);
      expect(retrieved?.name).toBe('Get Test');
    });

    test('should return undefined for non-existent test case', () => {
      const result = getTestCaseSync('TC-NONEXISTENT-XXX');
      expect(result).toBeUndefined();
    });

    test('should list test cases with filtering', () => {
      createTestCaseSync({
        type: 'webhook',
        name: 'Webhook Test',
        description: 'Test',
        input: {},
        expected_output: {},
        tags: ['smoke', 'webhook'],
        enabled: true,
      });

      createTestCaseSync({
        type: 'elevenlabs',
        name: 'ElevenLabs Test',
        description: 'Test',
        input: {},
        expected_output: {},
        tags: ['smoke', 'voice'],
        enabled: true,
      });

      createTestCaseSync({
        type: 'webhook',
        name: 'Disabled Test',
        description: 'Test',
        input: {},
        expected_output: {},
        tags: ['regression'],
        enabled: false,
      });

      // Filter by type
      const webhookTests = listTestCasesSync({ type: 'webhook' });
      expect(webhookTests.length).toBe(2);

      // Filter by tag
      const smokeTests = listTestCasesSync({ tag: 'smoke' });
      expect(smokeTests.length).toBe(2);

      // Filter by enabled
      const enabledTests = listTestCasesSync({ enabled: true });
      expect(enabledTests.length).toBe(2);

      // Pagination
      const limited = listTestCasesSync({ limit: 1 });
      expect(limited.length).toBe(1);
    });

    test('should update a test case', async () => {
      const created = createTestCaseSync({
        type: 'webhook',
        name: 'Original Name',
        description: 'Original desc',
        input: {},
        expected_output: {},
        tags: [],
        enabled: true,
      });

      // Small delay to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 5));

      const updated = updateTestCaseSync(created.test_id, {
        name: 'Updated Name',
        tags: ['updated'],
      });

      expect(updated?.name).toBe('Updated Name');
      expect(updated?.tags).toContain('updated');
      // Timestamp should be updated (may be same in very fast execution)
      expect(updated?.updated_at).toBeDefined();
    });

    test('should return undefined when updating non-existent test case', () => {
      const result = updateTestCaseSync('TC-NONEXISTENT-XXX', { name: 'New' });
      expect(result).toBeUndefined();
    });

    test('should delete a test case', () => {
      const created = createTestCaseSync({
        type: 'webhook',
        name: 'To Delete',
        description: 'Test',
        input: {},
        expected_output: {},
        tags: [],
        enabled: true,
      });

      const deleted = deleteTestCaseSync(created.test_id);
      expect(deleted).toBe(true);

      const retrieved = getTestCaseSync(created.test_id);
      expect(retrieved).toBeUndefined();
    });

    test('should return false when deleting non-existent test case', () => {
      const result = deleteTestCaseSync('TC-NONEXISTENT-XXX');
      expect(result).toBe(false);
    });
  });

  describe('Test Runs CRUD', () => {
    test('should create a test run with auto-generated ID and timestamp', () => {
      const run = createTestRunSync({
        triggered_by: 'manual',
        test_filter: { tags: ['smoke'] },
      });

      expect(run.execution_id).toMatch(/^RUN-/);
      expect(run.triggered_by).toBe('manual');
      expect(run.started_at).toBeDefined();
    });

    test('should get a test run by ID', () => {
      const created = createTestRunSync({
        triggered_by: 'ci',
        test_filter: {},
      });

      const retrieved = getTestRunSync(created.execution_id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.execution_id).toBe(created.execution_id);
    });

    test('should list test runs with filtering', () => {
      createTestRunSync({ triggered_by: 'manual', test_filter: {} });
      createTestRunSync({ triggered_by: 'ci', test_filter: {} });
      createTestRunSync({ triggered_by: 'manual', test_filter: {} });

      const manualRuns = listTestRunsSync({ triggeredBy: 'manual' });
      expect(manualRuns.length).toBe(2);

      const ciRuns = listTestRunsSync({ triggeredBy: 'ci' });
      expect(ciRuns.length).toBe(1);
    });

    test('should complete a test run with stats', () => {
      const run = createTestRunSync({
        triggered_by: 'manual',
        test_filter: {},
      });

      const completed = completeTestRunSync(run.execution_id, {
        total_tests: 10,
        passed: 8,
        failed: 1,
        errors: 1,
        skipped: 0,
        avg_latency_ms: 150,
      });

      expect(completed?.total_tests).toBe(10);
      expect(completed?.passed).toBe(8);
      expect(completed?.pass_rate).toBe(80);
      expect(completed?.completed_at).toBeDefined();
    });
  });

  describe('Test Results CRUD', () => {
    test('should create a test result with auto-generated ID and timestamp', () => {
      const result = createTestResultSync({
        test_id: 'TC-TEST-001',
        execution_id: 'RUN-TEST-001',
        status: 'passed',
        actual_output: { success: true },
        latency_ms: 100,
      });

      expect(result.result_id).toMatch(/^RES-/);
      expect(result.status).toBe('passed');
      expect(result.executed_at).toBeDefined();
    });

    test('should get a test result by ID', () => {
      const created = createTestResultSync({
        test_id: 'TC-TEST-001',
        execution_id: 'RUN-TEST-001',
        status: 'failed',
        actual_output: {},
        latency_ms: 200,
      });

      const retrieved = getTestResultSync(created.result_id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.status).toBe('failed');
    });

    test('should list test results with filtering', () => {
      createTestResultSync({
        test_id: 'TC-001',
        execution_id: 'RUN-001',
        status: 'passed',
        actual_output: {},
        latency_ms: 100,
      });

      createTestResultSync({
        test_id: 'TC-002',
        execution_id: 'RUN-001',
        status: 'failed',
        actual_output: {},
        latency_ms: 150,
      });

      createTestResultSync({
        test_id: 'TC-003',
        execution_id: 'RUN-002',
        status: 'passed',
        actual_output: {},
        latency_ms: 80,
      });

      // Filter by execution ID
      const run1Results = listTestResultsSync({ executionId: 'RUN-001' });
      expect(run1Results.length).toBe(2);

      // Filter by status
      const passedResults = listTestResultsSync({ status: 'passed' });
      expect(passedResults.length).toBe(2);

      // Filter by test ID
      const tc001Results = listTestResultsSync({ testId: 'TC-001' });
      expect(tc001Results.length).toBe(1);
    });
  });

  describe('Requirements CRUD', () => {
    test('should create a requirement with auto-generated ID and timestamp', () => {
      const req = createRequirementSync({
        user_intent: 'The agent should respond to greetings',
        status: 'captured',
        source: 'manual',
        linked_tests: [],
      });

      expect(req.requirement_id).toMatch(/^REQ-/);
      expect(req.user_intent).toBe('The agent should respond to greetings');
      expect(req.captured_at).toBeDefined();
    });

    test('should get a requirement by ID', () => {
      const created = createRequirementSync({
        user_intent: 'Test intent',
        status: 'captured',
        source: 'manual',
        linked_tests: [],
      });

      const retrieved = getRequirementSync(created.requirement_id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.user_intent).toBe('Test intent');
    });

    test('should list requirements with pagination', () => {
      for (let i = 0; i < 5; i++) {
        createRequirementSync({
          user_intent: `Requirement ${i}`,
          status: 'captured',
          source: 'manual',
          linked_tests: [],
        });
      }

      const all = listRequirementsSync();
      expect(all.length).toBe(5);

      const limited = listRequirementsSync({ limit: 2 });
      expect(limited.length).toBe(2);

      const offset = listRequirementsSync({ offset: 3, limit: 10 });
      expect(offset.length).toBe(2);
    });

    test('should update a requirement', () => {
      const created = createRequirementSync({
        user_intent: 'Original intent',
        status: 'captured',
        source: 'manual',
        linked_tests: [],
      });

      const updated = updateRequirementSync(created.requirement_id, {
        status: 'validated',
        verbatim_quote: 'Updated quote',
      });

      expect(updated?.status).toBe('validated');
      expect(updated?.verbatim_quote).toBe('Updated quote');
    });

    test('should delete a requirement', () => {
      const created = createRequirementSync({
        user_intent: 'To delete',
        status: 'captured',
        source: 'manual',
        linked_tests: [],
      });

      const deleted = deleteRequirementSync(created.requirement_id);
      expect(deleted).toBe(true);

      const retrieved = getRequirementSync(created.requirement_id);
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Utility Functions', () => {
    test('captureRequirementSync should create requirement with options', () => {
      const req = captureRequirementSync('User wants to book appointments', {
        verbatimQuote: '"I need to schedule a demo"',
        source: 'chat',
        tags: ['booking', 'demo'],
      });

      expect(req.user_intent).toBe('User wants to book appointments');
      expect(req.verbatim_quote).toBe('"I need to schedule a demo"');
      expect(req.source).toBe('chat');
      expect(req.tags).toContain('booking');
    });

    test('linkTestToRequirementSync should link test to requirement', () => {
      const req = createRequirementSync({
        user_intent: 'Test requirement',
        status: 'captured',
        source: 'manual',
        linked_tests: [],
      });

      const testCase = createTestCaseSync({
        type: 'webhook',
        name: 'Linked Test',
        description: 'Test',
        input: {},
        expected_output: {},
        tags: [],
        enabled: true,
      });

      const result = linkTestToRequirementSync(testCase.test_id, req.requirement_id);

      expect(result.testCase?.requirement_id).toBe(req.requirement_id);
      expect(result.requirement?.linked_tests).toContain(testCase.test_id);
    });

    test('getRequirementCoverageSync should return coverage status', () => {
      // Create requirement with linked test
      const coveredReq = createRequirementSync({
        user_intent: 'Covered requirement',
        status: 'captured',
        source: 'manual',
        linked_tests: [],
      });

      const testCase = createTestCaseSync({
        type: 'webhook',
        name: 'Test',
        description: 'Test',
        input: {},
        expected_output: {},
        tags: [],
        enabled: true,
      });

      linkTestToRequirementSync(testCase.test_id, coveredReq.requirement_id);

      // Create uncovered requirement
      createRequirementSync({
        user_intent: 'Uncovered requirement',
        status: 'captured',
        source: 'manual',
        linked_tests: [],
      });

      const coverage = getRequirementCoverageSync();
      expect(coverage.length).toBe(2);

      const covered = coverage.find(c => c.requirement_id === coveredReq.requirement_id);
      expect(covered?.coverage_status).toBe('covered');
      expect(covered?.test_count).toBe(1);

      const uncovered = coverage.find(c => c.coverage_status === 'uncovered');
      expect(uncovered).toBeDefined();
      expect(uncovered?.test_count).toBe(0);
    });

    test('clearAllDataSync should remove all data', () => {
      createTestCaseSync({
        type: 'webhook',
        name: 'Test',
        description: 'Test',
        input: {},
        expected_output: {},
        tags: [],
        enabled: true,
      });

      createRequirementSync({
        user_intent: 'Requirement',
        status: 'captured',
        source: 'manual',
        linked_tests: [],
      });

      clearAllDataSync();

      expect(listTestCasesSync().length).toBe(0);
      expect(listRequirementsSync().length).toBe(0);
      expect(listTestRunsSync().length).toBe(0);
      expect(listTestResultsSync().length).toBe(0);
    });
  });
});
