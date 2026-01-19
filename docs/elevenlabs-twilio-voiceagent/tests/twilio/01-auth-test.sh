#!/bin/bash
# Auth Test: Twilio
# Generated: 2025-12-26
# Docs: https://www.twilio.com/docs/usage/api

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../env/.env.twilio"

echo "Testing Twilio authentication..."

if [ -z "$TWILIO_ACCOUNT_SID" ] || [ -z "$TWILIO_AUTH_TOKEN" ]; then
  echo "TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set"
  exit 1
fi

# Test credentials by fetching account info
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID.json")

HTTP_BODY=$(echo "$RESPONSE" | sed '$d')
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

if [ "$HTTP_CODE" -eq 200 ]; then
  echo "PASS: Twilio authentication successful"
  echo "Account Status:"
  echo "$HTTP_BODY" | jq -r '.status // "Unknown"' 2>/dev/null || echo "$HTTP_BODY"
  exit 0
elif [ "$HTTP_CODE" -eq 401 ]; then
  echo "FAIL: Invalid credentials"
  echo "$HTTP_BODY"
  exit 1
else
  echo "FAIL: Unexpected response (HTTP $HTTP_CODE)"
  echo "$HTTP_BODY"
  exit 1
fi
