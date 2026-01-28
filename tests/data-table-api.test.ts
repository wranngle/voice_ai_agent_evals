/**
 * Data Table API Test Suite
 *
 * Tests the local storage API for CRUD operations.
 * Validates the testing framework data layer.
 *
 * Run with: vitest tests/data-table-api.test.ts
 */

import { describe, it, expect, test, beforeAll, afterAll } from "vitest";
import {
  generateId,
  createRequirement,
  getRequirement,
  listRequirements,
  updateRequirement,
  captureRequirement,
  createTestCase,
  getTestCase,
  listTestCases,
  updateTestCase,
  deleteTestCase,
  createTestResult,
  getTestResult,
  listTestResults,
  getResultsByRun,
  createTestRun,
  getTestRun,
  listTestRuns,
  completeTestRun,
  linkTestToRequirement,
  getRequirementCoverage,
  clearAllDataSync,
} from "../lib/testing";
import type {
  TestRequirement,
  TestCase,
  TestResult,
  TestRun,
} from "../lib/testing";

describe("Data Table API", () => {
  // Clear all data before running tests
  beforeAll(() => {
    clearAllDataSync();
  });

  // Clean up after all tests
  afterAll(() => {
    clearAllDataSync();
  });

  describe("ID Generation", () => {
    test("should generate unique requirement IDs", () => {
      const id1 = generateId("REQ");
      const id2 = generateId("REQ");

      expect(id1).toMatch(/^REQ-[A-Z0-9]+-[A-Z0-9]+$/);
      expect(id2).toMatch(/^REQ-[A-Z0-9]+-[A-Z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    test("should generate unique test case IDs", () => {
      const id1 = generateId("TC");
      const id2 = generateId("TC");

      expect(id1).toMatch(/^TC-[A-Z0-9]+-[A-Z0-9]+$/);
      expect(id2).toMatch(/^TC-[A-Z0-9]+-[A-Z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    test("should generate unique run IDs", () => {
      const id1 = generateId("RUN");
      const id2 = generateId("RUN");

      expect(id1).toMatch(/^RUN-[A-Z0-9]+-[A-Z0-9]+$/);
      expect(id2).toMatch(/^RUN-[A-Z0-9]+-[A-Z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    test("should generate unique result IDs", () => {
      const id1 = generateId("RES");
      const id2 = generateId("RES");

      expect(id1).toMatch(/^RES-[A-Z0-9]+-[A-Z0-9]+$/);
      expect(id2).toMatch(/^RES-[A-Z0-9]+-[A-Z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe("Requirements API", () => {
    let testRequirementId: string;

    test("should create a requirement", async () => {
      const result = await createRequirement({
        user_intent: "Test requirement for API validation",
        verbatim_quote: "I want to test the API",
        status: "captured",
        source: "test",
        linked_tests: [],
        tags: ["test", "api-validation"],
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.requirement_id).toMatch(/^REQ-/);
      expect(result.data?.user_intent).toBe("Test requirement for API validation");

      testRequirementId = result.data!.requirement_id;
    });

    test("should get a requirement by ID", async () => {
      const result = await getRequirement(testRequirementId);

      expect(result.success).toBe(true);
      expect(result.data?.requirement_id).toBe(testRequirementId);
      expect(result.data?.user_intent).toBe("Test requirement for API validation");
    });

    test("should list requirements", async () => {
      const result = await listRequirements({ limit: 10 });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    test("should update a requirement", async () => {
      const result = await updateRequirement(testRequirementId, {
        status: "reviewed",
        tags: ["test", "api-validation", "updated"],
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe("reviewed");
    });

    test("should capture a requirement with helper", async () => {
      const result = await captureRequirement(
        "Quick capture test",
        {
          verbatimQuote: "Just a quick test",
          source: "test-suite",
          tags: ["quick-capture"],
        }
      );

      expect(result.success).toBe(true);
      expect(result.data?.user_intent).toBe("Quick capture test");
      expect(result.data?.source).toBe("test-suite");
    });
  });

  describe("Test Cases API", () => {
    let testCaseId: string;

    test("should create a test case", async () => {
      const result = await createTestCase({
        type: "webhook",
        name: "API Validation Test Case",
        description: "Tests the webhook API endpoint",
        input: {
          url: "https://example.com/webhook",
          method: "POST",
          body: { test: true },
        },
        expected_output: {
          status: 200,
          body: { success: true },
        },
        tags: ["webhook", "test"],
        enabled: true,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.test_id).toMatch(/^TC-/);
      expect(result.data?.name).toBe("API Validation Test Case");

      testCaseId = result.data!.test_id;
    });

    test("should get a test case by ID", async () => {
      const result = await getTestCase(testCaseId);

      expect(result.success).toBe(true);
      expect(result.data?.test_id).toBe(testCaseId);
      expect(result.data?.type).toBe("webhook");
    });

    test("should list test cases", async () => {
      const result = await listTestCases({ limit: 10 });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    test("should list test cases by type", async () => {
      const result = await listTestCases({ type: "webhook", limit: 10 });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    test("should update a test case", async () => {
      const result = await updateTestCase(testCaseId, {
        description: "Updated description for webhook API test",
        enabled: false,
      });

      expect(result.success).toBe(true);
      expect(result.data?.description).toBe("Updated description for webhook API test");
      expect(result.data?.enabled).toBe(false);
    });

    test("should delete a test case", async () => {
      // Create a test case specifically for deletion
      const createResult = await createTestCase({
        type: "webhook",
        name: "Test Case To Delete",
        description: "This will be deleted",
        input: {},
        expected_output: {},
        tags: ["delete-test"],
        enabled: false,
      });

      expect(createResult.success).toBe(true);
      const deleteId = createResult.data!.test_id;

      const deleteResult = await deleteTestCase(deleteId);
      expect(deleteResult.success).toBe(true);

      // Verify deletion
      const getResult = await getTestCase(deleteId);
      // After deletion, get should fail or return empty
      expect(getResult.data).toBeFalsy();
    });
  });

  describe("Test Results API", () => {
    let testRunId: string;
    let testResultId: string;
    let testCaseId: string;

    beforeAll(async () => {
      // Create a test run first
      const runResult = await createTestRun({
        triggered_by: "manual",
        trigger_source: "test-suite",
        total_tests: 0,
        passed: 0,
        failed: 0,
        errors: 0,
        skipped: 0,
        pass_rate: 0,
        avg_latency_ms: 0,
      });
      testRunId = runResult.data!.execution_id;

      // Create a test case
      const caseResult = await createTestCase({
        type: "webhook",
        name: "Test Case for Results",
        description: "Used for result tests",
        input: {},
        expected_output: {},
        tags: ["result-test"],
        enabled: true,
      });
      testCaseId = caseResult.data!.test_id;
    });

    test("should create a test result", async () => {
      const result = await createTestResult({
        test_id: testCaseId,
        execution_id: testRunId,
        status: "passed",
        actual_output: { response: "ok" },
        latency_ms: 150,
        assertions_passed: 3,
        assertions_failed: 0,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.result_id).toMatch(/^RES-/);
      expect(result.data?.status).toBe("passed");

      testResultId = result.data!.result_id;
    });

    test("should get a test result by ID", async () => {
      const result = await getTestResult(testResultId);

      expect(result.success).toBe(true);
      expect(result.data?.result_id).toBe(testResultId);
      expect(result.data?.latency_ms).toBe(150);
    });

    test("should list test results", async () => {
      const result = await listTestResults({ limit: 10 });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    test("should get results by run", async () => {
      const result = await getResultsByRun(testRunId);

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    test("should create a failed test result", async () => {
      const result = await createTestResult({
        test_id: testCaseId,
        execution_id: testRunId,
        status: "failed",
        actual_output: { error: "Assertion failed" },
        latency_ms: 200,
        error_message: "Expected 200 but got 500",
        assertions_passed: 1,
        assertions_failed: 2,
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe("failed");
      expect(result.data?.error_message).toBe("Expected 200 but got 500");
    });
  });

  describe("Test Runs API", () => {
    let testRunId: string;

    test("should create a test run", async () => {
      const result = await createTestRun({
        triggered_by: "manual",
        trigger_source: "api-test",
        total_tests: 10,
        passed: 0,
        failed: 0,
        errors: 0,
        skipped: 0,
        pass_rate: 0,
        avg_latency_ms: 0,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.execution_id).toMatch(/^RUN-/);
      expect(result.data?.triggered_by).toBe("manual");

      testRunId = result.data!.execution_id;
    });

    test("should get a test run by ID", async () => {
      const result = await getTestRun(testRunId);

      expect(result.success).toBe(true);
      expect(result.data?.execution_id).toBe(testRunId);
    });

    test("should list test runs", async () => {
      const result = await listTestRuns({ limit: 10 });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    test("should complete a test run", async () => {
      const result = await completeTestRun(testRunId, {
        total_tests: 10,
        passed: 8,
        failed: 1,
        errors: 1,
        skipped: 0,
        avg_latency_ms: 175,
      });

      expect(result.success).toBe(true);
      expect(result.data?.pass_rate).toBe(80);
      expect(result.data?.completed_at).toBeDefined();
    });

    test("should create a CI-triggered run", async () => {
      const result = await createTestRun({
        triggered_by: "ci",
        trigger_source: "main",
        total_tests: 50,
        passed: 0,
        failed: 0,
        errors: 0,
        skipped: 0,
        pass_rate: 0,
        avg_latency_ms: 0,
      });

      expect(result.success).toBe(true);
      expect(result.data?.triggered_by).toBe("ci");
      expect(result.data?.trigger_source).toBe("main");
    });
  });

  describe("Cross-Entity Operations", () => {
    let requirementId: string;
    let testCaseId: string;

    beforeAll(async () => {
      // Create requirement
      const reqResult = await createRequirement({
        user_intent: "Cross-entity test requirement",
        status: "captured",
        source: "test",
        linked_tests: [],
      });
      requirementId = reqResult.data!.requirement_id;

      // Create test case
      const caseResult = await createTestCase({
        type: "webhook",
        name: "Cross-entity test case",
        description: "For linking tests",
        input: {},
        expected_output: {},
        tags: ["link-test"],
        enabled: true,
      });
      testCaseId = caseResult.data!.test_id;
    });

    test("should link test case to requirement", async () => {
      const result = await linkTestToRequirement(testCaseId, requirementId);

      expect(result.testUpdate.success).toBe(true);
      expect(result.reqUpdate.success).toBe(true);
    });

    test("should get requirement coverage", async () => {
      const result = await getRequirementCoverage();

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe("Error Handling", () => {
    test("should handle non-existent requirement gracefully", async () => {
      const result = await getRequirement("REQ-NONEXISTENT-000");

      // Should return success: false or empty data
      expect(result.success === false || !result.data).toBe(true);
    });

    test("should handle non-existent test case gracefully", async () => {
      const result = await getTestCase("TC-NONEXISTENT-000");

      expect(result.success === false || !result.data).toBe(true);
    });

    test("should handle non-existent test run gracefully", async () => {
      const result = await getTestRun("RUN-NONEXISTENT-000");

      expect(result.success === false || !result.data).toBe(true);
    });
  });

  describe("Performance", () => {
    test("should create requirement in under 50ms", async () => {
      const start = Date.now();
      const result = await createRequirement({
        user_intent: "Performance test requirement",
        status: "captured",
        source: "perf-test",
        linked_tests: [],
      });
      const elapsed = Date.now() - start;

      expect(result.success).toBe(true);
      expect(elapsed).toBeLessThan(50); // Local storage should be much faster
    });

    test("should list requirements in under 50ms", async () => {
      const start = Date.now();
      const result = await listRequirements({ limit: 100 });
      const elapsed = Date.now() - start;

      expect(result.success).toBe(true);
      expect(elapsed).toBeLessThan(50);
    });

    test("should handle concurrent operations", async () => {
      const operations = Array(5).fill(null).map((_, i) =>
        createRequirement({
          user_intent: `Concurrent test ${i}`,
          status: "captured",
          source: "concurrent-test",
          linked_tests: [],
        })
      );

      const results = await Promise.all(operations);

      results.forEach((result) => {
        expect(result.success).toBe(true);
      });
    });
  });
});
