import { describe, it, expect } from 'vitest';
import { GovernanceValidator, TAG_IDS } from './lib/validator';

describe('Meta-Governance: Testing the Validator', () => {

  // --- VALID WORKFLOW MOCK ---
  const validWorkflow = {
    name: '[DEV] Valid Workflow - Test',
    active: true,
    tags: [{ id: TAG_IDS.DEV, name: 'DEV' }],
    meta: { research_proof: 'link-to-research' },
    nodes: [
      {
        name: 'webhook_trigger',
        type: 'n8n-nodes-base.webhook',
        notes: 'Generic trigger',
        parameters: { path: 'valid-path' }
      },
      {
        name: 'process_data',
        type: 'n8n-nodes-base.set',
        notes: 'Processing data'
      },
      {
        name: 'switch_logic',
        type: 'n8n-nodes-base.switch',
        notes: 'Routing logic'
      }
    ]
  };

  it('should PASS a perfectly valid workflow', () => {
    const result = GovernanceValidator.validate(validWorkflow, 'valid-workflow.json');
    expect(result.valid, `Expected valid, got errors: ${result.errors.join(', ')}`).toBe(true);
  });

  // --- INVALID CASES ---

  it('should FAIL if missing literal tags', () => {
    const invalid = { ...validWorkflow, tags: [] };
    const result = GovernanceValidator.validate(invalid, 'test.json');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Missing literal tag object'))).toBe(true);
  });

  it('should FAIL if ARCHIVED but active', () => {
    const invalid = { 
      ...validWorkflow, 
      active: true,
      tags: [{ id: TAG_IDS.ARCHIVED, name: 'ARCHIVED' }]
    };
    const result = GovernanceValidator.validate(invalid, 'test.json');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('ARCHIVED workflows must be inactive'))).toBe(true);
  });

  it('should FAIL if name contains version number', () => {
    const invalid = { ...validWorkflow, name: 'Workflow v1' };
    const result = GovernanceValidator.validate(invalid, 'test.json');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('No version numbers'))).toBe(true);
  });

  it('should FAIL if name contains buzzwords', () => {
    const invalid = { ...validWorkflow, name: 'Super Orchestrator Agent' };
    const result = GovernanceValidator.validate(invalid, 'test.json');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Banned buzzword'))).toBe(true);
  });

  it('should FAIL if file name is not kebab-case', () => {
    const result = GovernanceValidator.validate(validWorkflow, 'My_Bad_Name.json');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('File Name: Must be kebab-case'))).toBe(true);
  });

  it('should FAIL if node name is not snake_case', () => {
    const invalid = {
      ...validWorkflow,
      nodes: [{ name: 'Bad Name', type: 'n8n-nodes-base.set', notes: 'note' }]
    };
    const result = GovernanceValidator.validate(invalid, 'test.json');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Name must be snake_case'))).toBe(true);
  });

  it('should FAIL if trigger node name is not generic', () => {
    const invalid = {
      ...validWorkflow,
      nodes: [{ name: 'custom_webhook', type: 'n8n-nodes-base.webhook', notes: 'note' }]
    };
    const result = GovernanceValidator.validate(invalid, 'test.json');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Trigger must use allowed generic name'))).toBe(true);
  });

  it('should FAIL if node is missing notes', () => {
    const invalid = {
      ...validWorkflow,
      nodes: [{ name: 'process_data', type: 'n8n-nodes-base.set' }] // no notes
    };
    const result = GovernanceValidator.validate(invalid, 'test.json');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Must have notes'))).toBe(true);
  });

  it('should FAIL if IF node is used', () => {
    const invalid = {
      ...validWorkflow,
      nodes: [{ name: 'check_condition', type: 'n8n-nodes-base.if', notes: 'note' }]
    };
    const result = GovernanceValidator.validate(invalid, 'test.json');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Must not be an IF node'))).toBe(true);
  });

  it('should FAIL if webhook path is nested', () => {
    const invalid = {
      ...validWorkflow,
      nodes: [{ 
        name: 'webhook_trigger', 
        type: 'n8n-nodes-base.webhook', 
        notes: 'note',
        parameters: { path: 'nested/path' }
      }]
    };
    const result = GovernanceValidator.validate(invalid, 'test.json');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Must be unnested'))).toBe(true);
  });

  it('should FAIL if missing research proof', () => {
    const invalid = { ...validWorkflow, meta: {} };
    const result = GovernanceValidator.validate(invalid, 'test.json');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Must have meta.research_proof'))).toBe(true);
  });

  it('should PASS if missing research proof BUT is ARCHIVED', () => {
    const archived = { 
      ...validWorkflow, 
      active: false,
      tags: [{ id: TAG_IDS.ARCHIVED, name: 'ARCHIVED' }],
      meta: {} // No proof
    };
    const result = GovernanceValidator.validate(archived, 'test.json');
    expect(result.valid).toBe(true);
  });

});
