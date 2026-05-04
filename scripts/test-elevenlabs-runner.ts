/**
 * Test ElevenLabs Runner Against Real API
 *
 * Run: bun run scripts/test-elevenlabs-runner.ts
 */

import {ElevenLabsRunner} from '../lib/testing/runners/elevenlabs-runner';
import type {TestCase} from '../lib/testing/types';

const AGENT_ID = process.env.ELEVENLABS_AGENT_ID ?? 'agent_xxxx_demo';

async function main() {
  console.log('🎤 Testing ElevenLabs Runner Against Real API\n');
  console.log('═'.repeat(60));

  // Get API key from environment or MCP config
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    console.log('\n❌ ELEVENLABS_API_KEY not found in environment');
    console.log('   Checking if MCP has it configured...');

    // The MCP server has the key, but we need it for direct API calls
    console.log('\n   To run this test, export the API key:');
    console.log('   export ELEVENLABS_API_KEY=your_key_here');
    process.exit(1);
  }

  const runner = new ElevenLabsRunner(apiKey);

  // Test 1: Basic greeting test
  console.log('\n📝 Test 1: Basic greeting');
  console.log('─'.repeat(40));

  const test1: TestCase = {
    test_id: 'TEST-EL-001',
    type: 'elevenlabs',
    name: 'Agent responds to greeting',
    description: 'Test that the agent responds appropriately to a simple greeting',
    input: {
      agent_id: AGENT_ID,
      test_prompt: 'Hi, I\'m interested in learning more about your services.',
    },
    expected_output: {
      response_contains: process.env.EXPECT_RESPONSE_CONTAINS?.split(',') ?? [],
      max_turns: 25,
    },
    tags: ['smoke', 'greeting'],
    enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Validate first
  const validation = runner.validate(test1);
  if (!validation.valid) {
    console.log('❌ Validation failed:', validation.errors);
    process.exit(1);
  }

  console.log('✓ Validation passed');

  // Execute
  console.log('\n🚀 Executing test (this may take 30-60 seconds)...\n');
  const result = await runner.execute(test1, {timeout: 120_000});

  console.log('─'.repeat(40));
  console.log(`Status: ${result.status === 'passed' ? '✅ PASSED' : (result.status === 'failed' ? '❌ FAILED' : '⚠️ ERROR')}`);
  console.log(`Latency: ${result.latency_ms}ms`);
  console.log(`Assertions: ${result.assertions_passed} passed, ${result.assertions_failed} failed`);

  if (result.error_message) {
    console.log(`\nError: ${result.error_message}`);
  }

  // Show conversation if available
  const output = result.actual_output as {conversation?: Array<{role: string; message: string}>};
  if (output.conversation) {
    console.log('\n📜 Conversation:');
    for (const turn of output.conversation.slice(0, 6)) {
      const icon = turn.role === 'user' ? '👤' : '🤖';
      const preview = turn.message.length > 100 ? turn.message.slice(0, 100) + '...' : turn.message;
      console.log(`  ${icon} ${turn.role}: ${preview}`);
    }

    if (output.conversation.length > 6) {
      console.log(`  ... (${output.conversation.length - 6} more turns)`);
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('\n✨ Test complete!\n');

  process.exit(result.status === 'passed' ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
