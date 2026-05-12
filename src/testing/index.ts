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
  TestRequirement,
  TestCase,
  TestResult,
  TestRun,
  WebhookTestInput,
  EvaluationArtifact,
  EvaluationDimension,
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
  type ExternalCommandTestConfig,
  type ExternalCommandExpectedOutput,
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
  ExternalCommandRunner,
  externalCommandRunner,
  ScenarioRunner,
  scenarioRunner,
  scoreScenario,
  // Orchestrator
  TestOrchestrator,
  orchestrator,
  runTests,
} from './runners';

export {
  discoverScenarioFiles,
  discoverScenarioTestCases,
  loadScenarioDefinition,
  loadScenarioTranscript,
  parseScenarioYaml,
  scenarioToTestCase,
  scenarioTranscriptPath,
  type ScenarioAxis,
  type ScenarioCriterion,
  type ScenarioDefinition,
  type ScenarioNativeToolCall,
  type ScenarioToolCall,
  type ScenarioToolResult,
  type ScenarioTranscript,
  type ScenarioTurn,
} from './scenarios';

// App adapters
export {
  createGtmOpsTestCases,
  loadGtmOpsHarnessManifest,
  runGtmOpsAdapter,
  type GtmOpsAdapterOptions,
  type GtmOpsAdapterRun,
  type GtmOpsHarnessCommand,
  type GtmOpsHarnessManifest,
} from './adapters';
