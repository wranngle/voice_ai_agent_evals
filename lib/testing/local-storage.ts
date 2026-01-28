/**
 * Local Storage Client
 *
 * File-based storage for testing framework data.
 * Uses JSON files for simple, reliable local storage.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
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

interface StorageData<T> {
  items: T[];
  lastUpdated: string;
}

/**
 * Ensure storage directory exists
 */
function ensureStorageDir(): void {
  const dir = getStorageDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Read data from a storage file
 */
function readStorage<T>(file: string): StorageData<T> {
  ensureStorageDir();
  if (!existsSync(file)) {
    return { items: [], lastUpdated: new Date().toISOString() };
  }
  try {
    const content = readFileSync(file, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { items: [], lastUpdated: new Date().toISOString() };
  }
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
 * Generate unique IDs for different entity types
 */
export function generateId(prefix: 'REQ' | 'TC' | 'RUN' | 'RES'): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

// ============================================
// Requirements CRUD
// ============================================

export function createRequirementSync(
  requirement: Omit<TestRequirement, 'requirement_id' | 'captured_at'>
): TestRequirement {
  const data = readStorage<TestRequirement>(getFiles().requirements);
  const newReq: TestRequirement = {
    ...requirement,
    requirement_id: generateId('REQ'),
    captured_at: new Date().toISOString(),
  };
  data.items.push(newReq);
  writeStorage(getFiles().requirements, data);
  return newReq;
}

export function getRequirementSync(requirementId: string): TestRequirement | undefined {
  const data = readStorage<TestRequirement>(getFiles().requirements);
  return data.items.find(r => r.requirement_id === requirementId);
}

export function listRequirementsSync(params?: { limit?: number; offset?: number }): TestRequirement[] {
  const data = readStorage<TestRequirement>(getFiles().requirements);
  const offset = params?.offset || 0;
  const limit = params?.limit || 100;
  return data.items.slice(offset, offset + limit);
}

export function updateRequirementSync(
  requirementId: string,
  updates: Partial<TestRequirement>
): TestRequirement | undefined {
  const data = readStorage<TestRequirement>(getFiles().requirements);
  const index = data.items.findIndex(r => r.requirement_id === requirementId);
  if (index === -1) return undefined;

  data.items[index] = { ...data.items[index], ...updates };
  writeStorage(getFiles().requirements, data);
  return data.items[index];
}

export function deleteRequirementSync(requirementId: string): boolean {
  const data = readStorage<TestRequirement>(getFiles().requirements);
  const index = data.items.findIndex(r => r.requirement_id === requirementId);
  if (index === -1) return false;

  data.items.splice(index, 1);
  writeStorage(getFiles().requirements, data);
  return true;
}

// ============================================
// Test Cases CRUD
// ============================================

export function createTestCaseSync(
  testCase: Omit<TestCase, 'test_id' | 'created_at' | 'updated_at'>
): TestCase {
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

export function listTestCasesSync(params?: {
  limit?: number;
  offset?: number;
  type?: TestType;
  requirementId?: string;
  tag?: string;
  enabled?: boolean;
}): TestCase[] {
  const data = readStorage<TestCase>(getFiles().cases);
  let items = data.items;

  if (params?.type) {
    items = items.filter(c => c.type === params.type);
  }
  if (params?.requirementId) {
    items = items.filter(c => c.requirement_id === params.requirementId);
  }
  if (params?.tag) {
    items = items.filter(c => c.tags.includes(params.tag!));
  }
  if (params?.enabled !== undefined) {
    items = items.filter(c => c.enabled === params.enabled);
  }

  const offset = params?.offset || 0;
  const limit = params?.limit || 100;
  return items.slice(offset, offset + limit);
}

export function updateTestCaseSync(
  testId: string,
  updates: Partial<TestCase>
): TestCase | undefined {
  const data = readStorage<TestCase>(getFiles().cases);
  const index = data.items.findIndex(c => c.test_id === testId);
  if (index === -1) return undefined;

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
  if (index === -1) return false;

  data.items.splice(index, 1);
  writeStorage(getFiles().cases, data);
  return true;
}

// ============================================
// Test Results CRUD
// ============================================

export function createTestResultSync(
  result: Omit<TestResult, 'result_id' | 'executed_at'>
): TestResult {
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

export function listTestResultsSync(params?: {
  limit?: number;
  offset?: number;
  testId?: string;
  executionId?: string;
  status?: TestStatus;
}): TestResult[] {
  const data = readStorage<TestResult>(getFiles().results);
  let items = data.items;

  if (params?.testId) {
    items = items.filter(r => r.test_id === params.testId);
  }
  if (params?.executionId) {
    items = items.filter(r => r.execution_id === params.executionId);
  }
  if (params?.status) {
    items = items.filter(r => r.status === params.status);
  }

  const offset = params?.offset || 0;
  const limit = params?.limit || 100;
  return items.slice(offset, offset + limit);
}

export function getResultsByRunSync(executionId: string): TestResult[] {
  return listTestResultsSync({ executionId });
}

// ============================================
// Test Runs CRUD
// ============================================

export function createTestRunSync(
  run: Omit<TestRun, 'execution_id' | 'started_at'>
): TestRun {
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

export function listTestRunsSync(params?: {
  limit?: number;
  offset?: number;
  triggeredBy?: TestRun['triggered_by'];
}): TestRun[] {
  const data = readStorage<TestRun>(getFiles().runs);
  let items = data.items;

  if (params?.triggeredBy) {
    items = items.filter(r => r.triggered_by === params.triggeredBy);
  }

  const offset = params?.offset || 0;
  const limit = params?.limit || 100;
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
  }
): TestRun | undefined {
  const data = readStorage<TestRun>(getFiles().runs);
  const index = data.items.findIndex(r => r.execution_id === executionId);
  if (index === -1) return undefined;

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
  }
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
  requirementId: string
): { testCase: TestCase | undefined; requirement: TestRequirement | undefined } {
  const testCase = updateTestCaseSync(testId, { requirement_id: requirementId });

  const requirement = getRequirementSync(requirementId);
  if (requirement) {
    const linkedTests = [...(requirement.linked_tests || [])];
    if (!linkedTests.includes(testId)) {
      linkedTests.push(testId);
      updateRequirementSync(requirementId, { linked_tests: linkedTests });
    }
  }

  return { testCase, requirement: getRequirementSync(requirementId) };
}

export function getRequirementCoverageSync(): Array<{
  requirement_id: string;
  user_intent: string;
  test_count: number;
  coverage_status: 'covered' | 'partial' | 'uncovered';
}> {
  const requirements = listRequirementsSync();
  return requirements.map(req => ({
    requirement_id: req.requirement_id,
    user_intent: req.user_intent,
    test_count: req.linked_tests?.length || 0,
    coverage_status: (req.linked_tests?.length || 0) > 0 ? 'covered' : 'uncovered' as const,
  }));
}

/**
 * Clear all test data (useful for test cleanup)
 */
export function clearAllDataSync(): void {
  writeStorage(getFiles().requirements, { items: [], lastUpdated: new Date().toISOString() });
  writeStorage(getFiles().cases, { items: [], lastUpdated: new Date().toISOString() });
  writeStorage(getFiles().results, { items: [], lastUpdated: new Date().toISOString() });
  writeStorage(getFiles().runs, { items: [], lastUpdated: new Date().toISOString() });
}

// ============================================
// Async Wrappers (for API compatibility)
// ============================================

export async function createRequirement(
  requirement: Omit<TestRequirement, 'requirement_id' | 'captured_at'>
): Promise<{ success: true; data: TestRequirement }> {
  return { success: true, data: createRequirementSync(requirement) };
}

export async function getRequirement(
  requirementId: string
): Promise<{ success: boolean; data?: TestRequirement }> {
  const data = getRequirementSync(requirementId);
  return data ? { success: true, data } : { success: false };
}

export async function listRequirements(
  params?: { limit?: number; offset?: number }
): Promise<{ success: true; data: TestRequirement[] }> {
  return { success: true, data: listRequirementsSync(params) };
}

export async function updateRequirement(
  requirementId: string,
  updates: Partial<TestRequirement>
): Promise<{ success: boolean; data?: TestRequirement }> {
  const data = updateRequirementSync(requirementId, updates);
  return data ? { success: true, data } : { success: false };
}

export async function captureRequirement(
  userIntent: string,
  options?: { verbatimQuote?: string; source?: string; tags?: string[] }
): Promise<{ success: true; data: TestRequirement }> {
  return { success: true, data: captureRequirementSync(userIntent, options) };
}

export async function createTestCase(
  testCase: Omit<TestCase, 'test_id' | 'created_at' | 'updated_at'>
): Promise<{ success: true; data: TestCase }> {
  return { success: true, data: createTestCaseSync(testCase) };
}

export async function getTestCase(
  testId: string
): Promise<{ success: boolean; data?: TestCase }> {
  const data = getTestCaseSync(testId);
  return data ? { success: true, data } : { success: false };
}

export async function listTestCases(
  params?: { limit?: number; offset?: number; type?: TestType; requirementId?: string; tag?: string; enabled?: boolean }
): Promise<{ success: true; data: TestCase[] }> {
  return { success: true, data: listTestCasesSync(params) };
}

export async function updateTestCase(
  testId: string,
  updates: Partial<TestCase>
): Promise<{ success: boolean; data?: TestCase }> {
  const data = updateTestCaseSync(testId, updates);
  return data ? { success: true, data } : { success: false };
}

export async function deleteTestCase(
  testId: string
): Promise<{ success: boolean }> {
  return { success: deleteTestCaseSync(testId) };
}

export async function createTestResult(
  result: Omit<TestResult, 'result_id' | 'executed_at'>
): Promise<{ success: true; data: TestResult }> {
  return { success: true, data: createTestResultSync(result) };
}

export async function getTestResult(
  resultId: string
): Promise<{ success: boolean; data?: TestResult }> {
  const data = getTestResultSync(resultId);
  return data ? { success: true, data } : { success: false };
}

export async function listTestResults(
  params?: { limit?: number; offset?: number; testId?: string; executionId?: string; status?: TestStatus }
): Promise<{ success: true; data: TestResult[] }> {
  return { success: true, data: listTestResultsSync(params) };
}

export async function getResultsByRun(
  executionId: string
): Promise<{ success: true; data: TestResult[] }> {
  return { success: true, data: getResultsByRunSync(executionId) };
}

export async function createTestRun(
  run: Omit<TestRun, 'execution_id' | 'started_at'>
): Promise<{ success: true; data: TestRun }> {
  return { success: true, data: createTestRunSync(run) };
}

export async function getTestRun(
  executionId: string
): Promise<{ success: boolean; data?: TestRun }> {
  const data = getTestRunSync(executionId);
  return data ? { success: true, data } : { success: false };
}

export async function listTestRuns(
  params?: { limit?: number; offset?: number; triggeredBy?: TestRun['triggered_by'] }
): Promise<{ success: true; data: TestRun[] }> {
  return { success: true, data: listTestRunsSync(params) };
}

export async function completeTestRun(
  executionId: string,
  stats: { total_tests: number; passed: number; failed: number; errors: number; skipped: number; avg_latency_ms: number }
): Promise<{ success: boolean; data?: TestRun }> {
  const data = completeTestRunSync(executionId, stats);
  return data ? { success: true, data } : { success: false };
}

export async function linkTestToRequirement(
  testId: string,
  requirementId: string
): Promise<{ testUpdate: { success: boolean; data?: TestCase }; reqUpdate: { success: boolean; data?: TestRequirement } }> {
  const result = linkTestToRequirementSync(testId, requirementId);
  return {
    testUpdate: result.testCase ? { success: true, data: result.testCase } : { success: false },
    reqUpdate: result.requirement ? { success: true, data: result.requirement } : { success: false },
  };
}

export async function getRequirementCoverage(): Promise<{ success: true; data: Array<{ requirement_id: string; user_intent: string; test_count: number; coverage_status: 'covered' | 'partial' | 'uncovered' }> }> {
  return { success: true, data: getRequirementCoverageSync() };
}
