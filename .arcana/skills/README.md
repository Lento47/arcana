# Skills

This directory contains example Arcana user-space skills.

A skill is a contract-aware reusable capability, not just a prompt.

Recommended skill layout:

```txt
.arcana/skills/<skill-name>/
  SKILL.md
  contract.json
  verification.md
  failure-modes.md
  examples.md
```

## Examples

- `secure-code-review/`

## Status

These are examples for the Agent Operating Layer branch. Runtime skill loading from `.arcana/skills` is not implemented in this branch.
