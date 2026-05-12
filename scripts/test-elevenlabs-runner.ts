/**
 * Test ElevenLabs Runner Against Real API
 *
 * Run: bun run scripts/test-elevenlabs-runner.ts
 */

import {ElevenLabsRunner} from '../src/testing/runners/elevenlabs-runner';
import type {TestCase} from '../src/testing/types';

const PLACEHOLDER_AGENT_ID = 'agent_xxxx_demo';
const AGENT_ID = cliValue('--agent-id') ?? process.env.ELEVENLABS_AGENT_ID ?? PLACEHOLDER_AGENT_ID;

function cliValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  const value = index === -1 ? undefined : process.argv[index + 1];
  return value && !value.startsWith('--') && value.trim() !== '' ? value : undefined;
}

function expectedResponseContains(): string[] | undefined {
  const values = process.env.EXPECT_RESPONSE_CONTAINS
    ?.split(',')
    .map(value => value.trim())
    .filter(value => value !== '');

  return values && values.length > 0 ? values : undefined;
}

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

  // Detect the placeholder agent ID early so a missing ELEVENLABS_AGENT_ID
  // doesn't silently 404 on `agent_xxxx_demo` and produce a misleading
  // "agent not found" error instead of "you forgot to configure".
  if (AGENT_ID === PLACEHOLDER_AGENT_ID) {
    console.log('\n❌ ELEVENLABS_AGENT_ID not set; refusing to call the live API with placeholder');
    console.log('   `agent_xxxx_demo`. Export ELEVENLABS_AGENT_ID=agent_<your sandbox>');
    console.log('   or pass --agent-id when running the script.');
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
      // `max_turns` doubles as the API's `new_turns_limit` budget, so the
      // assertion `turnCount <= max_turns` is structurally always-pass and
      // gives the smoke no real signal on its own. `min_turns: 2` is the
      // positive check: a healthy live call must produce at least the user
      // prompt plus one agent reply, otherwise we want a red smoke.
      max_turns: 25,
      min_turns: 2,
    },
    tags: ['smoke', 'greeting'],
    enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const responseContains = expectedResponseContains();
  if (responseContains) {
    test1.expected_output.response_contains = responseContains;
  }

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

  // Show conversation if available. ElevenLabs returns `message: null` for
  // tool-call-only agent turns, so guard the slice/length access — otherwise
  // a real agent with tools crashes this live smoke test with a TypeError.
  const output = result.actual_output as {conversation?: Array<{role: string; message?: string | undefined}>};
  if (output.conversation) {
    console.log('\n📜 Conversation:');
    for (const turn of output.conversation.slice(0, 6)) {
      const icon = turn.role === 'user' ? '👤' : '🤖';
      const text = turn.message ?? '(no text — tool call or empty turn)';
      const preview = text.length > 100 ? text.slice(0, 100) + '...' : text;
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
