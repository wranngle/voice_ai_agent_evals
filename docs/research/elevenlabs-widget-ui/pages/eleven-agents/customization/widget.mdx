> This is a page from the ElevenLabs documentation. For a complete page index, fetch https://elevenlabs.io/docs/llms.txt. For the full documentation in a single file, fetch https://elevenlabs.io/docs/llms-full.txt.

# Widget customization

**Widgets** enable instant integration of ElevenAgents into any website. You can either customize your widget through the UI or through our type-safe [ElevenAgents SDKs](/docs/eleven-api/resources/libraries) for complete control over styling and behavior. The SDK overrides take priority over UI customization.
Our widget is multimodal and able to process both text and audio.

## Modality configuration

The widget supports flexible input modes to match your use case. Configure these options in the [dashboard](https://elevenlabs.io/app/agents/dashboard) **Widget** tab under the **Interface** section.

Multimodality is fully supported in our client SDKs, see more
[here](/docs/eleven-api/resources/libraries).

![Widget interface options](https://files.buildwithfern.com/https://elevenlabs.docs.buildwithfern.com/docs/cf851dd7a29b4bd23f7d36097ebf57c0bfe1b6a7a3b35687ddea20d9920a93c0/assets/images/conversational-ai/widget-options.png)

**Available modes:**

* **Voice only** (default): Users interact through speech only.
* **Voice + text**: Users can switch between voice and text input during conversations.
* **Chat Mode**: Conversations start in chat (text-only) mode without voice capabilities when initiated with a text message.

For more information on using chat (text-only) mode via our SDKs, see our [chat mode guide](/docs/eleven-agents/guides/chat-mode).

The widget defaults to voice-only mode. Enable the text input toggle to allow multimodal
interactions, or enable text-only mode support for purely text-based conversations when initiated
via text.

## Embedding the widget

Widgets currently require public agents with authentication disabled. Ensure this is disabled in
the **Advanced** tab of your agent settings.

Add this code snippet to your website's `<body>` section. Place it in your main `index.html` file for site-wide availability:

```html title="Widget embed code"
<elevenlabs-convai agent-id="<replace-with-agent_7101k5zvyjhmfg983brhmhkd98n6>"></elevenlabs-convai>
<script
  src="https://unpkg.com/@elevenlabs/convai-widget-embed"
  async
  type="text/javascript"
></script>
```

For enhanced security, define allowed domains in your agent's **Allowlist** (located in the
**Security** tab). This restricts access to specified hosts only.

## Widget attributes

This basic embed code will display the widget with the default configuration defined in the agent's dashboard.
The widget supports various HTML attributes for further customization:

```html
<elevenlabs-convai
  agent-id="agent_id"              // Required: Your agent ID
  signed-url="signed_url"          // Alternative to agent-id
  server-location="us"             // Optional: "us" or default
  variant="expanded"               // Optional: Widget display mode
  dismissible="true"               // Optional: Allow the user to minimize the widget
></elevenlabs-convai>
```

```html
<elevenlabs-convai
  avatar-image-url="https://..." // Optional: Custom avatar image
  avatar-orb-color-1="#6DB035" // Optional: Orb gradient color 1
  avatar-orb-color-2="#F5CABB" // Optional: Orb gradient color 2
></elevenlabs-convai>
```

```html
<elevenlabs-convai
  action-text="Need assistance?" // Optional: CTA button text
  start-call-text="Begin conversation" // Optional: Start call button
  end-call-text="End call" // Optional: End call button
  expand-text="Open chat" // Optional: Expand widget text
  listening-text="Listening..." // Optional: Listening state
  speaking-text="Assistant speaking" // Optional: Speaking state
></elevenlabs-convai>
```

The widget renders markdown in agent responses. Links display as plain text by default to prevent phishing.

```html
<elevenlabs-convai
  markdown-link-allowed-hosts="example.com"  // Domains where links are clickable (use "*" for all)
  markdown-link-include-www="true"           // Also allow www variants (default: true)
  markdown-link-allow-http="true"            // Allow http:// links (default: true)
  syntax-highlight-theme="dark"              // Code block theme: "dark", "light", or "auto"
></elevenlabs-convai>
```

## Runtime configuration

Two more html attributes can be used to customize the agent's behavior at runtime. These two features can be used together, separately, or not at all

### Dynamic variables

Dynamic variables allow you to inject runtime values into your agent's messages, system prompts, and tools.

```html
<elevenlabs-convai
  agent-id="agent_7101k5zvyjhmfg983brhmhkd98n6"
  dynamic-variables='{"user_name": "John", "account_type": "premium"}'
></elevenlabs-convai>
```

All dynamic variables that the agent requires must be passed in the widget.

See more in our [dynamic variables
guide](/docs/eleven-agents/customization/personalization/dynamic-variables).

### Overrides

Overrides enable complete customization of your agent's behavior at runtime:

```html
<elevenlabs-convai
  agent-id="agent_7101k5zvyjhmfg983brhmhkd98n6"
  override-language="es"
  override-prompt="Custom system prompt for this user"
  override-first-message="Hi! How can I help you today?"
  override-voice-id="axXgspJ2msm3clMCkdW3"
></elevenlabs-convai>
```

Overrides can be enabled for specific fields, and are entirely optional.

See more in our [overrides guide](/docs/eleven-agents/customization/personalization/overrides).

## Visual customization

Customize the widget's appearance, text content, language selection, and more.

Open your agent in the dashboard and navigate to the **Widget** tab to customize appearance, avatar, text, terms, language support, and more.

![Widget customization](https://files.buildwithfern.com/https://elevenlabs.docs.buildwithfern.com/docs/1f773d01a3c0925a47f11cf57153db23bc8bc03b93efe5d7085919886ae392cf/assets/images/conversational-ai/widget-overview.png)

```bash
elevenlabs agents pull --agent "<agent-name>"
```

Set fields under `platform_settings.widget`. For example, to change the orb colors and feedback mode:

```json
{
  "platform_settings": {
    "widget": {
      "variant": "full",
      "placement": "bottom-right",
      "avatar": {
        "type": "orb",
        "color_1": "#6DB035",
        "color_2": "#F5CABB"
      },
      "feedback_mode": "during",
      "bg_color": "#ffffff",
      "text_color": "#000000",
      "btn_color": "#000000",
      "btn_text_color": "#ffffff"
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
        "widget": {
            "variant": "full",
            "placement": "bottom-right",
            "avatar": {
                "type": "orb",
                "color_1": "#6DB035",
                "color_2": "#F5CABB",
            },
            "feedback_mode": "during",
        },
    },
)
```

```typescript
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const elevenlabs = new ElevenLabsClient();

await elevenlabs.conversationalAi.agents.update("agent_7101k5zvyjhmfg983brhmhkd98n6", {
  platformSettings: {
    widget: {
      variant: "full",
      placement: "bottom-right",
      avatar: {
        type: "orb",
        color1: "#6DB035",
        color2: "#F5CABB",
      },
      feedbackMode: "during",
    },
  },
});
```

Customize the widget colors and shapes to match your brand identity.

![Widget appearance](https://files.buildwithfern.com/https://elevenlabs.docs.buildwithfern.com/docs/0c07c4569f8c5ad3b93933711c268601af411085aa7df1bb8e8ec547a01f2d8e/assets/images/conversational-ai/appearance.gif)

Gather user insights to improve agent performance. This can be used to fine-tune your agent's knowledge-base & system prompt.

![Widget feedback](https://files.buildwithfern.com/https://elevenlabs.docs.buildwithfern.com/docs/d7117399e23f06522b3112ff5c5ead23f66d3ea4700c011ff75e5dcd6cce875c/assets/images/conversational-ai/widget-feedback.png)

**Collection modes**

* <strong>None</strong>: Disable feedback collection entirely.
* <strong>During conversation</strong>: Support real-time feedback during conversations. Additionnal metadata such as the agent response that prompted the feedback will be collected to help further identify gaps.
* <strong>After conversation</strong>: Display a single feedback prompt after the conversation.

Send feedback programmatically via the [API](/docs/eleven-agents/api-reference/conversations/create) when using custom SDK implementations.

Configure the voice orb or provide your own avatar.

![Widget orb customization](https://files.buildwithfern.com/https://elevenlabs.docs.buildwithfern.com/docs/7530f28ad124fc4533911eca4a2269ac1df19dffd2b6dab1e8b56d95cc1eb53c/assets/images/conversational-ai/avatar.gif)

**Available options**

* <strong>Orb</strong>: Choose two gradient colors (e.g., #6DB035 & #F5CABB).
* <strong>Link/image</strong>: Use a custom avatar image.

Customize all displayed widget text elements, for example to modify button labels.

![Widget text contents](https://files.buildwithfern.com/https://elevenlabs.docs.buildwithfern.com/docs/4ad66ecae5df29e587afcf6e1898ccb41ca197abdaa2fde3ada4b10d256f8b7c/assets/images/conversational-ai/textcontents.gif)

Display custom terms and conditions before the conversation.

![Terms setup](https://files.buildwithfern.com/https://elevenlabs.docs.buildwithfern.com/docs/58dfd0abf92615f85c7314e8baec1bf4dd401cc88a04f1096baf817f05edb39d/assets/images/conversational-ai/terms-setup.png)

**Available options**

* <strong>Terms content</strong>: Use Markdown to format your policy text.
* <strong>Local storage key</strong>: A key (e.g., "terms\_accepted") to avoid prompting returning users.

**Usage**

The terms are displayed to users in a modal before starting the call:

![Terms display](https://files.buildwithfern.com/https://elevenlabs.docs.buildwithfern.com/docs/ca7511c60f1f6a29ee8bdd5c40083c73ef701f6cfd7ce1672161d73559a0c9b0/assets/images/conversational-ai/terms.png)

The terms can be written in Markdown, allowing you to:

* Add links to external policies
* Format text with headers and lists
* Include emphasis and styling

For more help with Markdown, see the [CommonMark help guide](https://commonmark.org/help/).

Once accepted, the status is stored locally and the user won't be prompted again on subsequent
visits.

Enable multi-language support in the widget.

![Widget language](https://files.buildwithfern.com/https://elevenlabs.docs.buildwithfern.com/docs/049e871eb0f609b071599e405c3da76351ee4ea38e52400fc416194930c42327/assets/images/conversational-ai/language.gif)

To enable language selection, you must first [add additional
languages](/docs/eleven-agents/customization/voice/customization/language) to your agent.

Allow users to mute their audio in the widget.

![Widget's mute button](https://files.buildwithfern.com/https://elevenlabs.docs.buildwithfern.com/docs/e6968e4ba057d98857fb41125bb57f92570ed7c49711ce423add1ea558de5919/assets/images/conversational-ai/widget-muted.png)

To add the mute button please enable this in the `interface` card of the agent's `widget`
settings.

![Widget's mute button](https://files.buildwithfern.com/https://elevenlabs.docs.buildwithfern.com/docs/7db9df78926f3f3b3db7c286d4efc033356ec9b79cabe20670f65a52a624fae8/assets/images/conversational-ai/widget-mute-button.png)

Customize your public widget landing page (shareable link).

![Widget shareable page](https://files.buildwithfern.com/https://elevenlabs.docs.buildwithfern.com/docs/9d8b23aa816f4b7d727b3c0511ef91d046796bb57b8299382c53b6bcff746c50/assets/images/conversational-ai/widget-shareable-page.png)

**Available options**

* <strong>Description</strong>: Provide a short paragraph explaining the purpose of the call.

***

## Advanced implementation

For more advanced customization, you should use the type-safe [ElevenAgents
SDKs](/docs/eleven-api/resources/libraries) with a Next.js, React, or Python application.

### Client Tools

Client tools allow you to extend the functionality of the widget by adding event listeners. This enables the widget to perform actions such as:

* Redirecting the user to a specific page
* Sending an email to your support team
* Redirecting the user to an external URL

To see examples of these tools in action, start a call with the agent in the bottom right corner of this page. The [source code is available on GitHub](https://github.com/elevenlabs/elevenlabs-dx/blob/main/fern/assets/scripts/widget.js) for reference.

#### Creating a Client Tool

To create your first client tool, follow the [client tools guide](/docs/eleven-agents/customization/tools/client-tools).

![Client tool configuration](https://files.buildwithfern.com/https://elevenlabs.docs.buildwithfern.com/docs/d800b8c60cba2ab0a1d0aaaecc0652a678998a4161adaf10d83df51b928a7734/assets/images/conversational-ai/widget-client-tool-setup.png)

#### Example Implementation

Below is an example of how to handle the `redirectToExternalURL` tool triggered by the widget in your JavaScript code:

```javascript title="index.js"
document.addEventListener("DOMContentLoaded", () => {
  const widget = document.querySelector("elevenlabs-convai");

  if (widget) {
    // Listen for the widget's "call" event to trigger client-side tools
    widget.addEventListener("elevenlabs-convai:call", (event) => {
      event.detail.config.clientTools = {
        // Note: To use this example, the client tool called "redirectToExternalURL" (case-sensitive) must have been created with the configuration defined above.
        redirectToExternalURL: ({ url }) => {
          window.open(url, "_blank", "noopener,noreferrer");
        },
      };
    });
  }
});
```

Explore our type-safe [SDKs](/docs/eleven-api/resources/libraries) for React, Next.js, and Python
implementations.