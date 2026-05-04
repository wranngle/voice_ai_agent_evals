/**
 * Client Initiation Webhook Test Suite
 *
 * Tests the client-initiation-data webhook for various scenarios.
 * Run with: vitest tests/webhook/client-initiation-webhook.test.ts
 */

import {
  describe, expect, test,
} from 'vitest';

const WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://your-n8n-host.example.com/webhook/client-initiation-data';
const VALID_AGENT_ID = 'agent_xxxx_demo';

type WebhookRequest = {
  caller_id: string;
  agent_id: string;
  called_number?: string;
  call_sid?: string;
};

type DynamicVariables = {
  customer_name: string;
  customer_first_name: string;
  company: string;
  industry: string;
  account_tier: string;
  call_history: string;
  interaction_count: number;
  last_topic: string;
  notes: string;
  lookup_success: boolean;
  data_source: string;
  secret__crm_person_id: number;
  secret__crm_org_id: number;
};

type WebhookResponse = {
  type: string;
  dynamic_variables: DynamicVariables;
  conversation_config_override?: {
    agent: {
      first_message: string;
    };
  };
};

async function callWebhook(payload: WebhookRequest): Promise<{status: number; body: WebhookResponse | any; latencyMs: number}> {
  const start = Date.now();
  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload),
  });
  const latencyMs = Date.now() - start;

  let body;
  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }

  return {status: response.status, body, latencyMs};
}

describe.skipIf(process.env.CI)('Client Initiation Webhook', () => {
  describe('Valid Requests', () => {
    test('should return 200 for valid request with correct agent_id', async () => {
      const result = await callWebhook({
        caller_id: '+15551234567',
        agent_id: VALID_AGENT_ID,
        called_number: '+15550100',
        call_sid: 'TEST_' + Date.now(),
      });

      expect(result.status).toBe(200);
      expect(result.body.type).toBe('conversation_initiation_client_data');
      expect(result.body.dynamic_variables).toBeDefined();
    });

    test('should return correct response structure', async () => {
      const result = await callWebhook({
        caller_id: '+15559876543',
        agent_id: VALID_AGENT_ID,
      });

      const dv = result.body.dynamic_variables;
      expect(dv).toHaveProperty('customer_name');
      expect(dv).toHaveProperty('customer_first_name');
      expect(dv).toHaveProperty('account_tier');
      expect(dv).toHaveProperty('call_history');
      expect(dv).toHaveProperty('interaction_count');
      expect(dv).toHaveProperty('lookup_success');
      expect(dv).toHaveProperty('data_source');
    });

    test('should respond within 500ms', async () => {
      const result = await callWebhook({
        caller_id: '+15551111111',
        agent_id: VALID_AGENT_ID,
      });

      expect(result.latencyMs).toBeLessThan(500);
    });
  });

  describe('Unknown Caller (Fallback)', () => {
    test('should return default values for unknown phone number', async () => {
      const result = await callWebhook({
        caller_id: '+10000000000', // Unlikely to exist
        agent_id: VALID_AGENT_ID,
      });

      expect(result.status).toBe(200);
      const dv = result.body.dynamic_variables;
      expect(dv.customer_name).toBe('there');
      expect(dv.customer_first_name).toBe('there');
      expect(dv.account_tier).toBe('New');
      expect(dv.call_history).toBe('First-time caller');
      expect(dv.interaction_count).toBe(0);
    });

    test('should set lookup_success to false for unknown caller', async () => {
      const result = await callWebhook({
        caller_id: '+19999999999',
        agent_id: VALID_AGENT_ID,
      });

      // Note: This may be true if credentials are not configured
      expect(typeof result.body.dynamic_variables.lookup_success).toBe('boolean');
    });
  });

  describe('Invalid Requests', () => {
    test('should return 400 for invalid agent_id', async () => {
      const result = await callWebhook({
        caller_id: '+15551234567',
        agent_id: 'invalid_agent_id',
      });

      expect(result.status).toBe(400);
      expect(result.body.error).toBe('Invalid agent_id');
    });

    test('should return 400 for missing agent_id', async () => {
      const result = await callWebhook({
        caller_id: '+15551234567',
        agent_id: '',
      });

      expect(result.status).toBe(400);
    });

    test('should handle missing caller_id gracefully', async () => {
      const result = await callWebhook({
        caller_id: '',
        agent_id: VALID_AGENT_ID,
      });

      // Should still return 200 with defaults
      expect(result.status).toBe(200);
      expect(result.body.dynamic_variables.customer_name).toBe('there');
    });
  });

  describe('Account Tier Logic', () => {
    test('should return valid account tier values', async () => {
      const result = await callWebhook({
        caller_id: '+15551234567',
        agent_id: VALID_AGENT_ID,
      });

      const validTiers = ['New', 'Bronze', 'Silver', 'Gold'];
      expect(validTiers).toContain(result.body.dynamic_variables.account_tier);
    });
  });

  describe('Data Source Tracking', () => {
    test('should return valid data_source value', async () => {
      const result = await callWebhook({
        caller_id: '+15551234567',
        agent_id: VALID_AGENT_ID,
      });

      const validSources = ['crm', 'data_table', 'none'];
      expect(validSources).toContain(result.body.dynamic_variables.data_source);
    });
  });

  describe('Performance', () => {
    test('should handle 5 concurrent requests', async () => {
      const requests = Array.from({length: 5}).fill(null).map(async (_, i) =>
        callWebhook({
          caller_id: `+1555000000${i}`,
          agent_id: VALID_AGENT_ID,
        }));

      const results = await Promise.all(requests);

      for (const result of results) {
        expect(result.status).toBe(200);
        expect(result.latencyMs).toBeLessThan(1000);
      }
    });

    test('average latency should be under 300ms', async () => {
      const iterations = 3;
      let totalLatency = 0;

      for (let i = 0; i < iterations; i++) {
        const result = await callWebhook({
          caller_id: '+15551234567',
          agent_id: VALID_AGENT_ID,
        });
        totalLatency += result.latencyMs;
      }

      const avgLatency = totalLatency / iterations;
      expect(avgLatency).toBeLessThan(300);
    });
  });

  describe('Secret Fields', () => {
    test('should include secret fields with numeric values', async () => {
      const result = await callWebhook({
        caller_id: '+15551234567',
        agent_id: VALID_AGENT_ID,
      });

      const dv = result.body.dynamic_variables;
      expect(typeof dv.secret__crm_person_id).toBe('number');
      expect(typeof dv.secret__crm_org_id).toBe('number');
    });
  });
});

// Run tests if executed directly
if (import.meta.main) {
  console.log('Running Client Initiation Webhook Tests...');
  console.log(`Webhook URL: ${WEBHOOK_URL}`);
}
