#!/usr/bin/env node
/**
 * Upload tests to ElevenLabs native testing (shows in dashboard)
 */

const fs = require('node:fs');
const path = require('node:path');
const env = require('./lib/env');

const API_KEY = env.require('ELEVENLABS_API_KEY');
const AGENT_ID = 'agent_xxxx_demo';
const API_BASE = 'https://api.elevenlabs.io/v1';

console.log('=== ELEVENLABS NATIVE TEST UPLOADER ===\n');
console.log('API Key:', API_KEY.slice(0, 10) + '...');
console.log('Agent ID:', AGENT_ID);

// Test cases that will show in the ElevenLabs dashboard
const TEST_CASES = [
  {
    name: 'SMS Consent - Explicit Yes',
    type: 'tool',
    chat_history: [
      {role: 'user', message: 'Hi, I\'m interested in AI automation for my HVAC business', time_in_call_secs: 0},
      {role: 'agent', message: 'Great! Would you like me to send you a demo booking link via text?', time_in_call_secs: 5},
      {role: 'user', message: 'Yes please, send it to me at 555-123-4567', time_in_call_secs: 10},
    ],
    success_condition: 'Agent calls send_sms tool after receiving explicit \'yes\' consent',
    success_examples: [{response: 'Agent says \'I\'ll text you the link now\' and calls send_sms', type: 'success'}],
    failure_examples: [{response: 'Agent does not call send_sms despite explicit consent', type: 'failure'}],
  },
  {
    name: 'Discovery - Volume Question',
    type: 'llm',
    chat_history: [
      {role: 'user', message: 'Hi, I run a plumbing company and I\'m interested in your after-hours service', time_in_call_secs: 0},
    ],
    success_condition: 'Agent asks about after-hours call volume',
    success_examples: [{response: 'Agent asks "Roughly how many after-hours calls do you get?"', type: 'success'}],
    failure_examples: [{response: 'Agent skips discovery and jumps to pricing', type: 'failure'}],
  },
  {
    name: 'Discovery - Current Solution Question',
    type: 'llm',
    chat_history: [
      {role: 'user', message: 'We get about 20 calls a week after hours', time_in_call_secs: 0},
    ],
    success_condition: 'Agent asks what happens to after-hours calls currently',
    success_examples: [{response: 'Agent asks "What happens when someone calls at 2 AM?"', type: 'success'}],
    failure_examples: [{response: 'Agent skips to solution without understanding current state', type: 'failure'}],
  },
  {
    name: 'Discovery - Authority Question',
    type: 'llm',
    chat_history: [
      {role: 'user', message: 'Right now calls just go to voicemail', time_in_call_secs: 0},
    ],
    success_condition: 'Agent asks about decision-making authority',
    success_examples: [{response: 'Agent asks "Are you the one who handles the operations side?"', type: 'success'}],
    failure_examples: [{response: 'Agent assumes caller has authority without asking', type: 'failure'}],
  },
  {
    name: 'Emergency Redirect - Fire',
    type: 'llm',
    chat_history: [
      {role: 'user', message: 'There\'s a fire in my building, what should I do?', time_in_call_secs: 0},
    ],
    success_condition: 'Agent immediately redirects to 911',
    success_examples: [{response: 'Agent says "Please hang up and call 911 immediately"', type: 'success'}],
    failure_examples: [{response: 'Agent continues sales conversation', type: 'failure'}],
  },
  {
    name: 'Demo Close - Positive Response',
    type: 'tool',
    chat_history: [
      {role: 'user', message: 'This sounds interesting. Can I see a demo?', time_in_call_secs: 0},
      {role: 'agent', message: 'I\'d love to show you. Want me to text you the demo link right now?', time_in_call_secs: 5},
      {role: 'user', message: 'Yes, please do. My number is 555-987-6543', time_in_call_secs: 10},
    ],
    success_condition: 'Agent invokes send_sms tool with phone number',
    success_examples: [{response: 'Agent calls send_sms with 555-987-6543', type: 'success'}],
    failure_examples: [{response: 'Agent does not call send_sms', type: 'failure'}],
  },
  {
    name: 'Objection - Already Have Answering Service',
    type: 'llm',
    chat_history: [
      {role: 'user', message: 'We already use an answering service', time_in_call_secs: 0},
    ],
    success_condition: 'Agent handles objection by differentiating the product',
    success_examples: [{response: 'Agent asks about cost and mentions AI can distinguish emergencies', type: 'success'}],
    failure_examples: [{response: 'Agent gives up or ignores the objection', type: 'failure'}],
  },
  {
    name: 'Forbidden Language - No Tech Jargon',
    type: 'llm',
    chat_history: [
      {role: 'user', message: 'How does your AI work technically?', time_in_call_secs: 0},
    ],
    success_condition: 'Agent explains without using forbidden terms like LLM, API, agentic',
    success_examples: [{response: 'Agent uses terms like "digital employee" or "AI hotline"', type: 'success'}],
    failure_examples: [{response: 'Agent says "LLM", "API", "agentic", or "machine learning"', type: 'failure'}],
  },
  {
    name: 'Call Direction - Outbound Greeting',
    type: 'llm',
    chat_history: [
      {role: 'agent', message: 'Hi, this is the assistant with ExampleCo.', time_in_call_secs: 0},
    ],
    success_condition: 'On outbound calls, agent does NOT say \'How can I help you?\'',
    success_examples: [{response: 'Agent immediately pitches the product', type: 'success'}],
    failure_examples: [{response: 'Agent says "How can I help you today?"', type: 'failure'}],
  },
  {
    name: 'Pricing - Qualify First',
    type: 'llm',
    chat_history: [
      {role: 'user', message: 'How much does this cost?', time_in_call_secs: 0},
    ],
    success_condition: 'Agent qualifies industry before giving price',
    success_examples: [{response: 'Agent asks "What industry is your business in?" before pricing', type: 'success'}],
    failure_examples: [{response: 'Agent gives price without qualifying', type: 'failure'}],
  },
];

async function createTest(test) {
  const response = await fetch(`${API_BASE}/convai/agent-testing/create`, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: test.name,
      type: test.type,
      chat_history: test.chat_history,
      success_condition: test.success_condition,
      success_examples: test.success_examples,
      failure_examples: test.failure_examples,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }

  return response.json();
}

async function runTests() {
  const response = await fetch(`${API_BASE}/convai/agents/${AGENT_ID}/run-tests`, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }

  return response.json();
}

async function main() {
  console.log(`\nUploading ${TEST_CASES.length} test cases...\n`);

  let created = 0;
  let failed = 0;

  for (const test of TEST_CASES) {
    try {
      const result = await createTest(test);
      console.log(`✓ Created: ${test.name}`);
      console.log(`  Test ID: ${result.test_id || result.id || 'unknown'}`);
      created++;
    } catch (error) {
      console.log(`✗ Failed: ${test.name}`);
      console.log(`  Error: ${error.message}`);
      failed++;
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n=== UPLOAD COMPLETE ===');
  console.log(`Created: ${created}`);
  console.log(`Failed: ${failed}`);

  if (created > 0) {
    console.log('\nRunning tests on agent...');
    try {
      const runResult = await runTests();
      console.log('✓ Tests triggered');
      console.log(`  Invocation ID: ${runResult.invocation_id || runResult.id || 'unknown'}`);
      console.log(`\nCheck dashboard: https://elevenlabs.io/app/agents/agents/${AGENT_ID}?tab=tests`);
    } catch (error) {
      console.log(`✗ Failed to trigger tests: ${error.message}`);
    }
  }
}

main().catch(console.error);
