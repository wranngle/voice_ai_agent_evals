> This is a page from the ElevenLabs documentation. For a complete page index, fetch https://elevenlabs.io/docs/llms.txt. For the full documentation in a single file, fetch https://elevenlabs.io/docs/llms-full.txt.

# Chat Mode

Chat mode allows your agents to act as chat agents, ie to have text-only conversations without
audio input/output. This is useful for building chat interfaces, testing agents, or when audio is
not required.

## Overview

There are two main ways to enable chat mode:

1. **Agent Configuration**: Configure your agent for text-only mode when creating it via the API
2. **Runtime Overrides**: Use SDK overrides to enforce text-only conversations programmatically

This guide covers both approaches and how to implement chat mode across different SDKs.

## Creating Text-Only Agents

Configure an agent for text-only mode to make it the default for every conversation with that agent.

Open your agent in the dashboard, navigate to the **Advanced** tab, and enable the **Text only** toggle. Save your changes.

```bash
elevenlabs agents pull --agent "<agent-name>"
```

Set `conversation_config.conversation.text_only`:

```json
{
  "conversation_config": {
    "conversation": {
      "text_only": true
    }
  }
}
```

```bash
elevenlabs agents push --agent "<agent-name>"
```

```python
from elevenlabs import ElevenLabs

elevenlabs = ElevenLabs()

elevenlabs.conversational_ai.agents.update(
    agent_id="agent_7101k5zvyjhmfg983brhmhkd98n6",
    conversation_config={
        "conversation": {"text_only": True},
    },
)
```

```typescript
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const elevenlabs = new ElevenLabsClient();

await elevenlabs.conversationalAi.agents.update("agent_7101k5zvyjhmfg983brhmhkd98n6", {
  conversationConfig: {
    conversation: { textOnly: true },
  },
});
```

For complete API reference and all available configuration options, see the [text only field in
Create Agent API
documentation](/docs/api-reference/agents/create#request.body.conversation_config.conversation.text_only).

## Runtime Overrides for Text-Only Mode

To enable chat mode at runtime using overrides (rather than configuring at the agent level), you can use the `textOnly` override in your conversation configuration:

```python
from elevenlabs.client import ElevenLabs
from elevenlabs.conversational_ai.conversation import Conversation, ConversationInitiationData

# Configure for text-only mode with proper structure
conversation_override = {
    "conversation": {
        "text_only": True
    }
}

config = ConversationInitiationData(
    conversation_config_override=conversation_override
)

conversation = Conversation(
    elevenlabs,
    agent_id,
    requires_auth=bool(api_key),
    config=config,
    # Important: Ensure agent_response callback is set
    callback_agent_response=lambda response: print(f"Agent: {response}"),
    callback_user_transcript=lambda transcript: print(f"User: {transcript}"),
)

conversation.start_session()
```

```javascript
const conversation = await Conversation.startSession({
  agentId: "<your-agent-id>",
  overrides: {
    conversation: {
      textOnly: true,
    },
  },
});
```

This configuration ensures that:

* No audio input/output is used
* All communication happens through text messages
* The conversation operates in a chat-like interface mode

## Important Notes

**Critical**: When using chat mode, you must ensure the `agent_response` event/callback is
activated and properly configured. Without this, the agent's text responses will not be sent or
displayed to the user.

**Security Overrides**: When using runtime overrides (not agent-level configuration), you must
enable the conversation overrides in your agent's security settings. Navigate to your agent's
**Security** tab and enable the appropriate overrides. For more details, see the [Overrides
documentation](/docs/eleven-agents/customization/personalization/overrides).

### Key Requirements

1. **Agent Response Event**: Always configure the `agent_response` callback or event handler to receive and display the agent's text messages.

2. **Agent Configuration**: If your agent is specifically set to chat mode in the agent settings, it will automatically use text-only conversations without requiring the override.

3. **No Audio Interface**: When using text-only mode, you don't need to configure audio interfaces or request microphone permissions.

### Example: Handling Agent Responses

```python
def handle_agent_response(response):
    """Critical handler for displaying agent messages"""
    print(f"Agent: {response}")  # Update your UI with the response
    update_chat_ui(response)

config = ConversationInitiationData(
    conversation_config_override={"conversation": {"text_only": True}}
)

conversation = Conversation(
  elevenlabs,
  agent_id,
  config=config,
  callback_agent_response=handle_agent_response,
)

conversation.start_session()
```

```javascript
const conversation = await Conversation.startSession({
  agentId: "<your-agent-id>",
  overrides: {
    conversation: {
      textOnly: true,
    },
  },
  // Critical: Handle agent responses
  onMessage: (message) => {
    if (message.type === "agent_response") {
      console.log("Agent:", message.text);
      // Display in your UI
      displayAgentMessage(message.text);
    }
  },
});
```

## Sending Text Messages

In chat mode, you'll need to send user messages programmatically instead of through audio:

```python
# Send a text message to the agent
conversation.send_user_message("Hello, how can you help me today?")
```

```javascript
// Send a text message to the agent
conversation.sendUserMessage({
  text: "Hello, how can you help me today?",
});
```

## Concurrency Benefits

Chat mode provides significant concurrency advantages over voice conversations:

* **Higher Limits**: Chat-only conversations have 25x higher concurrency limits than voice conversations
* **Separate Pool**: Text conversations use a dedicated concurrency pool, independent of voice conversation limits
* **Scalability**: Ideal for high-throughput applications like customer support, chatbots, or automated testing

| Plan       | Voice Concurrency | Chat-only Concurrency |
| ---------- | ----------------- | --------------------- |
| Free       | 4                 | 100                   |
| Starter    | 6                 | 150                   |
| Creator    | 10                | 250                   |
| Pro        | 20                | 500                   |
| Scale      | 30                | 750                   |
| Business   | 30                | 750                   |
| Enterprise | Elevated          | Elevated (25x)        |

During connection initiation, chat-only conversations are initially checked against your total
concurrency limit during the handshake process, then transferred to the separate chat-only
concurrency pool once the connection is established.

## Use Cases

Chat mode is ideal for:

* **Chat Interfaces**: Building traditional chat UIs without voice
* **Testing**: Testing agent logic without audio dependencies
* **Accessibility**: Providing text-based alternatives for users
* **Silent Environments**: When audio input/output is not appropriate
* **Integration Testing**: Automated testing of agent conversations

## Troubleshooting

### Agent Not Responding

If the agent's responses are not appearing:

1. Verify the `agent_response` callback is properly configured
2. Check that the agent is configured for chat mode or the `textOnly` override is set
3. Ensure the WebSocket connection is established successfully

## Next Steps

* Learn about [customizing agent behavior](/docs/eleven-agents/customization/llm)
* Explore [client events](/docs/eleven-agents/customization/events/client-events) for advanced interactions
* See [authentication setup](/docs/eleven-agents/customization/authentication) for secure conversations