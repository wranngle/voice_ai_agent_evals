# Tasks: Reconcile Cloud-Local State

## Phase 1: Cloud State Inventory

- [ ] 1.1 Fix n8n MCP authentication
  - Check `~/.claude/.env` for N8N_API_KEY
  - Verify `~/.claude/.mcp.json` has correct n8n server config
  - Test: `mcp__n8n-mcp__n8n_list_workflows`

- [ ] 1.2 List all cloud n8n workflows
  - Run `mcp__n8n-mcp__n8n_list_workflows` with limit=100
  - Extract: id, name, active status, tags, updatedAt
  - Save to `reconciliation-data/cloud-n8n-workflows.json`

- [ ] 1.3 Get detailed metadata for key workflows
  - For each workflow in agent-registry.yaml (send-sms, post-call, etc.)
  - Run `mcp__n8n-mcp__n8n_get_workflow`
  - Save webhook IDs, node counts, credential references
  - Save to `reconciliation-data/workflow-details/`

- [ ] 1.4 List all cloud ElevenLabs agents
  - Already done: 2 agents ([DEV] Sarah, [DEV] Client Data Test)
  - Document in `reconciliation-data/cloud-elevenlabs-agents.json`

## Phase 2: Local-Cloud Comparison

- [ ] 2.1 Create comparison matrix
  - For each local `pipelines/*.json` file
  - Match to cloud workflow by webhookId or name
  - Compare updatedAt timestamps
  - Identify: MATCH, STALE_LOCAL, ORPHAN_LOCAL, CLOUD_ONLY
  - Save to `reconciliation-data/comparison-matrix.md`

- [ ] 2.2 Analyze agent configs
  - Compare `agents/example-agent/tech-spec.md` to cloud agent prompt
  - Run `mcp__elevenlabs-mcp__get_agent` for agent_xxxx_demo
  - Check if local prompt matches cloud
  - Document differences

- [ ] 2.3 Identify test dependencies
  - Find all references to `agents/example-agent/tests/scenarios.yaml`
  - Confirm only supersystem/ uses it
  - Plan migration path to `supersystem/scenarios/example-agent.yaml`

- [ ] 2.4 Document findings
  - Create `reconciliation-data/FINDINGS.md`
  - List: stale files, orphans, sync issues
  - Recommend: keep, move, delete for each file

## Phase 3: Project Restructure

- [ ] 3.1 Create new directory structure
  - `mkdir -p temp/agent-drafts temp/workflow-exports`
  - `mkdir -p docs/how-to docs/architecture`
  - `mkdir -p templates/agents templates/workflows` (if needed)
  - `mkdir -p supersystem/scenarios`

- [ ] 3.2 Move test scenarios
  - Copy `agents/example-agent/tests/scenarios.yaml` → `supersystem/scenarios/example-agent.yaml`
  - Update references in supersystem scripts
  - Update agent-registry.yaml scenario_file path

- [ ] 3.3 Move cloud-mirroring directories to old/
  - Move `agents/` → `old/agents/` (68KB)
  - Move `pipelines/` → `old/pipelines/` (144KB, 8 files)
  - Move `transcript-extraction/` → `old/transcript-extraction/` (140KB)
  - Verify: `ls -la | grep -E "^d.*agents|^d.*pipelines|^d.*transcript"` shows only old/ subdirs

- [ ] 3.4 Update .gitignore
  - Add `temp/` to .gitignore
  - Add `reconciliation-data/` to .gitignore (working directory)

## Phase 4: Documentation

- [ ] 4.1 Create cloud operation guides
  - `docs/how-to/create-elevenlabs-agent.md` - MCP tool usage
  - `docs/how-to/deploy-n8n-workflow.md` - MCP tool usage
  - `docs/how-to/test-agents-supersystem.md` - Testing framework
  - `docs/how-to/cloud-first-workflow.md` - Development process

- [ ] 4.2 Create architecture documentation
  - `docs/architecture/cloud-first-principles.md`
  - `docs/architecture/mcp-tools-reference.md`
  - Document: Cloud is truth, local is control plane

- [ ] 4.3 Update README.md
  - Remove old directory structure
  - Add new cloud-first structure
  - Add section: "Cloud-First Architecture"
  - Add section: "Using MCP Tools to Manage Cloud"
  - Reference how-to guides

- [ ] 4.4 Update agent-registry.yaml
  - Update scenario_file paths to supersystem/scenarios/
  - Remove config_file, prompt_file paths (cloud only)
  - Add note: "Cloud agents managed via MCP tools"

## Phase 5: Verification

- [ ] 5.1 Verify directory structure
  - Run: `ls -la | grep -E "^d.*agents|^d.*pipelines|^d.*transcript" | grep -v old`
  - Should return: nothing (directories moved to old/)
  - Run: `ls old/`
  - Should show: agents/, pipelines/, transcript-extraction/
  - Run: `ls supersystem/scenarios/`
  - Should show: example-agent.yaml

- [ ] 5.2 Verify supersystem tests still work
  - Check supersystem scripts can find scenarios
  - Run smoke test against cloud agent (if safe)
  - Verify test results still save correctly

- [ ] 5.3 Verify MCP tools work
  - Test: `mcp__n8n-mcp__n8n_list_workflows`
  - Test: `mcp__elevenlabs-mcp__list_agents`
  - Confirm cloud operations functional

- [ ] 5.4 Run full-text search for broken references
  - `rg "agents/example-agent" --type md --type yaml --type json`
  - `rg "pipelines/" --type md --type yaml --type json`
  - Fix any remaining references

## Phase 6: Commit

- [ ] 6.1 Stage all changes
  - `git add -A`
  - `git status` to review

- [ ] 6.2 Commit restructure
  - Clear message documenting cloud-first migration
  - List deleted directories and sizes
  - Note scenario file migration
  - Include Co-Authored-By line

- [ ] 6.3 Create reconciliation report
  - Save `reconciliation-data/REPORT.md` with full findings
  - Do NOT commit (in .gitignore)
  - Keep for reference/rollback info

## Dependencies

- **Phase 1 blocks Phase 2**: Need cloud inventory before comparison
- **Phase 2 blocks Phase 3**: Need comparison results before restructure
- **Phase 3 blocks Phase 4**: Need structure before documenting it
- **Phase 4 blocks Phase 5**: Need docs before verification
- **Phase 5 blocks Phase 6**: Need verification before commit

## Parallelizable Work

- 1.2, 1.3, 1.4 can run in parallel (independent API calls)
- 3.1, 3.2 can run in parallel (independent directory operations)
- 4.1 docs can be written in parallel (independent guides)
- 5.2, 5.3 can run in parallel (independent tests)

## Success Criteria

- [ ] agents/, pipelines/, transcript-extraction/ moved to old/
- [ ] supersystem/scenarios/example-agent.yaml exists with correct content
- [ ] temp/ directory exists and is gitignored
- [ ] docs/how-to/ has 4+ cloud operation guides
- [ ] README.md reflects cloud-first architecture
- [ ] Supersystem tests still functional
- [ ] MCP tools verified working
- [ ] Git commit documents full restructure
- [ ] old/ directory contains archived cloud-mirroring files

## Rollback Procedure

If issues arise:
```bash
# Current commit hash (before restructure)
git log -1 --oneline

# Revert restructure commit
git revert <commit-hash>

# Or checkout previous state
git checkout <commit-hash-before-restructure>
```

## Notes

- reconciliation-data/ is a working directory (gitignored)
- Keep findings/comparison data for reference
- Document any surprises in FINDINGS.md
- If cloud state differs significantly from expectations, PAUSE and consult
