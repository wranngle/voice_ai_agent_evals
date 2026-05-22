/**
 * Vertical template selector: maps an EnrichmentResult to one of the
 * shipped vertical templates under templates/verticals/*.yaml.
 */

import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {parse as parseYaml} from 'yaml';
import type {EnrichmentResult, VerticalTemplate} from './types';

const TEMPLATE_DIRS = [
  join(process.cwd(), 'templates', 'verticals'),
  join(__dirname, '..', '..', 'templates', 'verticals'),
];

function resolveTemplateDir(): string | undefined {
  for (const dir of TEMPLATE_DIRS) {
    try {
      const stat = readdirSync(dir);
      if (stat.length > 0) {
        return dir;
      }
    } catch {
      // Try next.
    }
  }

  return undefined;
}

export function loadVerticalTemplates(): VerticalTemplate[] {
  const dir = resolveTemplateDir();
  if (!dir) {
    return [];
  }

  const files = readdirSync(dir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  return files.map(f => {
    const raw = readFileSync(join(dir, f), 'utf8');
    return parseYaml(raw) as VerticalTemplate;
  });
}

export function selectTemplate(enrichment: EnrichmentResult, override?: string): VerticalTemplate {
  const templates = loadVerticalTemplates();
  if (templates.length === 0) {
    throw new Error('No vertical templates found under templates/verticals/');
  }

  if (override) {
    const match = templates.find(t => t.id === override);
    if (match) {
      return match;
    }
  }

  const hint = enrichment.category_hint.toLowerCase();
  const direct = templates.find(t => t.id === hint);
  if (direct) {
    return direct;
  }

  const aliasMatch = templates.find(t => t.category_aliases.some(a => a.toLowerCase() === hint));
  if (aliasMatch) {
    return aliasMatch;
  }

  return templates[0];
}

const VARIABLE_PATTERN = /{{\s*([a-z_]\w*)\s*}}/gi;

export function fillSystemPrompt(template: VerticalTemplate, enrichment: EnrichmentResult): string {
  const values: Record<string, string> = {
    company_name: enrichment.business_name,
    vertical_label: enrichment.vertical_label,
    service_area: enrichment.service_area,
    business_hours: enrichment.business_hours,
    services_summary: enrichment.services_summary,
    response_window: enrichment.response_window ?? '24 business hours',
  };

  return template.system_prompt.replaceAll(VARIABLE_PATTERN, (_match: string, key: string) => values[key] ?? `{{${key}}}`);
}
