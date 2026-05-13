import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  expandAll, expandTemplate, loadIndustries, loadTemplates, loadVariants,
} from '../../src/factory/templates';
import type {
  FactoryContext, Industry, Template, Variant,
} from '../../src/factory';

const TEMPLATES_DIR = join(process.cwd(), 'templates', 'factory');

describe('loadIndustries', () => {
  it('parses industries.yaml and returns Industry[] with required fields', () => {
    const industries = loadIndustries(join(TEMPLATES_DIR, 'industries.yaml'));
    expect(industries.length).toBeGreaterThan(5);
    for (const ind of industries) {
      expect(ind.id).toBeTruthy();
      expect(ind.name).toBeTruthy();
      expect(ind.greeting).toBeTruthy();
      expect(ind.pain_point).toBeTruthy();
    }

    // Sanity: known industries from archive.
    const ids = industries.map(i => i.id);
    expect(ids).toContain('hvac');
    expect(ids).toContain('plumbing');
    expect(ids).toContain('electrical');
  });
});

describe('loadVariants', () => {
  it('parses variants.yaml and groups by bucket', () => {
    const ctx = loadVariants(join(TEMPLATES_DIR, 'variants.yaml'));
    expect(ctx.demo_close_variants?.length).toBeGreaterThanOrEqual(3);
    expect(ctx.objection_variants?.length).toBeGreaterThanOrEqual(3);

    const demoIds = ctx.demo_close_variants!.map(v => v.id);
    expect(demoIds).toContain('eager');
    expect(demoIds).toContain('declined');
  });
});

describe('loadTemplates', () => {
  it('parses base-scenarios.yaml and returns Template[] with placeholder ids', () => {
    const templates = loadTemplates(join(TEMPLATES_DIR, 'base-scenarios.yaml'));
    expect(templates.length).toBeGreaterThan(5);
    for (const t of templates) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(['llm', 'tool', 'simulation']).toContain(t.type);
    }

    // Find a template that uses {industry} interpolation.
    const industryTemplate = templates.find(t => t.id.includes('{industry}'));
    expect(industryTemplate).toBeDefined();
    expect(industryTemplate?.expand_with).toContain('industries');
  });
});

describe('expandTemplate', () => {
  const industries: Industry[] = [
    {
      id: 'hvac', name: 'HVAC', greeting: 'I run an HVAC company', pain_point: 'AC at 3 AM',
    },
    {
      id: 'plumbing', name: 'Plumbing', greeting: 'I am a plumber', pain_point: 'burst pipes',
    },
  ];

  const variants: Variant[] = [
    {
      id: 'eager', name: 'Eager', response: 'Yes!', expected_behavior: 'tool call',
    },
    {
      id: 'hesitant', name: 'Hesitant', response: 'Maybe', expected_behavior: 'soft push',
    },
  ];

  const context: FactoryContext = {industries, demo_close_variants: variants};

  it('substitutes {industry}, {industry_name}, {industry_greeting} placeholders', () => {
    const template: Template = {
      id: 'outbound-{industry}',
      name: 'Outbound - {industry_name}',
      type: 'llm',
      expand_with: ['industries'],
      chat_history: [{role: 'user', message: '{industry_greeting}', time_in_call_secs: 0}],
      success_condition: 'Agent identifies as Sarah',
    };

    const result = expandTemplate(template, context, {strategy: 'cartesian'});
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('outbound-hvac');
    expect(result[0].name).toBe('Outbound - HVAC');
    expect(result[0].chat_history?.[0].message).toBe('I run an HVAC company');
    expect(result[1].id).toBe('outbound-plumbing');
  });

  it('handles multi-variable expansion via cartesian (industries × variants)', () => {
    const template: Template = {
      id: 'demo-{industry}-{demo_close_variant}',
      name: 'Demo {industry_name} - {demo_close_variant_name}',
      type: 'llm',
      expand_with: ['industries', 'demo_close_variants'],
      chat_history: [{role: 'user', message: '{demo_close_variant_response}'}],
    };

    const result = expandTemplate(template, context, {strategy: 'cartesian'});
    expect(result).toHaveLength(2 * 2);
    const ids = result.map(t => t.id);
    expect(ids).toContain('demo-hvac-eager');
    expect(ids).toContain('demo-plumbing-hesitant');
  });

  it('expand_with pairwise uses fewer tests than cartesian', () => {
    const template: Template = {
      id: 'wide-{industry}-{demo_close_variant}',
      name: 'wide',
      type: 'llm',
      expand_with: ['industries', 'demo_close_variants'],
    };
    const cart = expandTemplate(template, context, {strategy: 'cartesian'});
    const pair = expandTemplate(template, context, {strategy: 'pairwise', seed: 1});
    expect(pair.length).toBeLessThanOrEqual(cart.length);
  });

  it('passes through templates with no expand_with as a single test', () => {
    const template: Template = {
      id: 'static',
      name: 'Static',
      type: 'llm',
    };
    expect(expandTemplate(template, context, {strategy: 'cartesian'})).toHaveLength(1);
  });

  it('throws on missing context bucket', () => {
    const template: Template = {
      id: 'broken-{missing}',
      name: 'broken',
      type: 'llm',
      expand_with: ['missing_bucket'],
    };
    expect(() => expandTemplate(template, context, {strategy: 'cartesian'}))
      .toThrow(/missing or empty for bucket "missing_bucket"/);
  });
});

describe('expandAll', () => {
  it('flattens expansion across multiple templates', () => {
    const industries: Industry[] = [
      {
        id: 'hvac', name: 'HVAC', greeting: 'g', pain_point: 'p',
      },
    ];
    const context: FactoryContext = {industries};
    const templates: Template[] = [
      {
        id: 'a-{industry}', name: 'A {industry_name}', type: 'llm', expand_with: ['industries'],
      },
      {
        id: 'b-{industry}', name: 'B {industry_name}', type: 'tool', expand_with: ['industries'],
      },
    ];
    const result = expandAll(templates, context, {strategy: 'cartesian'});
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id)).toEqual(['a-hvac', 'b-hvac']);
  });

  it('expands all archive templates against archive context (smoke test)', () => {
    const industries = loadIndustries(join(TEMPLATES_DIR, 'industries.yaml'));
    const variantCtx = loadVariants(join(TEMPLATES_DIR, 'variants.yaml'));
    const templates = loadTemplates(join(TEMPLATES_DIR, 'base-scenarios.yaml'));
    const context: FactoryContext = {industries, ...variantCtx};
    const result = expandAll(templates, context, {strategy: 'pairwise', seed: 1});
    expect(result.length).toBeGreaterThan(20);
    // Spot check at least one expanded id has no remaining placeholders.
    const sample = result.find(r => r.expanded_with && r.expanded_with.length > 0);
    expect(sample?.id).not.toMatch(/{/);
  });
});
