#!/usr/bin/env bash
# repo-automation.sh - primitive local observer for dotfiles-managed repos.
set -euo pipefail

POLICY_PATH=${REPO_AUTOMATION_POLICY:-.automation/policy.json}

usage(){
  cat <<'USAGE'
Usage: repo-automation.sh <command>

Commands:
  policy   Print the effective automation policy.
  observe  Print local Git/autosync state as JSON.
  doctor   Print actionable automation gaps as JSON.
USAGE
}

need_jq(){ command -v jq >/dev/null || { echo "repo-automation: jq is required" >&2; exit 2; }; }
in_git_repo(){ git rev-parse --show-toplevel >/dev/null 2>&1; }

policy_json(){
  need_jq
  if [[ -f "$POLICY_PATH" ]]; then
    jq -c . "$POLICY_PATH"
  else
    jq -nc '{
      version: 0,
      mode: "unmanaged",
      source: "default",
      integration: { default: "snapshot-only", quiet_seconds: 120 },
      checks: { required: [] }
    }'
  fi
}

policy_value(){
  need_jq
  local expr=$1
  if [[ -f "$POLICY_PATH" ]]; then
    jq -r "$expr // empty" "$POLICY_PATH" 2>/dev/null || true
  fi
}

policy_array_csv(){
  need_jq
  local expr=$1
  if [[ -f "$POLICY_PATH" ]]; then
    jq -r "$expr // [] | if type == \"array\" then join(\",\") else . end" "$POLICY_PATH" 2>/dev/null || true
  fi
}

derive_autosync_mode(){
  local raw
  raw=$(policy_value '.autosync.mode')
  [[ -z "$raw" ]] && raw=$(policy_value '.integration.default')
  raw=$(printf '%s' "${raw:-snapshot-only}" | tr '[:upper:]_' '[:lower:]-')
  case "$raw" in
    integrate|integration|integrate-when-green|when-green|automerge|auto-merge) echo integrate;;
    paused|pause|off|disabled|disable|skip) echo paused;;
    *) echo snapshot-only;;
  esac
}

git_json_array_from_lines(){
  if [[ -t 0 ]]; then
    jq -n '[]'
  else
    jq -R 'select(length > 0)' | jq -s .
  fi
}

git_dirty_files_json(){
  git status --porcelain=v1 --untracked-files=all 2>/dev/null \
    | sed -E 's/^...//' \
    | git_json_array_from_lines
}

git_branch_name(){
  git symbolic-ref --short HEAD 2>/dev/null || echo detached
}

git_default_branch(){
  local branch
  branch=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')
  [[ -n "$branch" ]] && { echo "$branch"; return; }
  echo main
}

git_upstream(){
  git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true
}

git_ahead_behind_json(){
  local upstream ahead=0 behind=0
  upstream=$(git_upstream)
  if [[ -n "$upstream" ]]; then
    ahead=$(git rev-list --count "$upstream..HEAD" 2>/dev/null || echo 0)
    behind=$(git rev-list --count "HEAD..$upstream" 2>/dev/null || echo 0)
  fi
  jq -nc --arg upstream "$upstream" --argjson ahead "$ahead" --argjson behind "$behind" \
    '{upstream:$upstream,ahead:$ahead,behind:$behind}'
}

observe(){
  need_jq
  if ! in_git_repo; then
    jq -nc --arg policy_source "$POLICY_PATH" '{ok:false,error:"not a git repo",policy_source:$policy_source}'
    return 1
  fi
  local root branch default_branch origin mode quiet integrate_branches skip_branches files_json ab_json
  root=$(git rev-parse --show-toplevel)
  branch=$(git_branch_name)
  default_branch=$(git_default_branch)
  origin=$(git remote get-url origin 2>/dev/null || true)
  mode=$(derive_autosync_mode)
  quiet=$(policy_value '.integration.quiet_seconds')
  [[ -z "$quiet" ]] && quiet=120
  integrate_branches=$(policy_array_csv '.integration.integrate_branches')
  skip_branches=$(policy_array_csv '.integration.skip_branches')
  files_json=$(git_dirty_files_json)
  ab_json=$(git_ahead_behind_json)

  jq -nc \
    --arg root "$root" \
    --arg branch "$branch" \
    --arg default_branch "$default_branch" \
    --arg origin "$origin" \
    --arg policy "$POLICY_PATH" \
    --arg mode "$mode" \
    --argjson quiet "$quiet" \
    --arg integrate_branches "$integrate_branches" \
    --arg skip_branches "$skip_branches" \
    --argjson dirty_files "$files_json" \
    --argjson ab "$ab_json" \
    '{
      ok:true,
      repo_root:$root,
      branch:$branch,
      default_branch:$default_branch,
      origin:$origin,
      policy_source:$policy,
      autosync:{mode:$mode,quiet_seconds:$quiet,integrate_branches:$integrate_branches,skip_branches:$skip_branches},
      git:{upstream:$ab.upstream,ahead:$ab.ahead,behind:$ab.behind,dirty_count:($dirty_files|length),dirty_files:$dirty_files}
    }'
}

doctor(){
  need_jq
  local findings=()
  if ! in_git_repo; then
    findings+=("not a git repo")
  else
    [[ -f "$POLICY_PATH" ]] || findings+=("missing .automation/policy.json; rerun dotfiles bootstrap")
    git remote get-url origin >/dev/null 2>&1 || findings+=("missing origin remote; autosync can only commit locally")
    [[ -z "$(git status --porcelain=v1 2>/dev/null)" ]] || findings+=("dirty working tree; autosync will checkpoint, integration waits for quiet_seconds")
    local ab ahead behind
    ab=$(git_ahead_behind_json)
    ahead=$(jq -r '.ahead' <<<"$ab")
    behind=$(jq -r '.behind' <<<"$ab")
    if (( ahead > 0 && behind > 0 )); then
      findings+=("branch diverged from upstream; semantic reconcile required before integration")
    fi
    command -v gh >/dev/null || findings+=("gh CLI missing; GitHub PR integration unavailable")
    command -v llm.sh >/dev/null || [[ -x "$HOME/.dotfiles/scripts/bin/llm.sh" ]] || findings+=("llm.sh missing; commit messages will use fallback")
    [[ -f .autosync/pause || -f .autosync/paused ]] && findings+=("autosync pause marker present")
  fi

  local findings_json
  findings_json=$(printf '%s\n' "${findings[@]:-}" | jq -R 'select(length > 0)' | jq -s .)
  jq -nc --argjson findings "$findings_json" '{ok:($findings|length == 0),findings:$findings}'
}

cmd=${1:-observe}
case "$cmd" in
  policy) policy_json | jq .;;
  observe) observe;;
  doctor) doctor;;
  -h|--help|help) usage;;
  *) usage >&2; exit 2;;
esac
