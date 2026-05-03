/**
 * List all n8n workflows and identify potential duplicates
 */

const API_URL = process.env.N8N_API_URL || "https://your-n8n-host.example.com/api/v1/workflows?limit=100";
const API_KEY = process.env.N8N_API_KEY;
if (!API_KEY) {
  throw new Error("N8N_API_KEY env var required");
}

interface Workflow {
  id: string;
  name: string;
  active: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

async function main() {
  const response = await fetch(API_URL, {
    headers: { "X-N8N-API-KEY": API_KEY }
  });

  const data = await response.json() as { data: Workflow[] };
  const workflows = data.data || [];

  console.log(`\n=== n8n Workflow Analysis ===`);
  console.log(`Total workflows: ${workflows.length}\n`);

  // Group by base name (remove prefixes, versions, duplicates markers)
  const groups: Record<string, Workflow[]> = {};

  for (const w of workflows) {
    // Normalize name: remove [DEV], [ARCHIVED], version numbers, "dup X", etc.
    const baseName = w.name
      .replace(/^\[(DEV|ALPHA|BETA|PROD|ARCHIVED)\]\s*/i, '')
      .replace(/\s*\(dup\s*\d*\)/gi, '')
      .replace(/\s*v\d+(\.\d+)*$/i, '')
      .replace(/\s*-\s*(BULLETPROOF|FIXED|NEW|OLD|TEST|BACKUP).*$/i, '')
      .trim()
      .toLowerCase();

    if (!groups[baseName]) groups[baseName] = [];
    groups[baseName].push(w);
  }

  // Find duplicates (groups with more than 1 workflow)
  const duplicates = Object.entries(groups).filter(([_, items]) => items.length > 1);

  console.log(`=== Potential Duplicates (${duplicates.length} groups) ===\n`);

  for (const [baseName, items] of duplicates.sort((a, b) => b[1].length - a[1].length)) {
    console.log(`"${baseName}" (${items.length} versions):`);
    for (const w of items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())) {
      const status = w.active ? '✓ ACTIVE' : w.isArchived || w.name.includes('[ARCHIVED]') ? '⊘ ARCHIVED' : '○ INACTIVE';
      const updated = new Date(w.updatedAt).toLocaleDateString();
      console.log(`  ${status.padEnd(12)} | ${w.id} | ${w.name.slice(0, 50)} | ${updated}`);
    }
    console.log('');
  }

  // Summary
  const activeCount = workflows.filter(w => w.active).length;
  const archivedCount = workflows.filter(w => w.isArchived || w.name.includes('[ARCHIVED]')).length;
  const inactiveCount = workflows.length - activeCount - archivedCount;

  console.log(`=== Summary ===`);
  console.log(`Active: ${activeCount}`);
  console.log(`Inactive: ${inactiveCount}`);
  console.log(`Archived: ${archivedCount}`);
  console.log(`Duplicate groups: ${duplicates.length}`);
  console.log(`Total duplicate workflows: ${duplicates.reduce((sum, [_, items]) => sum + items.length, 0)}`);
}

main().catch(console.error);
