/**
 * List all n8n workflows and identify potential duplicates.
 *
 * Required env: N8N_API_KEY, N8N_API_URL (base URL, e.g.
 * https://your-n8n-host.example.com/api/v1).
 *
 * Usage: bun scripts/list-workflows.ts
 */

import {normalizeN8nApiUrl} from '../src/n8n-url';

// `N8N_API_URL` is documented as required. Falling back to a placeholder
// host silently aimed past the user's actual n8n; surface the omission with
// usage instead.
const API_URL = process.env.N8N_API_URL ?? '';
const API_KEY = process.env.N8N_API_KEY ?? '';

type Workflow = {
  id: string;
  name: string;
  active: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

type WorkflowsPage = {
  data: Workflow[];
  nextCursor?: string;
};

const PAGE_SIZE = 100;
// Safety cap: if pagination ever loops, refuse to walk more than this many
// pages so the script can't melt under a misbehaving server response.
const MAX_PAGES = 200;

async function fetchAllWorkflows(): Promise<Workflow[]> {
  const baseUrl = normalizeN8nApiUrl(API_URL);
  const out: Workflow[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${baseUrl}/workflows`);
    url.searchParams.set('limit', String(PAGE_SIZE));
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    const response = await fetch(url, {headers: {'X-N8N-API-KEY': API_KEY}});
    if (!response.ok) {
      throw new Error(`n8n API ${response.status} ${response.statusText} for ${url.toString()}`);
    }

    const body = await response.json() as WorkflowsPage;
    const items = body.data ?? [];
    out.push(...items);

    if (!body.nextCursor || items.length === 0) {
      return out;
    }

    cursor = body.nextCursor;
  }

  throw new Error(`workflow pagination exceeded ${MAX_PAGES} pages — refusing to continue`);
}

async function main() {
  if (!API_KEY) {
    console.error('Error: N8N_API_KEY environment variable not set');
    process.exit(1);
  }

  if (!API_URL) {
    console.error('Error: N8N_API_URL environment variable not set');
    console.error('   Export the base URL of your n8n instance (e.g.');
    console.error('   https://n8n.your-host.example/api/v1) before running this script.');
    process.exit(1);
  }

  const workflows = await fetchAllWorkflows();

  console.log('\n=== n8n Workflow Analysis ===');
  console.log(`Total workflows: ${workflows.length}\n`);

  // Group by base name (remove prefixes, versions, duplicates markers)
  const groups: Record<string, Workflow[]> = {};

  for (const w of workflows) {
    // Normalize name: remove [DEV], [ARCHIVED], version numbers, "dup X", etc.
    const baseName = w.name
      .replace(/^\[(dev|alpha|beta|prod|archived)]\s*/i, '')
      .replaceAll(/\s*\(dup\s*\d*\)/gi, '')
      .replace(/\s*v\d+(\.\d+)*$/i, '')
      .replace(/\s*-\s*(bulletproof|fixed|new|old|test|backup).*$/i, '')
      .trim()
      .toLowerCase();

    groups[baseName] ||= [];
    groups[baseName].push(w);
  }

  // Find duplicates (groups with more than 1 workflow)
  const duplicates = Object.entries(groups).filter(([_, items]) => items.length > 1);

  console.log(`=== Potential Duplicates (${duplicates.length} groups) ===\n`);

  for (const [baseName, items] of duplicates.sort((a, b) => b[1].length - a[1].length)) {
    console.log(`"${baseName}" (${items.length} versions):`);
    for (const w of items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())) {
      const status = w.active ? '✓ ACTIVE' : (w.isArchived || w.name.includes('[ARCHIVED]') ? '⊘ ARCHIVED' : '○ INACTIVE');
      const updated = new Date(w.updatedAt).toLocaleDateString();
      console.log(`  ${status.padEnd(12)} | ${w.id} | ${w.name.slice(0, 50)} | ${updated}`);
    }

    console.log('');
  }

  // Summary
  const activeCount = workflows.filter(w => w.active).length;
  const archivedCount = workflows.filter(w => w.isArchived || w.name.includes('[ARCHIVED]')).length;
  const inactiveCount = workflows.length - activeCount - archivedCount;

  console.log('=== Summary ===');
  console.log(`Active: ${activeCount}`);
  console.log(`Inactive: ${inactiveCount}`);
  console.log(`Archived: ${archivedCount}`);
  console.log(`Duplicate groups: ${duplicates.length}`);
  console.log(`Total duplicate workflows: ${duplicates.reduce((sum, [_, items]) => sum + items.length, 0)}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Fatal error:', message);
  process.exit(1);
});
