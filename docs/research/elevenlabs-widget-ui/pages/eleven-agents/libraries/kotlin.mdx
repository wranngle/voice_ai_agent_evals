> This is a page from the ElevenLabs documentation. For a complete page index, fetch https://elevenlabs.io/docs/llms.txt. For the full documentation in a single file, fetch https://elevenlabs.io/docs/llms-full.txt.

# Kotlin SDK

Refer to the [ElevenAgents overview](/docs/eleven-agents/overview) for an explanation of how
ElevenAgents works.

## Installation

Add the ElevenLabs SDK to your Android project by including the following dependency in your app-level `build.gradle` file:

```kotlin build.gradle.kts
dependencies {
    // ElevenLabs Agents SDK (Android)
    implementation("io.elevenlabs:elevenlabs-android:<latest>")

    // Kotlin coroutines, AndroidX, etc., as needed by your app
}
```

An example Android app using this SDK can be found
[here](https://github.com/elevenlabs/elevenlabs-android/tree/main/example-app)

## Requirements

* Android API level 21 (Android 5.0) or higher
* Internet permission for API calls
* Microphone permission for voice input
* Network security configuration for HTTPS calls

## Setup

### Manifest Configuration

Add the necessary permissions to your `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

### Runtime Permissions

For Android 6.0 (API level 23) and higher, you must request microphone permission at runtime:

```kotlin
import android.Manifest
import android.content.pm.PackageManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

private fun requestMicrophonePermission() {
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
        != PackageManager.PERMISSION_GRANTED) {

        if (ActivityCompat.shouldShowRequestPermissionRationale(this, Manifest.permission.RECORD_AUDIO)) {
            // Show explanation to the user
            showPermissionExplanationDialog()
        } else {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.RECORD_AUDIO),
                MICROPHONE_PERMISSION_REQUEST_CODE
            )
        }
    }
}
```

## Usage

Initialize the ElevenLabs SDK in your `Application` class or main activity:

Start a conversation session with either:

* Public agent: pass `agentId`
* Private agent: pass `conversationToken` provisioned from your backend (never expose your API key to the client).

```kotlin
import io.elevenlabs.ConversationClient
import io.elevenlabs.ConversationConfig
import io.elevenlabs.ConversationSession
import io.elevenlabs.ClientTool
import io.elevenlabs.ClientToolResult

// Start a public agent session (token generated for you)
val config = ConversationConfig(
    agentId = "<your_public_agent_id>", // OR conversationToken = "<token>"
    userId = "your-user-id",
    // Optional callbacks
    onConnect = { conversationId ->
        // Called when the conversation is connected and returns the conversation ID. You can access conversationId via session.getId() too
    },
    onMessage = { source, messageJson ->
        // Raw JSON messages from data channel; useful for logging/telemetry
    },
    onModeChange = { mode ->
        // "speaking" | "listening" — drive UI indicators
    },
    onStatusChange = { status ->
        // "connected" | "connecting" | "disconnected"
    },
    onCanSendFeedbackChange = { canSend ->
        // Enable/disable thumbs up/down buttons for feedback reporting
    },
    onUnhandledClientToolCall = { call ->
        // Agent requested a client tool not registered on the device
    },
    onVadScore = { score ->
        // Voice Activity Detection score, range from 0 to 1 where higher values indicate higher confidence of speech
    },
    onAudioAlignment = { alignment ->
        // Character-level timing data for synchronized text display
        val chars = alignment["chars"] as? List<*>
        val startTimes = alignment["char_start_times_ms"] as? List<*>
        val durations = alignment["char_durations_ms"] as? List<*>
        Log.d("ExampleApp", "Audio alignment: $chars")
    },
    // List of client tools the agent can invoke
    clientTools = mapOf(
        "logMessage" to object : ClientTool {
            override suspend fun execute(parameters: Map<String, Any>): ClientToolResult {
                val message = parameters["message"] as? String

                Log.d("ExampleApp", "[INFO] Client Tool Log: $message")
                return ClientToolResult.success("Message logged successfully")
            }
        }
    ),
)

// In an Activity context
val session: ConversationSession = ConversationClient.startSession(config, this)
```

Note that ElevenAgents requires microphone access. Consider explaining and requesting permissions in your app's UI before the conversation starts, especially on Android 6.0+ where runtime permissions are required.

If a tool is configured with `expects_response=false` on the server, return `null` from `execute`
to skip sending a tool result back to the agent.

## Public vs Private Agents

* **Public agents** (no auth): Initialize with `agentId` in `ConversationConfig`. The SDK requests a conversation token from ElevenLabs without needing an API key on device.
* **Private agents** (auth): Initialize with `conversationToken` in `ConversationConfig`. Your server requests a conversation token from ElevenLabs using your ElevenLabs API key.

Never embed API keys in clients. They can be easily extracted and used maliciously.

## Client Tools

Register client tools to allow the agent to call local capabilities on the device.

```kotlin
val config = ConversationConfig(
    agentId = "<public_agent>",
    clientTools = mapOf(
        "logMessage" to object : io.elevenlabs.ClientTool {
            override suspend fun execute(parameters: Map<String, Any>): io.elevenlabs.ClientToolResult? {
                val message = parameters["message"] as? String ?: return io.elevenlabs.ClientToolResult.failure("Missing 'message'")

                android.util.Log.d("ClientTool", "Log: $message")
                return null // No response needed for fire-and-forget tools
            }
        }
    )
)
```

When the agent issues a `client_tool_call`, the SDK executes the matching tool and responds with a `client_tool_result`. If the tool is not registered, `onUnhandledClientToolCall` is invoked and a failure result is returned to the agent (if a response is expected).

### Callbacks Overview

* **onConnect** - Called when the WebRTC connection is established. Returns the conversation ID.
* **onMessage** - Called when a new message is received. These can be tentative or final transcriptions of user voice, replies produced by LLM, or debug messages. Provides source (`"ai"` or `"user"`) and raw JSON message.
* **onModeChange** - Called when the conversation mode changes. This is useful for indicating whether the agent is speaking (`"speaking"`) or listening (`"listening"`).
* **onStatusChange** - Called when the conversation status changes (`"connected"`, `"connecting"`, or `"disconnected"`).
* **onCanSendFeedbackChange** - Called when the ability to send feedback changes. Enables/disables feedback buttons.
* **onUnhandledClientToolCall** - Called when the agent requests a client tool that is not registered on the device.
* **onVadScore** - Called when the voice activity detection score changes. Range from 0 to 1 where higher values indicate higher confidence of speech.
* **onAudioAlignment** - Called when audio alignment data is received, providing character-level timing information for agent speech.

Not all client events are enabled by default for an agent. If you have enabled a callback but
aren't seeing events come through, ensure that your ElevenLabs agent has the corresponding event
enabled. You can do this in the "Advanced" tab of the agent settings in the ElevenLabs dashboard.

### Methods

#### startSession

The `startSession` method initiates the WebRTC connection and starts using the microphone to communicate with the ElevenLabs Agents agent.

##### Public agents

For public agents (i.e. agents that don't have authentication enabled), only the `agentId` is required. The Agent ID can be acquired through the [ElevenLabs UI](https://elevenlabs.io/app/agents).

```kotlin
val session = ConversationClient.startSession(
    config = ConversationConfig(
        agentId = "your-agent-id"
    ),
    context = this
)
```

##### Private agents

For private agents, you must pass in a `conversationToken` obtained from the ElevenLabs API. Generating this token requires an ElevenLabs API key.

The `conversationToken` is valid for 10 minutes.

```typescript maxLines=0
// Server-side token generation (Node.js example)

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

Then, pass the token to the `startSession` method. Note that only the `conversationToken` is required for private agents.

```kotlin

// Get conversation token from your server
val conversationToken = fetchConversationTokenFromServer()

// For private agents, pass in the conversation token
val session = ConversationClient.startSession(
    config = ConversationConfig(
        conversationToken = conversationToken
    ),
    context = this
)
```

You can optionally pass a user ID to identify the user in the conversation. This can be your own customer identifier. This will be included in the conversation initiation data sent to the server.

```kotlin
val session = ConversationClient.startSession(
    config = ConversationConfig(
        agentId = "your-agent-id",
        userId = "your-user-id"
    ),
    context = this
)
```

#### endSession

A method to manually end the conversation. The method will disconnect and end the conversation.

```kotlin
session.endSession()
```

#### sendUserMessage

Send a text message to the agent during an active conversation. This will trigger a response from the agent.

```kotlin
session.sendUserMessage("Hello, how can you help me?")
```

#### sendContextualUpdate

Sends contextual information to the agent that won't trigger a response.

```kotlin
session.sendContextualUpdate(
    "User navigated to the profile page. Consider this for next response."
)
```

#### sendFeedback

Provide feedback on the conversation quality. This helps improve the agent's performance. Use `onCanSendFeedbackChange` to enable your thumbs up/down UI when feedback is allowed.

```kotlin
// Positive feedback
session.sendFeedback(true)

// Negative feedback
session.sendFeedback(false)
```

#### sendUserActivity

Notifies the agent about user activity to prevent interruptions. Useful for when the user is actively using the app and the agent should pause speaking, i.e. when the user is typing in a chat.

The agent will pause speaking for \~2 seconds after receiving this signal.

```kotlin
session.sendUserActivity()
```

#### getId

Get the conversation ID.

```kotlin
val conversationId = session.getId()
Log.d("Conversation", "Conversation ID: $conversationId")
// e.g., "conv_123"
```

#### Mute/ Unmute

```kotlin
session.toggleMute()
session.setMicMuted(true)   // mute
session.setMicMuted(false)  // unmute
```

Observe `session.isMuted` to update the UI label between "Mute" and "Unmute".

### Properties

#### status

Get the current status of the conversation.

```kotlin
val status = session.status
Log.d("Conversation", "Current status: $status")
// Values: DISCONNECTED, CONNECTING, CONNECTED
```

## ProGuard / R8

If you shrink/obfuscate, ensure Gson models and LiveKit are kept. Example rules (adjust as needed):

```proguard
-keep class io.elevenlabs.** { *; }
-keep class io.livekit.** { *; }
-keepattributes *Annotation*
```

## Troubleshooting

* Ensure microphone permission is granted at runtime
* If reconnect hangs, verify your app calls `session.endSession()` and that you start a new session instance before reconnecting
* For emulators, verify audio input/output routes are working; physical devices tend to behave more reliably

## Example Implementation

For an example implementation, see the example app in the [ElevenLabs Android SDK repository](https://github.com/elevenlabs/elevenlabs-android/tree/main/example-app). The app demonstrates:

* One‑tap connect/disconnect
* Speaking/listening indicator
* Feedback buttons with UI enable/disable
* Typing indicator via `sendUserActivity()`
* Contextual and user messages from an input
* Microphone mute/unmute button