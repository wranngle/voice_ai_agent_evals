#!/usr/bin/env bash
# gh-issue.sh — turn a one-line description into a fully-filled issue via llm.sh.
# Usage:
#   gh-issue.sh "voice agent fails on long input"            # opens form picker
#   gh-issue.sh -t bug "voice agent fails on long input"     # bug form
#   gh-issue.sh -t feat -a cli "ship --json flag"            # feat form, area=cli
#   gh-issue.sh -t research -a infra "evaluate fly.io vs railway"
# Env: GH_ISSUE_DEFAULT_TYPE (default: bug), LLM_SH (auto-discovered).
set -uo pipefail

formType=${GH_ISSUE_DEFAULT_TYPE:-bug}
explicitArea=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -t|--type) formType=$2; shift 2;;
    -a|--area) explicitArea=$2; shift 2;;
    -h|--help) sed -n '2,9p' "$0"; exit 0;;
    *) break;;
  esac
done
description=${*:-}
[[ -z $description ]] && { echo "gh-issue: need a one-line description" >&2; exit 2; }

case "$formType" in
  bug|feat|research) :;;
  *) echo "gh-issue: -t must be bug|feat|research (got: $formType)" >&2; exit 2;;
esac

LLM_SH=${LLM_SH:-$(command -v llm.sh || echo "$HOME/.dotfiles/scripts/bin/llm.sh")}
[[ -x $LLM_SH ]] || { echo "gh-issue: llm.sh not executable at $LLM_SH" >&2; exit 2; }
command -v gh >/dev/null || { echo "gh-issue: gh CLI not found" >&2; exit 2; }

repoSlug=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null) || {
  echo "gh-issue: not in a GitHub repo" >&2; exit 2;
}

systemPrompt="You are completing a GitHub issue body. Output strictly raw markdown that matches the headings the form expects: '### What & how to reproduce', '### Area', '### Environment', '### Logs / traceback' for a bug; '### Problem & Why now', '### Proposed approach', '### Area', '### Alternatives considered' for a feat; '### Question / hypothesis', '### Deliverable', '### Timebox', '### Area' for a research. Each heading is followed by a blank line and the value. The Area value MUST be one of: core | cli | api | docs | ci | infra | other. No fences, no commentary."

userPrompt=$(printf 'Form: %s\nDescription: %s\nRepo: %s%s\n' \
  "$formType" "$description" "$repoSlug" \
  "${explicitArea:+$'\n'Area constraint: use $explicitArea}")

body=$(LLM_SYSTEM="$systemPrompt" "$LLM_SH" <<<"$userPrompt" 2>/dev/null) || {
  echo "gh-issue: llm.sh failed; falling back to skeleton body" >&2
  body=$(printf '### What & how to reproduce\n\n%s\n\n### Area\n\n%s\n' \
    "$description" "${explicitArea:-other}")
}

case "$formType" in
  bug)      title="bug: $description"     ;;
  feat)     title="feat: $description"    ;;
  research) title="research: $description";;
esac

gh issue create --repo "$repoSlug" --title "$title" --body "$body" \
  --label "t.$formType" --label triage
