/**
 * Local Storage Client
 *
 * File-based storage for testing framework data.
 * Uses JSON files for simple, reliable local storage.
 */

import {
  existsSync, mkdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import type {
  TestRequirement,
  TestCase,
  TestResult,
  TestRun,
  TestType,
  TestStatus,
} from './types';

// Storage directory - read dynamically to support test isolation
function getStorageDir(): string {
  return process.env.TEST_STORAGE_DIR || join(process.cwd(), '.test-data');
}

// Storage files - computed dynamically
function getFiles() {
  const dir = getStorageDir();
  return {
    requirements: join(dir, 'requirements.json'),
    cases: join(dir, 'cases.json'),
    results: join(dir, 'results.json'),
    runs: join(dir, 'runs.json'),
  } as const;
}

type StorageData<T> = {
  items: T[];
  lastUpdated: string;
};

/**
 * Ensure storage directory exists
 */
function ensureStorageDir(): void {
  const dir = getStorageDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, {recursive: true});
  }
}

/**
 * Read data from a storage file.
 *
 * On parse failure or unexpected shape, throws — silently returning an empty
 * store would let a corrupt file masquerade as "no data yet" and the next
 * write would clobber whatever was actually on disk.
 */
function readStorage<T>(file: string): StorageData<T> {
  ensureStorageDir();
  if (!existsSync(file)) {
    return {items: [], lastUpdated: new Date().toISOString()};
  }

  const content = readFileSync(file, 'utf-8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse storage file ${file}: ${message}. Inspect or delete the file before retrying.`);
  }

  if (
    typeof parsed !== 'object'
    || parsed === null
    || !Array.isArray((parsed as {items?: unknown}).items)
    || typeof (parsed as {lastUpdated?: unknown}).lastUpdated !== 'string'
  ) {
    throw new Error(`Storage file ${file} is malformed: expected {items: T[], lastUpdated: string}. Inspect or delete the file before retrying.`);
  }

  return parsed as StorageData<T>;
}

/**
 * Write data to a storage file
 */
function writeStorage<T>(file: string, data: StorageData<T>): void {
  ensureStorageDir();
  data.lastUpdated = new Date().toISOString();
  writeFileSync(file, JSON.stringify(data, null, 2));
}

/**
 * Generate a unique ID for a stored entity.
 *
 * Format: `<PREFIX>-<base36-timestamp>-<8-hex-chars>` — the timestamp segment
 * keeps creation-order roughly recoverable from the ID; the suffix is 32 bits
 * of crypto.randomBytes for collision-resistance under tight loops.
 *
 * Birthday-collision resistance: 32 random bits ≈ 65k entries before 50%
 * chance of one collision. The earlier `Math.random().toString(36).slice(2, 5)`
 * surface (≈15.5 bits / 46k values) collided ~10% of runs at 100 IDs.
 */
export function generateId(prefix: 'REQ' | 'TC' | 'RUN' | 'RES'): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

// ============================================
// Requirements CRUD
// ============================================

export function createRequirementSync(requirement: Omit<TestRequirement, 'requirement_id' | 'captured_at'>): TestRequirement {
  const data = readStorage<TestRequirement>(getFiles().requirements);
  const newRequest: TestRequirement = {
    ...requirement,
    requirement_id: generateId('REQ'),
    captured_at: new Date().toISOString(),
  };
  data.items.push(newRequest);
  writeStorage(getFiles().requirements, data);
  return newRequest;
}

export function getRequirementSync(requirementId: string): TestRequirement | undefined {
  const data = readStorage<TestRequirement>(getFiles().requirements);
  return data.items.find(r => r.requirement_id === requirementId);
}

export function listRequirementsSync(parameters?: {limit?: number; offset?: number}): TestRequirement[] {
  const data = readStorage<TestRequirement>(getFiles().requirements);
  const offset = parameters?.offset || 0;
  const limit = parameters?.limit || 100;
  return data.items.slice(offset, offset + limit);
}

export function updateRequirementSync(
  requirementId: string,
  updates: Partial<TestRequirement>,
): TestRequirement | undefined {
  const data = readStorage<TestRequirement>(getFiles().requirements);
  const index = data.items.findIndex(r => r.requirement_id === requirementId);
  if (index === -1) {
    return undefined;
  }

  data.items[index] = {...data.items[index], ...updates};
  writeStorage(getFiles().requirements, data);
  return data.items[index];
}

export function deleteRequirementSync(requirementId: string): boolean {
  const data = readStorage<TestRequirement>(getFiles().requirements);
  const index = data.items.findIndex(r => r.requirement_id === requirementId);
  if (index === -1) {
    return false;
  }

  data.items.splice(index, 1);
  writeStorage(getFiles().requirements, data);
  return true;
}

// ============================================
// Test Cases CRUD
// ============================================

export function createTestCaseSync(testCase: Omit<TestCase, 'test_id' | 'created_at' | 'updated_at'>): TestCase {
  const data = readStorage<TestCase>(getFiles().cases);
  const now = new Date().toISOString();
  const newCase: TestCase = {
    ...testCase,
    test_id: generateId('TC'),
    created_at: now,
    updated_at: now,
  };
  data.items.push(newCase);
  writeStorage(getFiles().cases, data);
  return newCase;
}

export function getTestCaseSync(testId: string): TestCase | undefined {
  const data = readStorage<TestCase>(getFiles().cases);
  return data.items.find(c => c.test_id === testId);
}

export function listTestCasesSync(parameters?: {
  limit?: number;
  offset?: number;
  type?: TestType;
  requirementId?: string;
  tag?: string;
  enabled?: boolean;
}): TestCase[] {
  const data = readStorage<TestCase>(getFiles().cases);
  let {items} = data;

  if (parameters?.type) {
    items = items.filter(c => c.type === parameters.type);
  }

  if (parameters?.requirementId) {
    items = items.filter(c => c.requirement_id === parameters.requirementId);
  }

  if (parameters?.tag) {
    items = items.filter(c => c.tags.includes(parameters.tag!));
  }

  if (parameters?.enabled !== undefined) {
    items = items.filter(c => c.enabled === parameters.enabled);
  }

  const offset = parameters?.offset || 0;
  const limit = parameters?.limit || 100;
  return items.slice(offset, offset + limit);
}

export function updateTestCaseSync(
  testId: string,
  updates: Partial<TestCase>,
): TestCase | undefined {
  const data = readStorage<TestCase>(getFiles().cases);
  const index = data.items.findIndex(c => c.test_id === testId);
  if (index === -1) {
    return undefined;
  }

  data.items[index] = {
    ...data.items[index],
    ...updates,
    updated_at: new Date().toISOString(),
  };
  writeStorage(getFiles().cases, data);
  return data.items[index];
}

export function deleteTestCaseSync(testId: string): boolean {
  const data = readStorage<TestCase>(getFiles().cases);
  const index = data.items.findIndex(c => c.test_id === testId);
  if (index === -1) {
    return false;
  }

  data.items.splice(index, 1);
  writeStorage(getFiles().cases, data);
  return true;
}

// ============================================
// Test Results CRUD
// ============================================

export function createTestResultSync(result: Omit<TestResult, 'result_id' | 'executed_at'>): TestResult {
  const data = readStorage<TestResult>(getFiles().results);
  const newResult: TestResult = {
    ...result,
    result_id: generateId('RES'),
    executed_at: new Date().toISOString(),
  };
  data.items.push(newResult);
  writeStorage(getFiles().results, data);
  return newResult;
}

export function getTestResultSync(resultId: string): TestResult | undefined {
  const data = readStorage<TestResult>(getFiles().results);
  return data.items.find(r => r.result_id === resultId);
}

export function listTestResultsSync(parameters?: {
  limit?: number;
  offset?: number;
  testId?: string;
  executionId?: string;
  status?: TestStatus;
}): TestResult[] {
  const data = readStorage<TestResult>(getFiles().results);
  let {items} = data;

  if (parameters?.testId) {
    items = items.filter(r => r.test_id === parameters.testId);
  }

  if (parameters?.executionId) {
    items = items.filter(r => r.execution_id === parameters.executionId);
  }

  if (parameters?.status) {
    items = items.filter(r => r.status === parameters.status);
  }

  const offset = parameters?.offset || 0;
  const limit = parameters?.limit || 100;
  return items.slice(offset, offset + limit);
}

function getResultsByRunSync(executionId: string): TestResult[] {
  return listTestResultsSync({executionId});
}

// ============================================
// Test Runs CRUD
// ============================================

export function createTestRunSync(run: Omit<TestRun, 'execution_id' | 'started_at'>): TestRun {
  const data = readStorage<TestRun>(getFiles().runs);
  const newRun: TestRun = {
    ...run,
    execution_id: generateId('RUN'),
    started_at: new Date().toISOString(),
  };
  data.items.push(newRun);
  writeStorage(getFiles().runs, data);
  return newRun;
}

export function getTestRunSync(executionId: string): TestRun | undefined {
  const data = readStorage<TestRun>(getFiles().runs);
  return data.items.find(r => r.execution_id === executionId);
}

export function listTestRunsSync(parameters?: {
  limit?: number;
  offset?: number;
  triggeredBy?: TestRun['triggered_by'];
}): TestRun[] {
  const data = readStorage<TestRun>(getFiles().runs);
  let {items} = data;

  if (parameters?.triggeredBy) {
    items = items.filter(r => r.triggered_by === parameters.triggeredBy);
  }

  const offset = parameters?.offset || 0;
  const limit = parameters?.limit || 100;
  return items.slice(offset, offset + limit);
}

export function completeTestRunSync(
  executionId: string,
  stats: {
    total_tests: number;
    passed: number;
    failed: number;
    errors: number;
    skipped: number;
    avg_latency_ms: number;
  },
): TestRun | undefined {
  const data = readStorage<TestRun>(getFiles().runs);
  const index = data.items.findIndex(r => r.execution_id === executionId);
  if (index === -1) {
    return undefined;
  }

  const passRate = stats.total_tests > 0
    ? (stats.passed / stats.total_tests) * 100
    : 0;

  data.items[index] = {
    ...data.items[index],
    ...stats,
    pass_rate: Math.round(passRate * 100) / 100,
    completed_at: new Date().toISOString(),
  };
  writeStorage(getFiles().runs, data);
  return data.items[index];
}

// ============================================
// Utility Functions
// ============================================

export function captureRequirementSync(
  userIntent: string,
  options?: {
    verbatimQuote?: string;
    source?: string;
    tags?: string[];
  },
): TestRequirement {
  return createRequirementSync({
    user_intent: userIntent,
    verbatim_quote: options?.verbatimQuote,
    status: 'captured',
    source: options?.source || 'manual',
    linked_tests: [],
    tags: options?.tags,
  });
}

export function linkTestToRequirementSync(
  testId: string,
  requirementId: string,
): {testCase: TestCase | undefined; requirement: TestRequirement | undefined} {
  const testCase = updateTestCaseSync(testId, {requirement_id: requirementId});

  const requirement = getRequirementSync(requirementId);
  if (requirement) {
    const linkedTests = [...(requirement.linked_tests || [])];
    if (!linkedTests.includes(testId)) {
      linkedTests.push(testId);
      updateRequirementSync(requirementId, {linked_tests: linkedTests});
    }
  }

  return {testCase, requirement: getRequirementSync(requirementId)};
}

export function getRequirementCoverageSync(): Array<{
  requirement_id: string;
  user_intent: string;
  test_count: number;
  coverage_status: 'covered' | 'partial' | 'uncovered';
}> {
  const requirements = listRequirementsSync();
  return requirements.map(request => ({
    requirement_id: request.requirement_id,
    user_intent: request.user_intent,
    test_count: request.linked_tests?.length || 0,
    coverage_status: (request.linked_tests?.length || 0) > 0 ? 'covered' : 'uncovered' as const,
  }));
}

/**
 * Clear all test data (useful for test cleanup)
 */
export function clearAllDataSync(): void {
  writeStorage(getFiles().requirements, {items: [], lastUpdated: new Date().toISOString()});
  writeStorage(getFiles().cases, {items: [], lastUpdated: new Date().toISOString()});
  writeStorage(getFiles().results, {items: [], lastUpdated: new Date().toISOString()});
  writeStorage(getFiles().runs, {items: [], lastUpdated: new Date().toISOString()});
}

// ============================================
// Async Wrappers (for API compatibility)
// ============================================

export async function createRequirement(requirement: Omit<TestRequirement, 'requirement_id' | 'captured_at'>): Promise<{success: true; data: TestRequirement}> {
  return {success: true, data: createRequirementSync(requirement)};
}

export async function getRequirement(requirementId: string): Promise<{success: boolean; data?: TestRequirement}> {
  const data = getRequirementSync(requirementId);
  return data ? {success: true, data} : {success: false};
}

export async function listRequirements(parameters?: {limit?: number; offset?: number}): Promise<{success: true; data: TestRequirement[]}> {
  return {success: true, data: listRequirementsSync(parameters)};
}

export async function updateRequirement(
  requirementId: string,
  updates: Partial<TestRequirement>,
): Promise<{success: boolean; data?: TestRequirement}> {
  const data = updateRequirementSync(requirementId, updates);
  return data ? {success: true, data} : {success: false};
}

export async function captureRequirement(
  userIntent: string,
  options?: {verbatimQuote?: string; source?: string; tags?: string[]},
): Promise<{success: true; data: TestRequirement}> {
  return {success: true, data: captureRequirementSync(userIntent, options)};
}

export async function createTestCase(testCase: Omit<TestCase, 'test_id' | 'created_at' | 'updated_at'>): Promise<{success: true; data: TestCase}> {
  return {success: true, data: createTestCaseSync(testCase)};
}

export async function getTestCase(testId: string): Promise<{success: boolean; data?: TestCase}> {
  const data = getTestCaseSync(testId);
  return data ? {success: true, data} : {success: false};
}

export async function listTestCases(parameters?: {limit?: number; offset?: number; type?: TestType; requirementId?: string; tag?: string; enabled?: boolean}): Promise<{success: true; data: TestCase[]}> {
  return {success: true, data: listTestCasesSync(parameters)};
}

export async function updateTestCase(
  testId: string,
  updates: Partial<TestCase>,
): Promise<{success: boolean; data?: TestCase}> {
  const data = updateTestCaseSync(testId, updates);
  return data ? {success: true, data} : {success: false};
}

export async function deleteTestCase(testId: string): Promise<{success: boolean}> {
  return {success: deleteTestCaseSync(testId)};
}

export async function createTestResult(result: Omit<TestResult, 'result_id' | 'executed_at'>): Promise<{success: true; data: TestResult}> {
  return {success: true, data: createTestResultSync(result)};
}

export async function getTestResult(resultId: string): Promise<{success: boolean; data?: TestResult}> {
  const data = getTestResultSync(resultId);
  return data ? {success: true, data} : {success: false};
}

export async function listTestResults(parameters?: {limit?: number; offset?: number; testId?: string; executionId?: string; status?: TestStatus}): Promise<{success: true; data: TestResult[]}> {
  return {success: true, data: listTestResultsSync(parameters)};
}

export async function getResultsByRun(executionId: string): Promise<{success: true; data: TestResult[]}> {
  return {success: true, data: getResultsByRunSync(executionId)};
}

export async function createTestRun(run: Omit<TestRun, 'execution_id' | 'started_at'>): Promise<{success: true; data: TestRun}> {
  return {success: true, data: createTestRunSync(run)};
}

export async function getTestRun(executionId: string): Promise<{success: boolean; data?: TestRun}> {
  const data = getTestRunSync(executionId);
  return data ? {success: true, data} : {success: false};
}

export async function listTestRuns(parameters?: {limit?: number; offset?: number; triggeredBy?: TestRun['triggered_by']}): Promise<{success: true; data: TestRun[]}> {
  return {success: true, data: listTestRunsSync(parameters)};
}

export async function completeTestRun(
  executionId: string,
  stats: {total_tests: number; passed: number; failed: number; errors: number; skipped: number; avg_latency_ms: number},
): Promise<{success: boolean; data?: TestRun}> {
  const data = completeTestRunSync(executionId, stats);
  return data ? {success: true, data} : {success: false};
}

export async function linkTestToRequirement(
  testId: string,
  requirementId: string,
): Promise<{testUpdate: {success: boolean; data?: TestCase}; reqUpdate: {success: boolean; data?: TestRequirement}}> {
  const result = linkTestToRequirementSync(testId, requirementId);
  return {
    testUpdate: result.testCase ? {success: true, data: result.testCase} : {success: false},
    reqUpdate: result.requirement ? {success: true, data: result.requirement} : {success: false},
  };
}

export async function getRequirementCoverage(): Promise<{success: true; data: Array<{requirement_id: string; user_intent: string; test_count: number; coverage_status: 'covered' | 'partial' | 'uncovered'}>}> {
  return {success: true, data: getRequirementCoverageSync()};
}
