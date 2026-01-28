/**
 * Testing Framework Module
 *
 * Unified testing infrastructure for n8n workflows and ElevenLabs voice agents.
 */

// Type exports
export type {
  TestType,
  TestStatus,
  RequirementStatus,
  Priority,
  TestRequirement,
  TestCase,
  TestResult,
  TestRun,
  WebhookTestInput,
  ElevenLabsTestInput,
  N8nEvalTestInput,
  McpTestInput,
  RequirementCoverage,
  TestRunSummary,
} from './types';

// Local storage client exports (file-based, fast, reliable)
export {
  generateId,
  // Requirements
  createRequirement,
  getRequirement,
  listRequirements,
  updateRequirement,
  captureRequirement,
  // Test Cases
  createTestCase,
  getTestCase,
  listTestCases,
  updateTestCase,
  deleteTestCase,
  // Test Results
  createTestResult,
  getTestResult,
  listTestResults,
  getResultsByRun,
  // Test Runs
  createTestRun,
  getTestRun,
  listTestRuns,
  completeTestRun,
  // Utilities
  linkTestToRequirement,
  getRequirementCoverage,
  // Local storage extras
  clearAllDataSync,
} from './local-storage';

// Test runners
export {
  // Types
  type TestExecutionResult,
  type AssertionResult,
  type RunOptions,
  type TestRunner,
  type WebhookTestConfig,
  type WebhookExpectedOutput,
  type ElevenLabsTestConfig,
  type ElevenLabsExpectedOutput,
  type N8nEvalTestConfig,
  type N8nEvalExpectedOutput,
  type McpTestConfig,
  type McpExpectedOutput,
  type OrchestratorOptions,
  // Runners
  WebhookRunner,
  webhookRunner,
  ElevenLabsRunner,
  elevenlabsRunner,
  N8nEvalRunner,
  n8nEvalRunner,
  McpRunner,
  mcpRunner,
  // Orchestrator
  TestOrchestrator,
  orchestrator,
  runTests,
} from './runners';
