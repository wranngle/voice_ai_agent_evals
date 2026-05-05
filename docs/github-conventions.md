# GitHub conventions

How issues, labels, and PRs are structured across every repo this dotfiles bootstrap touches. Designed for a solo + AI-agent workflow: machine-parseable, zero manual labeling, no rot.

## Issue titles — conventional commits

```
<type>(<scope>): <imperative summary>
```

- `<type>` ∈ `feat | fix | bug | chore | docs | refactor | research | security | perf`
- `<scope>` is optional; lowercase area name (`hooks`, `mcp`, `n8n`)
- Summary ≤ 72 chars, imperative ("add label sync", not "adds" / "added")

The same shape autosync uses, the same shape AI tools generate naturally. No `[AREA]` brackets — the scope already names the area, and the `a/<area>` label encodes it for filters.

## Label taxonomy — *static facets only*

Labels are for static facets (type and area) plus explicit automation command labels such as `automerge`. Things that flow (status, priority, effort, sprint) live in **Projects v2**, not labels — they don't rot there.

| Family | Members | Cardinality |
|---|---|---|
| `t.*` (type) | `t.bug` `t.feat` `t.chore` `t.docs` `t.refactor` `t.research` `t.security` `t.perf` | exactly 1 per issue |
| `a/<area>` (area) | repo-defined; canonical seeded set: `a/core` `a/cli` `a/api` `a/docs` `a/ci` `a/infra` `a/other` | 0–N |
| `triage` | applied automatically on issue open | removed when triaged |
| `blocked` | applied when work cannot proceed | reason in latest comment |
| `automerge` | PR command label | arms auto-merge once checks pass |

Every dotfiles-bootstrapped repo gets the canonical set seeded by `seedCanonicalGithubLabels` in `.dotfiles.sh` — idempotent, runs every bootstrap.

## Issue forms

Three forms, deterministic templates (no LLM in the bootstrap path), shipped to every repo:

- `bug_report.yml` → title prefix `bug: `, labels `t.bug + triage`
- `feature_request.yml` → title prefix `feat: `, labels `t.feat + triage`
- `research.yml` → title prefix `research: `, labels `t.research + triage`

Each form has a required **Area** dropdown. The `issue-triage` workflow reads the dropdown and applies `a/<area>` automatically — you never label by hand.

## Auto-fill via AI: `gh-issue.sh`

```bash
gh-issue.sh "voice agent fails on inputs > 8s"
gh-issue.sh -t feat -a cli "ship --json flag"
gh-issue.sh -t research -a infra "evaluate fly.io vs railway"
```

Wraps `llm.sh` to generate the form body from a one-liner, then `gh issue create`s with the right title prefix and labels.

## Issue → PR linkage

PRs MUST reference an issue with `Closes #N` / `Fixes #N` in the body. The PR template enforces this. On merge, the issue auto-closes and (if Projects v2 is wired up) status flips to Done.

If a PR has no linked issue, file one first — even a one-line research issue. The audit trail is the point.

## What lives in Projects v2 (not labels)

A single user-level **Triage** Projects v2 board (one per gh user, owned by you, named via `DOTFILES_TRIAGE_PROJECT_TITLE` env, default `Triage`). All issues from every dotfiles-bootstrapped repo route here. Cross-repo visibility is the entire point.

| Field | Source | Values |
|---|---|---|
| **Status** | Projects v2 default | Todo · In Progress · Done (rename in the UI as you wish) |
| **Priority** | seeded by bootstrap | P0 · P1 · P2 · P3 |
| **Effort** | seeded by bootstrap | XS · S · M · L · XL |
| **Repository** | Projects v2 auto-fill | populated when an issue is added |

The board is **discovered or created on every bootstrap** by `ensureUserLevelTriageProject` in `.dotfiles.sh`. Custom fields (Priority, Effort) are added if absent. Per-repo wiring (`wireRepoToTriageProject`) sets repo variables `TRIAGE_PROJECT_NUMBER` + `TRIAGE_PROJECT_OWNER`, which the `issue-triage` workflow reads to call `gh project item-add` on every newly-opened issue.

### One-time setup — single source of truth

Add a PAT to `~/.agents/.env` once. The dotfiles bootstrap uses it for both local project ops and as the per-repo workflow secret. Zero per-repo manual setup.

```bash
# Create a (classic) PAT at https://github.com/settings/tokens with scopes:
#   project, read:project, repo  (repo scope is needed so the bootstrap can also
#                                 set the secret on each repo non-interactively)
# Then:
echo 'PROJECTS_TOKEN=ghp_…' >> ~/.agents/.env
chmod 600 ~/.agents/.env
DOTFILES_FORCE=1 ./.dotfiles.sh
```

The bootstrap then, on every run:

1. Reads `PROJECTS_TOKEN` from `~/.agents/.env`
2. Uses it via `GH_TOKEN=$PAT` env override (no `gh auth refresh` needed, no scope on the local gh login)
3. Discovers or creates the user-level `Triage` project (configurable via `DOTFILES_TRIAGE_PROJECT_TITLE`)
4. Adds the `Priority` and `Effort` custom fields if absent
5. Caches `number / owner / id` to `~/.local/state/dotfiles-bootstrap/triage-project.env`
6. For every repo it touches: sets repo variables `TRIAGE_PROJECT_NUMBER`, `TRIAGE_PROJECT_OWNER`, **and** the repo secret `PROJECTS_TOKEN` — all from the same `.env`

Without `PROJECTS_TOKEN` in `~/.agents/.env`, every project-related step gracefully no-ops with a clear log line; labels and workflows still ship. Adding the PAT later "activates" the system on the next bootstrap.

## PR linkage enforcement

Workflow `pr-link-check.yml` runs on every PR open / edit / synchronize. It scans the body for `Closes #N` / `Fixes #N` / `Resolves #N` (case-insensitive). If absent:

- Adds the `pr-needs-issue` label
- Posts a single comment requesting the link (idempotent; doesn't re-comment on later edits)

If the linkage is later added, the label is removed automatically. Non-blocking — solo work doesn't get gated, but the audit trail surfaces.

## Auto-merge

Workflow `automerge.yml` arms GitHub auto-merge for:

- autosync branches named `wip/**` (default `wip/local/<branch>`)
- PRs labeled `automerge`
- Dependabot semver patch/minor version updates

The bootstrap enables repo auto-merge, branch deletion after merge, squash merge,
and default-branch protection with the required checks from
`.automation/policy.json`. The local autosync loop does not fall back to an
immediate merge when that policy says `require_green=true`.

## Why not labels for status/priority/effort?

- Labels lose ordering. You can't sort "P0 oldest first."
- Filtering composite views (e.g. "P1 + In progress + due this week") needs SQL-grade slicing — labels can't.
- Labels rot when applied manually. Projects v2 fields show up as required defaults at item-add time.
- The `gh project` CLI is fully scriptable; the label REST API is rate-limited and noisier.
