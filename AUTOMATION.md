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

## Local Commands

```bash
repo-automation.sh observe
repo-automation.sh doctor
repo-automation.sh policy
```

`.autosync/policy.env`, `.autosync/pause`, and `.autosync/lease.json` are
per-repo overrides. The generated contract is the default; local overrides are
for explicit temporary exceptions.
