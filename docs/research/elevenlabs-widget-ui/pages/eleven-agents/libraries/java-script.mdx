> This is a page from the ElevenLabs documentation. For a complete page index, fetch https://elevenlabs.io/docs/llms.txt. For the full documentation in a single file, fetch https://elevenlabs.io/docs/llms-full.txt.

# JavaScript SDK

Also see the [ElevenAgents overview](/docs/eleven-agents/overview)

## Installation

Install the package in your project through package manager.

```shell
npm install @elevenlabs/client
# or
yarn add @elevenlabs/client
# or
pnpm install @elevenlabs/client
```

Upgrading from an earlier version? Run `npx skills add elevenlabs/packages` to install the
`elevenlabs:sdk-migration` skill for your AI coding agent, which automates import changes and API
updates.

## Usage

This library is primarily meant for development in vanilla JavaScript projects, or as a base for libraries tailored to specific frameworks.
It is recommended to check whether your specific framework has its own library.
However, you can use this library in any JavaScript-based project.

### Initialize conversation

First, create a new conversation session using `Conversation.startSession`:

```js
const conversation = await Conversation.startSession(options);
```

This will establish a connection and start using the microphone to communicate with the ElevenLabs Agents agent. Consider explaining and allowing microphone access in your app's UI before starting the conversation:

```js
// call after explaining to the user why the microphone access is needed
await navigator.mediaDevices.getUserMedia({ audio: true });
```

#### Session configuration

The options passed to `startSession` specify how the session is established. Conversations can be started with public or private agents.

##### Public agents

Agents that don't require any authentication can be used to start a conversation by using the agent ID. The agent ID can be acquired through the [ElevenLabs UI](https://elevenlabs.io/app/conversational-ai).

For public agents, you can use the ID directly:

```js
const conversation = await Conversation.startSession({
  agentId: "agent_7101k5zvyjhmfg983brhmhkd98n6",
});
```

The connection type is automatically inferred based on the conversation mode. Voice conversations
use WebRTC and text-only conversations use WebSocket by default. You can still explicitly specify
`connectionType: 'webrtc'` or `connectionType: 'websocket'` if needed.

##### Private agents

If the conversation requires authorization, you will need to add a dedicated endpoint to your server that will either request a signed url (if using the WebSockets connection type) or a conversation token (if using WebRTC) using the [ElevenLabs API](https://elevenlabs.io/docs/overview/intro) and pass it back to the client.

Here's an example for a WebSocket connection:

```js maxLines=0
// Node.js server

app.get("/signed-url", yourAuthMiddleware, async (req, res) => {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${process.env.AGENT_ID}`,
    {
      method: "GET",
      headers: {
        // Requesting a signed url requires your ElevenLabs API key
        // Do NOT expose your API key to the client!
        "xi-api-key": process.env.XI_API_KEY,
      },
    }
  );

  if (!response.ok) {
    return res.status(500).send("Failed to get signed URL");
  }

  const body = await response.json();
  res.send(body.signed_url);
});
```

```js
// Client

const response = await fetch("/signed-url", yourAuthHeaders);
const signedUrl = await response.text();

const conversation = await Conversation.startSession({
  signedUrl,
});
```

Here's an example for WebRTC:

```js maxLines=0
// Node.js server

app.get("/conversation-token", yourAuthMiddleware, async (req, res) => {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${process.env.AGENT_ID}`,
    {
      headers: {
        // Requesting a conversation token requires your ElevenLabs API key
        // Do NOT expose your API key to the client!
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
      },
    }
  );

  if (!response.ok) {
    return res.status(500).send("Failed to get conversation token");
  }

  const body = await response.json();
  res.send(body.token);
});
```

Once you have the token, providing it to `startSession` will initiate the conversation using WebRTC.

```js
// Client

const response = await fetch("/conversation-token", yourAuthHeaders);
const conversationToken = await response.text();

const conversation = await Conversation.startSession({
  conversationToken,
});
```

#### Optional callbacks

The options passed to `startSession` can also be used to register optional callbacks:

* **onConnect** - handler called when the conversation websocket connection is established.
* **onDisconnect** - handler called when the conversation websocket connection is ended.
* **onMessage** - handler called when a new text message is received. These can be tentative or final transcriptions of user voice, replies produced by LLM. Primarily used for handling conversation transcription.
* **onError** - handler called when an error is encountered.
* **onStatusChange** - handler called whenever connection status changes. Can be `connected`, `connecting` and `disconnected` (initial).
* **onModeChange** - handler called when a status changes, eg. agent switches from `speaking` to `listening`, or the other way around.
* **onCanSendFeedbackChange** - handler called when sending feedback becomes available or unavailable.
* **onAudioAlignment** - handler called when audio alignment data is received, providing character-level timing information for agent speech.

Not all client events are enabled by default for an agent. If you have enabled a callback but
aren't seeing events come through, ensure that your ElevenLabs agent has the corresponding event
enabled. You can do this in the "Advanced" tab of the agent settings in the ElevenLabs dashboard.

#### Return value

`startSession` returns a conversation instance (`VoiceConversation` or `TextConversation` depending on the mode) that can be used to control the session. The method will throw an error if the session cannot be established. This can happen if the user denies microphone access, or if the connection fails.

**endSession**

A method to manually end the conversation. The method will end the conversation and disconnect from websocket.
Afterwards the conversation instance will be unusable and can be safely discarded.

```js
await conversation.endSession();
```

**getId**

A method returning the conversation ID.

```js
const id = conversation.getId();
```

**setVolume**

A method to set the output volume of the conversation. Accepts object with volume field between 0 and 1.

```js
await conversation.setVolume({ volume: 0.5 });
```

**getInputVolume / getOutputVolume**

Methods that return the current input/output volume on a scale from `0` to `1` where `0` is -100 dB and `1` is -30 dB.

```js
const inputVolume = await conversation.getInputVolume();
const outputVolume = await conversation.getOutputVolume();
```

**sendFeedback**

A method for sending binary feedback to the agent. The method accepts a boolean value, where `true` represents positive feedback and `false` negative feedback.

Feedback is always correlated to the most recent agent response and can be sent only once per response.

You can listen to `onCanSendFeedbackChange` to know if feedback can be sent at the given moment.

```js
conversation.sendFeedback(true); // positive feedback
conversation.sendFeedback(false); // negative feedback
```

**sendContextualUpdate**

A method to send contextual updates to the agent. This can be used to inform the agent about user actions that are not directly related to the conversation, but may influence the agent's responses.

```js
conversation.sendContextualUpdate(
  "User navigated to another page. Consider it for next response, but don't react to this contextual update."
);
```

**sendUserMessage**

Sends a text message to the agent.

Can be used to let the user type in the message instead of using the microphone. Unlike `sendContextualUpdate`, this will be treated as a user message and will prompt the agent to take its turn in the conversation.

```js
sendButton.addEventListener("click", (e) => {
  conversation.sendUserMessage(textInput.value);
  textInput.value = "";
});
```

**sendUserActivity**

Notifies the agent about user activity.

The agent will not attempt to speak for at least 2 seconds after the user activity is detected.

This can be used to prevent the agent from interrupting the user when they are typing.

```js
textInput.addEventListener("input", () => {
  conversation.sendUserActivity();
});
```

**setMicMuted**

A method to mute/unmute the microphone.

```js
// Mute the microphone
conversation.setMicMuted(true);

// Unmute the microphone
conversation.setMicMuted(false);
```

**changeInputDevice**

Allows you to change the audio input device during an active voice conversation. This method is only available for voice conversations.

In WebRTC mode the input format and sample rate are hardcoded to `pcm` and `48000` respectively.
Changing those values when changing the input device is a no-op.

```js
const conversation = await Conversation.startSession({
  agentId: "agent_7101k5zvyjhmfg983brhmhkd98n6",
  // Alternatively you can provide a device ID when starting the session
  // Useful if you want to start the conversation with a non-default device
  inputDeviceId: "a1b2c3d4e5f6",
});

// Change to a specific input device
await conversation.changeInputDevice({
  sampleRate: 16000,
  format: "pcm",
  preferHeadphonesForIosDevices: true,
  inputDeviceId: "a1b2c3d4e5f6",
});
```

If the device ID is invalid, the default device will be used instead.

**changeOutputDevice**

Allows you to change the audio output device during an active voice conversation. This method is only available for voice conversations.

In WebRTC mode the output format and sample rate are hardcoded to `pcm` and `48000` respectively.
Changing those values when changing the output device is a no-op.

```js
const conversation = await Conversation.startSession({
  agentId: "agent_7101k5zvyjhmfg983brhmhkd98n6",
  // Alternatively you can provide a device ID when starting the session
  // Useful if you want to start the conversation with a non-default device
  outputDeviceId: "a1b2c3d4e5f6",
});

// Change to a specific output device
await conversation.changeOutputDevice({
  sampleRate: 16000,
  format: "pcm",
  outputDeviceId: "a1b2c3d4e5f6",
});
```

Device switching only works for voice conversations. If no specific `deviceId` is provided, the
browser will use its default device selection. You can enumerate available devices using the
[MediaDevices.enumerateDevices()](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices)
API.

**getInputByteFrequencyData / getOutputByteFrequencyData**

Methods that return `Uint8Array`s containing the current input/output frequency data. See [AnalyserNode.getByteFrequencyData](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getByteFrequencyData) for more information.

These methods are only available for voice conversations. In WebRTC mode the audio is hardcoded to
use `pcm_48000`, meaning any visualization using the returned data might show different patterns
to WebSocket connections.