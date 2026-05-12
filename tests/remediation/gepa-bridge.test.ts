import {describe, expect, it} from 'vitest';
import {
  GepaUnavailableError,
  getSidecarPaths,
  isGepaAvailable,
  runGepaOptimization,
} from '../../src/remediation/gepa-bridge';

describe('getSidecarPaths', () => {
  it('returns absolute paths under ~/.cache/voice-evals/python/<version>/', () => {
    const paths = getSidecarPaths();
    expect(paths.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(paths.cache).toMatch(/\.cache.*voice-evals.*python/);
    expect(paths.bin).toMatch(/python/);
    expect(paths.script).toMatch(/gepa_run\.py$/);
    expect(paths.bin.startsWith(paths.cache)).toBe(true);
    expect(paths.script.startsWith(paths.cache)).toBe(true);
  });
});

describe('isGepaAvailable', () => {
  it('returns false when the sidecar is not installed (Phase 5 stub state)', () => {
    // In the test environment the venv/script don't exist — this is the
    // expected state until Phase 5.x lands the install path.
    expect(isGepaAvailable()).toBe(false);
  });
});

describe('runGepaOptimization', () => {
  it('throws GepaUnavailableError with install instructions when sidecar is missing', async () => {
    await expect(runGepaOptimization({prompts: {x: 'y'}, trainset: []}))
      .rejects.toThrow(GepaUnavailableError);

    try {
      await runGepaOptimization({prompts: {x: 'y'}, trainset: []});
    } catch (error) {
      expect(error).toBeInstanceOf(GepaUnavailableError);
      const {message} = (error as Error);
      expect(message).toContain('voice-evals doctor');
      expect(message).toMatch(/--install|sidecar/);
    }
  });
});

describe('GepaUnavailableError', () => {
  it('is a named subclass of Error', () => {
    const error = new GepaUnavailableError('test');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('GepaUnavailableError');
    expect(error.message).toBe('test');
  });
});
