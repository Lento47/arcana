# Object Schema Drafts

This document defines draft shapes for Arcana's Agent Operating Layer objects.

These are not runtime schemas yet. They are implementation planning artifacts.

## Schema status

```txt
Status: draft
Purpose: align implementation design before code
Runtime validation: not implemented in this branch
```

## AgentContract

```json
{
  "name": "safe-refactor",
  "version": "0.1.0",
  "mode": "advise",
  "goal": "Refactor code without changing public behavior.",
  "scope": {
    "read": ["packages/**"],
    "write": ["packages/**/src/**", "packages/**/test/**"]
  },
  "allowed": ["read_files", "edit_source_files", "run_local_tests"],
  "forbidden": ["add_dependency", "delete_tests", "deploy"],
  "success": ["relevant_tests_pass", "no_public_api_change"],
  "verification": {
    "requiredForProvenSuccess": true,
    "commands": ["bun run typecheck", "bun test"]
  },
  "budget": {
    "maxFilesChanged": 12,
    "maxPatchLines": 600,
    "maxRetries": 2
  },
  "risk": {
    "default": "medium",
    "escalateOn": ["lockfile_change", "delete_operation"]
  }
}
```

Required fields:

```txt
name
version
goal
scope
allowed
forbidden
success
verification
```

## RunCapsule

```json
{
  "id": "run_123",
  "status": "completed",
  "proofStatus": "unproven",
  "mode": "advise",
  "goal": "Refactor route handling code.",
  "contract": "safe-refactor",
  "repo": {
    "branch": "agent-operating-layer",
    "commit": "abc123",
    "dirty": true
  },
  "routeDecisions": ["route_123"],
  "contextSources": ["ctx_123"],
  "commands": ["cmd_123"],
  "fileChanges": ["change_123"],
  "verificationRecords": ["verify_123"],
  "memoryReceipts": [],
  "summary": "Edited route handling and recorded verification status."
}
```

Required fields:

```txt
id
status
proofStatus
mode
goal
repo
summary
```

## RouteDecision

```json
{
  "id": "route_123",
  "policy": "local-first",
  "task": "summarize repository architecture",
  "selected": {
    "provider": "local",
    "model": "local-coder",
    "dataExposure": "local"
  },
  "rejected": [
    {
      "provider": "external",
      "reason": "local-first policy preferred local route for low-risk summary"
    }
  ],
  "reason": "Task is low-risk and local route is sufficient.",
  "risk": "low"
}
```

Required fields:

```txt
id
policy
task
selected
reason
risk
```

## VerificationRecord

```json
{
  "id": "verify_123",
  "kind": "test",
  "required": true,
  "status": "skipped",
  "command": "bun test",
  "evidence": [],
  "skipReason": "User requested documentation-only run.",
  "confidence": "low"
}
```

Allowed statuses:

```txt
planned
running
passed
failed
skipped
inconclusive
```

## MemoryReceipt

```json
{
  "id": "memory_123",
  "fact": "This repo uses Bun as package manager.",
  "source": {
    "type": "file",
    "ref": "package.json#packageManager"
  },
  "scope": "repo",
  "confidence": "high",
  "status": "active",
  "relatedRuns": ["run_123"]
}
```

Memory must always include:

```txt
fact
source
scope
confidence
status
```

## ContextSource

```json
{
  "id": "ctx_123",
  "sourceType": "file",
  "sourceRef": "packages/core/src/session.ts",
  "summary": "Session orchestration and execution state handling.",
  "trust": "trusted",
  "staleness": "fresh",
  "selectionReason": "Relevant to requested refactor.",
  "relatedRun": "run_123"
}
```

Context must always include:

```txt
sourceType
sourceRef
summary
trust
staleness
selectionReason
```

## PluginDecision

```json
{
  "kind": "risk",
  "risk": "medium",
  "message": "Dependency change detected. Intent should be recorded.",
  "evidence": {
    "files": ["package.json", "bun.lock"],
    "packages": ["cron-parser"]
  },
  "modeBehavior": {
    "observe": "record",
    "advise": "warn",
    "ask": "confirm",
    "enforce": "block_unless_contract_allows",
    "locked": "block_unless_allowlisted"
  }
}
```

Plugin decisions should not silently enforce. Arcana mode decides how to apply them.

## SkillMetadata

```yaml
---
name: docs-update
version: 0.1.0
mode: advise
contract: contract.json
category: documentation
---
```

Required metadata:

```txt
name
version
mode
category
```

## Cross-object composition

```txt
AgentContract defines boundary.
RouteDecision explains model/provider path.
ContextSource explains input provenance.
RunCapsule records execution.
VerificationRecord proves or weakens outcome.
MemoryReceipt captures durable sourced facts.
PluginDecision annotates custom risk or behavior.
```

## Implementation note

The first implementation should start append-only:

```txt
run.started
mode.selected
contract.loaded
route.selected
context.selected
command.completed
file.changed
verification.recorded
plugin.decision
memory.proposed
run.completed
```

Objects can be projections over events before they become stable database tables.
