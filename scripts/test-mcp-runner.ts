/**
 * Test MCP Runner Against Real API
 *
 * Run: bun run scripts/test-mcp-runner.ts
 */

import {McpRunner} from '../lib/testing/runners/mcp-runner';
import type {TestCase} from '../lib/testing/types';

const POST_CALL_WORKFLOW_ID = 'GZsLwzpsTvl9jIEs';
const SARAH_AGENT_ID = 'agent_xxxx_demo';

async function main() {
  console.log('🔌 Testing MCP Runner Against Real API\n');
  console.log('═'.repeat(60));

  const apiUrl = process.env.N8N_API_URL;
  const apiKey = process.env.N8N_API_KEY;

  if (!apiUrl || !apiKey) {
    console.log('\n❌ N8N_API_URL or N8N_API_KEY not found in environment');
    process.exit(1);
  }

  const runner = new McpRunner(apiUrl, apiKey);

  // Test 1: Webhook-triggered workflow execution
  console.log('\n📝 Test 1: Webhook-triggered workflow');
  console.log('─'.repeat(40));

  const test1: TestCase = {
    test_id: 'TEST-MCP-001',
    type: 'mcp',
    name: 'MCP Runner - Webhook Workflow',
    description: 'Test MCP runner can execute webhook-triggered workflows',
    input: {
      workflow_id: POST_CALL_WORKFLOW_ID,
      trigger_type: 'webhook',
      payload: {
        agent_id: SARAH_AGENT_ID,
        conversation_id: 'mcp-test-001',
        call_status: 'completed',
        call_duration_seconds: 60,
        transcript: 'Test call for MCP runner validation',
      },
    },
    expected_output: {
      execution_status: 'success',
      expected_output: {
        webhook_output: {
          success: true,
        },
      },
    },
    tags: ['mcp', 'webhook'],
    enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Validate
  const validation1 = runner.validate(test1);
  if (!validation1.valid) {
    console.log('❌ Validation failed:', validation1.errors);
    process.exit(1);
  }

  console.log('✓ Validation passed');

  // Execute
  console.log('\n🚀 Executing test...\n');
  const result1 = await runner.execute(test1, {timeout: 30_000});

  console.log('─'.repeat(40));
  console.log(`Status: ${result1.status === 'passed' ? '✅ PASSED' : (result1.status === 'failed' ? '❌ FAILED' : '⚠️ ERROR')}`);
  console.log(`Latency: ${result1.latency_ms}ms`);
  console.log(`Assertions: ${result1.assertions_passed} passed, ${result1.assertions_failed} failed`);

  if (result1.error_message) {
    console.log(`\nError: ${result1.error_message}`);
  }

  // Show output
  const output1 = result1.actual_output;
  console.log('\n📤 Response:');
  console.log(`  Execution Status: ${output1.status}`);
  console.log(`  Nodes Executed: ${JSON.stringify(output1.nodes_executed)}`);
  console.log(`  MCP Tools Called: ${JSON.stringify(output1.mcp_tools_called)}`);

  // Test 2: Validation test - missing required fields
  console.log('\n\n📝 Test 2: Validation - missing fields');
  console.log('─'.repeat(40));

  const test2: TestCase = {
    test_id: 'TEST-MCP-002',
    type: 'mcp',
    name: 'MCP Runner - Missing Fields',
    description: 'Test MCP runner validates required fields',
    input: {
      workflow_id: POST_CALL_WORKFLOW_ID,
      // Missing trigger_type and payload
    },
    expected_output: {},
    tags: ['mcp', 'validation'],
    enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const validation2 = runner.validate(test2);
  if (validation2.valid) {
    console.log('❌ Validation should have failed but passed');
  } else {
    console.log('✅ Validation correctly rejected invalid test:');
    for (const e of validation2.errors) {
      console.log(`   - ${e}`);
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('\n✨ MCP Runner tests complete!\n');

  // Return success if first test passed
  process.exit(result1.status === 'passed' ? 0 : 1);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
