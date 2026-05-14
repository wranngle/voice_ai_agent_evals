/**
 * META-AUDIT — Client-initiation webhook fast-fail valid-object contract.
 *
 * The ElevenLabs `conversation_initiation_client_data` webhook is a hard
 * real-time dependency: every inbound call hits it before any audio plays.
 * Per official docs the response MUST be HTTP 200 with `type`,
 * `dynamic_variables` (every defined var, none omitted), and optional
 * overrides. If the webhook is slow or returns junk, the agent falls back to
 * its dashboard defaults.
 *
 * The user's requirement: "Ensure it can succeed fast with valid object even
 * in worst cases."
 *
 * `src/webhook/client-initiation.ts` is the TS reference responder. The n8n
 * workflow mirrors its contract. These tests prove the reference holds.
 */

import {describe, expect, it} from 'vitest';
import {
  buildClientInitiationResponse,
  respondFast,
  type DynamicVariableSpec,
} from '../../src/webhook/client-initiation';

const SPECS: DynamicVariableSpec[] = [
  {identifier: 'system_prompt_context', type: 'string', default: 'none'},
  {identifier: 'agent_name', type: 'string', default: 'the assistant'},
  {identifier: 'company_name', type: 'string', default: 'this business'},
  {identifier: 'primary_language', type: 'string', default: 'English'},
  {identifier: 'transfer_enabled', type: 'boolean', default: false},
  {identifier: 'agent_voice_marker', type: 'string', default: ''},
];

describe('META-AUDIT: buildClientInitiationResponse — pure validity floor', () => {
  it('returns valid response with all defaults when no enrichment given', () => {
    const r = buildClientInitiationResponse({specs: SPECS});
    expect(r.type).toBe('conversation_initiation_client_data');
    for (const spec of SPECS) {
      expect(r.dynamic_variables).toHaveProperty(spec.identifier);
      expect(r.dynamic_variables[spec.identifier]).toBe(spec.default);
    }
  });

  it('uses enrichment when it matches the declared type', () => {
    const r = buildClientInitiationResponse({
      specs: SPECS,
      enrichments: {agent_name: 'Sarah', transfer_enabled: true},
    });
    expect(r.dynamic_variables.agent_name).toBe('Sarah');
    expect(r.dynamic_variables.transfer_enabled).toBe(true);
  });

  it('rejects enrichment with wrong type and falls back to default', () => {
    const r = buildClientInitiationResponse({
      specs: SPECS,
      // transfer_enabled declared boolean — string should be rejected
      enrichments: {transfer_enabled: 'yes', agent_name: 42},
    });
    expect(r.dynamic_variables.transfer_enabled).toBe(false);
    expect(r.dynamic_variables.agent_name).toBe('the assistant');
  });

  it('never returns undefined values', () => {
    const r = buildClientInitiationResponse({
      specs: SPECS,
      enrichments: {agent_name: undefined, system_prompt_context: null as unknown as string},
    });
    for (const value of Object.values(r.dynamic_variables)) {
      expect(value).not.toBeUndefined();
      expect(value).not.toBeNull();
    }
  });

  it('omits optional overrides when not provided', () => {
    const r = buildClientInitiationResponse({specs: SPECS});
    expect(r.conversation_config_override).toBeUndefined();
    expect(r.branch_id).toBeUndefined();
    expect(r.environment).toBeUndefined();
  });

  it('includes overrides verbatim when provided', () => {
    const r = buildClientInitiationResponse({
      specs: SPECS,
      conversation_config_override: {agent: {first_message: 'Hi there!'}},
      branch_id: 'br_test',
      environment: 'prod',
    });
    expect(r.conversation_config_override?.agent?.first_message).toBe('Hi there!');
    expect(r.branch_id).toBe('br_test');
    expect(r.environment).toBe('prod');
  });
});

describe('META-AUDIT: respondFast — survives worst-case upstreams', () => {
  it('returns valid response within 200ms when every upstream hangs forever', async () => {
    const t0 = Date.now();
    const r = await respondFast({
      input: {caller_id: '+15551234567', agent_id: 'a1', called_number: '+15559999999'},
      specs: SPECS,
      enrich: () => new Promise(() => { /* hang */ }),
      enrichmentTimeoutMs: 150,
    });
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(400);
    expect(r.type).toBe('conversation_initiation_client_data');
    for (const spec of SPECS) {
      expect(r.dynamic_variables[spec.identifier]).toBe(spec.default);
    }
  });

  it('returns valid response when enrichment throws', async () => {
    const r = await respondFast({
      input: {caller_id: '+15551234567'},
      specs: SPECS,
      enrich: async () => { throw new Error('crm_500'); },
    });
    expect(r.type).toBe('conversation_initiation_client_data');
    expect(r.dynamic_variables.agent_name).toBe('the assistant');
  });

  it('returns valid response with partial enrichment when some upstream succeeds', async () => {
    const r = await respondFast({
      input: {caller_id: '+15551234567'},
      specs: SPECS,
      enrich: async () => ({agent_name: 'Sarah', /* company_name missing */}),
    });
    expect(r.dynamic_variables.agent_name).toBe('Sarah');
    expect(r.dynamic_variables.company_name).toBe('this business');
  });

  it('returns valid response when enrich is omitted entirely', async () => {
    const r = await respondFast({input: {}, specs: SPECS});
    expect(r.type).toBe('conversation_initiation_client_data');
    expect(Object.keys(r.dynamic_variables).sort()).toEqual(SPECS.map(s => s.identifier).sort());
  });

  it('every key in response.dynamic_variables matches a declared spec — no leaks, no omissions', async () => {
    const r = await respondFast({
      input: {},
      specs: SPECS,
      enrich: async () => ({malicious_extra_key: 'should_be_ignored', agent_name: 'Eve'}),
    });
    const declared = new Set(SPECS.map(s => s.identifier));
    for (const k of Object.keys(r.dynamic_variables)) {
      expect(declared.has(k), `unexpected key in response: ${k}`).toBe(true);
    }
    for (const id of declared) {
      expect(r.dynamic_variables).toHaveProperty(id);
    }
  });
});
