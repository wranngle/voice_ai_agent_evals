/**
 * Test n8n Eval Runner Against Real API
 *
 * Run: bun run scripts/test-n8n-eval-runner.ts
 */

import {N8nEvalRunner} from '../lib/testing/runners/n8n-eval-runner';
import type {TestCase} from '../lib/testing/types';

const POST_CALL_WORKFLOW_ID = process.env.N8N_POST_CALL_WORKFLOW_ID ?? 'workflow_xxxx_demo';
const POST_CALL_WEBHOOK_PATH = process.env.N8N_POST_CALL_WEBHOOK_PATH ?? 'post-call';
const AGENT_ID = process.env.ELEVENLABS_AGENT_ID ?? 'agent_xxxx_demo';

async function main() {
  console.log('🔧 Testing n8n Eval Runner Against Real API\n');
  console.log('═'.repeat(60));

  const apiUrl = process.env.N8N_API_URL;
  const apiKey = process.env.N8N_API_KEY;

  if (!apiUrl || !apiKey) {
    console.log('\n❌ N8N_API_URL or N8N_API_KEY not found in environment');
    console.log('   To run this test, export the API credentials:');
    console.log('   export N8N_API_URL=https://your-n8n-host.example.com');
    console.log('   export N8N_API_KEY=your_key_here');
    process.exit(1);
  }

  const runner = new N8nEvalRunner(apiUrl, apiKey);

  // Test 1: Valid completed call via webhook
  console.log('\n📝 Test 1: Completed call via webhook');
  console.log('─'.repeat(40));

  const test1: TestCase = {
    test_id: 'TEST-N8N-001',
    type: 'n8n-eval',
    name: 'Post-Call Webhook - Completed Call',
    description: 'Test that a completed call is processed correctly',
    input: {
      workflow_id: POST_CALL_WORKFLOW_ID,
      webhook_path: POST_CALL_WEBHOOK_PATH,
      payload: {
        agent_id: AGENT_ID,
        conversation_id: 'test-conv-001',
        call_status: 'completed',
        call_duration_seconds: 180,
        caller_id: '+12025551234',
        transcript: 'Customer wants to schedule a demo and book a meeting next week.',
        call_summary: 'Prospect interested in after-hours coverage, wants to book demo',
        customer_sentiment: 'positive',
        dynamic_variables: {
          customer_name: 'Test Customer',
          customer_first_name: 'Test',
          email: 'test@example.com',
        },
      },
    },
    expected_output: {
      execution_status: 'success',
      output_contains: {
        success: true,
        processed: true,
        call_status: 'completed',
      },
      max_execution_time_ms: 10_000,
    },
    tags: ['smoke', 'webhook', 'n8n-eval'],
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
  console.log(JSON.stringify(output1.output, null, 2));

  // Test 2: Invalid agent ID (should get error response)
  console.log('\n\n📝 Test 2: Invalid agent ID');
  console.log('─'.repeat(40));

  const test2: TestCase = {
    test_id: 'TEST-N8N-002',
    type: 'n8n-eval',
    name: 'Post-Call Webhook - Invalid Agent',
    description: 'Test that invalid agent_id returns 400 error',
    input: {
      workflow_id: POST_CALL_WORKFLOW_ID,
      webhook_path: POST_CALL_WEBHOOK_PATH,
      payload: {
        agent_id: 'invalid_agent_id',
        conversation_id: 'test-conv-002',
        call_status: 'completed',
        call_duration_seconds: 60,
        caller_id: '+12025559999',
      },
    },
    expected_output: {
      // The workflow returns 400 for invalid agent, but webhook call still "succeeds"
      // We check the output contains the error
      output_contains: {
        error: 'Invalid agent_id',
      },
    },
    tags: ['error-handling', 'webhook', 'n8n-eval'],
    enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const validation2 = runner.validate(test2);
  if (validation2.valid) {
    console.log('✓ Validation passed');
    console.log('\n🚀 Executing test...\n');
    const result2 = await runner.execute(test2, {timeout: 30_000});

    console.log('─'.repeat(40));
    console.log(`Status: ${result2.status === 'passed' ? '✅ PASSED' : (result2.status === 'failed' ? '❌ FAILED' : '⚠️ ERROR')}`);
    console.log(`Latency: ${result2.latency_ms}ms`);
    console.log(`Assertions: ${result2.assertions_passed} passed, ${result2.assertions_failed} failed`);

    if (result2.error_message) {
      console.log(`\nError: ${result2.error_message}`);
    }

    const output2 = result2.actual_output;
    console.log('\n📤 Response:');
    console.log(JSON.stringify(output2.output, null, 2));
  } else {
    console.log('❌ Validation failed:', validation2.errors);
  }

  // Test 3: Abandoned call
  console.log('\n\n📝 Test 3: Abandoned call');
  console.log('─'.repeat(40));

  const test3: TestCase = {
    test_id: 'TEST-N8N-003',
    type: 'n8n-eval',
    name: 'Post-Call Webhook - Abandoned Call',
    description: 'Test abandoned call processing',
    input: {
      workflow_id: POST_CALL_WORKFLOW_ID,
      webhook_path: POST_CALL_WEBHOOK_PATH,
      payload: {
        agent_id: AGENT_ID,
        conversation_id: 'test-conv-003',
        call_status: 'abandoned',
        call_duration_seconds: 15,
        caller_id: '+12025558888',
      },
    },
    expected_output: {
      execution_status: 'success',
      output_contains: {
        success: true,
        call_status: 'abandoned',
        // Should_callback contains the caller_id when truthy, not boolean
        abandon_reason: 'early_abandonment',
      },
    },
    tags: ['abandoned', 'webhook', 'n8n-eval'],
    enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const validation3 = runner.validate(test3);
  if (validation3.valid) {
    console.log('✓ Validation passed');
    console.log('\n🚀 Executing test...\n');
    const result3 = await runner.execute(test3, {timeout: 30_000});

    console.log('─'.repeat(40));
    console.log(`Status: ${result3.status === 'passed' ? '✅ PASSED' : (result3.status === 'failed' ? '❌ FAILED' : '⚠️ ERROR')}`);
    console.log(`Latency: ${result3.latency_ms}ms`);
    console.log(`Assertions: ${result3.assertions_passed} passed, ${result3.assertions_failed} failed`);

    if (result3.error_message) {
      console.log(`\nError: ${result3.error_message}`);
    }

    const output3 = result3.actual_output;
    console.log('\n📤 Response:');
    console.log(JSON.stringify(output3.output, null, 2));
  } else {
    console.log('❌ Validation failed:', validation3.errors);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('\n✨ Tests complete!\n');
}

main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
