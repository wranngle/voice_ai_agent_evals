import {describe, expect, it} from 'vitest';
import {runHelp} from '../../src/cli/commands/help';

describe('runHelp', () => {
  it('prints the v1.0 surface, not legacy harness vocabulary', async () => {
    const lines: string[] = [];
    const code = await runHelp({out: line => lines.push(line)});
    expect(code).toBe(0);
    const joined = lines.join('\n');
    expect(joined).toContain('voice-evals');
    expect(joined).toContain('score <wav-file>');
    expect(joined).toContain('ingest <transcript-file>');
    expect(joined).toContain('polish <agent-id>');
    expect(joined).toContain('baseline capture');
    expect(joined).toContain('doctor');
    expect(joined).toContain('legacy');
    expect(joined).not.toContain('.test-data/');
    expect(joined).not.toContain('SCEN-');
  });
});
