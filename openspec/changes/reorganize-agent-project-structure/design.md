# Design: Reorganize Agent Project Structure

## Context

The voice_ai_agents project powers ExampleCo' production "AI hotline" AI hotline service. It began as exploratory development for a single agent (Sarah) and evolved into a multi-agent platform with comprehensive testing infrastructure (supersystem), n8n workflow orchestration, and ElevenLabs voice integration.

**Historical Evolution:**
1. **Phase 1 (Dec 2024)**: Initial Sarah agent development with rapid iteration on prompts
2. **Phase 2 (Dec-Jan 2025)**: Example Garage agent experimentation (never reached production)
3. **Phase 3 (Jan 2025)**: Sarah hardening, test factory, supersystem framework
4. **Phase 4 (Jan 2025)**: Production deployment, post-call processing, Qdrant vectorization

The rapid iteration left behind ~100 archived files in an `old/` directory, creating confusion about which files are authoritative.

**Key Stakeholders:**
- ExampleCo engineers maintaining production agents
- New contributors learning the project structure
- OpenSpec change management system requiring clear file organization

**Constraints:**
- Cannot lose git history (rollback must be possible)
- Cannot break active agent configurations in production
- Must maintain clear audit trail for decisions

## Goals / Non-Goals

**Goals:**
- Remove all superseded and archived files from active working directory
- Establish clear single-source-of-truth for each component (agent configs, prompts, workflows)
- Improve developer experience navigating the project
- Reduce cognitive load understanding which files are authoritative
- Make git operations faster (fewer files to scan)

**Non-Goals:**
- Changing any functional behavior or runtime code
- Modifying active agent configurations or workflows
- Creating new organizational categories or abstractions
- Moving active files around (only deleting archived ones)
- Consolidating Sarah files into a new subdirectory (current structure is adequate)

## Decisions

### Decision 1: Complete Deletion vs Archival to Git Tags

**Options Considered:**
1. **Complete deletion** - Remove old/ directory entirely, rely on git history
2. **Git tag archive** - Tag current commit as "pre-cleanup", then delete
3. **Move to archive branch** - Keep files in a separate git branch
4. **Keep old/ but add .gitignore** - Stop tracking but leave locally

**Choice**: Complete deletion (Option 1)

**Rationale:**
- Git history already preserves every version of every file
- Old files are superseded, not "archived for reference" - they're obsolete
- Developers can `git log --follow` to see file history
- Tags add ceremony without benefit (git history is sufficient)
- Archive branches create maintenance overhead (what branch is truth?)
- Local .gitignore creates inconsistency between clones

**Trade-offs:**
- Pro: Cleanest possible working directory
- Pro: Forces reliance on git history (industry best practice)
- Pro: No ambiguity about what's active
- Con: Requires knowing git commands to see historical files
- Con: Can't casually browse old files without checkout

**Mitigation**: Create decision log documenting what was removed and where to find historical versions.

### Decision 2: Agent Registry LEGACY Entry

**Options Considered:**
1. **Remove entry** - Delete example-garage from agent-registry.yaml
2. **Mark inactive** - Add `status: INACTIVE` field
3. **Create skeleton** - Create agents/example-garage/ with README explaining status

**Choice**: Remove entry (Option 1)

**Rationale:**
- legacy agent has no active development (no phone number, no active config directory)
- Agent-registry.yaml should reflect currently maintained agents
- Historical agents can be discovered via git history
- Keeping inactive entries creates confusion about what needs maintenance

**Trade-offs:**
- Pro: Registry accurately reflects maintained agents
- Pro: Clearer for new contributors
- Con: Loses documentation of past experiments
- Mitigation: Decision log can document LEGACY as historical experiment

### Decision 3: Sarah Prompt Files Consolidation

**Observation**: 4 standalone Sarah prompt files exist in old/:
- example-agent-enhanced-prompt-v1.1.md (17KB)
- example-agent-final-prompt-100pct.md (14KB)
- example-agent-merged-prompt.md (8KB)
- (Plus agents-example-agent-archive/ with 3 more variations)

**Current Source of Truth**: agents/example-agent/tech-spec.md (846 lines, comprehensive)

**Choice**: Delete all old prompt files

**Rationale:**
- tech-spec.md is the authoritative production prompt
- Old prompts document iteration process, not current state
- Prompt history is preserved in git commits
- Multiple "final" prompts create confusion about which is actually final

**Verification**: Reviewed tech-spec.md to confirm it contains:
- Complete system prompt (IDENTITY, VOICE, PRODUCT, GUARDRAILS)
- Tool definitions (send_sms, end_call)
- Conversation flow patterns
- BANT qualification framework
- Objection handling scripts
- Forbidden language list

### Decision 4: Supersystem Test Results

**Observation**: old/supersystem-test-results/ contains 14+ JSON evaluation files

**Choice**: Delete historical test results

**Rationale:**
- Test results are point-in-time snapshots (not living documentation)
- Current test infrastructure (supersystem/test-factory/) generates fresh results
- Historical results don't inform current development
- supersystem/ directory contains current test framework and recent results

**Alternative Considered**: Move to supersystem/archived-results/
**Rejected**: Results are already in git history, no need for special archival

## Organizational Philosophy

### Single Source of Truth Principle

Every component should have exactly ONE authoritative location:

| Component | Source of Truth | Superseded Locations |
|-----------|----------------|---------------------|
| Sarah Agent Config | agents/example-agent/ | old/agents-example-agent-archive/ |
| Sarah System Prompt | agents/example-agent/tech-spec.md | old/example-agent-*.md (4 files) |
| SMS Tool Definition | agents/example-agent/tech-spec.md | old/send-sms-tool.json |
| Active Workflows | pipelines/*.json | old/pipelines-archive/*.json |
| Test Framework | supersystem/ | old/supersystem-test-results/ |
| Debug Artifacts | None (disposable) | old/debug-dumps/ |

### Active vs Historical Distinction

**Active files** (keep):
- Used in production or current development
- Referenced by active code or workflows
- Maintained and updated regularly
- Clear ownership and purpose

**Historical files** (delete):
- Superseded by newer versions
- Not referenced by active code
- Exist only for historical context
- Context is preserved in git history

### Directory Naming Convention

Going forward:
- **agents/[name]/** - Active agent configurations (production or active dev)
- **pipelines/** - Active n8n workflows
- **supersystem/** - Testing infrastructure (may contain recent results)
- **old/** - REMOVED (use git history instead)
- **archive/** - DISCOURAGED (use git history + tags if needed)

## Migration Plan

**Pre-Migration:**
1. Create git branch `reorganize-project-structure`
2. Create decision log in docs/decisions/
3. Document current commit hash for rollback

**Migration Steps:**
1. Verify no active code references files in old/
2. Delete directories in order: agents, pipelines, dumps, results, temp
3. Delete standalone prompt files
4. Remove old/ directory
5. Update agent-registry.yaml
6. Update project documentation

**Post-Migration:**
1. Run full-text search for "old/" references
2. Verify git status shows expected deletions
3. Commit with descriptive message
4. Update OpenSpec proposal status

**Rollback:**
```bash
# If issues arise, revert the cleanup commit
git revert <commit-hash>

# Or checkout previous state
git checkout <commit-hash-before-cleanup>
```

## Risks / Trade-offs

### Risk 1: Losing Important Context

**Risk**: Deleted files contained important context not captured in current files

**Likelihood**: Low - comprehensive review showed all active info in agents/example-agent/tech-spec.md

**Mitigation**:
- Thorough pre-deletion review of file contents
- Git history preserves everything
- Decision log documents what was removed and why

### Risk 2: Broken References

**Risk**: Active code or docs reference files in old/ directory

**Likelihood**: Low - used during exploration, not integration

**Mitigation**:
- Pre-deletion search: `rg "old/" --type js --type yaml --type json`
- Post-deletion verification: `rg "old/"`
- Testing supersystem scripts after cleanup

### Risk 3: Developer Confusion

**Risk**: Contributors accustomed to old/ directory won't know where things went

**Likelihood**: Medium - change to established structure

**Mitigation**:
- Decision log explaining rationale
- README updates pointing to git history for historical files
- Clear commit message documenting cleanup

## Open Questions

**Q1**: Should we keep a single README in old/ pointing to git history?
**A1**: No - if old/ exists at all, it invites adding more files to it. Complete removal is cleaner.

**Q2**: Should we create agents/example-garage/ as a placeholder?
**A2**: No - agent-registry.yaml removal is sufficient. If LEGACY is revived, create the directory then.

**Q3**: Should we move instead of delete, to preserve local file access?
**A3**: No - git history is the correct tool for historical access. Local moves create inconsistency.

**Q4**: Should we validate supersystem tests pass before committing?
**A4**: Yes - added to tasks.md as verification step 10.4

## Success Metrics

**Quantitative:**
- Old/ directory deleted (~100 files, ~50MB)
- Zero ripgrep matches for "old/" in active code
- Git operations (status, diff) ~20-30% faster
- Clone time reduced by ~10-15%

**Qualitative:**
- New contributors can quickly identify authoritative files
- Less time spent clarifying "which version is current?"
- Clearer mental model of project structure
- Easier to maintain OpenSpec spec/change alignment

## Conclusion

This reorganization prioritizes clarity and maintainability over historical file retention. By removing 100+ archived files and relying on git history for rollback/reference, we establish a cleaner single-source-of-truth for each component. The trade-off is requiring git knowledge to access historical files, but this aligns with industry best practices and reduces cognitive load for active development.
