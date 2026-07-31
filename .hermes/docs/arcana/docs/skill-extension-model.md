# Skill Extension Model

Skills are the reusable capability layer of Arcana user space.

A skill should not be only a prompt. A skill should explain a repeatable operating behavior and optionally bind to a contract, verification guidance, failure modes, examples, and plugin hooks.

## One-line definition

```txt
An Arcana skill turns reusable know-how into an operational capability.
```

## Recommended skill folder

```txt
.arcana/skills/<skill-name>/
  SKILL.md
  contract.json
  verification.md
  failure-modes.md
  examples.md
```

## Skill layers

### `SKILL.md`

Human-readable behavior.

Defines:

```txt
purpose
mode
expected behavior
required output
forbidden behavior
quality bar
```

### `contract.json`

Machine-readable boundary.

Defines:

```txt
scope
allowed actions
forbidden actions
success criteria
verification requirements
risk escalation
```

### `verification.md`

Explains how to judge the output.

Defines:

```txt
what evidence is expected
what commands may verify it
what counts as proven vs unproven
what needs human review
```

### `failure-modes.md`

Prevents repeated bad behavior.

Defines:

```txt
common mistakes
scope mistakes
quality failures
unsafe behavior
```

### `examples.md`

Shows good and bad outputs.

Defines:

```txt
input examples
expected output examples
bad output examples
edge cases
```

## Skill metadata

`SKILL.md` should use frontmatter:

```yaml
---
name: docs-update
version: 0.1.0
mode: advise
contract: contract.json
category: documentation
---
```

## Skill quality bar

A skill is acceptable only if it answers:

```txt
What job does this skill perform?
What mode should it prefer?
What inputs does it need?
What output should it produce?
What tools may it use?
What should it never do?
How should output be verified?
What failure modes are common?
How does it attach to a Run Capsule?
```

## Skill vs prompt

| Prompt | Arcana Skill |
|---|---|
| instruction text | operational capability |
| no boundary | contract-bound |
| no verification | verification-aware |
| easy to copy badly | structured and reviewable |
| hard to trust | produces evidence and records |

## Example skills

```txt
docs-update
safe-refactor
dependency-review
release-check
support-triage
incident-summary
migration-planner
architecture-review
```

## Skill behavior across modes

```txt
observe:
  skill runs and records behavior

advise:
  skill warns when output quality or risk is weak

ask:
  skill asks before risky actions

enforce:
  skill must follow contract boundaries

locked:
  skill must be approved or allowlisted
```

## Product claim

```txt
Arcana skills are not prompt snippets. They are contract-aware capabilities users can adapt to their own work.
```
