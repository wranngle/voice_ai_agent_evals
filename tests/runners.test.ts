/**
 * Test Runner Tests
 *
 * Tests for the webhook runner and orchestrator.
 */

import { describe, it, expect, test, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import {
  WebhookRunner,
  webhookRunner,
  TestOrchestrator,
  orchestrator,
  runTests,
  createTestCase,
  listTestCases,
  listTestRuns,
  getResultsByRun,
  clearAllDataSync,
} from "../lib/testing";
import type { TestCase } from "../lib/testing";

const UNIQUE_STORAGE_DIR = join(process.cwd(), '.test-data-runners-' + process.pid);

describe("Test Runners", () => {
  beforeAll(() => {
    process.env.TEST_STORAGE_DIR = UNIQUE_STORAGE_DIR;
    mkdirSync(UNIQUE_STORAGE_DIR, { recursive: true });
    clearAllDataSync();
  });

  afterAll(() => {
    clearAllDataSync();
    try { rmSync(UNIQUE_STORAGE_DIR, { recursive: true, force: true }); } catch {}
    delete process.env.TEST_STORAGE_DIR;
  });

  describe("WebhookRunner", () => {
    const runner = new WebhookRunner();

    test("should have correct type", () => {
      expect(runner.type).toBe("webhook");
    });

    test("should validate test case with valid URL", () => {
      const testCase: TestCase = {
        test_id: "TC-TEST-001",
        type: "webhook",
        name: "Valid test",
        description: "Test with valid URL",
        input: {
          url: "https://example.com/api",
          method: "GET",
        },
        expected_output: {
          status: 200,
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test("should reject test case with missing URL", () => {
      const testCase: TestCase = {
        test_id: "TC-TEST-002",
        type: "webhook",
        name: "Invalid test",
        description: "Test without URL",
        input: {
          method: "GET",
        },
        expected_output: {},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain("Missing required field: url");
    });

    test("should reject test case with invalid URL", () => {
      const testCase: TestCase = {
        test_id: "TC-TEST-003",
        type: "webhook",
        name: "Invalid URL test",
        description: "Test with malformed URL",
        input: {
          url: "not-a-valid-url",
          method: "GET",
        },
        expected_output: {},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(false);
      expect(validation.errors[0]).toMatch(/Invalid URL/);
    });

    test("should execute GET request successfully", async () => {
      const testCase: TestCase = {
        test_id: "TC-TEST-004",
        type: "webhook",
        name: "GET request test",
        description: "Test GET request to httpbin",
        input: {
          url: "https://httpbin.org/get",
          method: "GET",
        },
        expected_output: {
          status: 200,
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase, { timeout: 10000 });

      expect(result.status).toBe("passed");
      expect(result.actual_output.status).toBe(200);
      expect(result.latency_ms).toBeGreaterThan(0);
      expect(result.assertions_passed).toBeGreaterThan(0);
      expect(result.assertions_failed).toBe(0);
    });

    test("should execute POST request successfully", async () => {
      const testCase: TestCase = {
        test_id: "TC-TEST-005",
        type: "webhook",
        name: "POST request test",
        description: "Test POST request to httpbin",
        input: {
          url: "https://httpbin.org/post",
          method: "POST",
          body: { test: "data", number: 42 },
        },
        expected_output: {
          status: 200,
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase, { timeout: 10000 });

      expect(result.status).toBe("passed");
      expect(result.actual_output.status).toBe(200);
    });

    test("should fail when status does not match", async () => {
      const testCase: TestCase = {
        test_id: "TC-TEST-006",
        type: "webhook",
        name: "Status mismatch test",
        description: "Test expecting wrong status",
        input: {
          url: "https://httpbin.org/get",
          method: "GET",
        },
        expected_output: {
          status: 404, // Wrong expectation
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase, { timeout: 10000 });

      expect(result.status).toBe("failed");
      expect(result.assertions_failed).toBeGreaterThan(0);
      expect(result.error_message).toMatch(/Expected status 404/);
    });

    test("should check latency constraint", async () => {
      const testCase: TestCase = {
        test_id: "TC-TEST-007",
        type: "webhook",
        name: "Latency test",
        description: "Test with unrealistic latency constraint",
        input: {
          url: "https://httpbin.org/get",
          method: "GET",
        },
        expected_output: {
          status: 200,
          latency_max_ms: 1, // Unrealistically low
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase, { timeout: 10000 });

      expect(result.status).toBe("failed");
      expect(result.error_message).toMatch(/exceeds max/);
    });

    test("should handle network errors gracefully", async () => {
      const testCase: TestCase = {
        test_id: "TC-TEST-008",
        type: "webhook",
        name: "Network error test",
        description: "Test to non-existent host",
        input: {
          url: "https://this-domain-does-not-exist-12345.com/api",
          method: "GET",
        },
        expected_output: {
          status: 200,
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase, { timeout: 5000 });

      expect(result.status).toBe("error");
      expect(result.error_message).toBeDefined();
    });

    test("should check body contains", async () => {
      const testCase: TestCase = {
        test_id: "TC-TEST-009",
        type: "webhook",
        name: "Body contains test",
        description: "Test body contains check",
        input: {
          url: "https://httpbin.org/json",
          method: "GET",
        },
        expected_output: {
          status: 200,
          body_contains: {
            slideshow: {
              title: "Sample Slide Show",
            },
          },
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase, { timeout: 10000 });

      expect(result.status).toBe("passed");
      expect(result.assertions_passed).toBeGreaterThan(0);
    });
  });

  describe("TestOrchestrator", () => {
    beforeEach(() => {
      clearAllDataSync();
    });

    test("should have webhook runner registered", () => {
      const runner = orchestrator.getRunner("webhook");
      expect(runner).toBeDefined();
      expect(runner?.type).toBe("webhook");
    });

    test("should run empty test suite", async () => {
      const summary = await runTests({ type: "webhook" });

      expect(summary.total_tests).toBe(0);
      expect(summary.passed).toBe(0);
      expect(summary.failed).toBe(0);
      expect(summary.execution_id).toMatch(/^RUN-/);
    });

    test("should run tests and record results", async () => {
      // Create a test case
      await createTestCase({
        type: "webhook",
        name: "Orchestrator test case",
        description: "Test for orchestrator",
        input: {
          url: "https://httpbin.org/get",
          method: "GET",
        },
        expected_output: {
          status: 200,
        },
        tags: ["orchestrator-test"],
        enabled: true,
      });

      // Run tests
      const summary = await runTests({
        type: "webhook",
        tag: "orchestrator-test",
        timeout: 10000,
      });

      expect(summary.total_tests).toBe(1);
      expect(summary.passed).toBe(1);
      expect(summary.failed).toBe(0);
      expect(summary.pass_rate).toBe(100);

      // Verify results were recorded
      const results = await getResultsByRun(summary.execution_id);
      expect(results.data).toHaveLength(1);
      expect(results.data![0].status).toBe("passed");

      // Verify run was recorded
      const runs = await listTestRuns({ limit: 1 });
      expect(runs.data).toHaveLength(1);
      expect(runs.data![0].execution_id).toBe(summary.execution_id);
    });

    test("should handle mixed pass/fail results", async () => {
      // Create passing test
      await createTestCase({
        type: "webhook",
        name: "Passing test",
        description: "Should pass",
        input: {
          url: "https://httpbin.org/get",
          method: "GET",
        },
        expected_output: {
          status: 200,
        },
        tags: ["mixed-test"],
        enabled: true,
      });

      // Create failing test
      await createTestCase({
        type: "webhook",
        name: "Failing test",
        description: "Should fail",
        input: {
          url: "https://httpbin.org/get",
          method: "GET",
        },
        expected_output: {
          status: 404, // Will fail
        },
        tags: ["mixed-test"],
        enabled: true,
      });

      const summary = await runTests({
        type: "webhook",
        tag: "mixed-test",
        timeout: 10000,
      });

      expect(summary.total_tests).toBe(2);
      expect(summary.passed).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.pass_rate).toBe(50);
      expect(summary.failures).toHaveLength(1);
    });

    test("should respect failFast option", async () => {
      // Create failing test first
      await createTestCase({
        type: "webhook",
        name: "Failing test",
        description: "Should fail first",
        input: {
          url: "https://httpbin.org/status/404",
          method: "GET",
        },
        expected_output: {
          status: 200, // Will fail
        },
        tags: ["failfast-test"],
        enabled: true,
      });

      // Create passing test second
      await createTestCase({
        type: "webhook",
        name: "Passing test",
        description: "Should not run",
        input: {
          url: "https://httpbin.org/get",
          method: "GET",
        },
        expected_output: {
          status: 200,
        },
        tags: ["failfast-test"],
        enabled: true,
      });

      const summary = await runTests({
        type: "webhook",
        tag: "failfast-test",
        failFast: true,
        timeout: 10000,
      });

      // With failFast, should stop after first failure
      expect(summary.failures).toHaveLength(1);
    });

    test("should filter by tag", async () => {
      await createTestCase({
        type: "webhook",
        name: "Tagged test A",
        description: "Has tag A",
        input: { url: "https://httpbin.org/get", method: "GET" },
        expected_output: { status: 200 },
        tags: ["tag-a"],
        enabled: true,
      });

      await createTestCase({
        type: "webhook",
        name: "Tagged test B",
        description: "Has tag B",
        input: { url: "https://httpbin.org/get", method: "GET" },
        expected_output: { status: 200 },
        tags: ["tag-b"],
        enabled: true,
      });

      const summaryA = await runTests({ tag: "tag-a", timeout: 10000 });
      expect(summaryA.total_tests).toBe(1);

      const summaryB = await runTests({ tag: "tag-b", timeout: 10000 });
      expect(summaryB.total_tests).toBe(1);
    });

    test("should skip disabled tests by default", async () => {
      await createTestCase({
        type: "webhook",
        name: "Enabled test",
        description: "Should run",
        input: { url: "https://httpbin.org/get", method: "GET" },
        expected_output: { status: 200 },
        tags: ["enabled-test"],
        enabled: true,
      });

      await createTestCase({
        type: "webhook",
        name: "Disabled test",
        description: "Should not run",
        input: { url: "https://httpbin.org/get", method: "GET" },
        expected_output: { status: 200 },
        tags: ["enabled-test"],
        enabled: false,
      });

      const summary = await runTests({ tag: "enabled-test", timeout: 10000 });
      expect(summary.total_tests).toBe(1);
    });
  });
});
