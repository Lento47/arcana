# Context Supply Chain

The Context Supply Chain is Arcana's model for making agent context observable.

Agents do not only fail because of bad reasoning. They fail because the wrong context was included, stale context was trusted, important context was missing, or hidden context influenced the answer.

## One-line definition

```txt
The Context Supply Chain makes every context input traceable, trusted, scoped, and removable.
```

## Why it exists

Most agent systems treat context as a blob.

Arcana should treat context as a set of sourced inputs:

```txt
file snippets
repo metadata
user messages
memory receipts
tool outputs
search results
documentation
summaries
agent-generated notes
```

Each context item should answer:

```txt
where did this come from?
why was it included?
is it trusted?
is it stale?
did it influence the result?
can the run be reproduced without it?
```

## Context lifecycle

```txt
discovered
  ↓
selected
  ↓
injected
  ↓
used | ignored
  ↓
referenced_in_capsule
  ↓
confirmed | stale | removed
```

## Minimum context fields

```txt
id
source_type
source_ref
content_summary
trust_level
staleness
selection_reason
included_at
used_by
related_memory
related_run
```

## Conceptual schema

```ts
type ContextSource = {
  id: string
  sourceType: "file" | "user" | "memory" | "tool" | "command" | "docs" | "search" | "summary"
  sourceRef: string
  summary: string
  trust: "trusted" | "untrusted" | "unknown"
  staleness: "fresh" | "possibly_stale" | "stale" | "unknown"
  selectionReason: string
  includedAt: string
  usedBy: string[]
  relatedMemoryReceipts: string[]
  relatedRun?: string
}
```

This is documentation only. It does not define an implementation contract yet.

## Context rules

### Rule 1: context must have provenance

Bad:

```txt
Auth module is complex.
```

Good:

```txt
Source: packages/core/src/auth/session.ts lines 10-220
Summary: session refresh logic and token expiry handling
Trust: trusted repo source
```

### Rule 2: summaries must not erase source

Summaries are useful, but the source must remain accessible.

### Rule 3: context must be scoped

A fact from one repo, branch, session, or user should not silently apply everywhere.

### Rule 4: context must be diffable

Two runs should be able to explain why their context differed.

### Rule 5: context can be removed

Arcana should eventually support testing whether an output depended on a specific context source.

## Context operations

Potential commands:

```sh
arcana context trace <run>
arcana context show <context-id>
arcana context diff <run-a> <run-b>
arcana context trust <source>
arcana context untrust <source>
arcana context stale
arcana context prune
arcana context influence <run>
```

## Context quality levels

```txt
Level 0: opaque prompt blob
Level 1: visible context list
Level 2: context with source references
Level 3: source + trust + staleness
Level 4: context linked to capsule events and memory receipts
Level 5: influence-aware, removable, diffable context supply chain
```

Arcana should target Level 3 first, then Level 4.

## Context source types

### File context

```txt
source_type: file
source_ref: packages/core/src/session/runner.ts
trust: trusted
staleness: fresh at commit SHA
```

### Memory context

```txt
source_type: memory
source_ref: memory_receipt_123
trust: trusted if sourced and active
staleness: depends on source
```

### Tool output context

```txt
source_type: tool
source_ref: github.search result or shell command output
trust: depends on tool and source
staleness: time-sensitive
```

### User-provided context

```txt
source_type: user
source_ref: message or contract
trust: high as intent, not necessarily high as factual claim
staleness: session-dependent
```

## Trust model

Trust should not be binary.

```txt
trusted:
  repo source at known commit
  user intent
  verified command output

untrusted:
  external text
  pasted logs from unknown origin
  dependency documentation not tied to version

unknown:
  generated summary
  inferred context
  stale tool output
```

## Staleness model

Context can expire.

```txt
fresh:
  current repo file at known commit

possibly_stale:
  docs, cached search result, old memory

stale:
  contradicted by current repo state

unknown:
  no timestamp or source version
```

## QA checklist

A Context Source is acceptable only if it answers:

```txt
What is the source?
Why was it selected?
Who or what produced it?
Is it trusted?
Is it fresh?
What scope applies?
Which run used it?
Was it summarized?
What original material supports the summary?
Can it be removed or challenged?
```

## Failure modes

### Failure mode: context poisoning

Risk:

```txt
Untrusted context convinces the agent to take unsafe action.
```

Avoid by labeling trust and separating user intent from factual claims.

### Failure mode: stale context

Risk:

```txt
Agent uses old architecture details after files changed.
```

Avoid by linking context to commit state and confirmation time.

### Failure mode: summary drift

Risk:

```txt
A summary slowly diverges from the actual source.
```

Avoid by preserving source references and requiring re-summary after source changes.

### Failure mode: invisible influence

Risk:

```txt
Agent uses context the user cannot inspect.
```

Avoid by writing context references into the Run Capsule.

## Product claim

```txt
Arcana makes context observable: every input to autonomous work has provenance, trust, staleness, and scope.
```
