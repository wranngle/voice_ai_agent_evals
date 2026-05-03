const https = require('https');
require('./lib/env');

const API_KEY = process.env.ELEVENLABS_API_KEY;
const AGENT_ID = 'agent_xxxx_demo';

if (!API_KEY) {
  console.log('ERROR: No API key found');
  process.exit(1);
}

console.log('API Key:', API_KEY.substring(0, 10) + '...');
console.log('Agent ID:', AGENT_ID);
console.log('\nFetching agent from ElevenLabs...\n');

const options = {
  hostname: 'api.elevenlabs.io',
  path: `/v1/convai/agents/${AGENT_ID}`,
  method: 'GET',
  headers: {
    'xi-api-key': API_KEY,
    'Accept': 'application/json'
  }
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('HTTP Status:', res.statusCode);

    if (res.statusCode !== 200) {
      console.log('Error Response:', data);
      return;
    }

    try {
      const agent = JSON.parse(data);

      console.log('\n=== AGENT SUMMARY ===');
      console.log('Name:', agent.name);
      console.log('Agent ID:', agent.agent_id);

      const config = agent.conversation_config || {};
      const agentConfig = config.agent || {};
      const tts = config.tts || {};

      console.log('\n=== VOICE CONFIG ===');
      console.log('Voice ID:', tts.voice_id || 'NOT SET');
      console.log('Stability:', tts.stability || 'NOT SET');
      console.log('Speed:', tts.speed || 'NOT SET');

      console.log('\n=== AGENT CONFIG ===');
      console.log('First Message:', agentConfig.first_message || 'NOT SET');
      console.log('Language:', agentConfig.language || 'NOT SET');

      // Check for prompt
      const prompt = agentConfig.prompt?.prompt;
      if (prompt) {
        console.log('\n=== PROMPT PREVIEW (first 300 chars) ===');
        console.log(prompt.substring(0, 300) + '...');

        // Check for key v2.0 markers
        console.log('\n=== V2.0 MARKERS ===');
        console.log('Has call_direction:', prompt.includes('call_direction') ? '✓' : '✗');
        console.log('Has FORBIDDEN LANGUAGE:', prompt.includes('FORBIDDEN LANGUAGE') ? '✓' : '✗');
        console.log('Has Discovery Questions:', prompt.includes('Discovery') ? '✓' : '✗');
        console.log('Has Demo Close:', prompt.includes('Demo Close') ? '✓' : '✗');
        console.log('Has Emergency Redirect:', prompt.includes('Emergency Redirect') ? '✓' : '✗');
      } else {
        console.log('\n=== PROMPT ===');
        console.log('NO PROMPT FOUND');
      }

      // Check tools
      const tools = agentConfig.prompt?.tools || [];
      console.log('\n=== TOOLS ===');
      console.log('Tool count:', tools.length);
      tools.forEach(t => {
        console.log(`  - ${t.name}: ${t.api_schema?.url || 'no URL'}`);
      });

    } catch (e) {
      console.log('Parse error:', e.message);
      console.log('Raw data:', data.substring(0, 500));
    }
  });
});

req.on('error', e => console.log('Request error:', e.message));
req.end();
