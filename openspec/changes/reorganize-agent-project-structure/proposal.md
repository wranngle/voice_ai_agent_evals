# Change: Reorganize Agent Project Structure

## Why

The voice_ai_agents project has accumulated 100+ archived files scattered across multiple directories, creating organizational complexity and developer confusion. Active production files (agents/example-agent/, pipelines/, supersystem/) are mixed with obsolete artifacts in the `old/` directory, which contains:
- **8 files** of superseded Sarah agent configs (agents-example-agent-archive/)
- **24 files** for an inactive legacy agent (agents-legacy-archive/ + example-garage-original/)
- **4 files** of old n8n workflows (pipelines-archive/)
- **8 files** of debugging artifacts (debug-dumps/)
- **14+ files** of historical test results (supersystem-test-results/)
- **30+ files** of temporary development artifacts (temp-files/)
- **4 standalone Sarah prompt files** that have been consolidated into tech-spec.md

This creates maintenance overhead and makes it unclear which files are authoritative. The agent-registry.yaml also references a "example-garage" agent that has no corresponding active directory structure.

## What Changes

- **REMOVED** `old/` directory entirely (~100 files, ~50MB)
- **CONSOLIDATED** All Sarah/ExampleCo documentation into centralized location
- **CLEANED** Root directory to contain only active project infrastructure
- **UPDATED** agent-registry.yaml to remove inactive legacy agent reference
- **DOCUMENTED** Decision log explaining the reorganization rationale

### Specific Actions

**Files to Delete (old/ directory):**
- `old/agents-example-agent-archive/` - 8 files (superseded by agents/example-agent/)
- `old/agents-legacy-archive/` - 12 files (no active development)
- `old/example-garage-original/` - 12 files (duplicate of above)
- `old/pipelines-archive/` - 4 files (superseded versions)
- `old/debug-dumps/` - 8 files (debugging artifacts only)
- `old/supersystem-test-results/` - 14+ files (historical data)
- `old/temp-files/` - 30+ files (temporary artifacts)
- `old/root-cleanup/` - 3 files (obsolete scripts)
- `old/example-agent-*.md` - 4 files (merged into tech-spec.md)
- `old/send-sms-tool.json` - 1 file (integrated into pipelines)

**Registry Updates:**
- Remove or mark inactive: `example-garage` agent entry (no agents/example-garage/ exists)
- Update comments to reflect current structure

**Files to Keep (active infrastructure):**
```
voice_ai_agents/
├── agents/example-agent/          ✅ Production agent (3 files)
├── pipelines/             ✅ Active n8n workflows (9 files)
├── supersystem/           ✅ Testing framework (300+ files)
├── transcript-extraction/ ✅ Post-call processing
├── templates/             ✅ Reusable components
├── openspec/              ✅ Change management
├── docs/                  ✅ API documentation
├── env/                   ✅ Cloud-first configs
├── workflows/             ✅ Workflow orchestration
└── [root configs]         ✅ Package.json, tsconfig, etc.
```

## Impact

- **Affected specs**: None (purely organizational, no functional changes)
- **Affected code**: No code changes, only file deletions
- **Affected systems**: Git repository cleanup, no runtime impact
- **Breaking changes**: None - only removes archived/unused files
- **Developer experience**: Significantly improved clarity on authoritative files

## Risk Assessment

**Low Risk:**
- All files in `old/` are superseded or archived
- No active code depends on these files
- Git history preserves complete file history
- Can rollback via git if needed

**Benefits:**
- Clearer project structure for new contributors
- Faster file searches and navigation
- Reduced cognitive load understanding what's active
- Git operations (clone, status, diff) faster with fewer files
