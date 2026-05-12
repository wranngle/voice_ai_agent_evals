import {describe, expect, it} from 'vitest';
import {
  cleanProperty,
  cleanTools,
  hasMutualExclusionViolation,
} from '../../src/wrapper/tools';
import type {AgentTool} from '../../src/wrapper/types';

describe('cleanProperty', () => {
  it('keeps description when present', () => {
    const cleaned = cleanProperty({
      type: 'string',
      description: 'Caller phone number in E.164.',
    });
    expect(cleaned).toEqual({type: 'string', description: 'Caller phone number in E.164.'});
  });

  it('strips is_system_provided', () => {
    const cleaned = cleanProperty({type: 'string', is_system_provided: true});
    expect(cleaned).not.toHaveProperty('is_system_provided');
    expect(cleaned.type).toBe('string');
    expect(cleaned.description).toContain('System-provided');
  });

  it('strips dynamic_variable but preserves intent in description', () => {
    const cleaned = cleanProperty({
      type: 'string',
      dynamic_variable: 'caller_phone',
    });
    expect(cleaned).not.toHaveProperty('dynamic_variable');
    expect(cleaned.description).toContain('caller_phone');
  });

  it('strips enum but inlines values into description', () => {
    const cleaned = cleanProperty({
      type: 'string',
      enum: ['hvac', 'plumbing', 'legal'],
    });
    expect(cleaned).not.toHaveProperty('enum');
    expect(cleaned.description).toContain('hvac');
    expect(cleaned.description).toContain('plumbing');
    expect(cleaned.description).toContain('legal');
  });

  it('strips constant_value but preserves the value in description', () => {
    const cleaned = cleanProperty({type: 'string', constant_value: 'wranngle'});
    expect(cleaned).not.toHaveProperty('constant_value');
    expect(cleaned.description).toContain('wranngle');
  });

  it('prefers an explicit description over synthesized fallbacks', () => {
    const cleaned = cleanProperty({
      type: 'string',
      description: 'Explicit description.',
      enum: ['a', 'b'],
      is_system_provided: true,
    });
    expect(cleaned.description).toBe('Explicit description.');
  });
});

describe('cleanTools', () => {
  const tool: AgentTool = {
    name: 'send_sms',
    description: 'Send an SMS to the caller.',
    api_schema: {
      url: 'https://example.com/send-sms',
      method: 'POST',
      request_body_schema: {
        type: 'object',
        properties: {
          phone_number: {
            type: 'string',
            description: 'Recipient phone in E.164.',
            is_system_provided: false,
            enum: ['a', 'b'],
          },
          message: {type: 'string', constant_value: 'hi'},
        },
        required: ['phone_number'],
      },
    },
  };

  it('returns a new array (does not mutate input)', () => {
    const cleaned = cleanTools([tool]);
    expect(cleaned).not.toBe([tool]);
    expect(tool.api_schema?.request_body_schema?.properties?.phone_number)
      .toHaveProperty('is_system_provided');
  });

  it('strips every property to {type, description}', () => {
    const cleaned = cleanTools([tool]);
    const phoneNumber = cleaned[0]?.api_schema?.request_body_schema?.properties?.phone_number;
    expect(phoneNumber).toBeDefined();
    expect(Object.keys(phoneNumber!)).toEqual(['type', 'description']);
  });

  it('preserves the original description when present', () => {
    const cleaned = cleanTools([tool]);
    expect(cleaned[0]?.api_schema?.request_body_schema?.properties?.phone_number?.description).toBe('Recipient phone in E.164.');
  });

  it('preserves required[], url, method, top-level name + description', () => {
    const cleaned = cleanTools([tool]);
    expect(cleaned[0].name).toBe('send_sms');
    expect(cleaned[0].description).toBe('Send an SMS to the caller.');
    expect(cleaned[0].api_schema?.url).toBe('https://example.com/send-sms');
    expect(cleaned[0].api_schema?.method).toBe('POST');
    expect(cleaned[0].api_schema?.request_body_schema?.required).toEqual(['phone_number']);
  });

  it('handles tools with no properties (no-op)', () => {
    const noProps: AgentTool = {name: 'noop', description: 'no body'};
    expect(cleanTools([noProps])).toEqual([noProps]);
  });
});

describe('hasMutualExclusionViolation', () => {
  it('returns false for clean { type, description }', () => {
    expect(hasMutualExclusionViolation({type: 'string', description: 'd'})).toBe(false);
  });

  it('returns false for type alone', () => {
    expect(hasMutualExclusionViolation({type: 'string'})).toBe(false);
  });

  it('returns true when description + is_system_provided both set', () => {
    expect(hasMutualExclusionViolation({
      type: 'string',
      description: 'd',
      is_system_provided: true,
    })).toBe(true);
  });

  it('returns true when dynamic_variable + constant_value both set', () => {
    expect(hasMutualExclusionViolation({
      type: 'string',
      dynamic_variable: 'x',
      constant_value: 'y',
    })).toBe(true);
  });

  it('returns true when description + enum both set', () => {
    expect(hasMutualExclusionViolation({
      type: 'string',
      description: 'd',
      enum: ['a'],
    })).toBe(true);
  });
});
