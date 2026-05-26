> This is a page from the ElevenLabs documentation. For a complete page index, fetch https://elevenlabs.io/docs/llms.txt. For the full documentation in a single file, fetch https://elevenlabs.io/docs/llms-full.txt.

# React Native SDK

Refer to the [ElevenAgents overview](/docs/eleven-agents/overview) for an explanation of how
ElevenAgents works.

## Installation

Install the package and its dependencies in your React Native project.

```shell
npm install @elevenlabs/react-native @livekit/react-native @livekit/react-native-webrtc livekit-client
```

An example app using this SDK with Expo can be found
[here](https://github.com/elevenlabs/packages/tree/main/examples/react-native-expo)

Upgrading from an earlier version? Run `npx skills add elevenlabs/packages` to install the
`elevenlabs:sdk-migration` skill for your AI coding agent, which automates import changes,
`ConversationProvider` wrapping, and API updates.

## Requirements

* React Native with LiveKit dependencies
* Microphone permissions configured for your platform
* Expo compatibility (development builds only)

This SDK was designed and built for use with the Expo framework. Due to its dependency on
LiveKit's WebRTC implementation, it requires development builds and cannot be used with Expo Go.

## Setup

### Provider Setup

Wrap your app with the `ConversationProvider` to enable ElevenAgents functionality.

```tsx
import { ConversationProvider } from "@elevenlabs/react-native";
import React from "react";

function App() {
  return (
    <ConversationProvider>
      <YourAppComponents />
    </ConversationProvider>
  );
}
```

`@elevenlabs/react-native` re-exports `ConversationProvider` and all hooks from
`@elevenlabs/react`. The API is identical to the web React SDK — see the [React SDK
documentation](/docs/eleven-agents/libraries/react) for the full API reference.

## Usage

All hooks from the React SDK are available via `@elevenlabs/react-native`:

* **`useConversation`** — convenience hook combining all state and methods
* **`useConversationControls`** — action methods (startSession, endSession, etc.)
* **`useConversationStatus`** — connection status
* **`useConversationInput`** — mute state
* **`useConversationMode`** — speaking/listening state
* **`useConversationFeedback`** — feedback availability and submission
* **`useConversationClientTool`** — dynamic client tool registration
* **`useRawConversation`** — raw conversation instance

### Starting a conversation

```tsx
import { useConversationControls, useConversationStatus } from "@elevenlabs/react-native";
import React from "react";
import { View, Text, Button } from "react-native";

function ConversationComponent() {
  const { startSession, endSession } = useConversationControls();
  const { status } = useConversationStatus();

  const handleStart = async () => {
    await startSession({
      agentId: "agent_7101k5zvyjhmfg983brhmhkd98n6",
    });
  };

  return (
    <View>
      <Text>Status: {status}</Text>
      <Button
        title={status === "connected" ? "End" : "Start"}
        onPress={status === "connected" ? endSession : handleStart}
      />
    </View>
  );
}
```

For private agents, authentication, client tools, overrides, and all other features, see the [React SDK documentation](/docs/eleven-agents/libraries/react).

## Example Implementation

Here's a complete example of a React Native component using the ElevenLabs Agents SDK:

```tsx
import { ConversationProvider, useConversation } from "@elevenlabs/react-native";
import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

function ConversationScreen() {
  const [isConnected, setIsConnected] = useState(false);

  const conversation = useConversation({
    onConnect: () => {
      console.log("Connected to conversation");
      setIsConnected(true);
    },
    onDisconnect: () => {
      console.log("Disconnected from conversation");
      setIsConnected(false);
    },
    onMessage: (message) => {
      console.log("Message received:", message);
    },
    onError: (error) => {
      console.error("Conversation error:", error);
    },
  });

  const startConversation = async () => {
    try {
      await conversation.startSession({
        agentId: "agent_7101k5zvyjhmfg983brhmhkd98n6",
      });
    } catch (error) {
      console.error("Failed to start conversation:", error);
    }
  };

  const endConversation = async () => {
    try {
      await conversation.endSession();
    } catch (error) {
      console.error("Failed to end conversation:", error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.status}>Status: {conversation.status}</Text>

      <Text style={styles.speaking}>
        Agent is {conversation.isSpeaking ? "speaking" : "not speaking"}
      </Text>

      <TouchableOpacity
        style={[styles.button, isConnected && styles.buttonActive]}
        onPress={isConnected ? endConversation : startConversation}
      >
        <Text style={styles.buttonText}>
          {isConnected ? "End Conversation" : "Start Conversation"}
        </Text>
      </TouchableOpacity>

      {conversation.canSendFeedback && (
        <View style={styles.feedbackContainer}>
          <TouchableOpacity
            style={styles.feedbackButton}
            onPress={() => conversation.sendFeedback(true)}
          >
            <Text>👍</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.feedbackButton}
            onPress={() => conversation.sendFeedback(false)}
          >
            <Text>👎</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function App() {
  return (
    <ConversationProvider>
      <ConversationScreen />
    </ConversationProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  status: {
    fontSize: 16,
    marginBottom: 10,
  },
  speaking: {
    fontSize: 14,
    marginBottom: 20,
    color: "#666",
  },
  button: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 20,
  },
  buttonActive: {
    backgroundColor: "#FF3B30",
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  feedbackContainer: {
    flexDirection: "row",
    gap: 10,
  },
  feedbackButton: {
    backgroundColor: "#F2F2F7",
    padding: 10,
    borderRadius: 8,
  },
});

export default App;
```

## Platform-Specific Considerations

### iOS

Ensure microphone permissions are properly configured in your `Info.plist`:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>This app needs microphone access to enable voice conversations with AI agents.</string>
```

### Android

Add microphone permissions to your `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

Consider requesting runtime permissions before starting a conversation:

```tsx
import { PermissionsAndroid, Platform } from "react-native";

const requestMicrophonePermission = async () => {
  if (Platform.OS === "android") {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: "Microphone Permission",
      message: "This app needs microphone access to enable voice conversations.",
      buttonNeutral: "Ask Me Later",
      buttonNegative: "Cancel",
      buttonPositive: "OK",
    });
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }
  return true;
};
```