import {describe, expect, it} from 'vitest';
import {runDoctor} from '../../src/cli/commands/doctor';

describe('runDoctor', () => {
  it('exits 0 and writes the sidecar status report', async () => {
    const lines: string[] = [];
    const code = await runDoctor({out: line => lines.push(line)});
    expect(code).toBe(0);
    const joined = lines.join('\n');
    expect(joined).toContain('voice-evals doctor');
    expect(joined).toContain('Sidecar version');
    expect(joined).toContain('Status:');
    expect(joined).toMatch(/(available|unavailable)/);
    expect(joined).toContain('VOICE_EVALS_SKIP_PYTHON_INSTALL');
  });
});
