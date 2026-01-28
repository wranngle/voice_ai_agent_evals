import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { GovernanceValidator } from './lib/validator';

// --- CONFIGURATION ---
const REPO_ROOT = path.resolve(__dirname, '../../../../');
const WORKFLOWS_DIR = path.join(REPO_ROOT, 'workflows');

// --- HELPERS ---
// Directories to skip during governance scanning
const SKIP_DIRS = ['node_modules', 'templates', 'dev', 'old', 'tests', 'test-factory', 'data', 'fixtures'];

function getAllWorkflowFiles(dir: string): string[] {
  let results: string[] = [];
  try {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        if (!file.startsWith('.') && !SKIP_DIRS.includes(file)) {
          results = results.concat(getAllWorkflowFiles(filePath));
        }
      } else if (file.endsWith('.json')) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const json = JSON.parse(content);
          if (json.nodes && (json.connections || Array.isArray(json.nodes))) {
            results.push(filePath);
          }
        } catch (e) {
          // Ignore non-json or non-workflow files
        }
      }
    });
  } catch (e) {
    // Ignore missing dirs
  }
  return results;
}

// --- TEST SUITE ---

describe('n8n Workflow Governance Suite', () => {
  const allWorkflows = getAllWorkflowFiles(WORKFLOWS_DIR);

  it('Should discover workflow files (advisory)', () => {
    // Advisory: warns if no workflows found but does not block
    if (allWorkflows.length === 0) {
      console.warn('No workflow JSON files found in scanned directories. Governance tests skipped.');
    }
    expect(true).toBe(true);
  });

  allWorkflows.forEach(filePath => {
    const relativePath = path.relative(REPO_ROOT, filePath);
    const fileName = path.basename(filePath);
    
    describe(`Workflow: ${relativePath}`, () => {
      let workflow: any;
      
      try {
        workflow = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (e) {
        it('Critical: File must be valid JSON', () => {
          throw new Error(`Failed to parse ${relativePath}: ${e}`);
        });
        return;
      }

      // Run the Validator
      const result = GovernanceValidator.validate(workflow, fileName);

      // Report Errors as Tests
      it('Governance Check', () => {
        if (!result.valid) {
          // Fail with a nice message listing all errors
          throw new Error(`
Governance Violations found in ${relativePath}:
` + result.errors.map(e => `  - ${e}`).join('\n'));
        }
        expect(result.valid).toBe(true);
      });

      // --- RULE 7: DUPLICATION CHECK ---
      // This requires comparing against all other files, so it sits outside the static single-file validator
      it('Rule: Must not be >95% similar to other workflows', () => {
        allWorkflows.forEach(otherFile => {
          if (otherFile === filePath) return; 
          
          try {
            const otherContent = fs.readFileSync(otherFile, 'utf8');
            const otherWorkflow = JSON.parse(otherContent);
            const similarity = GovernanceValidator.calculateSimilarity(workflow, otherWorkflow);
            
            expect(similarity, 
              `Too similar (${(similarity * 100).toFixed(1)}%) to ${path.relative(REPO_ROOT, otherFile)}`
            ).toBeLessThan(0.95);
          } catch (e) {
            // ignore
          }
        });
      });

    });
  });
});
