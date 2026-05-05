#!/usr/bin/env bash
# github-hygiene.sh - audit and converge wranngle-owned GitHub repos.
set -euo pipefail

export PATH="/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin:$HOME/.dotfiles/scripts/bin:$PATH"

readonly GITHUB_HYGIENE_VERSION=0.1.0
readonly SERVICE_NAME=github-hygiene
COMMAND=${1:-full}
RUN_STAMP=${GITHUB_HYGIENE_RUN_STAMP:-$(date -u +%Y%m%d%H%M%S)}
RUN_ID=${GITHUB_HYGIENE_RUN_ID:-$(uuidgen 2>/dev/null || printf '%s-%s' "$(date +%s%N)" "$RANDOM")}
STATE_DIR=${GITHUB_HYGIENE_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/github-hygiene}
REPORT_DIR=${GITHUB_HYGIENE_REPORT_DIR:-$STATE_DIR/reports/$RUN_STAMP}
WORK_DIR=${GITHUB_HYGIENE_WORK_DIR:-$STATE_DIR/work/$RUN_STAMP}
LOG_FILE=${GITHUB_HYGIENE_LOG_FILE:-$REPORT_DIR/events.jsonl}
OPS_FILE=$REPORT_DIR/operations.jsonl
SUMMARY_FILE=$REPORT_DIR/summary.json
INVENTORY_FILE=$REPORT_DIR/inventory.json
DOTFILES_BOOTSTRAP=${GITHUB_HYGIENE_DOTFILES_BOOTSTRAP:-$HOME/.dotfiles/.dotfiles.sh}
OWNER=${GITHUB_HYGIENE_OWNER:-}
LIMIT=${GITHUB_HYGIENE_LIMIT:-1000}
INCLUDE_ARCHIVED=${GITHUB_HYGIENE_INCLUDE_ARCHIVED:-0}
BOOTSTRAP_FORKS=${GITHUB_HYGIENE_BOOTSTRAP_FORKS:-0}
PUSH_MODE=${GITHUB_HYGIENE_PUSH_MODE:-direct}
APPLY_REMOTE=${GITHUB_HYGIENE_APPLY_REMOTE:-}
BOOTSTRAP_REPOS=${GITHUB_HYGIENE_BOOTSTRAP_REPOS:-}
REPO_FILTER=${GITHUB_HYGIENE_REPOS:-}
EVENT_SEQUENCE=0

mkdir -p "$REPORT_DIR" "$WORK_DIR"
: > "$OPS_FILE"

usage(){
  cat <<'USAGE'
Usage: github-hygiene.sh [inventory|audit|apply|bootstrap|full]

Commands:
  inventory   List visible repos into the report directory.
  audit       Inventory plus read-only GitHub settings evidence.
  apply       Audit and apply mechanical GitHub security/settings hardening.
  bootstrap   Clone active owned repos, run dotfiles security-only bootstrap, scan, commit, push.
  full        Apply remote settings and bootstrap active owned repos.

Key env:
  GITHUB_HYGIENE_OWNER=wranngle
  GITHUB_HYGIENE_REPORT_DIR=/path/to/report
  GITHUB_HYGIENE_REPOS=owner/repo,repo-name
  GITHUB_HYGIENE_PUSH_MODE=direct|branch|none
  GITHUB_HYGIENE_INCLUDE_ARCHIVED=1
  GITHUB_HYGIENE_BOOTSTRAP_FORKS=1
USAGE
}

emit_event(){ local level=$1 action=$2 outcome=$3 repo=${4:-} detail=${5:-} error=${6:-} ts json
  EVENT_SEQUENCE=$((EVENT_SEQUENCE+1))
  ts=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
  json=$(jq -nc \
    --arg ts "$ts" --arg lvl "$level" --arg action "$action" --arg outcome "$outcome" \
    --arg svc "$SERVICE_NAME" --arg repo "$repo" --arg detail "$detail" --arg err "$error" \
    --arg trace "$RUN_ID" --arg eid "$RUN_ID-$EVENT_SEQUENCE" \
    '{"@timestamp":$ts,"log.level":$lvl,"event.action":$action,"event.outcome":$outcome,"event.id":$eid,"trace.id":$trace,"service.name":$svc,"labels":{"repo":$repo,"detail":$detail}} + (if $err == "" then {} else {"error.message":$err} end)')
  printf '%s\n' "$json" >&2
  printf '%s\n' "$json" >> "$LOG_FILE"
}

record_operation(){ local repo=$1 task=$2 outcome=$3 detail=${4:-} error=${5:-}
  jq -nc --arg ts "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)" --arg repo "$repo" --arg task "$task" \
    --arg outcome "$outcome" --arg detail "$detail" --arg error "$error" \
    '{ts:$ts,repo:$repo,task:$task,outcome:$outcome,detail:$detail,error:$error}' >> "$OPS_FILE"
  emit_event info "$task" "$outcome" "$repo" "$detail" "$error"
}

require_tool(){ command -v "$1" >/dev/null 2>&1 || { emit_event error prereq failure '' "$1" "missing required tool"; exit 2; }; }
slug_path(){ printf '%s' "$1" | tr '/.' '__'; }
repo_json_bool(){ jq -r "$1 // false" <<<"$2"; }
repo_json_string(){ jq -r "$1 // \"\"" <<<"$2"; }
json_object_or_empty(){ jq -c 'if type == "object" then . else {} end' <<<"${1:-}" 2>/dev/null || printf '{}\n'; }
json_array_or_empty(){ jq -c 'if type == "array" then . else [] end' <<<"${1:-}" 2>/dev/null || printf '[]\n'; }

repo_selected(){ local slug=$1 token
  [[ -z $REPO_FILTER ]]&&return 0
  for token in ${REPO_FILTER//,/ };do
    [[ $slug == "$token" || ${slug#*/} == "$token" ]]&&return 0
  done
  return 1
}

run_op(){ local repo=$1 task=$2 output
  shift 2
  if output=$("$@" 2>&1); then
    record_operation "$repo" "$task" success "$*"
    return 0
  fi
  output=$(printf '%s' "$output" | tr '\n' ' ' | cut -c1-800)
  record_operation "$repo" "$task" failure "$*" "$output"
  return 1
}

run_api_json(){ local repo=$1 task=$2 method=$3 endpoint=$4 body=$5 output
  if output=$(gh api -X "$method" "$endpoint" -H "Accept: application/vnd.github+json" --input - 2>&1 <<<"$body"); then
    record_operation "$repo" "$task" success "$method $endpoint"
    return 0
  fi
  output=$(printf '%s' "$output" | tr '\n' ' ' | cut -c1-800)
  record_operation "$repo" "$task" failure "$method $endpoint" "$output"
  return 1
}

resolve_modes(){
  case "$COMMAND" in
    inventory) APPLY_REMOTE=${APPLY_REMOTE:-0}; BOOTSTRAP_REPOS=${BOOTSTRAP_REPOS:-0};;
    audit) APPLY_REMOTE=${APPLY_REMOTE:-0}; BOOTSTRAP_REPOS=${BOOTSTRAP_REPOS:-0};;
    apply) APPLY_REMOTE=${APPLY_REMOTE:-1}; BOOTSTRAP_REPOS=${BOOTSTRAP_REPOS:-0};;
    bootstrap) APPLY_REMOTE=${APPLY_REMOTE:-0}; BOOTSTRAP_REPOS=${BOOTSTRAP_REPOS:-1};;
    full) APPLY_REMOTE=${APPLY_REMOTE:-1}; BOOTSTRAP_REPOS=${BOOTSTRAP_REPOS:-1};;
    -h|--help|help) usage; exit 0;;
    *) usage >&2; exit 2;;
  esac
}

inventory_repositories(){
  require_tool gh
  require_tool jq
  gh auth status >/dev/null 2>&1 || { emit_event error gh.auth failure '' '' "gh is not authenticated"; exit 2; }
  if [[ -z $OWNER ]]; then
    OWNER=$(gh api user --jq .login)
  fi
  emit_event info inventory.start success '' "owner=$OWNER limit=$LIMIT"
  gh repo list "$OWNER" --limit "$LIMIT" \
    --json nameWithOwner,owner,visibility,isArchived,isFork,isPrivate,defaultBranchRef,pushedAt,updatedAt,url,sshUrl,viewerPermission,viewerCanAdminister \
    > "$INVENTORY_FILE"
  jq -r '.[] | [.nameWithOwner,.visibility,(.isArchived|tostring),(.isFork|tostring),(.defaultBranchRef.name // "")] | @tsv' "$INVENTORY_FILE" \
    > "$REPORT_DIR/inventory.tsv"
  emit_event info inventory.done success '' "repos=$(jq length "$INVENTORY_FILE")"
}

audit_remote_repo(){ local repo_obj=$1 slug repo_dir repo_api actions_api workflow_api rulesets_api prs_api runs_api vuln depfix pvr
  repo_obj=$(json_object_or_empty "$repo_obj")
  slug=$(repo_json_string '.nameWithOwner' "$repo_obj")
  repo_dir="$REPORT_DIR/repos/$(slug_path "$slug")"
  mkdir -p "$repo_dir"
  repo_api=$(json_object_or_empty "$(gh api "repos/$slug" 2>/dev/null || true)")
  actions_api=$(json_object_or_empty "$(gh api "repos/$slug/actions/permissions" 2>/dev/null || true)")
  workflow_api=$(json_object_or_empty "$(gh api "repos/$slug/actions/permissions/workflow" 2>/dev/null || true)")
  rulesets_api=$(json_array_or_empty "$(gh api "repos/$slug/rulesets" 2>/dev/null || true)")
  prs_api=$(json_array_or_empty "$(gh pr list --repo "$slug" --state all --limit 50 \
    --json number,state,title,headRefName,baseRefName,isDraft,updatedAt,mergeStateStatus 2>/dev/null || true)")
  runs_api=$(json_array_or_empty "$(gh run list --repo "$slug" --limit 30 \
    --json databaseId,status,conclusion,workflowName,headBranch,updatedAt,event 2>/dev/null || true)")
  if gh api -X GET "repos/$slug/vulnerability-alerts" >/dev/null 2>&1; then vuln=enabled; else vuln=unavailable_or_disabled; fi
  if gh api -X GET "repos/$slug/automated-security-fixes" >/dev/null 2>&1; then depfix=enabled; else depfix=unavailable_or_disabled; fi
  if gh api -X GET "repos/$slug/private-vulnerability-reporting" >/dev/null 2>&1; then pvr=enabled; else pvr=unavailable_or_disabled; fi
  jq -n \
    --argjson inventory "$repo_obj" --argjson repo "$repo_api" --argjson actions "$actions_api" \
    --argjson workflow "$workflow_api" --argjson rulesets "$rulesets_api" \
    --argjson prs "$prs_api" --argjson runs "$runs_api" \
    --arg vuln "$vuln" --arg depfix "$depfix" --arg pvr "$pvr" \
    '{inventory:$inventory,repo:$repo,actions_permissions:$actions,workflow_permissions:$workflow,rulesets:$rulesets,prs:$prs,runs:$runs,probes:{vulnerability_alerts:$vuln,automated_security_fixes:$depfix,private_vulnerability_reporting:$pvr}}' \
    > "$repo_dir/remote-audit.json"
  record_operation "$slug" remote-audit success "$repo_dir/remote-audit.json"
}

apply_remote_repo(){ local repo_obj=$1 slug archived actions_body workflow_body security_body
  slug=$(repo_json_string '.nameWithOwner' "$repo_obj")
  archived=$(repo_json_bool '.isArchived' "$repo_obj")
  if [[ $archived == true ]]; then
    record_operation "$slug" remote-apply skipped archived
    return 0
  fi
  run_op "$slug" gh.repo-settings gh repo edit "$slug" \
    --enable-wiki=false \
    --enable-issues=true \
    --enable-discussions=true \
    --enable-projects=false \
    --enable-auto-merge \
    --delete-branch-on-merge \
    --allow-update-branch \
    --enable-squash-merge \
    --enable-merge-commit=false \
    --enable-rebase-merge=false \
    --squash-merge-commit-message pr-title-description || true
  run_op "$slug" gh.vulnerability-alerts gh api -X PUT "repos/$slug/vulnerability-alerts" -H "Accept: application/vnd.github+json" || true
  run_op "$slug" gh.dependabot-security-updates gh api -X PUT "repos/$slug/automated-security-fixes" -H "Accept: application/vnd.github+json" || true
  run_op "$slug" gh.private-vulnerability-reporting gh api -X PUT "repos/$slug/private-vulnerability-reporting" -H "Accept: application/vnd.github+json" || true
  workflow_body='{"default_workflow_permissions":"read","can_approve_pull_request_reviews":false}'
  run_api_json "$slug" gh.actions-workflow-permissions PUT "repos/$slug/actions/permissions/workflow" "$workflow_body" || true
  actions_body='{"enabled":true,"allowed_actions":"all","sha_pinning_required":true}'
  run_api_json "$slug" gh.actions-permissions PUT "repos/$slug/actions/permissions" "$actions_body" || true
  security_body='{"security_and_analysis":{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"},"dependabot_security_updates":{"status":"enabled"}}}'
  run_api_json "$slug" gh.secret-scanning PATCH "repos/$slug" "$security_body" || true
}

clone_repo(){ local slug=$1 default_branch=$2 target_dir=$3
  mkdir -p "$(dirname "$target_dir")"
  run_op "$slug" clone gh repo clone "$slug" "$target_dir" -- --depth=1 || return 1
  if [[ -n $default_branch ]]; then
    git -C "$target_dir" switch "$default_branch" >/dev/null 2>&1 || true
  fi
}

scan_local_repo(){ local slug=$1 repo_dir=$2 report_dir=$3 status=success output
  mkdir -p "$report_dir"
  find "$repo_dir" \
    \( -path "$repo_dir/.git" -o -path "$repo_dir/node_modules" -o -path "$repo_dir/.venv" -o -path "$repo_dir/venv" -o -path "$repo_dir/old" \) -prune -o \
    \( -name '.env' -o -name '.env.*' -o -name '*.pem' -o -name '*.key' -o -name '*id_rsa*' -o -name '*Zone.Identifier*' \) -print \
    > "$report_dir/sensitive-path-candidates.txt" 2>/dev/null || true
  if command -v gitleaks >/dev/null 2>&1; then
    if output=$(cd "$repo_dir" && gitleaks git --redact --no-banner --report-format json --report-path "$report_dir/gitleaks.json" 2>&1); then
      record_operation "$slug" gitleaks.detect success "$report_dir/gitleaks.json"
    else
      status=failure
      output=$(printf '%s' "$output" | tr '\n' ' ' | cut -c1-800)
      record_operation "$slug" gitleaks.detect failure "$report_dir/gitleaks.json" "$output"
    fi
  else
    record_operation "$slug" gitleaks.detect skipped "gitleaks not on PATH"
  fi
  if find "$repo_dir" -name '*.sh' -not -path '*/.git/*' -print -quit | grep -q .; then
    if output=$(find "$repo_dir" -name '*.sh' -not -path '*/.git/*' -print0 | xargs -0 -r bash -n 2>&1); then
      record_operation "$slug" bash-n success shell-scripts
    else
      status=failure
      output=$(printf '%s' "$output" | tr '\n' ' ' | cut -c1-800)
      record_operation "$slug" bash-n failure shell-scripts "$output"
    fi
  fi
  [[ $status == success ]]
}

commit_and_push_changes(){ local slug=$1 repo_dir=$2 default_branch=$3 changed branch pr_url output
  changed=$(git -C "$repo_dir" status --porcelain=v1 --untracked-files=all)
  if [[ -z $changed ]]; then
    record_operation "$slug" git.commit skipped "no changes"
    return 0
  fi
  git -C "$repo_dir" add -A
  if command -v gitleaks >/dev/null 2>&1; then
    if ! output=$(cd "$repo_dir" && gitleaks git --staged --redact --no-banner 2>&1); then
      output=$(printf '%s' "$output" | tr '\n' ' ' | cut -c1-800)
      record_operation "$slug" gitleaks.protect failure staged "$output"
      return 1
    fi
    record_operation "$slug" gitleaks.protect success staged
  fi
  git -C "$repo_dir" config user.name "${GITHUB_HYGIENE_GIT_USER_NAME:-wranngle automation}"
  git -C "$repo_dir" config user.email "${GITHUB_HYGIENE_GIT_USER_EMAIL:-162844475+wranngle@users.noreply.github.com}"
  if ! output=$(git -C "$repo_dir" commit -m "chore: apply security hygiene baseline" 2>&1); then
    output=$(printf '%s' "$output" | tr '\n' ' ' | cut -c1-800)
    record_operation "$slug" git.commit failure baseline "$output"
    return 1
  fi
  record_operation "$slug" git.commit success baseline
  case "$PUSH_MODE" in
    none)
      record_operation "$slug" git.push skipped "GITHUB_HYGIENE_PUSH_MODE=none"
      ;;
    direct)
      if output=$(git -C "$repo_dir" push origin "HEAD:$default_branch" 2>&1); then
        record_operation "$slug" git.push success "direct:$default_branch"
      else
        output=$(printf '%s' "$output" | tr '\n' ' ' | cut -c1-800)
        record_operation "$slug" git.push failure "direct:$default_branch" "$output"
        branch="automation/security-hygiene-$RUN_STAMP"
        push_branch_and_pr "$slug" "$repo_dir" "$branch" "$default_branch"
      fi
      ;;
    branch)
      branch="automation/security-hygiene-$RUN_STAMP"
      push_branch_and_pr "$slug" "$repo_dir" "$branch" "$default_branch"
      ;;
    *)
      record_operation "$slug" git.push failure "$PUSH_MODE" "unknown push mode"
      return 1
      ;;
  esac
}

push_branch_and_pr(){ local slug=$1 repo_dir=$2 branch=$3 default_branch=$4 output pr_url
  git -C "$repo_dir" branch -f "$branch" HEAD >/dev/null 2>&1 || true
  if output=$(git -C "$repo_dir" push -u origin "$branch" 2>&1); then
    record_operation "$slug" git.push-branch success "$branch"
  else
    output=$(printf '%s' "$output" | tr '\n' ' ' | cut -c1-800)
    record_operation "$slug" git.push-branch failure "$branch" "$output"
    return 1
  fi
  if pr_url=$(gh pr create --repo "$slug" --base "$default_branch" --head "$branch" \
    --title "chore: apply security hygiene baseline" \
    --body "Automated dotfiles security-hygiene rollout. Applies pinned security workflows, Dependabot, gitleaks, repository policy, and GitHub settings hydration." 2>&1); then
    record_operation "$slug" gh.pr-create success "$pr_url"
    gh pr merge --repo "$slug" "$pr_url" --auto --squash --delete-branch >/dev/null 2>&1 \
      && record_operation "$slug" gh.pr-automerge success "$pr_url" \
      || record_operation "$slug" gh.pr-automerge skipped "$pr_url" "auto-merge unavailable"
  else
    pr_url=$(printf '%s' "$pr_url" | tr '\n' ' ' | cut -c1-800)
    record_operation "$slug" gh.pr-create failure "$branch" "$pr_url"
  fi
}

bootstrap_local_repo(){ local repo_obj=$1 slug archived fork default_branch repo_dir repo_report
  slug=$(repo_json_string '.nameWithOwner' "$repo_obj")
  archived=$(repo_json_bool '.isArchived' "$repo_obj")
  fork=$(repo_json_bool '.isFork' "$repo_obj")
  default_branch=$(repo_json_string '.defaultBranchRef.name' "$repo_obj")
  [[ -z $default_branch ]] && default_branch=main
  if [[ $archived == true && $INCLUDE_ARCHIVED != 1 ]]; then
    record_operation "$slug" bootstrap skipped archived
    return 0
  fi
  if [[ $fork == true && $BOOTSTRAP_FORKS != 1 ]]; then
    record_operation "$slug" bootstrap skipped fork
    return 0
  fi
  if [[ ! -x $DOTFILES_BOOTSTRAP ]]; then
    record_operation "$slug" bootstrap failure "$DOTFILES_BOOTSTRAP" "dotfiles bootstrap is not executable"
    return 1
  fi
  repo_dir="$WORK_DIR/$(slug_path "$slug")"
  repo_report="$REPORT_DIR/repos/$(slug_path "$slug")"
  clone_repo "$slug" "$default_branch" "$repo_dir" || return 1
  emit_event info bootstrap.run success "$slug" "$repo_dir"
  if (cd "$repo_dir" && DOTFILES_SECURITY_ONLY=1 DOTFILES_SKIP_LLM=1 DOTFILES_SKIP_GH_HYDRATE=1 DOTFILES_FORCE=1 \
    DOTFILES_LOG_FILE="$repo_report/dotfiles-bootstrap.jsonl" REPO_ROOT="$repo_dir" \
    "$DOTFILES_BOOTSTRAP" >/dev/null); then
    record_operation "$slug" dotfiles.security-only success "$repo_dir"
  else
    record_operation "$slug" dotfiles.security-only failure "$repo_dir" "bootstrap exited nonzero"
  fi
  scan_local_repo "$slug" "$repo_dir" "$repo_report" || true
  commit_and_push_changes "$slug" "$repo_dir" "$default_branch" || true
  if (cd "$repo_dir" && DOTFILES_SECURITY_ONLY=1 DOTFILES_SKIP_LLM=1 DOTFILES_FORCE=1 \
    DOTFILES_LOG_FILE="$repo_report/dotfiles-hydrate.jsonl" REPO_ROOT="$repo_dir" \
    "$DOTFILES_BOOTSTRAP" >/dev/null); then
    record_operation "$slug" dotfiles.hydrate success "$repo_dir"
  else
    record_operation "$slug" dotfiles.hydrate failure "$repo_dir" "hydrate exited nonzero"
  fi
}

write_summary(){
  jq -n \
    --arg version "$GITHUB_HYGIENE_VERSION" --arg run_id "$RUN_ID" --arg run_stamp "$RUN_STAMP" \
    --arg owner "$OWNER" --arg command "$COMMAND" --arg report_dir "$REPORT_DIR" \
    --slurpfile inventory "$INVENTORY_FILE" --slurpfile ops "$OPS_FILE" \
    '{
      version:$version,
      run_id:$run_id,
      run_stamp:$run_stamp,
      owner:$owner,
      command:$command,
      report_dir:$report_dir,
      repo_count:($inventory[0] | length),
      repos:{
        archived:($inventory[0] | map(select(.isArchived == true)) | length),
        forks:($inventory[0] | map(select(.isFork == true)) | length),
        active_owned_sources:($inventory[0] | map(select(.isArchived == false and .isFork == false)) | length)
      },
      operations:{
        total:($ops | length),
        success:($ops | map(select(.outcome == "success")) | length),
        failure:($ops | map(select(.outcome == "failure")) | length),
        skipped:($ops | map(select(.outcome == "skipped")) | length)
      },
      failures:($ops | map(select(.outcome == "failure"))),
      skipped:($ops | map(select(.outcome == "skipped")))
    }' > "$SUMMARY_FILE"
  emit_event info summary.done success '' "$SUMMARY_FILE"
}

main(){
  resolve_modes
  inventory_repositories
  if [[ $COMMAND != inventory ]]; then
    while IFS= read -r repo_obj; do
      if ! repo_selected "$(repo_json_string '.nameWithOwner' "$repo_obj")";then
        continue
      fi
      audit_remote_repo "$repo_obj"
      if [[ $APPLY_REMOTE == 1 ]]; then
        apply_remote_repo "$repo_obj"
      fi
      if [[ $BOOTSTRAP_REPOS == 1 ]]; then
        bootstrap_local_repo "$repo_obj"
      fi
    done < <(jq -c '.[]' "$INVENTORY_FILE")
  fi
  write_summary
  jq . "$SUMMARY_FILE"
}

main "$@"
