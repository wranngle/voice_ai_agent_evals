# ADR-001: Project Reorganization - Remove old/ Directory

**Date**: 2026-01-19
**Status**: Approved
**Branch**: reorganize-project-structure
**Rollback Commit**: bc93520

## Context

The voice_ai_agents project accumulated ~100 archived files (2.1MB) in the `old/` directory during rapid development iterations from December 2024 through January 2026. This created organizational complexity and confusion about which files are authoritative.

**Directory Contents (pre-cleanup):**
- `old/agents-example-agent-archive/` - 8 superseded Sarah agent configuration files
- `old/agents-legacy-archive/` - 12 Example garage agent files (development-only, never production)
- `old/example-garage-original/` - 12 duplicate files
- `old/pipelines-archive/` - 4 superseded n8n workflow versions
- `old/debug-dumps/` - 8 debugging JSON conversation dumps
- `old/supersystem-test-results/` - 14+ historical evaluation results
- `old/temp-files/` - 30+ temporary development artifacts
- `old/root-cleanup/` - 3 obsolete cleanup scripts
- Standalone files: 4 old Sarah prompt markdown files, 1 old SMS tool JSON

**Total**: ~100 files, 2.1MB

## Decision

**Remove the entire `old/` directory** and rely on git history for accessing historical files.

## Rationale

1. **Single Source of Truth**: Every component now has exactly ONE authoritative location:
   - Sarah Agent → `agents/example-agent/` (tech-spec.md is comprehensive)
   - Active Workflows → `pipelines/`
   - Testing Framework → `supersystem/`

2. **Git History Sufficiency**: All files remain accessible via:
   - `git log --follow <path>` to trace file history
   - `git show <commit>:<path>` to view historical versions
   - `git checkout <commit>` to rollback if needed

3. **Industry Best Practice**: Keeping archived files in working directory creates maintenance burden; git is designed for version history.

4. **Developer Experience**: Clearer project structure, faster navigation, reduced cognitive load.

## Consequences

### Positive
- Cleaner working directory (100 fewer files)
- Faster git operations (clone, status, diff)
- Unambiguous file authority for new contributors
- Aligns with OpenSpec single-source-of-truth principle

### Negative
- Requires git knowledge to access historical files
- Cannot casually browse old files without checkout

### Neutral
- File history preserved completely in git
- Rollback available via `git revert` or `git checkout bc93520`

## What Was Removed

| Category | Files | Why Removed |
|----------|-------|-------------|
| Sarah archives | 8 in agents-example-agent-archive/ | Superseded by agents/example-agent/tech-spec.md |
| Sarah prompts | 4 standalone .md files | Consolidated into tech-spec.md |
| legacy agent | 24 (archive + original) | No active development, agent-registry entry removed |
| Pipelines | 4 in pipelines-archive/ | Superseded by pipelines/*.json |
| Debug artifacts | 8 conversation dumps | Point-in-time debugging data |
| Test results | 14+ evaluation JSONs | Superseded by current test framework |
| Temp files | 30+ development artifacts | Temporary exploratory code |
| Cleanup scripts | 3 in root-cleanup/ | One-time use, now obsolete |

## Active Files (Retained)

```
voice_ai_agents/
├── agents/example-agent/              ✅ Production agent (3 files)
│   ├── SETUP.md
│   ├── tech-spec.md          (846 lines - comprehensive)
│   └── tests/scenarios.yaml
├── pipelines/                 ✅ Active n8n workflows (9 files)
├── supersystem/               ✅ Testing framework (300+ files)
├── transcript-extraction/     ✅ Post-call processing
├── templates/                 ✅ Reusable components
├── openspec/                  ✅ Change management
├── docs/                      ✅ API documentation
└── [root configs]             ✅ Package.json, tsconfig, etc.
```

## Documentation Updates

Files updated to reflect reorganization:
1. `README.md` - Removed old/ from directory structure
2. `.gitignore` - Removed old/**/*-results-*.json pattern
3. `agent-registry.yaml` - Removed inactive example-garage entry
4. `openspec/changes/harden-post-call-webhook/` - Noted old/ deprecation

## Verification Steps

Pre-deletion checks:
- ✅ Searched for hard-coded references: `rg "old/"` found only documentation
- ✅ Verified agents/example-agent/tech-spec.md contains all prompt information
- ✅ Confirmed pipelines/ has current workflow versions
- ✅ Noted commit hash bc93520 for rollback

Post-deletion checks:
- Verify README.md updated
- Verify no broken relative imports
- Verify supersystem scripts still functional
- Run full-text search: `rg "old/"` should only find this decision log

## Rollback Procedure

If issues arise:
```bash
# Option 1: Revert the cleanup commit
git revert <cleanup-commit-hash>

# Option 2: Checkout previous state
git checkout bc93520

# Option 3: Restore specific files
git show bc93520:old/path/to/file.md > restored-file.md
```

## References

- OpenSpec Proposal: `openspec/changes/reorganize-agent-project-structure/`
- Pre-cleanup commit: bc93520
- Analysis agent: a97eb4c (comprehensive project analysis)

## Notes

- legacy agent removed from agent-registry.yaml as it has no active development
- Future archived files should NOT use old/ directory - use git history instead
- If archival is truly needed, create dated git tags (e.g., `archive-2026-01-19`)
