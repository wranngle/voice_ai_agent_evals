#!/bin/bash
# Quick validation tests for client-initiation-data webhook
# Usage: ./tests/quick-test.sh

WEBHOOK_URL="${N8N_WEBHOOK_URL:-https://your-n8n-host.example.com/webhook/client-initiation-data}"
AGENT_ID="agent_xxxx_demo"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

passed=0
failed=0

test_case() {
  local name="$1"
  local expected_status="$2"
  local payload="$3"

  echo -n "Testing: $name... "

  start=$(date +%s%3N)
  response=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "$payload")
  end=$(date +%s%3N)

  status=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')
  latency=$((end - start))

  if [ "$status" == "$expected_status" ]; then
    echo -e "${GREEN}PASS${NC} (${latency}ms)"
    ((passed++))
    return 0
  else
    echo -e "${RED}FAIL${NC} - Expected $expected_status, got $status"
    echo "  Response: $body"
    ((failed++))
    return 1
  fi
}

echo "========================================"
echo "Client Initiation Webhook Test Suite"
echo "========================================"
echo "Webhook: $WEBHOOK_URL"
echo ""

# Test 1: Valid request
test_case "Valid request with correct agent_id" "200" \
  "{\"caller_id\":\"+15551234567\",\"agent_id\":\"$AGENT_ID\"}"

# Test 2: Invalid agent_id
test_case "Invalid agent_id returns 400" "400" \
  "{\"caller_id\":\"+15551234567\",\"agent_id\":\"invalid_agent\"}"

# Test 3: Empty agent_id
test_case "Empty agent_id returns 400" "400" \
  "{\"caller_id\":\"+15551234567\",\"agent_id\":\"\"}"

# Test 4: Missing caller_id (should still work)
test_case "Missing caller_id returns 200" "200" \
  "{\"caller_id\":\"\",\"agent_id\":\"$AGENT_ID\"}"

# Test 5: Full payload
test_case "Full payload with all fields" "200" \
  "{\"caller_id\":\"+15559876543\",\"agent_id\":\"$AGENT_ID\",\"called_number\":\"+15550100\",\"call_sid\":\"TEST123\"}"

echo ""
echo "========================================"
echo "Response Structure Validation"
echo "========================================"

echo -n "Checking response format... "
response=$(curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "{\"caller_id\":\"+15551234567\",\"agent_id\":\"$AGENT_ID\"}")

# Check for required fields
if echo "$response" | grep -q '"type":"conversation_initiation_client_data"'; then
  echo -e "${GREEN}type field OK${NC}"
  ((passed++))
else
  echo -e "${RED}type field MISSING${NC}"
  ((failed++))
fi

if echo "$response" | grep -q '"dynamic_variables"'; then
  echo -e "${GREEN}dynamic_variables OK${NC}"
  ((passed++))
else
  echo -e "${RED}dynamic_variables MISSING${NC}"
  ((failed++))
fi

if echo "$response" | grep -q '"customer_name"'; then
  echo -e "${GREEN}customer_name OK${NC}"
  ((passed++))
else
  echo -e "${RED}customer_name MISSING${NC}"
  ((failed++))
fi

if echo "$response" | grep -q '"account_tier"'; then
  echo -e "${GREEN}account_tier OK${NC}"
  ((passed++))
else
  echo -e "${RED}account_tier MISSING${NC}"
  ((failed++))
fi

echo ""
echo "========================================"
echo "Performance Check"
echo "========================================"

echo -n "Latency test (3 requests)... "
total=0
for i in 1 2 3; do
  start=$(date +%s%3N)
  curl -s -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "{\"caller_id\":\"+15551234567\",\"agent_id\":\"$AGENT_ID\"}" > /dev/null
  end=$(date +%s%3N)
  latency=$((end - start))
  total=$((total + latency))
done
avg=$((total / 3))

if [ $avg -lt 500 ]; then
  echo -e "${GREEN}PASS${NC} (avg: ${avg}ms)"
  ((passed++))
else
  echo -e "${YELLOW}WARN${NC} (avg: ${avg}ms > 500ms target)"
  ((failed++))
fi

echo ""
echo "========================================"
echo -e "Results: ${GREEN}$passed passed${NC}, ${RED}$failed failed${NC}"
echo "========================================"

exit $failed
