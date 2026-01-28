/**
 * Vitest Parser Tests
 *
 * Tests for the Vitest file parser that extracts test cases for ingestion.
 */

import { describe, it, expect, test } from 'vitest';
import { parseVitestFile, type ParsedTest } from '../../lib/testing/ingestion/vitest-parser';

describe('Vitest Parser', () => {
  describe('Constants Extraction', () => {
    test('should extract string constants', () => {
      const content = `
        const WEBHOOK_URL = "https://n8n.example.com/webhook/test";
        const API_KEY = "sk-12345";
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.constants.WEBHOOK_URL).toBe('https://n8n.example.com/webhook/test');
      expect(result.constants.API_KEY).toBe('sk-12345');
    });

    test('should extract constants with environment fallback', () => {
      const content = `
        const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "https://default.example.com";
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.constants.N8N_WEBHOOK_URL).toBe('https://default.example.com');
    });

    test('should set webhookUrl from WEBHOOK_URL constant', () => {
      const content = `
        const WEBHOOK_URL = "https://n8n.example.com/webhook/post-call";
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.webhookUrl).toBe('https://n8n.example.com/webhook/post-call');
    });

    test('should prioritize WEBHOOK_URL over other URL constants', () => {
      const content = `
        const API_URL = "https://api.example.com";
        const WEBHOOK_URL = "https://webhook.example.com";
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.webhookUrl).toBe('https://webhook.example.com');
    });
  });

  describe('Describe Block Detection', () => {
    test('should detect describe blocks and set suite name', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";

        describe('Post-Call Webhook', () => {
          it('should handle completed call', async () => {
            const response = await sendWebhook({
              agent_id: 'test-agent',
              call_status: 'completed',
            });
            expect(response.status).toBe(200);
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests.length).toBe(1);
      expect(result.tests[0].suite).toBe('Post-Call Webhook');
    });

    test('should handle nested describe blocks (last seen)', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";

        describe('Webhooks', () => {
          describe('Post-Call', () => {
            it('should process call', async () => {
              const response = await sendWebhook({ agent_id: 'test' });
              expect(response.status).toBe(200);
            });
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests.length).toBe(1);
      expect(result.tests[0].suite).toBe('Post-Call');
    });
  });

  describe('It/Test Block Parsing', () => {
    test('should detect it() blocks', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";

        describe('Tests', () => {
          it('should do something', async () => {
            const response = await sendWebhook({ field: 'value' });
            expect(response.status).toBe(200);
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests.length).toBe(1);
      expect(result.tests[0].name).toBe('should do something');
    });

    test('should detect test() blocks', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";

        describe('Tests', () => {
          test('should do something else', async () => {
            const response = await sendWebhook({ field: 'value' });
            expect(response.status).toBe(200);
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests.length).toBe(1);
      expect(result.tests[0].name).toBe('should do something else');
    });

    test('should track source file and line number', () => {
      const content = `const WEBHOOK_URL = "https://example.com/webhook";
describe('Tests', () => {
  it('test on line 3', async () => {
    const response = await sendWebhook({ field: 'value' });
    expect(response.status).toBe(200);
  });
});`;

      const result = parseVitestFile(content, 'my-test.test.ts');

      expect(result.tests[0].sourceFile).toBe('my-test.test.ts');
      expect(result.tests[0].lineNumber).toBe(3);
    });

    test('should parse multiple it blocks', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";

        describe('Tests', () => {
          it('first test', async () => {
            const response = await sendWebhook({ a: 1 });
            expect(response.status).toBe(200);
          });

          it('second test', async () => {
            const response = await sendWebhook({ b: 2 });
            expect(response.status).toBe(201);
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests.length).toBe(2);
      expect(result.tests[0].name).toBe('first test');
      expect(result.tests[1].name).toBe('second test');
    });
  });

  describe('Payload Extraction', () => {
    test('should extract payload from sendWebhook call', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";

        describe('Tests', () => {
          it('test with payload', async () => {
            const response = await sendWebhook({
              agent_id: 'agent_123',
              call_status: 'completed',
              duration: 60,
            });
            expect(response.status).toBe(200);
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests[0].payload).toEqual({
        agent_id: 'agent_123',
        call_status: 'completed',
        duration: 60,
      });
    });

    test('should extract payload from callWebhook call', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";

        describe('Tests', () => {
          it('test with payload', async () => {
            const response = await callWebhook({ field: 'value' });
            expect(response.status).toBe(200);
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests[0].payload).toEqual({ field: 'value' });
    });

    test('should resolve constant references in payload', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";
        const AGENT_ID = "agent_test_123";

        describe('Tests', () => {
          it('test with constant', async () => {
            const response = await sendWebhook({
              agent_id: AGENT_ID,
              status: 'active',
            });
            expect(response.status).toBe(200);
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests[0].payload.agent_id).toBe('agent_test_123');
      expect(result.tests[0].payload.status).toBe('active');
    });

    test('should parse boolean values in payload', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";

        describe('Tests', () => {
          it('test with booleans', async () => {
            const response = await sendWebhook({
              enabled: true,
              disabled: false,
            });
            expect(response.status).toBe(200);
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests[0].payload.enabled).toBe(true);
      expect(result.tests[0].payload.disabled).toBe(false);
    });
  });

  describe('Assertion Extraction', () => {
    test('should extract status assertion', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";

        describe('Tests', () => {
          it('test status', async () => {
            const response = await sendWebhook({ field: 'value' });
            expect(response.status).toBe(201);
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests[0].expectedStatus).toBe(201);
    });

    test('should extract status assertion without response prefix', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";

        describe('Tests', () => {
          it('test status', async () => {
            const { status, body } = await sendWebhook({ field: 'value' });
            expect(status).toBe(400);
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests[0].expectedStatus).toBe(400);
    });

    test('should extract body field assertions', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";

        describe('Tests', () => {
          it('test body fields', async () => {
            const response = await sendWebhook({ field: 'value' });
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe("OK");
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests[0].expectedResponse.success).toBe(true);
      expect(result.tests[0].expectedResponse.message).toBe('OK');
    });

    test('should extract toBeTruthy assertions', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";

        describe('Tests', () => {
          it('test truthy fields', async () => {
            const response = await sendWebhook({ field: 'value' });
            expect(response.body.processed).toBeTruthy();
            expect(response.body.hasData).toBeTruthy();
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests[0].truthyFields).toContain('processed');
      expect(result.tests[0].truthyFields).toContain('hasData');
    });

    test('should extract toBeFalsy assertions', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";

        describe('Tests', () => {
          it('test falsy fields', async () => {
            const response = await sendWebhook({ field: 'value' });
            expect(response.body.error).toBeFalsy();
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests[0].falsyFields).toContain('error');
    });

    test('should extract toBeDefined assertions', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";

        describe('Tests', () => {
          it('test defined fields', async () => {
            const response = await sendWebhook({ field: 'value' });
            expect(response.body.id).toBeDefined();
            expect(response.body.timestamp).toBeDefined();
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests[0].definedFields).toContain('id');
      expect(result.tests[0].definedFields).toContain('timestamp');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty file', () => {
      const result = parseVitestFile('', 'empty.ts');

      expect(result.success).toBe(true);
      expect(result.tests).toHaveLength(0);
    });

    test('should handle file without webhook patterns', () => {
      const content = `
        describe('Unit tests', () => {
          it('should add numbers', () => {
            expect(1 + 1).toBe(2);
          });
        });
      `;

      const result = parseVitestFile(content, 'unit.test.ts');

      expect(result.tests.length).toBe(1);
      expect(result.tests[0].webhookUrl).toBeUndefined();
    });

    test('should default method to POST', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";

        describe('Tests', () => {
          it('should use POST', async () => {
            const response = await sendWebhook({ field: 'value' });
            expect(response.status).toBe(200);
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests[0].method).toBe('POST');
    });

    test('should handle multiline it blocks', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";

        describe('Tests', () => {
          it('should handle multiline', async () => {
            const payload = {
              field1: 'value1',
              field2: 'value2',
            };

            const response = await sendWebhook({
              ...payload,
              extra: 'data',
            });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests.length).toBe(1);
      expect(result.tests[0].expectedStatus).toBe(200);
      expect(result.tests[0].expectedResponse.success).toBe(true);
    });
  });
});
