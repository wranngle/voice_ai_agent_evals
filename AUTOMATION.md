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

```bash
repo-automation.sh observe
repo-automation.sh doctor
repo-automation.sh policy
github-hygiene.sh triage-failures
github-hygiene.sh repair-failures
```

`.autosync/policy.env`, `.autosync/pause`, and `.autosync/lease.json` are
per-repo overrides. The generated contract is the default; local overrides are
for explicit temporary exceptions.
