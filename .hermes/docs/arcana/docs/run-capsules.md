# Run Capsules

A Run Capsule is Arcana's durable object for autonomous work.

It is not only a log. It is a portable execution record that can be inspected, compared, forked, exported, and eventually replayed where possible.

## One-line definition

```txt
A Run Capsule turns an agent session into a durable, inspectable, portable work object.
```

## Why it exists

Agent sessions are usually ephemeral. They disappear into chat history, terminal scrollback, or opaque cloud logs.

Arcana should preserve the work as an object:

```txt
what was asked
what was allowed
what model was used
what context was seen
what tools were called
what commands ran
what files changed
what evidence was produced
what succeeded
what failed
what should be remembered
```

## Capsule lifecycle

```txt
created
  ↓
running
  ↓
recording
  ↓
verifying
  ↓
completed | failed | rejected | abandoned
  ↓
archived | forked | exported | replayed
```

## Minimum capsule fields

```txt
id
created_at
updated_at
status
workspace
repo_snapshot
user_goal
contract_ref
route_decisions
context_sources
tool_calls
commands
file_changes
artifacts
verification
memory_receipts
errors
final_summary
```

## Conceptual schema

```ts
type RunCapsule = {
  id: string
  status: "created" | "running" | "verifying" | "completed" | "failed" | "rejected" | "abandoned"
  goal: string
  contract?: AgentContractRef
  repo: RepoSnapshot
  route: RouteDecision[]
  context: ContextSource[]
  toolCalls: ToolCallRecord[]
  commands: CommandRecord[]
  fileChanges: FileChangeRecord[]
  artifacts: ArtifactRecord[]
  verification: VerificationRecord[]
  memoryReceipts: MemoryReceipt[]
  errors: ErrorRecord[]
  summary: CapsuleSummary
}
```

This is documentation only. It does not define an implementation contract yet.

## Capsule sections

### Goal

What the user wanted.

Good:

```txt
Fix flaky auth tests without changing the public session API.
```

Weak:

```txt
Fix this.
```

### Contract reference

The Agent Contract constrains the work.

If no explicit contract exists, Arcana should eventually synthesize a lightweight implicit contract from the prompt and permissions.

### Repo snapshot

Captures the starting point:

```txt
repo path
branch
commit SHA
workspace dirty state
package manager
runtime
relevant files
```

### Route decisions

Records model/tool/provider selection.

```txt
selected model
rejected models
policy used
cost estimate
privacy constraints
reasoning summary
```

### Context sources

Records the information the agent consumed.

```txt
file snippets
search results
memory receipts
user-provided text
tool outputs
docs
summaries
```

Every context source should have provenance.

### Tool calls

Records agent tool use.

```txt
tool name
input summary
output summary
risk level
approval state
error state
```

### Commands

Records shell commands and their outcomes.

```txt
command
cwd
exit code
stdout summary
stderr summary
duration
risk label
```

### File changes

Records edits.

```txt
file path
operation
lines changed
summary
risk
```

### Artifacts

Captures generated output:

```txt
patches
reports
screenshots
logs
benchmarks
exports
```

### Verification

Records whether the work passed.

```txt
tests
lint
typecheck
contract satisfaction
manual review
security checks
dependency checks
```

### Memory receipts

Only durable, sourced facts should become memory.

Example:

```txt
Fact: this repo uses Bun as package manager
Source: package.json
Confidence: high
Scope: repo
```

## Capsule operations

Potential operations:

```sh
arcana capsule list
arcana capsule show <id>
arcana capsule inspect <id>
arcana capsule export <id>
arcana capsule compare <a> <b>
arcana capsule fork <id>
arcana capsule verify <id>
arcana capsule replay <id>
```

## What makes a capsule different from logs

| Log | Run Capsule |
|---|---|
| chronological output | structured work object |
| hard to compare | comparable by fields |
| usually local/ephemeral | exportable and portable |
| records what happened | records what happened and why |
| rarely bound to success criteria | bound to contracts and verification |
| cannot easily become memory | produces memory receipts |

## QA checklist

A Run Capsule is acceptable only if it answers:

```txt
What was the goal?
What was allowed?
What was forbidden?
What did the agent see?
What did it do?
What changed?
What did it verify?
What failed?
What evidence supports the result?
What should be remembered?
Can another person inspect it later?
```

## Failure modes

### Failure mode: audit theater

Risk:

```txt
Capsule becomes a pretty log viewer.
```

Avoid by requiring structure, comparison, export, and verification.

### Failure mode: replay overpromise

Risk:

```txt
Not every run can be exactly replayed because external APIs, time, local state, and nondeterministic models change.
```

Avoid by distinguishing:

```txt
replayable
partially replayable
inspectable only
```

### Failure mode: hidden context

Risk:

```txt
Capsule omits memory/context that influenced the run.
```

Avoid by requiring context source references.

### Failure mode: trust without evidence

Risk:

```txt
Final answer says success, but no test or verification exists.
```

Avoid by requiring verification records and marking unverifiable success as `unproven`.

## Capsule quality levels

```txt
Level 0: transcript only
Level 1: structured events
Level 2: commands + diffs + artifacts
Level 3: context + route decisions + verification
Level 4: contract-bound, comparable, exportable
Level 5: replayable/forkable with memory receipts
```

Arcana should target Level 4 first. Level 5 is aspirational and task-dependent.

## Product claim

```txt
Arcana turns sessions into capsules: durable autonomous work you can inspect, compare, fork, and trust.
```
