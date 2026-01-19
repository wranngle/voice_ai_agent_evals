# Change: Reconcile Cloud-Local State

## Why

The voice_ai_agents project currently has **8.4MB of local files** that mirror cloud-managed infrastructure (ElevenLabs agents + n8n workflows). This creates a sync problem where:

- **Cloud is source of truth** (via ElevenLabs API and n8n server)
- **Local files duplicate cloud state** (agents/, pipelines/, transcript-extraction/)
- **Purpose is unclear**: Are these exports? Working drafts? Version control backups?
- **Sync burden exists**: Cloud changes make local files stale, local changes need manual deployment

The project should be a **cloud-first portal** - a lightweight control plane with MCP tools, testing infrastructure, and documentation - NOT a repository maintaining sync with cloud state.

**Current local files that mirror cloud:**
- `agents/` (68KB) - Mirrors ElevenLabs agent configs
- `pipelines/` (144KB, 8 workflows) - Mirrors n8n server workflows
- `transcript-extraction/` (140KB) - Mirrors deployed n8n workflow

**Correctly structured:**
- `supersystem/` (8.1MB) - Testing framework running against cloud ✅

## What Changes

This is a **comprehensive cloud-local state reconciliation** as a separate sub-project:

1. **Inventory Cloud State**
   - Fix n8n MCP authentication
   - List all n8n workflows with full metadata
   - List all ElevenLabs agents with full metadata
   - Document current cloud state

2. **Compare Local vs Cloud**
   - Match each local `.json` file to cloud workflow (or identify orphans)
   - Match agent configs to cloud agents
   - Identify version mismatches
   - Document what's deployed vs what's local

3. **Restructure Project**
   - **MOVE** `agents/` → `old/agents/` (cloud ElevenLabs agents are truth)
   - **MOVE** `pipelines/` → `old/pipelines/` (cloud n8n workflows are truth)
   - **MOVE** `transcript-extraction/` → `old/transcript-extraction/` (cloud n8n workflow is truth)
   - **COPY** test scenarios from agents/ to supersystem/scenarios/ (keep original in old/)
   - **CREATE** `temp/` directory (gitignored) for working drafts
   - **CREATE** `docs/how-to/` with cloud operation guides
   - **CREATE** `templates/` for reusable starting points (optional)
   - **UPDATE** README.md with cloud-first architecture

4. **Document Cloud Operations**
   - Guide: "How to create ElevenLabs agents via MCP"
   - Guide: "How to deploy n8n workflows via MCP"
   - Guide: "How to test agents with supersystem"
   - Guide: "Cloud-first development workflow"

## Impact

- **Affected specs**: None (organizational change)
- **Affected files**:
  - MOVE: `agents/`, `pipelines/`, `transcript-extraction/` → `old/` (~352KB)
  - COPY: `agents/example-agent/tests/scenarios.yaml` → `supersystem/scenarios/example-agent.yaml`
  - CREATE: `temp/`, `docs/how-to/`, `templates/` (optional)
  - UPDATE: README.md, .gitignore, agent-registry.yaml
- **Affected systems**: None (no cloud changes, only local structure)
- **Breaking changes**: None - cloud remains unchanged

## Success Criteria

- Zero local files that duplicate cloud state
- Clear documentation on cloud operations via MCP
- Test scenarios moved to supersystem/
- Working directory (temp/) created and gitignored
- README reflects cloud-first architecture
- No ambiguity about source of truth

## Risk Assessment

**Low Risk:**
- Cloud state unchanged (no deployments)
- Only restructuring local files
- Git history preserves everything
- Supersystem tests still run against cloud

**Benefits:**
- Eliminates sync problem entirely
- Clear cloud-first architecture
- Lighter repository (352KB deleted)
- MCP tools become primary interface
- No confusion about file purpose
