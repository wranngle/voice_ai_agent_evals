import https from 'node:https';

const API_KEY = process.env.ELEVENLABS_API_KEY;
const AGENT_ID = process.argv.includes('--agent-id')
  ? process.argv[process.argv.indexOf('--agent-id') + 1]
  : process.env.ELEVENLABS_AGENT_ID ?? 'agent_xxxx_demo';

if (!API_KEY) {
  console.log('ERROR: No API key found');
  process.exit(1);
}

// Don't log any portion of the secret — log a stable last-4 fingerprint that's
// just enough for "is the env var pointing at the key I think it is?" without
// leaking enough to identify or correlate the credential elsewhere.
console.log('API Key: ****' + API_KEY.slice(-4));
console.log('Agent ID:', AGENT_ID);
console.log('\nFetching agent from ElevenLabs...\n');

type Tool = {
  name?: string;
  api_schema?: {url?: string};
};

type AgentConfig = {
  first_message?: string;
  language?: string;
  prompt?: {
    prompt?: string;
    tools?: Tool[];
  };
};

type ConversationConfig = {
  agent?: AgentConfig;
  tts?: {
    voice_id?: string;
    stability?: number;
    speed?: number;
  };
};

type AgentResponse = {
  name?: string;
  agent_id?: string;
  conversation_config?: ConversationConfig;
};

const options = {
  hostname: 'api.elevenlabs.io',
  path: `/v1/convai/agents/${AGENT_ID}`,
  method: 'GET',
  headers: {
    'xi-api-key': API_KEY,
    Accept: 'application/json',
  },
};

const request = https.request(options, res => {
  let data = '';
  res.on('data', chunk => {
    data += chunk as string;
  });
  res.on('end', () => {
    console.log('HTTP Status:', res.statusCode);

    if (res.statusCode !== 200) {
      console.log('Error Response:', data);
      return;
    }

    try {
      const agent = JSON.parse(data) as AgentResponse;

      console.log('\n=== AGENT SUMMARY ===');
      console.log('Name:', agent.name ?? 'NOT SET');
      console.log('Agent ID:', agent.agent_id ?? 'NOT SET');

      const config = agent.conversation_config ?? {};
      const agentConfig = config.agent ?? {};
      const tts = config.tts ?? {};

      console.log('\n=== VOICE CONFIG ===');
      console.log('Voice ID:', tts.voice_id ?? 'NOT SET');
      console.log('Stability:', tts.stability ?? 'NOT SET');
      console.log('Speed:', tts.speed ?? 'NOT SET');

      console.log('\n=== AGENT CONFIG ===');
      console.log('First Message:', agentConfig.first_message ?? 'NOT SET');
      console.log('Language:', agentConfig.language ?? 'NOT SET');

      const prompt = agentConfig.prompt?.prompt;
      if (prompt) {
        console.log('\n=== PROMPT PREVIEW (first 300 chars) ===');
        console.log(prompt.slice(0, 300) + (prompt.length > 300 ? '...' : ''));
        console.log(`\nPrompt length: ${prompt.length} chars`);
      } else {
        console.log('\n=== PROMPT ===');
        console.log('NO PROMPT FOUND');
      }

      const tools = agentConfig.prompt?.tools ?? [];
      console.log('\n=== TOOLS ===');
      console.log('Tool count:', tools.length);
      for (const t of tools) {
        console.log(`  - ${t.name ?? '(unnamed)'}: ${t.api_schema?.url ?? 'no URL'}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.log('Parse error:', message);
      console.log('Raw data:', data.slice(0, 500));
    }
  });
});

request.on('error', (error: Error) => {
  console.log('Request error:', error.message);
});
request.end();
