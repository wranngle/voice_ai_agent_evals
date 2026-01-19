#!/bin/bash
# Test: Twilio - Send SMS
# Method: POST
# Docs: https://www.twilio.com/docs/sms/send-messages
#
# NOTE: This test actually sends an SMS! Use with caution.
# Set TEST_PHONE_NUMBER to receive a test message.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../env/.env.twilio"

echo "Testing Twilio SMS..."

if [ -z "$TWILIO_ACCOUNT_SID" ] || [ -z "$TWILIO_AUTH_TOKEN" ]; then
  echo "TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set"
  exit 1
fi

if [ -z "$TWILIO_PHONE_NUMBER" ]; then
  echo "TWILIO_PHONE_NUMBER not set"
  exit 1
fi

# Check for test phone number (don't send to random numbers)
TEST_PHONE_NUMBER="${1:-$TEST_PHONE_NUMBER}"
if [ -z "$TEST_PHONE_NUMBER" ]; then
  echo "SKIP: No TEST_PHONE_NUMBER provided"
  echo "Usage: ./02-send-sms.sh +1XXXXXXXXXX"
  echo "Or set TEST_PHONE_NUMBER in environment"
  exit 0
fi

echo "Sending test SMS to $TEST_PHONE_NUMBER..."

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  -d "From=$TWILIO_PHONE_NUMBER" \
  -d "To=$TEST_PHONE_NUMBER" \
  -d "Body=Test message from n8n workflow development - ElevenLabs/Twilio integration" \
  "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages.json")

HTTP_BODY=$(echo "$RESPONSE" | sed '$d')
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

if [ "$HTTP_CODE" -eq 201 ]; then
  echo "PASS: SMS sent successfully"
  echo "Message SID: $(echo "$HTTP_BODY" | jq -r '.sid' 2>/dev/null)"
  exit 0
elif [ "$HTTP_CODE" -eq 400 ]; then
  echo "FAIL: Invalid phone number or parameters"
  echo "$HTTP_BODY" | jq -r '.message // .' 2>/dev/null
  exit 1
elif [ "$HTTP_CODE" -eq 401 ]; then
  echo "FAIL: Authentication failed"
  exit 1
else
  echo "FAIL: Unexpected response (HTTP $HTTP_CODE)"
  echo "$HTTP_BODY"
  exit 1
fi
