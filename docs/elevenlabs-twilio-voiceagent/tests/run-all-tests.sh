#!/bin/bash
# Run all tests for: elevenlabs-twilio-voiceagent
# Generated: 2025-12-26

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo " Running Integration Tests"
echo " Workflow: elevenlabs-twilio-voiceagent"
echo "=========================================="
echo ""

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

run_test() {
  local test_script="$1"
  local test_name=$(basename "$test_script" .sh)
  local integration=$(dirname "$test_script" | xargs basename)

  echo "--- $integration / $test_name ---"

  # Capture output and exit code
  set +e
  OUTPUT=$(bash "$test_script" 2>&1)
  exit_code=$?
  set -e

  echo "$OUTPUT"

  # Check if output contains SKIP marker
  if echo "$OUTPUT" | grep -q "^SKIP:"; then
    ((SKIP_COUNT++)) || true
  elif [ $exit_code -eq 0 ]; then
    ((PASS_COUNT++)) || true
  else
    ((FAIL_COUNT++)) || true
  fi
  echo ""
}

# Run ElevenLabs tests
if [ -d "elevenlabs" ]; then
  for test_script in elevenlabs/*.sh; do
    if [ -f "$test_script" ]; then
      run_test "$test_script"
    fi
  done
fi

# Run Twilio tests
if [ -d "twilio" ]; then
  for test_script in twilio/*.sh; do
    if [ -f "$test_script" ]; then
      run_test "$test_script"
    fi
  done
fi

echo "=========================================="
echo " Results: $PASS_COUNT passed, $FAIL_COUNT failed, $SKIP_COUNT skipped"
echo "=========================================="

if [ $FAIL_COUNT -gt 0 ]; then
  echo " Some tests failed. Fix issues before building workflow."
  exit 1
else
  echo " All tests passed. Ready for workflow assembly."
  exit 0
fi
