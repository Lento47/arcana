# ADR 0001: Agent Operating Layer

## Status

Proposed

## Context

Most AI coding tools are session-oriented. A user asks for work, the agent acts, and the result exists as chat history, terminal output, local file changes, or tool logs.

That model is useful, but weak for serious autonomous work because it does not consistently answer:

```txt
What was the boundary?
What context was used?
Which model/provider touched the data?
What changed?
What verification passed?
What remains unproven?
What should be remembered?
Can this work be inspected or replayed later?
```

Arcana's product direction requires more than an agent interface. It requires an operating layer for autonomous work.

## Decision

Arcana will model autonomous work through durable objects:

```txt
Agent Contract
Run Capsule
Context Source
Memory Receipt
Route Decision
Verification Record
Plugin Decision
Skill Artifact
```

Arcana will also support user-space configuration:

```txt
CONTRACTS.md
.arcana/modes.json
.arcana/contracts/*.contract.json
.arcana/policies/*.policy.json
.arcana/skills/*/SKILL.md
.arcana/plugins/*.ts
```

Arcana will support progressive autonomy modes:

```txt
observe → advise → ask → enforce → locked
```

## Consequences

### Positive

```txt
agent work becomes inspectable
agent work becomes portable
agent work can be bounded by contracts
verification can separate proven from unproven
users can define their own autonomy model
enterprise strictness can exist without becoming the default
plugins can extend Arcana without forking core
```

### Tradeoffs

```txt
more structure than a simple agent CLI
more concepts for users to learn over time
requires careful UX to avoid bureaucracy
requires schema discipline before runtime implementation
```

### Risks

```txt
object model becomes too abstract
strict mode becomes annoying if defaulted too early
plugins become hidden policy if not recorded
capsules become logs instead of operational objects
```

## Mitigations

```txt
default to advise, not enforce
make every block show recovery options
record plugin decisions in capsules
use CONTRACTS.md for human-readable explanations
keep user-space local-first
ship adoption levels gradually
```

## Product statement

```txt
Arcana core provides the operating layer.
Users own their autonomy model.
```

## Decision summary

```txt
We will not build Arcana as only an AI coding CLI.
We will build Arcana as a terminal-native operating layer for autonomous work.
```
