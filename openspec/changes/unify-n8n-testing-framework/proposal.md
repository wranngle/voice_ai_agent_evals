# Proposal: Unify n8n Testing Framework

**Change ID:** `unify-n8n-testing-framework`
**Status:** Draft
**Author:** Claude
**Created:** 2026-01-24

## Problem Statement

The project has **fragmented testing infrastructure** across multiple systems:

| System | Purpose | Data Source | Integration |
|--------|---------|-------------|-------------|
| Bun webhook tests | HTTP contract validation | Hardcoded fixtures | Standalone |
| ElevenLabs Test Factory | Voice agent tests (1000+) | YAML templates | ElevenLabs API |
| n8n Evaluations | Workflow validation | Google Sheets (BANNED) | n8n native |
| Workflow evaluations YAML | Test case definitions | Local YAML | None |

**Critical Issues:**
1. **Google Sheets dependency** - Banned but still referenced in evaluation setup
2. **No unified data layer** - Test cases scattered across JSON, YAML, hardcoded values
3. **No requirement traceability** - User intents not tracked to test cases
4. **No cross-system orchestration** - Can't run voice + workflow tests together
5. **No automated result aggregation** - Manual review required

## Proposed Solution

**Unified Testing Framework** with:

1. **Vitest as the Beautiful Skin**: Modern test runner with web UI, coverage, watch mode
2. **Single Data Layer**: n8n Data Tables as the ONLY test data source
3. **Requirement Tracking**: Every test case traces to a captured user requirement
4. **Multi-System Orchestration**: Run ElevenLabs, webhook, and n8n evaluation tests from one interface
5. **Automated Result Aggregation**: Central results table with cross-system metrics
6. **Extensible Architecture**: Vitest workspaces + adapter pattern for new test types

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       UNIFIED TESTING FRAMEWORK                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                    DATA LAYER (n8n Data Tables)                        │ │
│  ├──────────────────┬──────────────────┬──────────────────────────────────┤ │
│  │  Requirements    │   Test Cases     │   Test Results                   │ │
│  │  ────────────    │   ──────────     │   ────────────                   │ │
│  │  • user_intent   │   • test_id      │   • execution_id                 │ │
│  │  • requirement_id│   • requirement  │   • test_id                      │ │
│  │  • source        │   • type         │   • status (pass/fail)           │ │
│  │  • priority      │   • input        │   • actual_output                │ │
│  │  • captured_at   │   • expected     │   • latency_ms                   │ │
│  │  • status        │   • system       │   • timestamp                    │ │
│  └──────────────────┴──────────────────┴──────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                    TEST RUNNERS (Adapters)                             │ │
│  ├────────────────┬────────────────┬────────────────┬─────────────────────┤ │
│  │  Webhook       │  ElevenLabs    │  n8n Eval      │  MCP Execution      │ │
│  │  Runner        │  Runner        │  Runner        │  Runner             │ │
│  │  ──────────    │  ──────────    │  ──────────    │  ──────────         │ │
│  │  Bun + Fetch   │  Test Factory  │  Eval Node     │  n8n_test_workflow  │ │
│  │  HTTP POST     │  Native API    │  Data Table    │  MCP tools          │ │
│  └────────────────┴────────────────┴────────────────┴─────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                    ORCHESTRATION LAYER                                 │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │  • test-orchestrator.ts - Central CLI for all test execution           │ │
│  │  • Parallel execution across systems                                   │ │
│  │  • Result aggregation and reporting                                    │ │
│  │  • CI/CD integration (GitHub Actions)                                  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                    REQUIREMENT CAPTURE (Greedy)                        │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │  • Every user request → requirement record                             │ │
│  │  • Verbatim quotes preserved                                           │ │
│  │  • Auto-generates test case skeleton                                   │ │
│  │  • Tracks implementation status                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Scope

### In Scope
- Replace Google Sheets with n8n Data Tables for all evaluation data
- Unified CLI (`test-orchestrator.ts`) for running all test types
- n8n Data Tables for: Requirements, Test Cases, Test Results
- Adapters for: Webhook tests, ElevenLabs tests, n8n Evaluations, MCP execution
- Requirement capture hook (greedily extracts testable requirements from user input)
- Result aggregation dashboard (n8n workflow)
- CI/CD integration template

### Out of Scope
- UI dashboard (use n8n Data Tables UI)
- Historical trend analysis (future enhancement)
- Load testing infrastructure (separate concern)

## Success Criteria

1. **Zero Google Sheets references** - All replaced with n8n Data Tables
2. **Single command execution** - `bun run test:all` runs entire suite
3. **100% requirement traceability** - Every test links to a requirement
4. **Cross-system results** - Unified report showing webhook + ElevenLabs + n8n results
5. **Extensibility** - Adding new test type requires only implementing adapter interface

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| n8n Data Table API limitations | High | Use browser automation fallback (proven with Post-Call History table) |
| ElevenLabs API rate limits | Medium | Existing exponential backoff in test-factory |
| Test data migration effort | Low | Automated migration script from YAML/JSON sources |
| Breaking existing workflows | High | Parallel run period before cutover |

## Dependencies

- **Vitest** - Test runner with beautiful UI (to be installed)
- n8n Data Tables feature (available)
- n8n MCP tools (`n8n_test_workflow`, `n8n_executions`)
- ElevenLabs Native Testing API (in use)
- Bun runtime (in use, Vitest runs on Bun)

## Timeline Estimate

| Phase | Deliverables |
|-------|-------------|
| 0. Vitest Setup | Install, configure workspaces, migrate existing tests |
| 1. Data Layer | Create Data Tables, migrate test cases |
| 2. Adapters | Build 4 test runner adapters |
| 3. Orchestration | CLI, parallel execution, aggregation |
| 4. Requirement Capture | Greedy capture hook, traceability |
| 5. CI/CD | GitHub Actions integration |

## Related Changes

- `harden-post-call-webhook` - Uses webhook testing patterns
- `enhance-client-initiation-data` - Has evaluation setup docs
