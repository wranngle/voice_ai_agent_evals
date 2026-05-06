/**
 * Webhook Test Runner
 *
 * Executes HTTP webhook tests and validates responses.
 */

import type {TestCase} from '../types';
import {signElevenLabsPayload} from '../../security/elevenlabs-signature';
import type {
  TestRunner,
  TestExecutionResult,
  RunOptions,
  WebhookTestConfig,
  WebhookExpectedOutput,
  AssertionResult,
} from './types';

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_ELEVENLABS_SIGNATURE_SECRET_ENV = 'ELEVENLABS_POST_CALL_SECRET';

// Fields that ONLY belong on expected_output. If a user puts any of these
// on `input`, the runner reads them from `expected_output` instead and the
// assertion silently no-ops. validate() rejects them with a redirect note.
// `body` and `headers` are deliberately excluded — they're dual-keyed
// (input sends them, expected_output asserts the response shape).
const WEBHOOK_EXPECTED_OUTPUT_ONLY_FIELDS = new Set([
  'status',
  'status_range',
  'body_contains',
  'body_array_contains',
  'body_truthy',
  'body_falsy',
  'body_defined',
  'latency_max_ms',
]);

// Full set of known expected_output keys. Used for fail-closed rejection of
// typo'd assertion fields. Mirrors codex's elevenlabs `EXPECTED_OUTPUT_FIELDS`
// pattern, which is `EXPECTED_OUTPUT_ONLY_FIELDS ∪ dual-keyed fields`.
const WEBHOOK_EXPECTED_OUTPUT_FIELDS = new Set([
  ...WEBHOOK_EXPECTED_OUTPUT_ONLY_FIELDS,
  'body',
  'headers',
]);

export class WebhookRunner implements TestRunner {
  readonly type = 'webhook' as const;

  async execute(testCase: TestCase, options?: RunOptions): Promise<TestExecutionResult> {
    const config = testCase.input as unknown as WebhookTestConfig;
    const expected = testCase.expected_output as WebhookExpectedOutput;
    const timeout = config.timeout_ms || options?.timeout || DEFAULT_TIMEOUT;

    const startTime = Date.now();
    const assertions: AssertionResult[] = [];

    try {
      // Build request. Resolve method ONCE — the body-attach check below
      // must consult the resolved value, not config.method (which is
      // optional). Previously `config.method !== 'GET'` was true when
      // config.method was undefined, attaching a body to what becomes a
      // GET request — invalid for many HTTP servers.
      const method = config.method ?? 'GET';
      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...config.headers,
        ...options?.headers,
      };
      const bodyText = config.body !== undefined && method !== 'GET'
        ? JSON.stringify(config.body)
        : undefined;

      if (config.sign_elevenlabs_payload) {
        if (bodyText === undefined) {
          throw new Error('ElevenLabs webhook signing requires a non-GET request with input.body');
        }

        const secretEnv = config.elevenlabs_signature_secret_env ?? DEFAULT_ELEVENLABS_SIGNATURE_SECRET_ENV;
        const sharedSecret = options?.env?.[secretEnv] ?? process.env[secretEnv];
        if (!sharedSecret) {
          throw new Error(`Missing ${secretEnv} for ElevenLabs webhook signing`);
        }

        const timestampSeconds = config.elevenlabs_signature_timestamp_secs
          ?? Math.floor(Date.now() / 1000);
        requestHeaders['ElevenLabs-Signature'] = signElevenLabsPayload(
          bodyText,
          sharedSecret,
          timestampSeconds,
        );
      }

      const requestInit: RequestInit = {
        method,
        headers: requestHeaders,
        signal: AbortSignal.timeout(timeout),
      };

      if (bodyText !== undefined) {
        requestInit.body = bodyText;
      }

      // Execute request
      const response = await fetch(config.url, requestInit);
      const latency_ms = Date.now() - startTime;

      // Parse response
      let responseBody: Record<string, unknown> = {};
      const contentType = response.headers.get('content-type') || '';
      const responseText = await response.text();

      if (contentType.includes('application/json')) {
        try {
          const parsed: unknown = JSON.parse(responseText);
          responseBody = isRecord(parsed) ? parsed : {_raw: responseText, _json: parsed};
        } catch {
          responseBody = {_raw: responseText};
        }
      } else {
        responseBody = {_raw: responseText};
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

      if (expected.body_array_contains) {
        for (const [path, expectedItems] of Object.entries(expected.body_array_contains)) {
          assertions.push(this.assertBodyArrayContains(responseBody, path, expectedItems));
        }
      }

      if (expected.body_truthy) {
        for (const path of expected.body_truthy) {
          assertions.push(this.assertBodyTruthy(responseBody, path));
        }
      }

      if (expected.body_falsy) {
        for (const path of expected.body_falsy) {
          assertions.push(this.assertBodyFalsy(responseBody, path));
        }
      }

      if (expected.body_defined) {
        for (const path of expected.body_defined) {
          assertions.push(this.assertBodyDefined(responseBody, path));
        }
      }

      if (expected.headers) {
        for (const [key, value] of Object.entries(expected.headers)) {
          assertions.push(this.assertHeader(response.headers, key, value));
        }
      }

      if (expected.latency_max_ms !== undefined) {
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
        actual_output: {error: errorMessage},
        latency_ms,
        error_message: errorMessage,
        assertions_passed: 0,
        assertions_failed: 0,
      };
    }
  }

  validate(testCase: TestCase): {valid: boolean; errors: string[]} {
    const errors: string[] = [];
    const config = testCase.input as unknown as WebhookTestConfig;
    const configRecord = (testCase.input ?? {});
    const expected = testCase.expected_output as unknown;

    if (config.url) {
      try {
        // eslint-disable-next-line no-new
        new URL(config.url);
      } catch {
        errors.push(`Invalid URL: ${config.url}`);
      }
    } else {
      errors.push('Missing required field: url');
    }

    if (config.method && !['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(config.method)) {
      errors.push(`Invalid HTTP method: ${config.method}`);
    }

    validateElevenLabsSigningConfig(config, errors);

    // Reject assertion fields placed on input — silent no-op otherwise.
    // `body` and `headers` are exempt (dual-keyed: request side + assertion side).
    for (const field of WEBHOOK_EXPECTED_OUTPUT_ONLY_FIELDS) {
      if (Object.hasOwn(configRecord, field)) {
        errors.push(`input.${field} is ignored by the webhook runner; move it to expected_output.${field}`);
      }
    }

    // Fail-closed on typo'd expected_output keys (e.g. `bodies` instead of
    // `body`, `latency_max` instead of `latency_max_ms`). Mirrors codex's
    // elevenlabs policy and pass-43's mcp policy.
    if (typeof expected === 'object' && expected !== null && !Array.isArray(expected)) {
      for (const field of Object.keys(expected)) {
        if (!WEBHOOK_EXPECTED_OUTPUT_FIELDS.has(field)) {
          errors.push(`expected_output.${field} is not recognized by the webhook runner`);
        }
      }
    }

    validateExpectedOutput(expected, errors);

    // A webhook test with zero assertions silently returns 'passed' regardless
    // of response. Reject empty expected_output so the runner can't claim
    // success without verifying anything. Mirrors codex's elevenlabs policy.
    if (
      typeof expected === 'object'
      && expected !== null
      && !Array.isArray(expected)
      && !hasWebhookAssertion(expected)
    ) {
      errors.push('expected_output must include at least one assertion for the webhook runner');
    }

    return {valid: errors.length === 0, errors};
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
    range: {min: number; max: number},
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
    expected: Record<string, unknown>,
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
    expected: Record<string, unknown>,
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

  private assertBodyArrayContains(
    actual: Record<string, unknown>,
    path: string,
    expectedItems: unknown[],
  ): AssertionResult {
    const value = getPathValue(actual, path);
    const arrayValue = Array.isArray(value.value) ? value.value : undefined;
    const missingItems = arrayValue
      ? expectedItems.filter(expectedItem =>
        !arrayValue.some(actualItem => this.arrayItemMatches(actualItem, expectedItem)))
      : expectedItems;
    const passed = value.exists && Array.isArray(arrayValue) && missingItems.length === 0;

    return {
      name: `body_array_contains:${path}`,
      passed,
      expected: expectedItems,
      actual: value.exists ? value.value : 'missing',
      message: passed
        ? undefined
        : `Expected response body array "${path}" to contain ${JSON.stringify(missingItems)}`,
    };
  }

  private assertBodyTruthy(actual: Record<string, unknown>, path: string): AssertionResult {
    const value = getPathValue(actual, path);
    const passed = Boolean(value.value);
    return {
      name: `body_truthy:${path}`,
      passed,
      expected: 'truthy',
      actual: value.exists ? value.value : 'missing',
      message: passed ? undefined : `Expected response body field "${path}" to be truthy`,
    };
  }

  private assertBodyFalsy(actual: Record<string, unknown>, path: string): AssertionResult {
    const value = getPathValue(actual, path);
    const passed = value.exists && !value.value;
    return {
      name: `body_falsy:${path}`,
      passed,
      expected: 'falsy',
      actual: value.exists ? value.value : 'missing',
      message: passed ? undefined : `Expected response body field "${path}" to be falsy`,
    };
  }

  private assertBodyDefined(actual: Record<string, unknown>, path: string): AssertionResult {
    const value = getPathValue(actual, path);
    const passed = value.exists && value.value !== undefined;
    return {
      name: `body_defined:${path}`,
      passed,
      expected: 'defined',
      actual: value.exists ? value.value : 'missing',
      message: passed ? undefined : `Expected response body field "${path}" to be defined`,
    };
  }

  private assertHeader(
    headers: Headers,
    key: string,
    expected: string,
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
    if (a === b) {
      return true;
    }

    if (typeof a !== typeof b) {
      return false;
    }

    if (a === null || b === null) {
      return a === b;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        return false;
      }

      return a.every((item, i) => this.deepEquals(item, b[i]));
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const aObject = a as Record<string, unknown>;
      const bObject = b as Record<string, unknown>;
      const aKeys = Object.keys(aObject);
      const bKeys = Object.keys(bObject);
      if (aKeys.length !== bKeys.length) {
        return false;
      }

      return aKeys.every(key => this.deepEquals(aObject[key], bObject[key]));
    }

    return false;
  }

  private objectContains(object: Record<string, unknown>, subset: Record<string, unknown>): boolean {
    for (const [key, value] of Object.entries(subset)) {
      if (!(key in object)) {
        return false;
      }

      if (typeof value === 'object' && value !== null) {
        if (typeof object[key] !== 'object' || object[key] === null) {
          return false;
        }

        if (!this.objectContains(object[key] as Record<string, unknown>, value as Record<string, unknown>)) {
          return false;
        }
      } else if (object[key] !== value) {
        return false;
      }
    }

    return true;
  }

  private arrayItemMatches(actual: unknown, expected: unknown): boolean {
    if (isRecord(actual) && isRecord(expected)) {
      return this.objectContains(actual, expected);
    }

    return this.deepEquals(actual, expected);
  }
}

function validateElevenLabsSigningConfig(config: WebhookTestConfig, errors: string[]): void {
  if (
    config.sign_elevenlabs_payload !== undefined
    && typeof config.sign_elevenlabs_payload !== 'boolean'
  ) {
    errors.push('input.sign_elevenlabs_payload must be a boolean when present');
  }

  if (
    config.elevenlabs_signature_secret_env !== undefined
    && !hasText(config.elevenlabs_signature_secret_env)
  ) {
    errors.push('input.elevenlabs_signature_secret_env must be a non-empty string when present');
  }

  if (
    config.elevenlabs_signature_timestamp_secs !== undefined
    && (!Number.isInteger(config.elevenlabs_signature_timestamp_secs)
      || config.elevenlabs_signature_timestamp_secs < 0)
  ) {
    errors.push('input.elevenlabs_signature_timestamp_secs must be a non-negative integer when present');
  }

  if (config.sign_elevenlabs_payload === true) {
    const method = config.method ?? 'GET';
    if (method === 'GET') {
      errors.push('input.sign_elevenlabs_payload requires a non-GET method');
    }

    if (config.body === undefined) {
      errors.push('input.sign_elevenlabs_payload requires input.body');
    }
  }
}

function getPathValue(object: Record<string, unknown>, path: string): {exists: boolean; value: unknown} {
  const parts = path.split('.');
  let current: unknown = object;

  for (const part of parts) {
    if (
      typeof current !== 'object'
      || current === null
      || !Object.hasOwn(current, part)
    ) {
      return {exists: false, value: undefined};
    }

    current = (current as Record<string, unknown>)[part];
  }

  return {exists: true, value: current};
}

function validateExpectedOutput(expected: unknown, errors: string[]): void {
  if (!isRecord(expected)) {
    errors.push('expected_output must be an object');
    return;
  }

  if (expected.status !== undefined && !isHttpStatus(expected.status)) {
    errors.push('expected_output.status must be an integer HTTP status code between 100 and 599');
  }

  if (expected.status_range !== undefined) {
    validateStatusRange(expected.status_range, errors);
  }

  if (expected.body !== undefined && !isRecord(expected.body)) {
    errors.push('expected_output.body must be an object when present');
  }

  if (expected.body_contains !== undefined && !isRecord(expected.body_contains)) {
    errors.push('expected_output.body_contains must be an object when present');
  }

  validateBodyArrayContains(expected.body_array_contains, errors);
  validatePathArray(expected.body_truthy, 'expected_output.body_truthy', errors);
  validatePathArray(expected.body_falsy, 'expected_output.body_falsy', errors);
  validatePathArray(expected.body_defined, 'expected_output.body_defined', errors);

  if (expected.headers !== undefined) {
    validateHeaderExpectations(expected.headers, errors);
  }

  if (
    expected.latency_max_ms !== undefined
    && (typeof expected.latency_max_ms !== 'number'
      || !Number.isFinite(expected.latency_max_ms)
      || expected.latency_max_ms < 0)
  ) {
    errors.push('expected_output.latency_max_ms must be a non-negative finite number');
  }
}

function validateStatusRange(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('expected_output.status_range must be an object with min and max status codes');
    return;
  }

  if (!isHttpStatus(value.min)) {
    errors.push('expected_output.status_range.min must be an integer HTTP status code between 100 and 599');
  }

  if (!isHttpStatus(value.max)) {
    errors.push('expected_output.status_range.max must be an integer HTTP status code between 100 and 599');
  }

  if (isHttpStatus(value.min) && isHttpStatus(value.max) && value.min > value.max) {
    errors.push('expected_output.status_range.min must be less than or equal to max');
  }
}

function validateBodyArrayContains(value: unknown, errors: string[]): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    errors.push('expected_output.body_array_contains must be an object keyed by response body path');
    return;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    errors.push('expected_output.body_array_contains must include at least one path when present');
  }

  for (const [path, expectedItems] of entries) {
    if (path.trim() === '') {
      errors.push('expected_output.body_array_contains keys must be non-empty response body paths');
    }

    if (!Array.isArray(expectedItems)) {
      errors.push(`expected_output.body_array_contains.${path} must be an array`);
      continue;
    }

    if (expectedItems.length === 0) {
      errors.push(`expected_output.body_array_contains.${path} must include at least one expected item`);
    }
  }
}

function validatePathArray(value: unknown, label: string, errors: string[]): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array of non-empty strings`);
    return;
  }

  if (value.length === 0) {
    errors.push(`${label} must include at least one item when present`);
    return;
  }

  for (const [index, item] of value.entries()) {
    if (typeof item !== 'string' || item.trim() === '') {
      errors.push(`${label}[${index}] must be a non-empty string`);
    }
  }
}

function validateHeaderExpectations(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('expected_output.headers must be an object when present');
    return;
  }

  for (const [key, headerValue] of Object.entries(value)) {
    if (key.trim() === '') {
      errors.push('expected_output.headers keys must be non-empty strings');
    }

    if (typeof headerValue !== 'string') {
      errors.push(`expected_output.headers.${key} must be a string`);
    }
  }
}

function isHttpStatus(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= 100
    && value <= 599;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function hasNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function hasNonEmptyRecord(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length > 0;
}

/**
 * A webhook test must declare at least one assertion. Without this guard,
 * `expected_output: {}` returns `status: 'passed'` regardless of what the
 * server actually responded.
 */
function hasWebhookAssertion(expected: WebhookExpectedOutput): boolean {
  return typeof expected.status === 'number'
    || isRecord(expected.status_range)
    || isRecord(expected.body)
    || hasNonEmptyRecord(expected.body_contains)
    || hasNonEmptyArray(expected.body_truthy)
    || hasNonEmptyArray(expected.body_falsy)
    || hasNonEmptyArray(expected.body_defined)
    || hasNonEmptyRecord(expected.body_array_contains)
    || hasNonEmptyRecord(expected.headers)
    || typeof expected.latency_max_ms === 'number';
}

export const webhookRunner = new WebhookRunner();
