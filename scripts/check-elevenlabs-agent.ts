import https from 'node:https';

const API_KEY = process.env.ELEVENLABS_API_KEY;
const PLACEHOLDER_AGENT_ID = 'agent_xxxx_demo';
const AGENT_ID = process.argv.includes('--agent-id')
  ? process.argv[process.argv.indexOf('--agent-id') + 1]
  : process.env.ELEVENLABS_AGENT_ID ?? PLACEHOLDER_AGENT_ID;

// `--snapshot` writes the parsed agent JSON to stdout (no human prose, no
// progress chatter) so docs/handling-model-updates.md can capture a
// pre-update agent-config snapshot via shell redirection. All status,
// progress, and credential-fingerprint output goes to stderr in this mode
// so the redirected stdout stays valid JSON.
const SNAPSHOT_MODE = process.argv.includes('--snapshot');
const status = SNAPSHOT_MODE ? console.error : console.log;

if (!API_KEY) {
  status('ERROR: No API key found');
  process.exit(1);
}

// Detect the placeholder agent ID before issuing the request. Without this
// the script aims at `agent_xxxx_demo` and surfaces a generic 404 from
// ElevenLabs instead of "you forgot to configure ELEVENLABS_AGENT_ID."
if (AGENT_ID === PLACEHOLDER_AGENT_ID) {
  status(`ERROR: ELEVENLABS_AGENT_ID not set; refusing to call the live API with placeholder \`${PLACEHOLDER_AGENT_ID}\`.`);
  status('       Export ELEVENLABS_AGENT_ID=agent_<your sandbox> or pass --agent-id when running the script.');
  process.exit(1);
}

// Don't log any portion of the secret — log a stable last-4 fingerprint that's
// just enough for "is the env var pointing at the key I think it is?" without
// leaking enough to identify or correlate the credential elsewhere.
status('API Key: ****' + API_KEY.slice(-4));
status('Agent ID: ' + AGENT_ID);
status('\nFetching agent from ElevenLabs...\n');

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
    status('HTTP Status: ' + String(res.statusCode));

    if (res.statusCode !== 200) {
      status('Error Response: ' + data);
      // Make the exit code reflect the failure so RUNBOOK callers (and any
      // CI gate built on top) actually catch auth/lookup failures instead
      // of silently treating "401 Unauthorized" as a healthy outcome.
      process.exit(1);
    }

    try {
      const agent = JSON.parse(data) as AgentResponse;

      if (SNAPSHOT_MODE) {
        // The whole parsed agent payload goes to stdout as JSON so a shell
        // redirect produces a faithful pre-update snapshot for rollback.
        process.stdout.write(JSON.stringify(agent, null, 2) + '\n');
        return;
      }

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
      status('Parse error: ' + message);
      status('Raw data: ' + data.slice(0, 500));
      process.exit(1);
    }
  });
});

request.on('error', (error: Error) => {
  status('Request error: ' + error.message);
  process.exit(1);
});
request.end();
