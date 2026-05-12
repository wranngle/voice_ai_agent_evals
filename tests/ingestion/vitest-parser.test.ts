/**
 * Vitest Parser Tests
 *
 * Tests for the Vitest file parser that extracts test cases for ingestion.
 */

import {
  describe, expect, test,
} from 'vitest';
import {parseVitestFile} from '../../src/testing/ingestion/vitest-parser';

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

    test('should extract constants with nullish environment fallback', () => {
      const content = `
        const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL ?? "https://default.example.com";
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.constants.N8N_WEBHOOK_URL).toBe('https://default.example.com');
      expect(result.webhookUrl).toBe('https://default.example.com');
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

    test('should apply alternate webhook URL constants to parsed tests', () => {
      const content = `
        const N8N_WEBHOOK_URL = "https://n8n.example.com/webhook/post-call";

        describe('Post-call webhook', () => {
          it('replays a historical payload', async () => {
            const response = await sendWebhook({ conversation_id: 'conv_synth_001' });
            expect(response.status).toBe(200);
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.webhookUrl).toBe('https://n8n.example.com/webhook/post-call');
      expect(result.tests[0].webhookUrl).toBe('https://n8n.example.com/webhook/post-call');
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

    test('should detect suite names from Vitest conditional describe blocks', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";

        describe.skipIf(process.env.CI)('Post-Call Webhook - Replay', () => {
          it('should replay call metadata', async () => {
            const response = await sendWebhook({ conversation_id: 'conv_synth_001' });
            expect(response.status).toBe(200);
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests.length).toBe(1);
      expect(result.tests[0].suite).toBe('Post-Call Webhook - Replay');
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

    test('should detect conditionally declared it/test blocks', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";

        describe('Tests', () => {
          it.runIf(process.env.REPLAY_WEBHOOKS)('replays historical payloads', async () => {
            const response = await sendWebhook({ conversation_id: 'conv_synth_002' });
            expect(response.status).toBe(200);
          });

          test.skipIf(process.env.CI)('checks local webhook receiver', async () => {
            const response = await sendWebhook({ conversation_id: 'conv_synth_003' });
            expect(response.status).toBe(202);
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests.map(parsed => parsed.name)).toEqual([
        'replays historical payloads',
        'checks local webhook receiver',
      ]);
      expect(result.tests.map(parsed => parsed.expectedStatus)).toEqual([200, 202]);
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

      expect(result.tests[0].payload).toEqual({field: 'value'});
    });

    test('should extract URL and payload from two-argument webhook helpers', () => {
      const content = `
        const WEBHOOK_URL = process.env.WEBHOOK_URL ?? "https://example.com/webhook/post-call";
        const HISTORICAL_CALL = {
          conversation_id: 'conv_456',
          transcript: [
            { role: 'caller', text: 'I am disappointed this is taking so long.' },
            { role: 'agent', text: 'I can escalate this for you.' },
          ],
          recording: { duration_secs: 91, has_audio: true },
          caller_labels: ['disappointed', 'escalation'],
          tool_trace: [{ name: 'lookup_record', status: 'success' }],
        };

        describe('Historical call replay', () => {
          it('replays a call fixture through the webhook', async () => {
            const response = await sendWebhook(WEBHOOK_URL, HISTORICAL_CALL);
            expect(response.status).toBe(200);
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests[0].webhookUrl).toBe('https://example.com/webhook/post-call');
      expect(result.tests[0].payload).toEqual({
        conversation_id: 'conv_456',
        transcript: [
          {role: 'caller', text: 'I am disappointed this is taking so long.'},
          {role: 'agent', text: 'I can escalate this for you.'},
        ],
        recording: {duration_secs: 91, has_audio: true},
        caller_labels: ['disappointed', 'escalation'],
        tool_trace: [{name: 'lookup_record', status: 'success'}],
      });
    });

    test('should extract literal URL and inline payload from two-argument webhook helpers', () => {
      const content = `
        describe('Historical call replay', () => {
          it('replays inline call metadata', async () => {
            const response = await postWebhook("https://example.com/webhook/post-call", {
              conversation_id: 'conv_789',
              outcome: 'callback_requested',
            });
            expect(response.status).toBe(200);
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests[0].webhookUrl).toBe('https://example.com/webhook/post-call');
      expect(result.tests[0].payload).toEqual({
        conversation_id: 'conv_789',
        outcome: 'callback_requested',
      });
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

    test('should preserve null values in payloads', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";

        describe('Tests', () => {
          it('test with null metadata', async () => {
            const response = await sendWebhook({
              recording_url: null,
              metadata: { disposition: null },
            });
            expect(response.status).toBe(200);
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests[0].payload).toEqual({
        recording_url: null,
        metadata: {disposition: null},
      });
    });

    test('should preserve nested call metadata in payloads', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";

        describe('Tests', () => {
          it('test with nested metadata', async () => {
            const response = await sendWebhook({
              agent_id: 'agent_123',
              metadata: {
                outcome: 'booked',
                labels: ['hot-lead', 'needs-followup'],
                recording: { duration_secs: 95, has_audio: true },
              },
              call_status: 'completed',
            });
            expect(response.status).toBe(200);
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests[0].payload).toEqual({
        agent_id: 'agent_123',
        metadata: {
          outcome: 'booked',
          labels: ['hot-lead', 'needs-followup'],
          recording: {duration_secs: 95, has_audio: true},
        },
        call_status: 'completed',
      });
    });

    test('should extract reusable historical call payload objects', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";
        const HISTORICAL_CALL = {
          agent_id: 'agent_123',
          transcript: [
            { role: 'caller', text: 'I am confused about the bill.' },
            { role: 'agent', text: 'I can help look that up.' },
          ],
          recording: { duration_secs: 83, has_audio: true },
          caller_labels: ['confused', 'billing'],
          outcome: 'escalated',
          tool_trace: { lookup_record: { status: 'success' } },
        };

        describe('Historical call ingestion', () => {
          it('ingests reusable payload fixture', async () => {
            const response = await sendWebhook(HISTORICAL_CALL);
            expect(response.status).toBe(200);
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests[0].payload).toEqual({
        agent_id: 'agent_123',
        transcript: [
          {role: 'caller', text: 'I am confused about the bill.'},
          {role: 'agent', text: 'I can help look that up.'},
        ],
        recording: {duration_secs: 83, has_audio: true},
        caller_labels: ['confused', 'billing'],
        outcome: 'escalated',
        tool_trace: {lookup_record: {status: 'success'}},
      });
    });

    test('should extract typed reusable historical call payload objects', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";
        type HistoricalCallFixture = {
          agent_id: string;
          transcript: Array<{ role: string; text: string }>;
        };
        const HISTORICAL_CALL: HistoricalCallFixture = {
          agent_id: 'agent_123',
          transcript: [
            { role: 'caller', text: 'I am confused about the bill.' },
            { role: 'agent', text: 'I can help look that up.' },
          ],
          recording: { duration_secs: 83, has_audio: true },
          caller_labels: ['confused', 'billing'],
          outcome: 'escalated',
          tool_trace: { lookup_record: { status: 'success' } },
        };

        describe('Historical call ingestion', () => {
          it('ingests typed reusable payload fixture', async () => {
            const response = await sendWebhook(HISTORICAL_CALL);
            expect(response.status).toBe(200);
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests[0].payload).toEqual({
        agent_id: 'agent_123',
        transcript: [
          {role: 'caller', text: 'I am confused about the bill.'},
          {role: 'agent', text: 'I can help look that up.'},
        ],
        recording: {duration_secs: 83, has_audio: true},
        caller_labels: ['confused', 'billing'],
        outcome: 'escalated',
        tool_trace: {lookup_record: {status: 'success'}},
      });
    });

    test('should merge object spread payload fixtures', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";
        const BASE_CALL = {
          agent_id: 'agent_123',
          metadata: {
            campaign: 'winback',
            caller_label: 'disappointed',
          },
          webhook_payload: { event: 'post_call' },
        };

        describe('Historical call ingestion', () => {
          it('ingests spread payload fixture', async () => {
            const response = await sendWebhook({
              ...BASE_CALL,
              metadata: {
                ...BASE_CALL.metadata,
                outcome: 'callback_requested',
              },
              webhook_payload: {
                ...BASE_CALL.webhook_payload,
                replay_fixture: true,
              },
            });
            expect(response.status).toBe(200);
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests[0].payload).toEqual({
        agent_id: 'agent_123',
        metadata: {
          campaign: 'winback',
          caller_label: 'disappointed',
          outcome: 'callback_requested',
        },
        webhook_payload: {
          event: 'post_call',
          replay_fixture: true,
        },
      });
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

    test('should extract nested body assertions', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";

        describe('Tests', () => {
          it('test nested body fields', async () => {
            const response = await sendWebhook({ field: 'value' });
            expect(response.body.analysis.outcome).toBe("booked");
            expect(response.body.recording.url).toBe(null);
            expect(response.body.tool_trace.lookup_record).toBeTruthy();
            expect(response.body.metadata.summary).toBeDefined();
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests[0].expectedResponse).toEqual({
        analysis: {outcome: 'booked'},
        recording: {url: null},
      });
      expect(result.tests[0].truthyFields).toContain('tool_trace.lookup_record');
      expect(result.tests[0].definedFields).toContain('metadata.summary');
    });

    test('should extract nested body toMatchObject assertions for historical call outputs', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";

        describe('Historical call ingestion', () => {
          it('captures post-call analysis shape', async () => {
            const response = await sendWebhook({ conversation_id: 'conv_123' });
            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
              analysis: {
                outcome: 'escalated',
                summary: 'Caller was confused about billing.',
              },
              recording: { duration_secs: 83, has_audio: true },
              caller_labels: ['confused', 'billing'],
              tool_trace: {
                lookup_record: { status: 'success' },
              },
            });
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests[0].expectedResponse).toEqual({
        analysis: {
          outcome: 'escalated',
          summary: 'Caller was confused about billing.',
        },
        recording: {duration_secs: 83, has_audio: true},
        caller_labels: ['confused', 'billing'],
        tool_trace: {
          lookup_record: {status: 'success'},
        },
      });
    });

    test('should extract array membership assertions from historical call outputs', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";

        describe('Historical call ingestion', () => {
          it('captures labels and tool trace membership', async () => {
            const response = await sendWebhook({ conversation_id: 'conv_123' });
            expect(response.status).toBe(200);
            expect(response.body.caller_labels).toContain('confused');
            expect(response.body.caller_labels).toContain('billing');
            expect(response.body.tool_trace).toContainEqual({
              name: 'lookup_record',
              status: 'success',
            });
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests[0].arrayContains).toEqual({
        caller_labels: ['confused', 'billing'],
        tool_trace: [{name: 'lookup_record', status: 'success'}],
      });
    });

    test('should merge toMatchObject assertions with field assertions', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";
        const EXPECTED_POST_CALL = {
          analysis: { outcome: 'booked' },
          tool_trace: { send_sms: { status: 'success' } },
        };

        describe('Historical call ingestion', () => {
          it('keeps incremental post-call assertions', async () => {
            const { body, status } = await sendWebhook({ conversation_id: 'conv_456' });
            expect(status).toBe(200);
            expect(body).toMatchObject(EXPECTED_POST_CALL);
            expect(body.analysis.summary).toBe('Booked a callback.');
          });
        });
      `;

      const result = parseVitestFile(content, 'test.ts');

      expect(result.tests[0].expectedResponse).toEqual({
        analysis: {
          outcome: 'booked',
          summary: 'Booked a callback.',
        },
        tool_trace: {
          send_sms: {status: 'success'},
        },
      });
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

      expect(result.tests).toHaveLength(0);
    });

    test('should not parse non-webhook tests from a mixed webhook file', () => {
      const content = `
        const WEBHOOK_URL = "https://example.com/webhook";

        describe('Mixed file', () => {
          it('replays a post-call payload', async () => {
            const response = await sendWebhook({ conversation_id: 'conv_synth_001' });
            expect(response.status).toBe(200);
          });

          it('unit-checks local fixture helpers', () => {
            expect(1 + 1).toBe(2);
          });
        });
      `;

      const result = parseVitestFile(content, 'mixed.test.ts');

      expect(result.tests).toHaveLength(1);
      expect(result.tests[0].name).toBe('replays a post-call payload');
      expect(result.tests[0].payload).toEqual({conversation_id: 'conv_synth_001'});
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
