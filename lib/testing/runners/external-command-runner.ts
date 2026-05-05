/**
 * External Command Runner
 *
 * Runs an app-owned validation command and normalizes the result into the
 * harness result shape. This is the bridge for repos that already own their
 * Vitest, Playwright, accessibility, or domain-eval suites.
 */

import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {dirname} from 'node:path';
import {performance} from 'node:perf_hooks';
import type {TestCase} from '../types';
import type {
  ExternalCommandExpectedOutput,
  ExternalCommandTestConfig,
  RunOptions,
  TestExecutionResult,
  TestRunner,
} from './types';

const DEFAULT_TIMEOUT_MS = 120_000;
const OUTPUT_TAIL_CHARS = 12_000;

function commandEnv(config: ExternalCommandTestConfig, options: RunOptions): NodeJS.ProcessEnv {
  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
  const existingPath = process.env[pathKey] ?? process.env.PATH ?? '';
  const runtimeBin = dirname(process.execPath);
  return {
    ...process.env,
    [pathKey]: existingPath.includes(runtimeBin) ? existingPath : `${runtimeBin}:${existingPath}`,
    ...options.env,
    ...config.env,
  };
}

function tailText(value: string): string {
  return value.length <= OUTPUT_TAIL_CHARS ? value : value.slice(-OUTPUT_TAIL_CHARS);
}

function asConfig(testCase: TestCase): ExternalCommandTestConfig {
  return testCase.input as ExternalCommandTestConfig;
}

function asExpected(testCase: TestCase): ExternalCommandExpectedOutput {
  return testCase.expected_output;
}

function containsAll(haystack: string, needles?: string[]): {passed: boolean; missing: string[]} {
  const missing = (needles ?? []).filter(needle => !haystack.includes(needle));
  return {passed: missing.length === 0, missing};
}

function containsNone(haystack: string, needles?: string[]): {passed: boolean; present: string[]} {
  const present = (needles ?? []).filter(needle => haystack.includes(needle));
  return {passed: present.length === 0, present};
}

/**
 * Runner for app-owned command suites.
 */
export class ExternalCommandRunner implements TestRunner {
  readonly type = 'external-command' as const;

  validate(testCase: TestCase): {valid: boolean; errors: string[]} {
    const config = asConfig(testCase);
    const errors: string[] = [];

    if (!config.command || typeof config.command !== 'string') {
      errors.push('Missing required field: command');
    }

    if (config.cwd && !existsSync(config.cwd)) {
      errors.push(`cwd does not exist: ${config.cwd}`);
    }

    if (config.timeout_ms !== undefined && (!Number.isFinite(config.timeout_ms) || config.timeout_ms <= 0)) {
      errors.push('timeout_ms must be a positive number');
    }

    return {valid: errors.length === 0, errors};
  }

  async execute(testCase: TestCase, options: RunOptions = {}): Promise<TestExecutionResult> {
    const config = asConfig(testCase);
    const expected = asExpected(testCase);
    const timeout = options.timeout ?? config.timeout_ms ?? DEFAULT_TIMEOUT_MS;
    const expectedExitCode = expected.exit_code ?? config.expected_exit_code ?? 0;
    const startTime = performance.now();

    return new Promise<TestExecutionResult>(resolve => {
      let stdout = '';
      let stderr = '';
      let settled = false;

      const child = spawn(config.command, {
        cwd: config.cwd ?? process.cwd(),
        env: commandEnv(config, options),
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const finish = (result: Omit<TestExecutionResult, 'latency_ms'>): void => {
        if (settled) {
          return;
        }

        settled = true;
        resolve({
          ...result,
          latency_ms: Math.round(performance.now() - startTime),
          artifacts: config.artifacts,
          dimensions: config.dimensions,
        });
      };

      const timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        finish({
          status: 'error',
          actual_output: {
            command: config.command,
            cwd: config.cwd ?? process.cwd(),
            stdout_tail: tailText(stdout),
            stderr_tail: tailText(stderr),
            timed_out: true,
          },
          error_message: `External command timed out after ${timeout}ms`,
          assertions_passed: 0,
          assertions_failed: 1,
        });
      }, timeout);

      child.stdout?.on('data', chunk => {
        stdout += String(chunk);
      });

      child.stderr?.on('data', chunk => {
        stderr += String(chunk);
      });

      child.on('error', error => {
        clearTimeout(timeoutId);
        finish({
          status: 'error',
          actual_output: {
            command: config.command,
            cwd: config.cwd ?? process.cwd(),
            stdout_tail: tailText(stdout),
            stderr_tail: tailText(stderr),
          },
          error_message: error.message,
          assertions_passed: 0,
          assertions_failed: 1,
        });
      });

      child.on('close', code => {
        clearTimeout(timeoutId);
        const stdoutCheck = containsAll(stdout, expected.stdout_contains);
        const stderrCheck = containsAll(stderr, expected.stderr_contains);
        const stdoutForbiddenCheck = containsNone(stdout, expected.stdout_not_contains);
        const stderrForbiddenCheck = containsNone(stderr, expected.stderr_not_contains);
        const exitCodePassed = code === expectedExitCode;
        const assertions = [exitCodePassed, stdoutCheck.passed, stderrCheck.passed];

        if ((expected.stdout_not_contains?.length ?? 0) > 0) {
          assertions.push(stdoutForbiddenCheck.passed);
        }

        if ((expected.stderr_not_contains?.length ?? 0) > 0) {
          assertions.push(stderrForbiddenCheck.passed);
        }

        const assertionsPassed = assertions.filter(Boolean).length;
        const assertionsFailed = assertions.length - assertionsPassed;
        const failures = [
          exitCodePassed ? '' : `Expected exit code ${expectedExitCode}, got ${code ?? 'unknown'}`,
          ...stdoutCheck.missing.map(needle => `stdout missing: ${needle}`),
          ...stderrCheck.missing.map(needle => `stderr missing: ${needle}`),
          ...stdoutForbiddenCheck.present.map(needle => `stdout contained forbidden text: ${needle}`),
          ...stderrForbiddenCheck.present.map(needle => `stderr contained forbidden text: ${needle}`),
        ].filter(Boolean);

        finish({
          status: assertionsFailed === 0 ? 'passed' : 'failed',
          actual_output: {
            command: config.command,
            cwd: config.cwd ?? process.cwd(),
            exit_code: code,
            stdout_tail: tailText(stdout),
            stderr_tail: tailText(stderr),
          },
          error_message: failures.length > 0 ? failures.join('; ') : undefined,
          assertions_passed: assertionsPassed,
          assertions_failed: assertionsFailed,
        });
      });
    });
  }
}

export const externalCommandRunner = new ExternalCommandRunner();
