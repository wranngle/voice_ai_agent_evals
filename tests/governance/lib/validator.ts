import * as path from 'node:path';

// Governance Constants
export const TAG_IDS = {
  DEV: 'Nbnc0KJVYlJeasQJ',
  ARCHIVED: '4k9QbQQTpxNkOoJQ',
};

export const BANNED_BUZZWORDS = [
  'agent',
  'orchestrator',
  'super',
  'hyper',
  'mega',
  'synapse',
  'synthesized',
  'autonomous',
];

export const ALLOWED_TRIGGER_NAMES = [
  'webhook_trigger',
  'schedule_trigger',
  'cron_trigger',
  'poll_trigger',
  'manual_trigger',
];

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

export const GovernanceValidator = {

  validate(workflow: any, fileName = 'workflow.json'): ValidationResult {
    const errors: string[] = [];

    // --- RULE 1: LITERAL TAGGING ---
    const hasDevTag = workflow.tags?.some((t: any) => t.id === TAG_IDS.DEV || t.name === 'DEV');
    const hasArchivedTag = workflow.tags?.some((t: any) => t.id === TAG_IDS.ARCHIVED || t.name === 'ARCHIVED');

    if (!hasDevTag && !hasArchivedTag) {
      errors.push(`Missing literal tag object. Must have ID ${TAG_IDS.DEV} (DEV) or ${TAG_IDS.ARCHIVED} (ARCHIVED)`);
    }

    // --- RULE 2: LITERAL ARCHIVING ---
    if (hasArchivedTag && workflow.active !== false) {
      errors.push('ARCHIVED workflows must be inactive (active: false)');
    }

    // --- RULE 3: NAMING CONVENTIONS ---
    if (/v\d+/i.test(workflow.name)) {
      errors.push('Name: No version numbers (v1, v2) allowed in workflow name');
    }

    for (const word of BANNED_BUZZWORDS) {
      if (workflow.name.toLowerCase().includes(word)) {
        errors.push(`Name: Banned buzzword '${word}' found in workflow name`);
      }
    }

    const nameWithoutExt = path.parse(fileName).name;
    // Basic kebab-case check: allows lowercase alphanumeric and hyphens
    if (!/^[a-z\d]+(-[a-z\d]+)*$/.test(nameWithoutExt)) {
      errors.push(`File Name: Must be kebab-case (got '${nameWithoutExt}')`);
    }

    // --- RULE 4: NODE RULES ---
    if (workflow.nodes) {
      for (const node of workflow.nodes as any[]) {
        const isTrigger = node.type.includes('trigger') || node.type.includes('webhook');

        if (isTrigger) {
          if (!ALLOWED_TRIGGER_NAMES.includes(node.name)) {
            errors.push(`Node '${node.name}': Trigger must use allowed generic name (${ALLOWED_TRIGGER_NAMES.join(', ')})`);
          }
        } else if (!/^[a-z\d_]+$/.test(node.name)) {
          errors.push(`Node '${node.name}': Name must be snake_case`);
        }

        if (!node.notes || node.notes.trim().length === 0) {
          errors.push(`Node '${node.name}': Must have notes`);
        }

        if (node.type === 'n8n-nodes-base.if') {
          errors.push(`Node '${node.name}': Must not be an IF node (use Switch)`);
        }
      }
    }

    // --- RULE 5: WEBHOOK STRUCTURE ---
    if (workflow.nodes) {
      for (const node of workflow.nodes as any[]) {
        if (node.type.includes('webhook')) {
          const pathParameter = node.parameters?.path;
          if (pathParameter) {
            if (pathParameter.includes('/')) {
              errors.push(`Webhook '${pathParameter}': Must be unnested (no slashes)`);
            }

            if (!/^[a-z\d-]+$/.test(pathParameter)) {
              errors.push(`Webhook '${pathParameter}': Must be kebab-case`);
            }
          }
        }
      }
    }

    // --- RULE 6: RESEARCH PREACTION ---
    if (!hasArchivedTag && (!workflow.meta?.research_proof || typeof workflow.meta.research_proof !== 'string')) {
      errors.push('Rule: Must have meta.research_proof (unless ARCHIVED)');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },

  calculateSimilarity(w1: any, w2: any): number {
    if (!w1.nodes || !w2.nodes) {
      return 0;
    }

    const types1 = new Set(w1.nodes.map((n: any) => n.type));
    const types2 = new Set(w2.nodes.map((n: any) => n.type));

    const intersection = new Set([...types1].filter(x => types2.has(x)));
    const union = new Set([...types1, ...types2]);

    if (union.size === 0) {
      return 0;
    }

    return intersection.size / union.size;
  },
};
