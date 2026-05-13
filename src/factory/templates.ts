/**
 * @wranngle/voice-evals/factory/templates — YAML template loader + expander.
 *
 * Reads:
 *   templates/factory/industries.yaml — Industry[] from `industries:` key
 *   templates/factory/variants.yaml   — multiple variant buckets
 *                                       (demo_close_variants, objection_variants, ...)
 *   templates/factory/base-scenarios.yaml — Template[] from `templates:` key
 *
 * Then expands each template via `expand_with` + the requested ExpansionStrategy,
 * substituting `{placeholder}` tokens with values pulled from the expansion
 * context (e.g. `{industry_name}` -> `Industry.name`).
 *
 * Placeholder grammar:
 *   {<bucket>}          — bucket's `.id` field (most common)
 *   {<bucket>_<field>}  — bucket's specified field (e.g. `industry_name`, `variant_response`)
 *
 * Where `<bucket>` is the singular form of the variant array name:
 *   industries -> industry
 *   demo_close_variants -> demo_close_variant
 */

import {readFileSync} from 'node:fs';
import {parse as parseYaml} from 'yaml';
import {expand} from './expand';
import type {
  ExpandOptions,
  GeneratedTest,
  Industry,
  Template,
  Variant,
} from './types';

export type FactoryContext = {
  [extra: string]: unknown;
  industries?: Industry[];
  demo_close_variants?: Variant[];
  objection_variants?: Variant[];
  personality_variants?: Variant[];
  edge_case_variants?: Variant[];
};

export function loadIndustries(path: string): Industry[] {
  const doc = parseYaml(readFileSync(path, 'utf8')) as {industries?: Industry[]};
  return doc.industries ?? [];
}

export function loadVariants(path: string): FactoryContext {
  const doc = parseYaml(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const out: FactoryContext = {};
  for (const key of [
    'demo_close_variants',
    'objection_variants',
    'personality_variants',
    'edge_case_variants',
  ]) {
    const value = doc[key];
    if (Array.isArray(value)) {
      out[key] = value as Variant[];
    }
  }

  return out;
}

export function loadTemplates(path: string): Template[] {
  const doc = parseYaml(readFileSync(path, 'utf8')) as {templates?: Template[]};
  return doc.templates ?? [];
}

/**
 * Resolve a template's `inherit:` reference + apply `overrides:`.
 *
 * Lookup order: scan the provided template pool by `id`. Inheritance is
 * one level (no chains) — keep the model simple. If `parent.expand_with`
 * is present and child overrides it, the child wins; otherwise child
 * inherits the parent's expansion dimensions.
 *
 * Returns a NEW Template object; the input is untouched. Throws when
 * `inherit:` points to an unknown id (loud failure, not silent no-op).
 */
export function resolveInheritance(template: Template, pool: readonly Template[]): Template {
  if (!template.inherit && !template.overrides) {
    return template;
  }

  const merged: Template = {...template};
  if (template.inherit) {
    const parent = pool.find(t => t.id === template.inherit);
    if (!parent) {
      throw new Error(`resolveInheritance: template "${template.id}" inherits from "${template.inherit}", which is not in the pool`);
    }

    Object.assign(merged, parent, template);
  }

  if (template.overrides) {
    Object.assign(merged, template.overrides);
  }

  delete merged.inherit;
  delete merged.overrides;
  return merged;
}

/**
 * Expand one template into N concrete GeneratedTests.
 *
 * For each variable in `expand_with`, the corresponding bucket from
 * `context` is treated as a dimension. Strategy decides cartesian vs
 * pairwise vs sample. Placeholders in name/id/chat_history/success_*
 * are interpolated against the per-test variable assignment.
 */
export function expandTemplate(
  template: Template,
  context: FactoryContext,
  options: ExpandOptions,
): GeneratedTest[] {
  const expandWith = template.expand_with ?? [];
  if (expandWith.length === 0) {
    return [renderTest(template, {})];
  }

  const variables: Record<string, unknown[]> = {};
  for (const bucket of expandWith) {
    const values = context[bucket];
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error(`expandTemplate: context is missing or empty for bucket "${bucket}"`);
    }

    variables[bucket] = values;
  }

  const assignments = expand<unknown>(variables, options.strategy, {
    seed: options.seed,
    sampleCount: options.sampleCount,
  });

  return assignments.map(assignment => renderTest(template, assignment));
}

/**
 * Expand many templates given the same context. Test ids are kept stable
 * across runs as long as the input templates + context don't change.
 */
export function expandAll(
  templates: Template[],
  context: FactoryContext,
  options: ExpandOptions,
): GeneratedTest[] {
  return templates.flatMap(template =>
    expandTemplate(resolveInheritance(template, templates), context, options));
}

// ---------- internals ----------

function renderTest(
  template: Template,
  assignment: Record<string, unknown>,
): GeneratedTest {
  const interpolationContext = buildInterpolationContext(assignment);
  return {
    id: interpolate(template.id, interpolationContext),
    name: interpolate(template.name, interpolationContext),
    type: template.type,
    category: template.category,
    priority: template.priority,
    chat_history: template.chat_history?.map(turn => ({
      ...turn,
      message: interpolate(turn.message, interpolationContext),
    })),
    success_condition: template.success_condition
      ? interpolate(template.success_condition, interpolationContext)
      : undefined,
    success_examples: template.success_examples,
    failure_examples: template.failure_examples,
    dynamic_variables: template.dynamic_variables,
    expanded_with: template.expand_with,
    variable_assignment: assignment,
  };
}

/**
 * Build a flat key->string lookup for {placeholder} interpolation.
 *
 * For each variable in the assignment:
 *   - `{<singular>}` resolves to .id
 *   - `{<singular>_<field>}` resolves to value[field]
 *
 * Singular form: industries -> industry, demo_close_variants -> demo_close_variant.
 */
function buildInterpolationContext(assignment: Record<string, unknown>): Record<string, string> {
  const ctx: Record<string, string> = {};
  for (const [bucket, value] of Object.entries(assignment)) {
    const singular = toSingular(bucket);
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      ctx[singular] = stringifyField(obj.id);
      for (const [field, fieldValue] of Object.entries(obj)) {
        ctx[`${singular}_${field}`] = stringifyField(fieldValue);
      }
    } else {
      ctx[singular] = stringifyField(value);
    }
  }

  return ctx;
}

function toSingular(bucket: string): string {
  // industries -> industry; demo_close_variants -> demo_close_variant; etc.
  if (bucket.endsWith('ies')) {
    return `${bucket.slice(0, -3)}y`;
  }

  if (bucket.endsWith('s') && !bucket.endsWith('ss')) {
    return bucket.slice(0, -1);
  }

  return bucket;
}

function stringifyField(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
}

const PLACEHOLDER_PATTERN = /{([a-z]\w*)}/g;

function interpolate(text: string, context: Record<string, string>): string {
  return text.replaceAll(PLACEHOLDER_PATTERN, (match, key: string) => {
    if (key in context) {
      return context[key];
    }

    return match;
  });
}
