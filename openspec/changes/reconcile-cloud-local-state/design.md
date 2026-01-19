# Design: Reconcile Cloud-Local State

## Context

The voice_ai_agents project started as exploratory development with local files, but evolved into managing production cloud infrastructure (ElevenLabs agents + n8n workflows). The current structure creates a **dual source of truth problem**:

- **Cloud systems** (ElevenLabs, n8n) hold the actual production state
- **Local files** (`agents/`, `pipelines/`) mirror cloud state but become stale
- **Purpose unclear**: Are local files working drafts, exports, or version control?

The project should function as a **cloud-first portal** - a control plane for managing cloud infrastructure via MCP tools, with testing and documentation, NOT a repository maintaining sync.

**Key Stakeholders:**
- ExampleCo engineers managing production agents
- Testing infrastructure (supersystem framework)
- Future contributors learning the system

**Constraints:**
- Cloud infrastructure is live and serving production traffic
- Cannot disrupt existing testing workflows
- Must preserve git history for rollback
- MCP tools must be primary interface going forward

## Goals / Non-Goals

**Goals:**
1. **Eliminate dual source of truth** - Cloud only, no local mirrors
2. **Establish cloud-first architecture** - MCP tools + documentation + testing
3. **Move test scenarios** to appropriate location (supersystem/)
4. **Create working directory** (temp/) for drafts, gitignored
5. **Document cloud operations** - Clear guides on using MCP tools

**Non-Goals:**
- Changing cloud infrastructure (no deployments, no agent modifications)
- Migrating to different cloud providers
- Building custom deployment tooling (MCP tools already exist)
- Version controlling cloud state (cloud APIs handle this)

## Decisions

### Decision 1: Move to old/ vs Delete Local Cloud Mirrors

**Options Considered:**
1. **Move to old/** - Archive in old/ directory
2. **Delete entirely** - Remove agents/, pipelines/, transcript-extraction/
3. **Move to templates/** - Keep as reference templates
4. **Keep but mark stale** - Add README warnings

**Choice**: Move to old/ (Option 1)

**Rationale:**
- Cloud is authoritative source of truth, but preserve local snapshots
- Provides easy local reference without MCP tool queries
- Allows browsing historical state casually
- No sync burden (files in old/ are explicitly archived, not maintained)
- Clear semantics: old/ = archived snapshots, not current state

**Trade-offs:**
- **Pro**: Easy local reference for archived state
- **Pro**: Can browse without MCP tools
- **Pro**: Clear "this is archived" semantics
- **Con**: Repository slightly larger (352KB in old/)
- **Con**: Need to resist temptation to update old/ files (they're snapshots)
- **Mitigation**: Documentation emphasizes old/ is read-only archive

### Decision 2: Test Scenarios Location

**Observation**: `agents/example-agent/tests/scenarios.yaml` is used by supersystem testing framework

**Options Considered:**
1. **supersystem/scenarios/example-agent.yaml** - Co-locate with testing framework
2. **tests/scenarios/example-agent.yaml** - Separate top-level tests/ directory
3. **Keep in agents/example-agent/** - Maintain current location

**Choice**: supersystem/scenarios/example-agent.yaml (Option 1)

**Rationale:**
- Test scenarios are consumed by supersystem framework
- Supersystem is the only component that needs local files (runs tests against cloud)
- Co-locating makes dependency explicit
- Aligns with "testing framework is primary local component" principle

**Alternative Considered**: Create top-level tests/
**Rejected**: Adds another directory; supersystem/ already contains test infrastructure

### Decision 3: Working Directory for Drafts

**Need**: Developers need a place to work on agent prompts/workflows before pushing to cloud

**Choice**: Create `temp/` directory (gitignored)

**Structure**:
```
temp/
├── agent-drafts/       # Draft ElevenLabs agent configs
├── workflow-exports/   # Exported n8n workflows for modification
└── .gitignore          # Don't commit working files
```

**Rationale:**
- Clear "this is not source of truth" semantics
- Gitignored prevents accidental commits
- Allows local experimentation without polluting repo
- Standard temp/ naming convention

### Decision 4: Documentation Structure

**Need**: Clear guides on cloud operations since local files won't exist

**Structure**:
```
docs/
├── how-to/
│   ├── create-elevenlabs-agent.md
│   ├── deploy-n8n-workflow.md
│   ├── test-agents-supersystem.md
│   └── cloud-first-workflow.md
├── architecture/
│   ├── cloud-first-principles.md
│   └── mcp-tools-reference.md
└── decisions/
    └── 2026-01-19-cloud-reconciliation.md
```

**Rationale:**
- how-to/ guides are actionable recipes
- architecture/ explains principles and patterns
- decisions/ captures this reconciliation ADR

### Decision 5: Templates Directory

**Question**: Should we keep templates/ for starter configs?

**Choice**: Optional - create if useful, but NOT for cloud mirrors

**If created**:
- Generic agent prompt starter
- Generic n8n workflow patterns
- These are **starting points**, not exports of production systems

**If not created**:
- MCP tools + docs are sufficient
- Start from scratch or cloud examples

## Organizational Philosophy

### Cloud-First Principles

1. **Cloud is Truth**
   - ElevenLabs agent configs live on ElevenLabs servers
   - n8n workflows live on n8n server
   - Local repo is a control plane, not a mirror

2. **MCP Tools are Primary Interface**
   - `mcp__elevenlabs-mcp__*` tools for agent operations
   - `mcp__n8n-mcp__*` tools for workflow operations
   - Documentation guides tool usage

3. **Local Files Serve Specific Purposes**
   - **supersystem/**: Testing framework (runs against cloud)
   - **temp/**: Working directory (gitignored)
   - **docs/**: Documentation and guides
   - **templates/**: Starter configs (optional)

4. **No Sync Problem**
   - Don't maintain local mirrors
   - Query cloud state when needed via MCP
   - Temporary exports go to temp/ (gitignored)

### Component Roles

| Component | Purpose | Source of Truth |
|-----------|---------|-----------------|
| ElevenLabs Agents | Voice AI agents | ☁️ ElevenLabs Cloud |
| n8n Workflows | Orchestration pipelines | ☁️ n8n Server |
| supersystem/ | Testing framework | 💾 Local (tests run against cloud) |
| docs/ | Guides and architecture | 💾 Local (documentation) |
| temp/ | Working directory | 💾 Local (gitignored) |

## Migration Plan

### Phase 1: Inventory (Non-Destructive)

1. Fix n8n MCP authentication
2. List all cloud workflows and agents
3. Compare local files to cloud state
4. Document findings in `reconciliation-data/`
5. **PAUSE**: Review findings before proceeding

### Phase 2: Restructure (Non-Destructive Archive)

1. Create new directory structure (temp/, docs/how-to/)
2. Copy test scenarios: `agents/example-agent/tests/scenarios.yaml` → `supersystem/scenarios/example-agent.yaml`
3. Move cloud-mirroring directories to archive: `agents/`, `pipelines/`, `transcript-extraction/` → `old/`
4. Update references in README, agent-registry.yaml
5. **VERIFY**: Supersystem tests still work

### Phase 3: Document

1. Write cloud operation guides (how-to/)
2. Write architecture principles
3. Update README with cloud-first structure
4. Commit changes

### Rollback Strategy

```bash
# If issues arise during restructure
git log -1 --oneline  # Note commit before restructure
git revert <commit>   # Undo changes

# Or full rollback
git checkout <commit-before-restructure>

# Restore specific file
git show <commit>:agents/example-agent/tech-spec.md > restored.md
```

## Risks / Trade-offs

### Risk 1: Loss of Local Reference Files

**Risk**: Developers can't quickly browse agent configs locally

**Likelihood**: Medium - convenience loss

**Mitigation**:
- MCP tools provide read access: `mcp__elevenlabs-mcp__get_agent`
- Create docs/how-to/ guides with MCP examples
- temp/ directory allows exporting for local viewing

### Risk 2: Breaking Supersystem Tests

**Risk**: Moving test scenarios breaks supersystem framework

**Likelihood**: Low - can test before committing

**Mitigation**:
- Update references in supersystem scripts
- Test against cloud agent after migration
- Keep old commit hash for rollback

### Risk 3: Developer Confusion

**Risk**: Contributors expect local files to exist (based on prior project structure)

**Likelihood**: High - change to established pattern

**Mitigation**:
- Clear README explaining cloud-first architecture
- how-to/ guides demonstrate MCP tool usage
- ADR documents the change rationale

### Risk 4: MCP Tool Failure

**Risk**: If MCP tools fail, no way to interact with cloud

**Likelihood**: Low - but high impact

**Mitigation**:
- Document direct API usage as fallback
- Keep API endpoint references in docs
- Test MCP connectivity before full migration

## Open Questions

**Q1**: Should we create templates/ for starter configs?
**A1**: Optional - defer until after restructure. Can add later if needed.

**Q2**: What about workflow versioning?
**A2**: n8n server handles versioning. If needed, export specific versions to temp/ for reference.

**Q3**: Should reconciliation-data/ be committed?
**A3**: No - add to .gitignore. It's working directory for this migration only.

**Q4**: What if cloud state is very different from local files?
**A4**: Document in FINDINGS.md, but proceed with deletion. Cloud is truth.

## Success Metrics

**Quantitative:**
- `agents/`, `pipelines/`, `transcript-extraction/` moved to old/ (~352KB)
- Zero active local files mirroring cloud state (archived in old/)
- Test scenarios copied to supersystem/scenarios/
- 4+ how-to guides created

**Qualitative:**
- Clear cloud-first architecture
- No confusion about source of truth
- MCP tools documented and working
- Supersystem tests still functional
- New contributors understand cloud-first model

## Conclusion

This reconciliation establishes a **cloud-first portal architecture** where:
- Cloud systems (ElevenLabs, n8n) are the single source of truth
- Local repo is a control plane with testing infrastructure and documentation
- MCP tools provide cloud interaction
- No sync problem exists

The trade-off is requiring MCP tools (or direct API calls) to view cloud state, but this eliminates the dual-truth problem and creates a clearer architectural model going forward.
