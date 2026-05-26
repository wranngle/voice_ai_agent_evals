> This is a page from the ElevenLabs documentation. For a complete page index, fetch https://elevenlabs.io/docs/llms.txt. For the full documentation in a single file, fetch https://elevenlabs.io/docs/llms-full.txt.

# Personalization

## Overview

Personalization allows you to adapt your agent's behavior for each individual user, enabling more natural and contextually relevant conversations. ElevenLabs offers multiple approaches to personalization:

1. **Dynamic Variables** - Inject runtime values into prompts and messages
2. **Overrides** - Completely replace system prompts or messages
3. **Twilio Integration** - Personalize inbound call experiences via webhooks

## Personalization Methods

Define runtime values using `{{ var_name }}` syntax to personalize your agent's messages, system
prompts, and tools.

Completely replace system prompts, first messages, language, or voice settings for each
conversation.

Dynamically personalize inbound Twilio calls using webhook data.

## Conversation Initiation Client Data Structure

The `conversation_initiation_client_data` object defines what can be customized when starting a conversation:

```json
{
  "type": "conversation_initiation_client_data",
  "conversation_config_override": {
    "agent": {
      "prompt": {
        "prompt": "overriding system prompt",
        "llm": "gpt-4o"
      },
      "first_message": "overriding first message",
      "language": "en"
    },
    "tts": {
      "voice_id": "voice-id-here"
    },
    "conversation": {
      "text_only": false
    }
  },
  "custom_llm_extra_body": {
    "temperature": 0.7,
    "max_tokens": 100
  },
  "dynamic_variables": {
    "string_var": "text value",
    "number_var": 1.2,
    "integer_var": 123,
    "boolean_var": true
  },
  "user_id": "your_custom_user_id",
  "branch_id": "agtbrch_xxxx",
  "environment": "production"
}
```

System dynamic variables (those prefixed with `system__`) cannot be sent or overridden in the
client initiation payload. Only custom dynamic variables can be set via the `dynamic_variables`
field.

## Choosing the Right Approach

<thead>
  <tr>
    <th>
      Method
    </th>

    <th>
      Best For
    </th>

    <th>
      Implementation
    </th>
  </tr>
</thead>

<tbody>
  <tr>
    <td>
      **Dynamic Variables**
    </td>

    <td>
      * Inserting user-specific data into templated content - Maintaining consistent agent
        behavior with personalized details - Personalizing tool parameters
    </td>

    <td>
      Define variables with 

      `{{ variable_name }}`

       and pass values at runtime
    </td>
  </tr>

  <tr>
    <td>
      **Overrides**
    </td>

    <td>
      * Completely changing agent behavior per user - Switching languages or voices - Legacy
        applications (consider migrating to Dynamic Variables)
    </td>

    <td>
      Enable specific override permissions in security settings and pass complete replacement
      content
    </td>
  </tr>
</tbody>

## Learn More

* [Dynamic Variables Documentation](/docs/eleven-agents/customization/personalization/dynamic-variables)
* [Overrides Documentation](/docs/eleven-agents/customization/personalization/overrides)
* [Twilio Integration Documentation](/docs/eleven-agents/customization/personalization/twilio-personalization)