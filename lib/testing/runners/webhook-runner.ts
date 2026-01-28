/**
 * Webhook Test Runner
 *
 * Executes HTTP webhook tests and validates responses.
 */

import type { TestCase } from '../types';
import type {
  TestRunner,
  TestExecutionResult,
  RunOptions,
  WebhookTestConfig,
  WebhookExpectedOutput,
  AssertionResult,
} from './types';

const DEFAULT_TIMEOUT = 30000;

export class WebhookRunner implements TestRunner {
  readonly type = 'webhook' as const;

  async execute(testCase: TestCase, options?: RunOptions): Promise<TestExecutionResult> {
    const config = testCase.input as WebhookTestConfig;
    const expected = testCase.expected_output as WebhookExpectedOutput;
    const timeout = config.timeout_ms || options?.timeout || DEFAULT_TIMEOUT;

    const startTime = Date.now();
    const assertions: AssertionResult[] = [];

    try {
      // Build request
      const requestInit: RequestInit = {
        method: config.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
          ...options?.headers,
        },
        signal: AbortSignal.timeout(timeout),
      };

      if (config.body && config.method !== 'GET') {
        requestInit.body = JSON.stringify(config.body);
      }

      // Execute request
      const response = await fetch(config.url, requestInit);
      const latency_ms = Date.now() - startTime;

      // Parse response
      let responseBody: Record<string, unknown> = {};
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        try {
          responseBody = await response.json();
        } catch {
          responseBody = { _raw: await response.text() };
        }
      } else {
        responseBody = { _raw: await response.text() };
      }

      // Run assertions
      if (expected.status !== undefined) {
        assertions.push(this.assertStatus(response.status, expected.status));
      }

      if (expected.status_range) {
        assertions.push(this.assertStatusRange(response.status, expected.status_range));
      }

      if (expected.body) {
        assertions.push(this.assertBodyEquals(responseBody, expected.body));
      }

      if (expected.body_contains) {
        assertions.push(this.assertBodyContains(responseBody, expected.body_contains));
      }

      if (expected.headers) {
        for (const [key, value] of Object.entries(expected.headers)) {
          assertions.push(this.assertHeader(response.headers, key, value));
        }
      }

      if (expected.latency_max_ms) {
        assertions.push(this.assertLatency(latency_ms, expected.latency_max_ms));
      }

      // Calculate results
      const passed = assertions.filter(a => a.passed).length;
      const failed = assertions.filter(a => !a.passed).length;
      const allPassed = failed === 0;

      return {
        status: allPassed ? 'passed' : 'failed',
        actual_output: {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: responseBody,
        },
        latency_ms,
        assertions_passed: passed,
        assertions_failed: failed,
        error_message: allPassed
          ? undefined
          : assertions
              .filter(a => !a.passed)
              .map(a => a.message)
              .join('; '),
      };
    } catch (error) {
      const latency_ms = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        status: 'error',
        actual_output: { error: errorMessage },
        latency_ms,
        error_message: errorMessage,
        assertions_passed: 0,
        assertions_failed: 0,
      };
    }
  }

  validate(testCase: TestCase): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const config = testCase.input as WebhookTestConfig;

    if (!config.url) {
      errors.push('Missing required field: url');
    } else {
      try {
        new URL(config.url);
      } catch {
        errors.push(`Invalid URL: ${config.url}`);
      }
    }

    if (config.method && !['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(config.method)) {
      errors.push(`Invalid HTTP method: ${config.method}`);
    }

    return { valid: errors.length === 0, errors };
  }

  private assertStatus(actual: number, expected: number): AssertionResult {
    const passed = actual === expected;
    return {
      name: 'status',
      passed,
      expected,
      actual,
      message: passed ? undefined : `Expected status ${expected}, got ${actual}`,
    };
  }

  private assertStatusRange(
    actual: number,
    range: { min: number; max: number }
  ): AssertionResult {
    const passed = actual >= range.min && actual <= range.max;
    return {
      name: 'status_range',
      passed,
      expected: range,
      actual,
      message: passed
        ? undefined
        : `Expected status between ${range.min}-${range.max}, got ${actual}`,
    };
  }

  private assertBodyEquals(
    actual: Record<string, unknown>,
    expected: Record<string, unknown>
  ): AssertionResult {
    const passed = this.deepEquals(actual, expected);
    return {
      name: 'body_equals',
      passed,
      expected,
      actual,
      message: passed ? undefined : 'Response body does not match expected',
    };
  }

  private assertBodyContains(
    actual: Record<string, unknown>,
    expected: Record<string, unknown>
  ): AssertionResult {
    const passed = this.objectContains(actual, expected);
    return {
      name: 'body_contains',
      passed,
      expected,
      actual,
      message: passed ? undefined : 'Response body does not contain expected fields',
    };
  }

  private assertHeader(
    headers: Headers,
    key: string,
    expected: string
  ): AssertionResult {
    const actual = headers.get(key);
    const passed = actual === expected;
    return {
      name: `header:${key}`,
      passed,
      expected,
      actual,
      message: passed ? undefined : `Expected header ${key}="${expected}", got "${actual}"`,
    };
  }

  private assertLatency(actual: number, maxMs: number): AssertionResult {
    const passed = actual <= maxMs;
    return {
      name: 'latency',
      passed,
      expected: `<= ${maxMs}ms`,
      actual: `${actual}ms`,
      message: passed ? undefined : `Latency ${actual}ms exceeds max ${maxMs}ms`,
    };
  }

  private deepEquals(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) return a === b;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((item, i) => this.deepEquals(item, b[i]));
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const aObj = a as Record<string, unknown>;
      const bObj = b as Record<string, unknown>;
      const aKeys = Object.keys(aObj);
      const bKeys = Object.keys(bObj);
      if (aKeys.length !== bKeys.length) return false;
      return aKeys.every(key => this.deepEquals(aObj[key], bObj[key]));
    }

    return false;
  }

  private objectContains(obj: Record<string, unknown>, subset: Record<string, unknown>): boolean {
    for (const [key, value] of Object.entries(subset)) {
      if (!(key in obj)) return false;
      if (typeof value === 'object' && value !== null) {
        if (typeof obj[key] !== 'object' || obj[key] === null) return false;
        if (!this.objectContains(obj[key] as Record<string, unknown>, value as Record<string, unknown>)) {
          return false;
        }
      } else if (obj[key] !== value) {
        return false;
      }
    }
    return true;
  }
}

export const webhookRunner = new WebhookRunner();
