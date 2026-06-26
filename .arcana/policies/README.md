# Policies

This directory contains example Arcana policy files.

Policies define workspace-level rules for:

```txt
model/provider routing
tool access
memory scope
context trust
network/data exposure
locked mode allowlists
```

## Examples

- `routing.policy.example.json`
- `memory.policy.example.json`
- `context.policy.example.json`

Tool-risk policy is documented in `docs/tool-risk-model.md` instead of a JSON example for now.

## Status

These are examples for the Agent Operating Layer branch. Runtime policy loading/enforcement is not implemented in this branch.
