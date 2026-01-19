#!/bin/bash
# Auth Test: ElevenLabs
# Generated: 2025-12-26
# Docs: https://elevenlabs.io/docs/api-reference/get-user-info

set -e

# Load credentials
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../env/.env.elevenlabs"

echo "Testing ElevenLabs authentication..."

if [ -z "$ELEVENLABS_API_KEY" ]; then
  echo "ELEVENLABS_API_KEY not set"
  exit 1
fi

# Test API key by getting user info
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  "${ELEVENLABS_BASE_URL:-https://api.elevenlabs.io}/v1/user")

HTTP_BODY=$(echo "$RESPONSE" | sed '$d')
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

if [ "$HTTP_CODE" -eq 200 ]; then
  echo "PASS: ElevenLabs authentication successful"
  echo "User Info:"
  echo "$HTTP_BODY" | jq -r '.subscription.tier // "Unknown tier"' 2>/dev/null || echo "$HTTP_BODY"
  exit 0
elif [ "$HTTP_CODE" -eq 401 ]; then
  echo "FAIL: Invalid API key"
  echo "$HTTP_BODY"
  exit 1
else
  echo "FAIL: Unexpected response (HTTP $HTTP_CODE)"
  echo "$HTTP_BODY"
  exit 1
fi
