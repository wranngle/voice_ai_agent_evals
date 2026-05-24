> This is a page from the ElevenLabs documentation. For a complete page index, fetch https://elevenlabs.io/docs/llms.txt. For the full documentation in a single file, fetch https://elevenlabs.io/docs/llms-full.txt.

# Overrides

While overrides are still supported for completely replacing system prompts or first messages, we
recommend using [Dynamic
Variables](/docs/eleven-agents/customization/personalization/dynamic-variables) as the preferred
way to customize your agent's responses and inject real-time data. Dynamic Variables offer better
maintainability and a more structured approach to personalization.

**Overrides** enable your assistant to adapt its behavior for each user interaction. You can pass custom data and settings at the start of each conversation, allowing the assistant to personalize its responses and knowledge with real-time context. Overrides completely override the agent's default values defined in the agent's [dashboard](https://elevenlabs.io/app/agents/agents).

## Overview

Overrides allow you to modify your AI agent's behavior in real-time without creating multiple agents. This enables you to personalize responses with user-specific data.

Overrides can be enabled for the following fields in the agent's security settings:

* System prompt
* First message
* Language
* Voice ID
* LLM (Large Language Model)
* Text-only mode
* Stability
* Speed
* Similarity boost

When overrides are enabled for a field, providing an override is still optional. If not provided, the agent will use the default values defined in the agent's [dashboard](https://elevenlabs.io/app/agents/agents). An error will be thrown if an override is provided for a field that does not have overrides enabled.

Here are a few examples where overrides can be useful:

* **Greet users** by their name
* **Include account-specific details** in responses
* **Adjust the agent's language** or tone based on user preferences
* **Pass real-time data** like account balances or order status

Overrides are particularly useful for applications requiring personalized interactions or handling
sensitive user data that shouldn't be stored in the agent's base configuration.

## Guide

### Prerequisites

* An [ElevenLabs account](https://elevenlabs.io)
* A configured ElevenLabs Conversational Agent ([create one here](/docs/eleven-agents/quickstart))

This guide will show you how to override the default agent **System prompt**, **First message**, **LLM**, and **TTS settings**.

For security reasons, overrides are disabled by default. Enable the fields you want to allow overriding (e.g. `first_message`, `prompt`, `language`).

Navigate to your agent's settings and select the **Security** tab. Enable the `First message`, `System prompt`, and any other overrides you need (such as `LLM`).

![Enable overrides](https://files.buildwithfern.com/https://elevenlabs.docs.buildwithfern.com/docs/496f20380ffe29fc46275bbfe5c6eaabdb5e211c780188243a018b38715ea779/assets/images/conversational-ai/enable-overrides.jpg)

```bash
elevenlabs agents pull --agent "<agent-name>"
```

Set fields under `platform_settings.overrides.conversation_config_override` to `true` to allow runtime overrides for that field:

```json
{
  "platform_settings": {
    "overrides": {
      "conversation_config_override": {
        "agent": {
          "first_message": true,
          "language": true,
          "prompt": { "prompt": true }
        },
        "tts": { "voice_id": true }
      }
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
    platform_settings={
        "overrides": {
            "conversation_config_override": {
                "agent": {
                    "first_message": True,
                    "language": True,
                    "prompt": {"prompt": True},
                },
                "tts": {"voice_id": True},
            },
        },
    },
)
```

```typescript
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const elevenlabs = new ElevenLabsClient();

await elevenlabs.conversationalAi.agents.update("agent_7101k5zvyjhmfg983brhmhkd98n6", {
  platformSettings: {
    overrides: {
      conversationConfigOverride: {
        agent: {
          firstMessage: true,
          language: true,
          prompt: { prompt: true },
        },
        tts: { voiceId: true },
      },
    },
  },
});
```

In your code, where the conversation is started, pass the overrides as a parameter.

Ensure you have the latest [SDK](/docs/eleven-agents/libraries/python) installed.

```python title="Python" focus={3-16} maxLines=16
from elevenlabs.conversational_ai.conversation import Conversation, ConversationInitiationData
...
conversation_override = {
    "agent": {
        "prompt": {
            "prompt": f"The customer's bank account balance is {customer_balance}. They are based in {customer_location}.", # Optional: override the system prompt.
            "llm": "gpt-4o" # Optional: override the LLM model.
        },
        "first_message": f"Hi {customer_name}, how can I help you today?", # Optional: override the first_message.
        "language": "en" # Optional: override the language.
    },
    "tts": {
        "voice_id": "custom_voice_id", # Optional: override the voice.
        "stability": 0.7, # Optional: override stability (0.0 to 1.0).
        "speed": 1.1, # Optional: override speed (0.7 to 1.2).
        "similarity_boost": 0.9 # Optional: override similarity boost (0.0 to 1.0).
    },
    "conversation": {
        "text_only": True # Optional: enable text-only mode (no audio).
    }
}

config = ConversationInitiationData(
    conversation_config_override=conversation_override
)
conversation = Conversation(
    ...
    config=config,
    ...
)
conversation.start_session()
```

```javascript title="JavaScript" focus={4-17} maxLines=17
...
const conversation = await Conversation.startSession({
  ...
  overrides: {
      agent: {
          prompt: {
              prompt: `The customer's bank account balance is ${customer_balance}. They are based in ${customer_location}.`, // Optional: override the system prompt.
              llm: "gpt-4o" // Optional: override the LLM model.
          },
          firstMessage: `Hi ${customer_name}, how can I help you today?`, // Optional: override the first message.
          language: "en" // Optional: override the language.
      },
      tts: {
          voiceId: "custom_voice_id", // Optional: override the voice.
          stability: 0.7, // Optional: override stability (0.0 to 1.0).
          speed: 1.1, // Optional: override speed (0.7 to 1.2).
          similarityBoost: 0.9 // Optional: override similarity boost (0.0 to 1.0).
      },
      conversation: {
          textOnly: true // Optional: enable text-only mode (no audio).
      }
  },
  ...
})
```

```swift title="Swift" focus={3-16} maxLines=16
import ElevenLabsSDK

let promptOverride = ElevenLabsSDK.AgentPrompt(
    prompt: "The customer's bank account balance is \(customer_balance). They are based in \(customer_location).", // Optional: override the system prompt.
    llm: "gpt-4o" // Optional: override the LLM model.
)
let agentConfig = ElevenLabsSDK.AgentConfig(
    prompt: promptOverride, // Optional: override the system prompt.
    firstMessage: "Hi \(customer_name), how can I help you today?", // Optional: override the first message.
    language: .en // Optional: override the language.
)
let ttsConfig = ElevenLabsSDK.TTSConfig(
    voiceId: "custom_voice_id", // Optional: override the voice.
    stability: 0.7, // Optional: override stability (0.0 to 1.0).
    speed: 1.1, // Optional: override speed (0.7 to 1.2).
    similarityBoost: 0.9 // Optional: override similarity boost (0.0 to 1.0).
)
let conversationConfig = ElevenLabsSDK.ConversationConfig(
    textOnly: true // Optional: enable text-only mode (no audio).
)
let overrides = ElevenLabsSDK.ConversationConfigOverride(
    agent: agentConfig, // Optional: override agent settings.
    tts: ttsConfig, // Optional: override TTS settings.
    conversation: conversationConfig // Optional: override conversation settings.
)

let config = ElevenLabsSDK.SessionConfig(
    agentId: "",
    overrides: overrides
)

let conversation = try await ElevenLabsSDK.Conversation.startSession(
  config: config,
  callbacks: callbacks
)
```

```html title="Widget"
  <elevenlabs-convai
    agent-id="agent_7101k5zvyjhmfg983brhmhkd98n6"
    override-language="es"         <!-- Optional: override the language -->
    override-prompt="Custom system prompt for this user"  <!-- Optional: override the system prompt -->
    override-first-message="Hi! How can I help you today?"  <!-- Optional: override the first message -->
    override-voice-id="custom_voice_id"  <!-- Optional: override the voice -->
  ></elevenlabs-convai>
```

When using overrides, omit any fields you don't want to override rather than setting them to empty strings or null values. Only include the fields you specifically want to customize.

To find the correct LLM model string, refer to the [Agent API reference](/docs/api-reference/agents/create#request.body.conversation_config.agent.prompt.llm) which lists all supported LLM models and their exact string identifiers.