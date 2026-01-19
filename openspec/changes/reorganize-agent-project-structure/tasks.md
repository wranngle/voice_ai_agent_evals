# Tasks: Reorganize Agent Project Structure

## 1. Pre-Cleanup Verification

- [ ] 1.1 Create git branch for reorganization work
- [ ] 1.2 Verify all files in `old/` are truly superseded or archived
- [ ] 1.3 Check for any hard-coded references to files in `old/` directory
- [ ] 1.4 Run grep search: `rg "old/(agents-example-agent-archive|agents-legacy-archive|pipelines-archive)" --type js --type yaml --type json`
- [ ] 1.5 Document current directory sizes: `du -sh old/` for baseline metrics

## 2. Create Reorganization Decision Log

- [ ] 2.1 Create `docs/decisions/2026-01-19-project-reorganization.md`
- [ ] 2.2 Document rationale: why removing old/ directory
- [ ] 2.3 Document what was removed and where active versions live
- [ ] 2.4 Document rollback procedure (git history + commit hash)

## 3. Remove Archived Agent Configurations

- [ ] 3.1 Delete `old/agents-example-agent-archive/` (8 files)
- [ ] 3.2 Delete `old/agents-legacy-archive/` (12 files)
- [ ] 3.3 Delete `old/example-garage-original/` (12 files - duplicate)
- [ ] 3.4 Verify agents/example-agent/ still contains all active files

## 4. Remove Archived Pipelines

- [ ] 4.1 Delete `old/pipelines-archive/` (4 workflow files)
- [ ] 4.2 Verify pipelines/ directory contains current versions
- [ ] 4.3 Document superseding workflows in decision log

## 5. Remove Debugging and Test Artifacts

- [ ] 5.1 Delete `old/debug-dumps/` (8 JSON conversation dumps)
- [ ] 5.2 Delete `old/supersystem-test-results/` (14+ evaluation result files)
- [ ] 5.3 Delete `old/temp-files/` (30+ temporary development artifacts)
- [ ] 5.4 Delete `old/root-cleanup/` (3 obsolete cleanup scripts)

## 6. Remove Standalone Archived Prompts

- [ ] 6.1 Delete `old/example-agent-enhanced-prompt-v1.1.md`
- [ ] 6.2 Delete `old/example-agent-final-prompt-100pct.md`
- [ ] 6.3 Delete `old/example-agent-merged-prompt.md`
- [ ] 6.4 Delete `old/send-sms-tool.json`
- [ ] 6.5 Verify agents/example-agent/tech-spec.md contains all prompt information

## 7. Remove Empty old/ Directory

- [ ] 7.1 Verify `old/` directory is now empty or only contains `.gitkeep`
- [ ] 7.2 Delete `old/` directory entirely: `rm -rf old/`
- [ ] 7.3 Verify deletion: `ls -la | grep old` returns nothing

## 8. Update Agent Registry

- [ ] 8.1 Open agent-registry.yaml
- [ ] 8.2 Review `example-garage` entry (lines 73-91)
- [ ] 8.3 EITHER: Mark as inactive OR create agents/example-garage/ structure
- [ ] 8.4 Add comment documenting current active agents vs inactive entries
- [ ] 8.5 Update `last_updated` field to current date

## 9. Update Project Documentation

- [ ] 9.1 Update README.md directory structure section (if exists)
- [ ] 9.2 Update any references to old/ directory in docs/
- [ ] 9.3 Add note to openspec/project.md about reorganization

## 10. Verification and Testing

- [ ] 10.1 Run full-text search for "old/" references: `rg "old/" --type md --type yaml --type json`
- [ ] 10.2 Verify no broken relative path imports in code
- [ ] 10.3 Check supersystem scripts still reference correct paths
- [ ] 10.4 Run project tests if available: `npm test` or `bun test`
- [ ] 10.5 Verify git status shows expected deletions

## 11. Git Commit

- [ ] 11.1 Stage all deletions: `git add -A`
- [ ] 11.2 Review staged changes: `git status`
- [ ] 11.3 Commit with clear message: `[docs] remove: archive cleanup - delete 100+ obsolete files from old/ directory`
- [ ] 11.4 Push to remote branch
- [ ] 11.5 Note commit hash in decision log for rollback reference

## Dependencies

- **1.x blocks all**: Must verify before any deletions
- **2.x parallel with 3.x-7.x**: Can document while deleting
- **3.x-7.x can run sequentially or parallel**: Each deletes independent directories
- **8.x after 3.x**: Registry update requires understanding agent cleanup
- **9.x after 7.x**: Documentation updates after deletions complete
- **10.x after 9.x**: Verification requires all changes done
- **11.x after 10.x**: Commit only after verification passes

## Parallelizable Work

- 3.x, 4.x, 5.x, 6.x can all run in parallel (independent directory deletions)
- 2.x can run in parallel with deletions (write decision log while cleaning)
- 9.1, 9.2, 9.3 can run in parallel (independent doc updates)

## Success Criteria

- [ ] `old/` directory no longer exists
- [ ] Zero references to `old/` in active codebase (verified via ripgrep)
- [ ] Agent-registry.yaml accurately reflects active agents
- [ ] Decision log created explaining rationale and rollback procedure
- [ ] Git commit created with clear message and documentation
- [ ] All supersystem tests still pass (if applicable)
- [ ] Project structure is cleaner and easier to navigate

## Rollback Procedure

If issues arise:
1. Note the commit hash before starting: `git log -1 --oneline`
2. Checkout previous commit: `git checkout <commit-hash>`
3. Or revert commit: `git revert <commit-hash>`
4. Document rollback reason in decision log
