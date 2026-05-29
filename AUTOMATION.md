# Automation Contract

This repo is dotfiles-managed. The primitive contract lives in
`.automation/policy.json`; generated workflows, labels, repo settings, and local
autosync behavior should converge on that file.

## Loop

1. Observe local Git state without reading secrets or large diffs.
2. Checkpoint dirty work to a neutral `wip/local/<branch>` ref, or an explicit `wip/<namespace>/<branch>` ref.
3. Integrate only after the tree is quiet and required checks are green.
4. Prefer GitHub auto-merge with squash and branch deletion.
5. Repair tree-equivalent local divergence after squash merges.
6. Stop on semantic conflicts, active leases, unsafe Git states, or secrets.

## Universal GitHub Failure Prevention

All generated artifacts pass through the same local contract before they are
written: normalize trailing whitespace, parse by file type, block shellcheck
warnings when shellcheck is installed, and block yamllint failures when
yamllint is installed. GitHub Actions should confirm the same checks, not be
the first place a deterministic bootstrap defect is discovered.

Legacy self-repair or AI-review workflows that create notification loops are
retired into `old/` during bootstrap. Current automation may open PRs and rely
on required checks, but it must not keep pushing failing repairs into the same
branch.

Routine policy failures should use check conclusions and labels, not repeated
bot comments. Comments are reserved for durable review findings or security
context that cannot be represented as a check annotation, label, or workflow
summary.

## Local Commands

The split utility scripts (`repo-automation.sh`, `github-hygiene.sh`,
`git-autosync.sh`, `git-conformance`, `git-wip-gc`, `agent-git-guard.sh`,
`gh-issue.sh`) were consolidated into a single binary at
`~/.dotfiles/scripts/bin/git_good`. The subcommands map onto the old verbs:

```bash
git_good observe                  # repo state without reading secrets / large diffs
git_good defaults                 # show the hardcoded defaults this binary applies
git_good conform                  # converge repo settings on the policy
git_good triage                   # GitHub failure triage (was: github-hygiene.sh triage-failures)
git_good repair                   # GitHub failure repair (was: github-hygiene.sh repair-failures)
git_good sync                     # autostash dirty tree, local-only (the cron entry)
git_good unstash                  # recover from a sync stash
git_good guard baseline|finalize  # finalizer NDJSON guard contract
git_good gc                       # drop stashes older than 30 days
git_good --dry-run <subcmd>       # print-only preview of any mutation
```

Runtime artifacts land under `<repo>/.artifacts/git_good/`:
`events.<yyyy-mm-dd>.jsonl` (ECS-shaped event ledger),
`stash.<uuid>.patch` (flat patch archive),
`baseline.<session>.tsv` (per-session finalizer baseline). The cron entry
`*/15 * * * * git_good sync` autostashes dirty trees on the timer.

Old per-repo override paths (`.autosync/policy.env`, `.autosync/pause`,
`.autosync/lease.json`) were retired alongside the split scripts; `git_good`
hardcodes its defaults in the binary so there is no per-repo policy file to
drift against. Run `git_good defaults` to inspect them.
