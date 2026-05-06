#!/usr/bin/env bash
set -euo pipefail

REPO="/home/wranngle/projects/voice_ai_agent_evals"
PROMPT="$REPO/prompts/cynical-eval-utility-maintainer.md"
LOG_DIR="$REPO/logs/cynical-eval-utility-maintainer"
LOCK="/tmp/voice-ai-agent-evals-cynical-maintainer.lock"
export PATH="/home/wranngle/.nvm/versions/node/v24.15.0/bin:/home/wranngle/.bun/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"
CODEX="${CODEX_BIN:-/home/wranngle/.nvm/versions/node/v24.15.0/bin/codex}"
RUN_TIMEOUT="${MAINTAINER_TIMEOUT:-8m}"

mkdir -p "$LOG_DIR"

ts="$(date -u +%Y%m%dT%H%M%SZ)"
log="$LOG_DIR/run-$ts.log"
last="$LOG_DIR/last-message-$ts.md"
latest="$LOG_DIR/latest.log"
ln -sfn "$log" "$latest"

{
  echo "=== cynical eval utility maintainer ==="
  echo "started_at_utc=$ts"
  echo "repo=$REPO"
  echo "codex=$CODEX"
  echo "timeout=$RUN_TIMEOUT"
  echo

  if [[ ! -x "$CODEX" ]]; then
    echo "ERROR: codex binary not executable: $CODEX"
    exit 127
  fi
  if [[ ! -f "$PROMPT" ]]; then
    echo "ERROR: prompt missing: $PROMPT"
    exit 127
  fi

  flock -n 9 || {
    echo "SKIP: previous maintainer pass is still running"
    exit 0
  }

  cd "$REPO"
  echo "--- git status before ---"
  git status -sb
  echo

  set +e
  timeout --kill-after=30s "$RUN_TIMEOUT" \
    "$CODEX" exec \
      --cd "$REPO" \
      --sandbox workspace-write \
      -c 'approval_policy="never"' \
      --output-last-message "$last" \
      - < "$PROMPT"
  codex_status=$?
  set -e
  if [[ "$codex_status" -eq 124 ]]; then
    echo
    echo "WARN: maintainer pass timed out after $RUN_TIMEOUT"
  elif [[ "$codex_status" -ne 0 ]]; then
    echo
    echo "WARN: codex exited with status $codex_status"
  fi

  echo
  echo "--- git status after ---"
  git status -sb
  echo
  echo "last_message=$last"
  exit "$codex_status"
} 9>"$LOCK" >"$log" 2>&1

ln -sfn "$log" "$latest"
