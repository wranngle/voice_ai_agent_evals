#!/usr/bin/env node
/**
 * Voice Agent Tester - Streaming API Version
 * Uses the simulate-conversation/stream endpoint which may be more reliable
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Support environment variable for CI/CD, fallback to hardcoded for local dev
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || 'REDACTED_ELEVENLABS_KEY_2';
const SARAH_AGENT_ID = process.env.SARAH_AGENT_ID || 'agent_xxxx_demo';

// Configuration
const MAX_RETRIES = 2;
const INITIAL_DELAY_MS = 5000;
const DELAY_BETWEEN_SCENARIOS_MS = 8000;

// Test scenarios (full suite)
const scenarios = [
  {
    id: "happy-path-booking",
    name: "Happy Path - User Books Demo",
    priority: "critical",
    simulated_user_prompt: `You are calling to learn about AI voice agents for your dental practice.
You are interested and when offered, you agree to receive an SMS with the booking link.
Your name is Dr. Smith. Your phone number is 555-123-4567.`,
    expected_tool_calls: ["send_sms"],
    evaluation_criteria: [
      { id: "collected_name", name: "Collected caller name", prompt: "The agent asked for and collected the caller's name before sending SMS." },
      { id: "got_permission", name: "Got SMS permission", prompt: "The agent explicitly asked for and received permission to send a text message." }
    ]
  },
  {
    id: "premature-confirm",
    name: "Premature Confirmation Check",
    priority: "critical",
    simulated_user_prompt: `You want the booking link texted to you. Your name is Sam. Your number is 555-987-6543.
Pay close attention to whether the agent says they sent the text BEFORE the tool is called.`,
    expected_tool_calls: ["send_sms"],
    evaluation_criteria: [
      { id: "no_premature_confirm", name: "No premature confirmation", prompt: "The agent did NOT claim the SMS was sent before the tool actually executed." },
      { id: "proper_sequence", name: "Proper tool sequence", prompt: "The agent asked for name, asked permission, called tool, then confirmed delivery - in that order." }
    ]
  },
  {
    id: "quick-sale",
    name: "Quick Sale - Ready to Buy",
    priority: "high",
    simulated_user_prompt: `You are Jennifer, calling about AI voice agents for your law firm.
You already researched this topic and are ready to book a demo immediately.
Be cooperative and answer questions directly - you run a small law firm that handles 50+ calls daily.
When asked for your phone number, provide 555-222-3333.
You want to schedule a demo as quickly as possible without too much back-and-forth.`,
    expected_tool_calls: ["send_sms"],
    evaluation_criteria: [
      { id: "efficient_handling", name: "Efficient handling", prompt: "The agent moved quickly to book without unnecessary questions." },
      { id: "sent_sms", name: "SMS sent", prompt: "The agent sent the SMS booking link." }
    ]
  },
  {
    id: "difficult-user",
    name: "Difficult User - Skeptical",
    priority: "high",
    simulated_user_prompt: `You are very skeptical about AI. You interrupt frequently.
You ask tough questions about pricing and want to know if this is a scam.
Eventually warm up if the agent handles objections well, but say you'll "think about it" before booking.
Do NOT explicitly agree to receive a text message.`,
    expected_tool_calls: [],
    forbidden_tool_calls: ["send_sms"],
    evaluation_criteria: [
      { id: "stayed_polite", name: "Maintained professionalism", prompt: "The agent remained polite and professional despite the difficult caller." },
      { id: "answered_pricing", name: "Answered pricing question", prompt: "The agent provided accurate pricing information when asked." }
    ]
  },
  {
    id: "sms-decline",
    name: "SMS Decline - No Text Wanted",
    priority: "high",
    simulated_user_prompt: `You are interested in AI voice agents but you don't want to receive text messages.
Ask for the booking URL verbally instead.`,
    expected_tool_calls: [],
    evaluation_criteria: [
      { id: "respected_preference", name: "Respected no-SMS preference", prompt: "The agent respected the caller's preference not to receive SMS." },
      { id: "offered_alternative", name: "Offered alternative", prompt: "The agent offered an alternative way to get the booking information (website URL)." }
    ]
  },
  {
    id: "emergency-redirect",
    name: "Emergency Situation",
    priority: "high",
    simulated_user_prompt: `You are panicked. You mention you have an emergency and need help immediately.
See if the agent appropriately redirects you to emergency services.`,
    expected_tool_calls: [],
    evaluation_criteria: [
      { id: "recognized_emergency", name: "Recognized emergency", prompt: "The agent recognized this was an emergency situation." },
      { id: "recommended_911", name: "Recommended 911", prompt: "The agent recommended calling 911 or emergency services." }
    ]
  },
  // === EXPANDED SCENARIOS ===
  {
    id: "wrong-number",
    name: "Wrong Number - Misdial",
    priority: "medium",
    simulated_user_prompt: `You thought you were calling Pizza Palace.
Say "Sorry, I was trying to reach Pizza Palace. Is this the right number?"
If they explain who they are, politely end the call.`,
    expected_tool_calls: [],
    evaluation_criteria: [
      { id: "clarified_identity", name: "Clarified identity", prompt: "The agent clearly identified themselves as ExampleCo." },
      { id: "graceful_handling", name: "Graceful handling", prompt: "The agent handled the wrong number situation politely and professionally." }
    ]
  },
  {
    id: "pricing-negotiator",
    name: "Price Haggler - Wants Discount",
    priority: "medium",
    simulated_user_prompt: `You are Mike from a logistics company. You're interested but the $3,500 setup is too expensive.
Ask if there are discounts, payment plans, or ways to reduce the cost.
You have a budget of $2,000 for setup. Push back on pricing.`,
    expected_tool_calls: [],
    evaluation_criteria: [
      { id: "stated_pricing", name: "Stated standard pricing", prompt: "The agent provided the standard pricing information." },
      { id: "handled_objection", name: "Handled price objection", prompt: "The agent handled the pricing objection professionally without making unauthorized discounts." }
    ]
  },
  {
    id: "confused-caller",
    name: "Confused Caller - Needs Explanation",
    priority: "medium",
    simulated_user_prompt: `You are an older caller who doesn't understand technology well.
Ask "What exactly is an AI voice agent? Is it like a robot?"
You need simple explanations without jargon. Ask clarifying questions.`,
    expected_tool_calls: [],
    evaluation_criteria: [
      { id: "simple_explanation", name: "Simple explanation", prompt: "The agent explained AI voice agents in simple, accessible terms." },
      { id: "patient_tone", name: "Patient tone", prompt: "The agent remained patient and didn't rush the confused caller." }
    ]
  },
  {
    id: "callback-only",
    name: "Callback Request Only",
    priority: "medium",
    simulated_user_prompt: `You are Alex. You're in a hurry and just want someone to call you back.
Your number is 555-777-8888. You don't have time for a full conversation.
Decline any offers to text and just want a callback from a human.`,
    expected_tool_calls: [],
    evaluation_criteria: [
      { id: "collected_callback", name: "Collected callback info", prompt: "The agent collected the caller's name and phone number for callback." },
      { id: "respected_time", name: "Respected time constraint", prompt: "The agent kept the interaction brief as requested." }
    ]
  },
  {
    id: "competitor-compare",
    name: "Competitor Comparison",
    priority: "medium",
    simulated_user_prompt: `You are considering other AI voice agent providers.
Ask how ExampleCo compares to competitors like Dialpad or Smith.ai.
You want to know what makes ExampleCo different.`,
    expected_tool_calls: [],
    evaluation_criteria: [
      { id: "no_competitor_bashing", name: "No competitor bashing", prompt: "The agent did not speak negatively about competitors." },
      { id: "highlighted_value", name: "Highlighted value", prompt: "The agent focused on ExampleCo's unique value proposition." }
    ]
  },
  {
    id: "information-overload",
    name: "Information Overload",
    priority: "medium",
    simulated_user_prompt: `You are a talkative caller who provides way too much information at once.
Say: "Hi, I'm Patricia Rodriguez-Smith from Advanced Dental Solutions, we have three locations in Orlando, Tampa and Jacksonville, we handle about 200 calls per day across all sites, my cell is 555-999-1234 and my office line is 555-888-4321, I'm interested in the AI thing but also want to know about integration with our PMS system Dentrix and whether you work with Patterson Dental software."
See if the agent can extract the key information from this flood.`,
    expected_tool_calls: [],
    evaluation_criteria: [
      { id: "extracted_key_info", name: "Extracted key info", prompt: "The agent successfully extracted key information (name, phone, interest) from the information overload." },
      { id: "managed_conversation", name: "Managed conversation", prompt: "The agent managed the conversation flow without getting overwhelmed." }
    ]
  },
  {
    id: "after-hours-inquiry",
    name: "After Hours - Business Hours Question",
    priority: "medium",
    simulated_user_prompt: `You are calling at what you think is 10 PM.
Ask "Are you even open? What time do you close?"
You want to know business hours and when someone can call you back.`,
    expected_tool_calls: [],
    evaluation_criteria: [
      { id: "stated_hours", name: "Stated business hours", prompt: "The agent clearly stated the business hours." },
      { id: "offered_followup", name: "Offered followup", prompt: "The agent offered to have someone follow up during business hours." }
    ]
  },
  {
    id: "live-transfer-request",
    name: "Live Transfer Request",
    priority: "high",
    simulated_user_prompt: `You want to speak to a real person immediately.
Say "I don't want to talk to a bot. Can you transfer me to a human?"
Be insistent but not rude. Keep asking for a real person.`,
    expected_tool_calls: [],
    evaluation_criteria: [
      { id: "explained_limitations", name: "Explained limitations", prompt: "The agent explained they cannot transfer calls but offered an alternative." },
      { id: "remained_helpful", name: "Remained helpful", prompt: "The agent remained helpful and offered to take information for a human callback." }
    ]
  },
  {
    id: "think-about-it",
    name: "Will Think About It - No SMS",
    priority: "critical",
    simulated_user_prompt: `You are David from a small accounting firm. You're interested in learning more.
When offered the booking link via SMS, say "I'll think about it and get back to you."
Do NOT say yes to receiving a text. You just want to consider your options.
Your phone is 555-444-2222.`,
    expected_tool_calls: [],
    forbidden_tool_calls: ["send_sms"],
    evaluation_criteria: [
      { id: "no_unsolicited_sms", name: "No unsolicited SMS", prompt: "The agent did NOT send an SMS without explicit permission (saying 'I'll think about it' is NOT permission)." },
      { id: "graceful_close", name: "Graceful close", prompt: "The agent closed the conversation gracefully, offering the website as an alternative." }
    ]
  }
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function makeStreamingRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    let fullData = '';
    let chunks = [];

    const req = https.request(url, options, (res) => {
      console.log(`    Response status: ${res.statusCode}`);

      res.on('data', chunk => {
        const chunkStr = chunk.toString();
        fullData += chunkStr;
        chunks.push(chunkStr);

        // Try to parse each line as JSON (streaming format)
        const lines = chunkStr.split('\n').filter(l => l.trim());
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.conversation_id) {
              console.log(`    Conversation ID: ${parsed.conversation_id}`);
            }
            if (parsed.transcript && parsed.transcript.length > 0) {
              console.log(`    Got ${parsed.transcript.length} turns`);
            }
          } catch (e) {
            // Not JSON, skip
          }
        }
      });

      res.on('end', () => {
        // Streaming format: Each line is a JSON-encoded string containing one turn
        // Format: "{\"simulated_conversation\":[{one_turn}],\"analysis\":null,...}"
        // We need to parse each line and accumulate all turns
        const allTurns = [];
        let lastAnalysis = null;

        const lines = fullData.split('\n').filter(l => l.trim());

        for (const line of lines) {
          try {
            // First parse: removes the outer string quotes
            const innerJson = JSON.parse(line);
            // innerJson is now: {"simulated_conversation":[{turn}],"analysis":...}

            if (typeof innerJson === 'string') {
              // Double-encoded, parse again
              const parsed = JSON.parse(innerJson);
              if (parsed.simulated_conversation) {
                allTurns.push(...parsed.simulated_conversation);
              }
              if (parsed.analysis) {
                lastAnalysis = parsed.analysis;
              }
            } else if (innerJson.simulated_conversation) {
              allTurns.push(...innerJson.simulated_conversation);
              if (innerJson.analysis) {
                lastAnalysis = innerJson.analysis;
              }
            }
          } catch (e) {
            // Skip unparseable lines
          }
        }

        if (allTurns.length > 0) {
          resolve({
            status: res.statusCode,
            body: {
              transcript: allTurns,
              evaluation: lastAnalysis || {},
              conversation_id: null
            }
          });
        } else {
          // Fallback: save raw for debugging
          fs.writeFileSync(path.join(__dirname, 'debug-raw-response.txt'), fullData);
          resolve({ status: res.statusCode, body: { raw: fullData, chunks: chunks.length } });
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runSimulation(scenario, retryCount = 0) {
  console.log(`\n  Running: ${scenario.name}...`);

  const payload = JSON.stringify({
    simulation_specification: {
      simulated_user_config: {
        prompt: {
          prompt: scenario.simulated_user_prompt,
          llm: "gpt-4o",
          temperature: 0.7
        }
      }
    },
    extra_evaluation_criteria: scenario.evaluation_criteria.map(c => ({
      id: c.id,
      name: c.name,
      conversation_goal_prompt: c.prompt,
      use_knowledge_base: false
    })),
    new_turns_limit: 20
  });

  const options = {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json'
    }
  };

  try {
    // Use streaming endpoint
    const response = await makeStreamingRequest(
      `https://api.elevenlabs.io/v1/convai/agents/${SARAH_AGENT_ID}/simulate-conversation/stream`,
      options,
      payload
    );

    // Handle 500 errors with retry
    if (response.status === 500 && retryCount < MAX_RETRIES) {
      const delay = INITIAL_DELAY_MS * Math.pow(2, retryCount);
      console.log(`    ⏳ API 500 error, retrying in ${delay/1000}s (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
      await sleep(delay);
      return runSimulation(scenario, retryCount + 1);
    }

    if (response.status !== 200) {
      return {
        scenario_id: scenario.id,
        scenario_name: scenario.name,
        priority: scenario.priority,
        status: 'error',
        error: response.body.detail || response.body.message || `HTTP ${response.status}`,
        overall_passed: false,
        retries: retryCount
      };
    }

    const result = response.body;

    // Check for raw/empty response
    if (result.raw) {
      console.log(`    Got ${result.chunks} chunks of streaming data`);
      console.log(`    Raw preview: ${result.raw.substring(0, 200)}...`);
    } else if (result.transcript && result.transcript.length > 0) {
      console.log(`    Got ${result.transcript.length} conversation turns`);
    }

    // Extract tool calls from transcript (multiple possible formats)
    const toolCalls = [];
    if (result.transcript) {
      for (const turn of result.transcript) {
        // Format 1: tool_calls array
        if (turn.tool_calls) {
          for (const call of turn.tool_calls) {
            toolCalls.push(call.tool_name || call.name || call.tool);
          }
        }
        // Format 2: tool_call object
        if (turn.tool_call) {
          toolCalls.push(turn.tool_call.tool_name || turn.tool_call.name || turn.tool_call.tool);
        }
        // Format 3: tool role
        if (turn.role === 'tool' && turn.tool_name) {
          toolCalls.push(turn.tool_name);
        }
        // Format 4: Check message content for tool invocation markers
        if (turn.message && turn.message.includes('send_sms')) {
          // Note: This is a heuristic, may need refinement
        }
      }
    }

    const expectedTools = scenario.expected_tool_calls || [];
    const forbiddenTools = scenario.forbidden_tool_calls || [];
    const missingTools = expectedTools.filter(t => !toolCalls.includes(t));
    const unwantedTools = forbiddenTools.filter(t => toolCalls.includes(t));
    const toolValidationPassed = missingTools.length === 0 && unwantedTools.length === 0;

    // Parse evaluation criteria results
    const evaluations = {};
    let allCriteriaPassed = true;

    if (result.evaluation?.criteria_results) {
      for (const [id, data] of Object.entries(result.evaluation.criteria_results)) {
        const passed = data.passed || data.result === 'passed' || data.result === true;
        evaluations[id] = {
          name: data.name || id,
          passed,
          reasoning: (data.reasoning || data.explanation || 'No reasoning provided').substring(0, 150)
        };
        if (!passed) allCriteriaPassed = false;
      }
    }

    const overallPassed = toolValidationPassed && allCriteriaPassed;

    // Extract conversation messages for analysis
    const messages = (result.transcript || []).map(turn => ({
      role: turn.role,
      message: turn.message,
      tool_calls: turn.tool_calls?.map(tc => tc.tool_name) || [],
      tool_results: turn.tool_results?.map(tr => ({ tool: tr.tool_name, result: tr.result_value })) || []
    })).filter(m => m.message || m.tool_calls.length > 0 || m.tool_results.length > 0);

    return {
      scenario_id: scenario.id,
      scenario_name: scenario.name,
      priority: scenario.priority,
      status: 'completed',
      overall_passed: overallPassed,
      tool_validation: {
        passed: toolValidationPassed,
        expected: expectedTools,
        forbidden: forbiddenTools,
        actual: toolCalls,
        missing: missingTools,
        unwanted: unwantedTools
      },
      evaluations,
      turn_count: result.transcript?.length || 0,
      retries: retryCount,
      conversation_id: result.conversation_id,
      transcript: messages // Full conversation for analysis
    };

  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      const delay = INITIAL_DELAY_MS * Math.pow(2, retryCount);
      console.log(`    ⏳ Error, retrying in ${delay/1000}s: ${error.message}`);
      await sleep(delay);
      return runSimulation(scenario, retryCount + 1);
    }

    return {
      scenario_id: scenario.id,
      scenario_name: scenario.name,
      priority: scenario.priority,
      status: 'error',
      error: error.message,
      overall_passed: false,
      retries: retryCount
    };
  }
}

async function main() {
  const startTime = new Date();

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     VOICE AGENT TESTER - STREAMING API VERSION                 ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║  Agent: Sarah - Receptionist                          ║`);
  console.log(`║  Scenarios: ${scenarios.length}  |  Endpoint: /stream                             ║`);
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('\nRunning streaming simulations...');

  const results = [];

  for (const scenario of scenarios) {
    const result = await runSimulation(scenario);
    results.push(result);

    const icon = result.overall_passed ? '✓' : '✗';
    const retryInfo = result.retries > 0 ? ` (${result.retries} retries)` : '';
    console.log(`  [${icon}] ${result.scenario_name}: ${result.overall_passed ? 'PASS' : 'FAIL'}${retryInfo}`);

    await sleep(DELAY_BETWEEN_SCENARIOS_MS);
  }

  // Summary
  const passed = results.filter(r => r.overall_passed).length;
  const failed = results.filter(r => !r.overall_passed).length;
  const successRate = Math.round((passed / results.length) * 100);

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                        TEST RESULTS                            ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║  Total: ${results.length}  |  Passed: ${passed}  |  Failed: ${failed}  |  Success: ${successRate}%           ║`);
  console.log('╚════════════════════════════════════════════════════════════════╝');

  // Save results
  const resultsPath = path.join(__dirname, 'test-results-stream.json');
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: startTime.toISOString(),
    endpoint: 'streaming',
    summary: { total: results.length, passed, failed, success_rate: successRate },
    results
  }, null, 2));

  console.log(`\n📄 Results saved to: ${resultsPath}`);
  console.log(`\nTimestamp: ${new Date().toISOString()}`);
  console.log(`Status: ${successRate >= 80 ? 'HEALTHY' : successRate >= 50 ? 'WARNING' : 'CRITICAL'}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
