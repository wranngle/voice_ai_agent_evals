# Twilio Voice & SMS API Reference

> Cached: 2025-12-26 | Sources: context7, ref-tools

## Overview

Twilio Programmable Voice enables making/receiving calls, recording, conferencing, and IVR. Programmable SMS enables sending/receiving SMS and MMS messages.

## Authentication

```bash
# Basic Auth with Account SID and Auth Token
curl -u "ACCOUNT_SID:AUTH_TOKEN" https://api.twilio.com/...
```

Get credentials: https://console.twilio.com/

## Base URLs

```
Voice/SMS: https://api.twilio.com/2010-04-01
```

## Voice API Endpoints

### Make Outbound Call

```
POST /Accounts/{AccountSid}/Calls.json
```

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| To | Yes | Phone number to call (E.164) |
| From | Yes | Your Twilio number (E.164) |
| Url | Yes | TwiML URL for call instructions |
| StatusCallback | No | Webhook for call status updates |
| StatusCallbackEvent | No | Events: initiated, ringing, answered, completed |

**Example:**
```bash
curl -X POST "https://api.twilio.com/2010-04-01/Accounts/AC.../Calls.json" \
  -u "ACCOUNT_SID:AUTH_TOKEN" \
  -d "To=+14155551212" \
  -d "From=+15017122661" \
  -d "Url=http://demo.twilio.com/docs/voice.xml"
```

### Inbound Call Webhook

When a call arrives at your Twilio number, Twilio sends a webhook with:

```json
{
  "CallSid": "CAxxxxx",
  "AccountSid": "ACxxxxx",
  "From": "+15551234567",
  "To": "+15559876543",
  "CallStatus": "ringing",
  "Direction": "inbound",
  "CallerName": "JOHN DOE"
}
```

## SMS API Endpoints

### Send SMS

```
POST /Accounts/{AccountSid}/Messages.json
```

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| To | Yes | Recipient phone (E.164) |
| From | Yes | Your Twilio number |
| Body | Yes | Message text |
| MediaUrl | No | URL for MMS media |

**Example:**
```bash
curl -X POST "https://api.twilio.com/2010-04-01/Accounts/AC.../Messages.json" \
  -u "ACCOUNT_SID:AUTH_TOKEN" \
  -d "To=+14155551212" \
  -d "From=+15017122661" \
  -d "Body=Hello from n8n!"
```

## TwiML - Call Control

TwiML controls call flow. Return from your webhook URL:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">Hello! How can I help you?</Say>
    <Pause length="1"/>
    <Play>https://example.com/audio.mp3</Play>
    <Gather input="speech" timeout="5">
        <Say>Please tell me what you need.</Say>
    </Gather>
</Response>
```

### Key TwiML Verbs

| Verb | Purpose |
|------|---------|
| `<Say>` | Text-to-speech |
| `<Play>` | Play audio file |
| `<Gather>` | Collect DTMF/speech input |
| `<Dial>` | Connect to another party |
| `<Record>` | Record audio |
| `<Pause>` | Add silence |
| `<Stream>` | Stream audio to external service |

## Client Initiation Data (Custom Parameters)

### Passing Context to Webhooks

When making outbound calls, pass custom parameters:

```bash
curl -X POST ".../Calls.json" \
  -d "Url=https://your-n8n.com/webhook/call-handler" \
  -d "customer_id=12345" \
  -d "customer_tier=premium" \
  -d "previous_calls=3"
```

These appear in the webhook as form parameters.

### Passing Context via SIP Headers

```
sip:agent@domain?User-to-User=12345%3Bencoding%3Dhex&X-Customer-Id=12345
```

### Accessing in TwiML Webhook (n8n)

In your n8n Webhook node, access via:
```javascript
// Webhook body contains all Twilio parameters
const customerId = $json.body.customer_id;
const callerPhone = $json.body.From;
const callSid = $json.body.CallSid;
```

## Conversational Intelligence

For call transcription and analysis:

```bash
POST /Accounts/{AccountSid}/Calls/{CallSid}/Transcriptions.json
```

## n8n Native Nodes

| Node | Type | Purpose |
|------|------|---------|
| `n8n-nodes-base.twilio` | Action | Send SMS, make calls |
| `n8n-nodes-base.twilioTrigger` | Trigger | Receive webhooks |

## Webhook Security

Validate webhook signatures:
```javascript
// Use X-Twilio-Signature header
const valid = twilio.validateRequest(
  authToken,
  signature,
  webhookUrl,
  params
);
```

---

*Retrieved via Context7 + ref-tools research*
