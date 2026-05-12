/**
 * Test Runner Tests
 *
 * Tests for the webhook runner and orchestrator.
 */

import {mkdirSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {
  describe, expect, test, beforeAll, afterAll, beforeEach, afterEach, vi,
} from 'vitest';
import {
  WebhookRunner,
  orchestrator,
  runTests,
  createTestCase,
  listTestRuns,
  getResultsByRun,
  clearAllDataSync, type TestCase,
} from '../../src/testing';
import {verifyElevenLabsSignature} from '../../src/security/elevenlabs-signature';

const UNIQUE_STORAGE_DIR = join(process.cwd(), '.test-data-runners-' + process.pid);
const SIGNATURE_SECRET = 'runner-test-elevenlabs-secret';
const SIGNATURE_TIMESTAMP_SECS = 1_700_000_000;

/**
 * Mock globalThis.fetch with a JSON response. Use `times` for tests that
 * run multiple test cases through the orchestrator (each test case = one
 * fetch); default times=1 covers single-runner-call tests.
 */
function mockFetch(status: number, body: unknown, times = 1) {
  const spy = vi.spyOn(globalThis, 'fetch');
  for (let i = 0; i < times; i++) {
    spy.mockResolvedValueOnce(new Response(JSON.stringify(body), {
      status,
      headers: {'Content-Type': 'application/json'},
    }));
  }
}

describe('Test Runners', () => {
  beforeAll(() => {
    process.env.TEST_STORAGE_DIR = UNIQUE_STORAGE_DIR;
    mkdirSync(UNIQUE_STORAGE_DIR, {recursive: true});
    clearAllDataSync();
  });

  afterAll(() => {
    clearAllDataSync();
    try {
      rmSync(UNIQUE_STORAGE_DIR, {recursive: true, force: true});
    } catch {}

    delete process.env.TEST_STORAGE_DIR;
  });

  describe('WebhookRunner', () => {
    const runner = new WebhookRunner();

    test('should have correct type', () => {
      expect(runner.type).toBe('webhook');
    });

    test('should validate test case with valid URL', () => {
      const testCase: TestCase = {
        test_id: 'TC-TEST-001',
        type: 'webhook',
        name: 'Valid test',
        description: 'Test with valid URL',
        input: {
          url: 'https://example.com/api',
          method: 'GET',
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

    test('should reject test case with missing URL', () => {
      const testCase: TestCase = {
        test_id: 'TC-TEST-002',
        type: 'webhook',
        name: 'Invalid test',
        description: 'Test without URL',
        input: {
          method: 'GET',
        },
        expected_output: {},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Missing required field: url');
    });

    test('should reject test case with invalid URL', () => {
      const testCase: TestCase = {
        test_id: 'TC-TEST-003',
        type: 'webhook',
        name: 'Invalid URL test',
        description: 'Test with malformed URL',
        input: {
          url: 'not-a-valid-url',
          method: 'GET',
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

    test('should reject empty expected_output (silent-green guard)', () => {
      // Without an assertion, the runner returns 'passed' regardless of what
      // the server returned. Mirrors codex's elevenlabs policy applied to
      // webhook to close the same silent-green class.
      const testCase: TestCase = {
        test_id: 'TC-TEST-EMPTY',
        type: 'webhook',
        name: 'Empty expected_output',
        description: 'Webhook test without assertions should fail validation',
        input: {
          url: 'https://example.com/api',
          method: 'GET',
        },
        expected_output: {},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('expected_output must include at least one assertion for the webhook runner');
    });

    test('should reject expected_output-only fields placed on input', () => {
      // Misplaced assertion fields on input would silently no-op — the
      // runner reads them only from `expected_output`. validate() must
      // catch each such field with a redirect message.
      const testCase: TestCase = {
        test_id: 'TC-TEST-MISPLACED',
        type: 'webhook',
        name: 'Misplaced assertion fields',
        description: 'status / body_contains / latency_max_ms on input',
        input: {
          url: 'https://example.com/api',
          method: 'POST',
          status: 200,
          body_contains: {ok: true},
          latency_max_ms: 500,
        },
        expected_output: {},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('input.status is ignored by the webhook runner; move it to expected_output.status');
      expect(validation.errors).toContain('input.body_contains is ignored by the webhook runner; move it to expected_output.body_contains');
      expect(validation.errors).toContain('input.latency_max_ms is ignored by the webhook runner; move it to expected_output.latency_max_ms');
    });

    test('should still accept body and headers on input (dual-keyed)', () => {
      // `body` and `headers` are deliberately exempt from the rejection
      // list — input sends them on the request, expected_output asserts
      // them on the response. Regression guard for that exemption.
      const testCase: TestCase = {
        test_id: 'TC-TEST-DUAL',
        type: 'webhook',
        name: 'Dual-keyed body and headers',
        description: 'body and headers may legitimately appear on input',
        input: {
          url: 'https://example.com/api',
          method: 'POST',
          body: {hello: 'world'},
          headers: {'X-Custom': 'yes'},
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

    test('should reject typo\'d expected_output keys (fail-closed on unknown fields)', () => {
      // `bodies` is a likely typo of `body`; `latency_max` is a typo of
      // `latency_max_ms`. Without fail-closed validation, both silently no-op.
      // Mirrors codex's elevenlabs policy applied to webhook.
      const testCase: TestCase = {
        test_id: 'TC-TEST-TYPO',
        type: 'webhook',
        name: 'Typo in expected_output',
        description: 'Typo\'d assertion keys should fail validation',
        input: {
          url: 'https://example.com/api',
          method: 'GET',
        },
        expected_output: {
          status: 200,
          bodies: {ok: true},
          latency_max: 500,
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('expected_output.bodies is not recognized by the webhook runner');
      expect(validation.errors).toContain('expected_output.latency_max is not recognized by the webhook runner');
    });

    test('should reject malformed expected_output assertions before execution', () => {
      const testCase: TestCase = {
        test_id: 'TC-TEST-BAD-EXPECTED',
        type: 'webhook',
        name: 'Malformed expected output',
        description: 'Invalid assertion config should fail validate()',
        input: {
          url: 'https://example.com/api',
          method: 'GET',
        },
        expected_output: {
          status: '200',
          status_range: {min: 500, max: 200},
          body_contains: 'ok',
          body_array_contains: {caller_labels: 'confused', tool_trace: []},
          body_truthy: ['processed', 123],
          body_falsy: [],
          headers: {'X-Trace': 42},
          latency_max_ms: 'fast',
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('expected_output.status must be an integer HTTP status code between 100 and 599');
      expect(validation.errors).toContain('expected_output.status_range.min must be less than or equal to max');
      expect(validation.errors).toContain('expected_output.body_contains must be an object when present');
      expect(validation.errors).toContain('expected_output.body_array_contains.caller_labels must be an array');
      expect(validation.errors).toContain('expected_output.body_array_contains.tool_trace must include at least one expected item');
      expect(validation.errors).toContain('expected_output.body_truthy[1] must be a non-empty string');
      expect(validation.errors).toContain('expected_output.body_falsy must include at least one item when present');
      expect(validation.errors).toContain('expected_output.headers.X-Trace must be a string');
      expect(validation.errors).toContain('expected_output.latency_max_ms must be a non-negative finite number');
    });

    test('should reject malformed ElevenLabs signing config before execution', () => {
      const testCase: TestCase = {
        test_id: 'TC-TEST-BAD-SIGNING',
        type: 'webhook',
        name: 'Malformed ElevenLabs signing config',
        description: 'Invalid signature replay config should fail validate()',
        input: {
          url: 'https://example.com/api',
          method: 'GET',
          sign_elevenlabs_payload: true,
          elevenlabs_signature_secret_env: '',
          elevenlabs_signature_timestamp_secs: -1,
        },
        expected_output: {},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('input.elevenlabs_signature_secret_env must be a non-empty string when present');
      expect(validation.errors).toContain('input.elevenlabs_signature_timestamp_secs must be a non-negative integer when present');
      expect(validation.errors).toContain('input.sign_elevenlabs_payload requires a non-GET method');
      expect(validation.errors).toContain('input.sign_elevenlabs_payload requires input.body');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    test('should execute GET request successfully', async () => {
      mockFetch(200, {ok: true});
      const testCase: TestCase = {
        test_id: 'TC-TEST-004',
        type: 'webhook',
        name: 'GET request test',
        description: 'Test GET request',
        input: {url: 'https://example.com/get', method: 'GET'},
        expected_output: {status: 200},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase, {timeout: 10_000});

      expect(result.status).toBe('passed');
      expect(result.actual_output.status).toBe(200);
      expect(result.latency_ms).toBeGreaterThanOrEqual(0);
      expect(result.assertions_passed).toBeGreaterThan(0);
      expect(result.assertions_failed).toBe(0);
    });

    test('should execute POST request successfully', async () => {
      mockFetch(200, {ok: true});
      const testCase: TestCase = {
        test_id: 'TC-TEST-005',
        type: 'webhook',
        name: 'POST request test',
        description: 'Test POST request',
        input: {
          url: 'https://example.com/post',
          method: 'POST',
          body: {test: 'data', number: 42},
        },
        expected_output: {status: 200},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase, {timeout: 10_000});

      expect(result.status).toBe('passed');
      expect(result.actual_output.status).toBe(200);
    });

    test('should sign ElevenLabs post-call webhook replay bodies', async () => {
      const response = new Response('{"ok":true}', {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      });
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
      const testCase: TestCase = {
        test_id: 'TC-TEST-ELEVENLABS-SIGNED',
        type: 'webhook',
        name: 'Signed ElevenLabs post-call replay',
        description: 'Post-call webhook replay with HMAC header',
        input: {
          url: 'https://example.com/post-call',
          method: 'POST',
          body: {
            type: 'post_call_transcription',
            data: {
              conversation_id: 'conv_replay_001',
              has_audio: true,
              has_user_audio: true,
              has_response_audio: true,
            },
          },
          sign_elevenlabs_payload: true,
          elevenlabs_signature_secret_env: 'RUNNER_TEST_ELEVENLABS_SECRET',
          elevenlabs_signature_timestamp_secs: SIGNATURE_TIMESTAMP_SECS,
        },
        expected_output: {status: 200},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase, {
        timeout: 10_000,
        env: {
          RUNNER_TEST_ELEVENLABS_SECRET: SIGNATURE_SECRET,
        },
      });

      expect(result.status).toBe('passed');

      const [, init] = fetchSpy.mock.calls[0];
      if (typeof init?.body !== 'string') {
        throw new TypeError('Expected signed webhook replay body to be a string');
      }

      const sentBody = init.body;
      const headers = init?.headers as Record<string, string>;
      expect(sentBody).toBe(JSON.stringify(testCase.input.body));
      expect(headers['ElevenLabs-Signature'].startsWith('t=1700000000,v0=')).toBe(true);
      expect(verifyElevenLabsSignature(
        sentBody,
        headers['ElevenLabs-Signature'],
        SIGNATURE_SECRET,
        {now: () => SIGNATURE_TIMESTAMP_SECS * 1000},
      )).toEqual({ok: true});
    });

    test('should fail signed webhook replay when the secret env var is missing', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const testCase: TestCase = {
        test_id: 'TC-TEST-ELEVENLABS-SIGNING-MISSING-SECRET',
        type: 'webhook',
        name: 'Missing signing secret',
        description: 'Signed replay should not send unsigned payloads',
        input: {
          url: 'https://example.com/post-call',
          method: 'POST',
          body: {type: 'post_call_transcription', data: {conversation_id: 'conv_replay_002'}},
          sign_elevenlabs_payload: true,
          elevenlabs_signature_secret_env: 'RUNNER_TEST_MISSING_SECRET',
        },
        expected_output: {status: 200},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      delete process.env.RUNNER_TEST_MISSING_SECRET;

      const result = await runner.execute(testCase, {
        timeout: 10_000,
        env: {},
      });

      expect(result.status).toBe('error');
      expect(result.error_message).toContain('Missing RUNNER_TEST_MISSING_SECRET for ElevenLabs webhook signing');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    test('should NOT attach body to implicit GET (regression: method undefined + body present)', async () => {
      // When config.method is undefined the runner resolves it to 'GET'.
      // Previously the body-attach check looked at config.method (still
      // undefined), saw `undefined !== 'GET'`, and attached a body to
      // what became a GET request — invalid for many HTTP servers.
      const response = new Response('{"ok":true}', {status: 200, headers: {'Content-Type': 'application/json'}});
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
      const testCase: TestCase = {
        test_id: 'TC-TEST-005-regression',
        type: 'webhook',
        name: 'Implicit GET with body present',
        description: 'method undefined, body present',
        input: {url: 'https://example.com/get', body: {oops: 'should not be sent'}},
        expected_output: {status: 200},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await runner.execute(testCase, {timeout: 10_000});

      const [, init] = fetchSpy.mock.calls[0];
      expect(init?.method).toBe('GET');
      expect(init?.body).toBeUndefined();
    });

    test('should fail when status does not match', async () => {
      mockFetch(200, {ok: true});
      const testCase: TestCase = {
        test_id: 'TC-TEST-006',
        type: 'webhook',
        name: 'Status mismatch test',
        description: 'Test expecting wrong status',
        input: {url: 'https://example.com/get', method: 'GET'},
        expected_output: {status: 404},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase, {timeout: 10_000});

      expect(result.status).toBe('failed');
      expect(result.assertions_failed).toBeGreaterThan(0);
      expect(result.error_message).toMatch(/Expected status 404/);
    });

    test('should handle network errors gracefully', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));
      const testCase: TestCase = {
        test_id: 'TC-TEST-008',
        type: 'webhook',
        name: 'Network error test',
        description: 'Test to non-existent host',
        input: {url: 'https://example.com/get', method: 'GET'},
        expected_output: {status: 200},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase, {timeout: 5000});

      expect(result.status).toBe('error');
      expect(result.error_message).toBeDefined();
    });

    test('should preserve malformed JSON webhook responses as raw body evidence', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{"ok":', {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      }));
      const testCase: TestCase = {
        test_id: 'TC-TEST-MALFORMED-JSON',
        type: 'webhook',
        name: 'Malformed JSON response',
        description: 'Bad JSON should fail assertions, not crash response parsing',
        input: {url: 'https://example.com/bad-json', method: 'GET'},
        expected_output: {
          status: 200,
          body_contains: {ok: true},
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase, {timeout: 10_000});

      expect(result.status).toBe('failed');
      expect(result.actual_output.body).toEqual({_raw: '{"ok":'});
      expect(result.error_message).toContain('Response body does not contain expected fields');
    });

    test('should check body contains', async () => {
      mockFetch(200, {slideshow: {title: 'Sample Slide Show', author: 'Yours Truly'}});
      const testCase: TestCase = {
        test_id: 'TC-TEST-009',
        type: 'webhook',
        name: 'Body contains test',
        description: 'Test body contains check',
        input: {url: 'https://example.com/json', method: 'GET'},
        expected_output: {
          status: 200,
          body_contains: {slideshow: {title: 'Sample Slide Show'}},
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase, {timeout: 10_000});

      expect(result.status).toBe('passed');
      expect(result.assertions_passed).toBeGreaterThan(0);
    });

    test('should check response body array membership by path', async () => {
      mockFetch(200, {
        caller_labels: ['confused', 'billing', 'needs-followup'],
        tool_trace: [
          {name: 'lookup_record', status: 'success', latency_ms: 410},
          {name: 'send_sms', status: 'skipped'},
        ],
      });
      const testCase: TestCase = {
        test_id: 'TC-TEST-009-ARRAY-CONTAINS',
        type: 'webhook',
        name: 'Historical call array membership',
        description: 'Caller labels and tool traces should be assertable without relying on array order',
        input: {url: 'https://example.com/json', method: 'GET'},
        expected_output: {
          status: 200,
          body_array_contains: {
            caller_labels: ['confused', 'needs-followup'],
            tool_trace: [{name: 'lookup_record', status: 'success'}],
          },
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase, {timeout: 10_000});

      expect(result.status).toBe('passed');
      expect(result.assertions_passed).toBe(3);
      expect(result.assertions_failed).toBe(0);
    });

    test('should fail response body array membership when expected items are absent', async () => {
      mockFetch(200, {
        caller_labels: ['billing'],
      });
      const testCase: TestCase = {
        test_id: 'TC-TEST-009-ARRAY-CONTAINS-FAIL',
        type: 'webhook',
        name: 'Missing historical call label',
        description: 'Missing caller labels should fail clearly',
        input: {url: 'https://example.com/json', method: 'GET'},
        expected_output: {
          status: 200,
          body_array_contains: {
            caller_labels: ['confused'],
          },
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase, {timeout: 10_000});

      expect(result.status).toBe('failed');
      expect(result.assertions_failed).toBe(1);
      expect(result.error_message).toContain('caller_labels');
      expect(result.error_message).toContain('confused');
    });

    test('should check truthy, falsy, and defined response body fields', async () => {
      mockFetch(200, {
        processed: 'yes',
        retryable: false,
        receipt: null,
      });
      const testCase: TestCase = {
        test_id: 'TC-TEST-009A',
        type: 'webhook',
        name: 'Body field assertions',
        description: 'Test body truthy/falsy/defined checks',
        input: {url: 'https://example.com/json', method: 'GET'},
        expected_output: {
          status: 200,
          body_truthy: ['processed'],
          body_falsy: ['retryable'],
          body_defined: ['receipt'],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase, {timeout: 10_000});

      expect(result.status).toBe('passed');
      expect(result.assertions_passed).toBe(4);
      expect(result.assertions_failed).toBe(0);
    });

    test('should fail when a defined response body field is missing', async () => {
      mockFetch(200, {ok: true});
      const testCase: TestCase = {
        test_id: 'TC-TEST-009B',
        type: 'webhook',
        name: 'Missing body field assertion',
        description: 'Test body_defined failures',
        input: {url: 'https://example.com/json', method: 'GET'},
        expected_output: {
          status: 200,
          body_defined: ['receipt'],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase, {timeout: 10_000});

      expect(result.status).toBe('failed');
      expect(result.assertions_failed).toBe(1);
      expect(result.error_message).toContain('receipt');
    });

    test('should fail when a falsy response body field is missing', async () => {
      mockFetch(200, {ok: true});
      const testCase: TestCase = {
        test_id: 'TC-TEST-009C',
        type: 'webhook',
        name: 'Missing falsy body field assertion',
        description: 'body_falsy needs explicit response evidence, not absence',
        input: {url: 'https://example.com/json', method: 'GET'},
        expected_output: {
          status: 200,
          body_falsy: ['should_callback'],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase, {timeout: 10_000});

      expect(result.status).toBe('failed');
      expect(result.assertions_failed).toBe(1);
      expect(result.error_message).toContain('should_callback');
    });

    test('should check latency constraint', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
        await new Promise(resolve => {
          setTimeout(resolve, 5);
        });

        return new Response(JSON.stringify({ok: true}), {
          status: 200,
          headers: {'Content-Type': 'application/json'},
        });
      });

      const testCase: TestCase = {
        test_id: 'TC-TEST-007',
        type: 'webhook',
        name: 'Latency test',
        description: 'Test with unrealistic latency constraint',
        input: {url: 'https://example.com/slow', method: 'GET'},
        expected_output: {status: 200, latency_max_ms: 1},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase, {timeout: 10_000});

      expect(result.status).toBe('failed');
      expect(result.error_message).toMatch(/exceeds max/);
    });

    test('should not ignore an explicit zero latency budget', async () => {
      mockFetch(200, {ok: true});
      const testCase: TestCase = {
        test_id: 'TC-TEST-007-zero',
        type: 'webhook',
        name: 'Zero latency budget',
        description: 'Regression for truthy latency budget check',
        input: {url: 'https://example.com/zero', method: 'GET'},
        expected_output: {status: 200, latency_max_ms: 0},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase, {timeout: 10_000});

      expect(result.assertions_passed + result.assertions_failed).toBe(2);
      expect(result.assertions_failed).toBe(result.latency_ms > 0 ? 1 : 0);
    });
  });

  describe('TestOrchestrator', () => {
    beforeEach(() => {
      clearAllDataSync();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    test('should have webhook runner registered', () => {
      const runner = orchestrator.getRunner('webhook');
      expect(runner).toBeDefined();
      expect(runner?.type).toBe('webhook');
    });

    test('should run empty test suite', async () => {
      const summary = await runTests({type: 'webhook'});

      expect(summary.total_tests).toBe(0);
      expect(summary.passed).toBe(0);
      expect(summary.failed).toBe(0);
      expect(summary.execution_id).toMatch(/^RUN-/);
    });

    test('should run tests and record results', async () => {
      mockFetch(200, {ok: true});
      await createTestCase({
        type: 'webhook',
        name: 'Orchestrator test case',
        description: 'Test for orchestrator',
        input: {url: 'https://example.com/get', method: 'GET'},
        expected_output: {status: 200},
        tags: ['orchestrator-test'],
        enabled: true,
      });

      const summary = await runTests({
        type: 'webhook', tag: 'orchestrator-test', timeout: 10_000,
      });

      expect(summary.total_tests).toBe(1);
      expect(summary.passed).toBe(1);
      expect(summary.failed).toBe(0);
      expect(summary.pass_rate).toBe(100);

      const results = await getResultsByRun(summary.execution_id);
      expect(results.data).toHaveLength(1);
      expect(results.data[0].status).toBe('passed');

      const runs = await listTestRuns({limit: 1});
      expect(runs.data).toHaveLength(1);
      expect(runs.data[0].execution_id).toBe(summary.execution_id);
    });

    test('should handle mixed pass/fail results', async () => {
      mockFetch(200, {ok: true}, 2);
      await createTestCase({
        type: 'webhook',
        name: 'Passing test',
        description: 'Should pass',
        input: {url: 'https://example.com/get', method: 'GET'},
        expected_output: {status: 200},
        tags: ['mixed-test'],
        enabled: true,
      });

      await createTestCase({
        type: 'webhook',
        name: 'Failing test',
        description: 'Should fail',
        input: {url: 'https://example.com/get', method: 'GET'},
        expected_output: {status: 404},
        tags: ['mixed-test'],
        enabled: true,
      });

      const summary = await runTests({
        type: 'webhook', tag: 'mixed-test', timeout: 10_000,
      });

      expect(summary.total_tests).toBe(2);
      expect(summary.passed).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.pass_rate).toBe(50);
      expect(summary.failures).toHaveLength(1);
    });

    test('should respect failFast option', async () => {
      // Both fetches return 404; first test (expecting 200) fails;
      // failFast should stop the second from running.
      mockFetch(404, {error: 'not found'}, 2);
      await createTestCase({
        type: 'webhook',
        name: 'Failing test',
        description: 'Should fail first',
        input: {url: 'https://example.com/get', method: 'GET'},
        expected_output: {status: 200},
        tags: ['failfast-test'],
        enabled: true,
      });

      await createTestCase({
        type: 'webhook',
        name: 'Passing test',
        description: 'Should not run',
        input: {url: 'https://example.com/get', method: 'GET'},
        expected_output: {status: 200},
        tags: ['failfast-test'],
        enabled: true,
      });

      const summary = await runTests({
        type: 'webhook', tag: 'failfast-test', failFast: true, timeout: 10_000,
      });

      expect(summary.failures).toHaveLength(1);
    });

    test('should filter by tag', async () => {
      mockFetch(200, {ok: true}, 2);
      await createTestCase({
        type: 'webhook',
        name: 'Tagged test A',
        description: 'Has tag A',
        input: {url: 'https://example.com/get', method: 'GET'},
        expected_output: {status: 200},
        tags: ['tag-a'],
        enabled: true,
      });

      await createTestCase({
        type: 'webhook',
        name: 'Tagged test B',
        description: 'Has tag B',
        input: {url: 'https://example.com/get', method: 'GET'},
        expected_output: {status: 200},
        tags: ['tag-b'],
        enabled: true,
      });

      const summaryA = await runTests({tag: 'tag-a', timeout: 10_000});
      expect(summaryA.total_tests).toBe(1);

      const summaryB = await runTests({tag: 'tag-b', timeout: 10_000});
      expect(summaryB.total_tests).toBe(1);
    });

    test('should skip disabled tests by default', async () => {
      mockFetch(200, {ok: true});
      await createTestCase({
        type: 'webhook',
        name: 'Enabled test',
        description: 'Should run',
        input: {url: 'https://example.com/get', method: 'GET'},
        expected_output: {status: 200},
        tags: ['enabled-test'],
        enabled: true,
      });

      await createTestCase({
        type: 'webhook',
        name: 'Disabled test',
        description: 'Should not run',
        input: {url: 'https://example.com/get', method: 'GET'},
        expected_output: {status: 200},
        tags: ['enabled-test'],
        enabled: false,
      });

      const summary = await runTests({tag: 'enabled-test', timeout: 10_000});
      expect(summary.total_tests).toBe(1);
    });
  });
});
