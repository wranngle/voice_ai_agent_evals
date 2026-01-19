#!/bin/bash
# Test: ElevenLabs - Text-to-Speech
# Method: POST
# Docs: https://elevenlabs.io/docs/api-reference/text-to-speech

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../env/.env.elevenlabs"

echo "Testing ElevenLabs Text-to-Speech..."

if [ -z "$ELEVENLABS_API_KEY" ]; then
  echo "ELEVENLABS_API_KEY not set"
  exit 1
fi

# Use default voice or Rachel (21m00Tcm4TlvDq8ikWAM)
VOICE_ID="${ELEVENLABS_DEFAULT_VOICE_ID:-21m00Tcm4TlvDq8ikWAM}"

# Make request (stream mode, don't save audio for test)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, this is a test of the ElevenLabs text to speech API.",
    "model_id": "eleven_multilingual_v2",
    "voice_settings": {
      "stability": 0.5,
      "similarity_boost": 0.75
    }
  }' \
  "${ELEVENLABS_BASE_URL:-https://api.elevenlabs.io}/v1/text-to-speech/$VOICE_ID")

if [ "$HTTP_CODE" -eq 200 ]; then
  echo "PASS: Text-to-speech endpoint working"
  echo "Voice ID: $VOICE_ID"
  exit 0
elif [ "$HTTP_CODE" -eq 401 ]; then
  echo "FAIL: Authentication failed"
  exit 1
elif [ "$HTTP_CODE" -eq 422 ]; then
  echo "FAIL: Invalid voice ID or parameters"
  exit 1
else
  echo "FAIL: Unexpected response (HTTP $HTTP_CODE)"
  exit 1
fi
