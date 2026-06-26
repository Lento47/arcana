# .arcana User Space

This directory documents the proposed local user-space layout for Arcana.

It is a template for contracts, modes, policies, skills, and plugins that users can adapt to their own project.

## Layout

```txt
.arcana/
  modes.example.json
  contracts/
    safe-refactor.contract.example.json
    dependency-change.contract.example.json
  policies/
    routing.policy.example.json
  skills/
    security-review/
      SKILL.md
      contract.example.json
  plugins/
    README.md
    dependency-intent.plugin.example.ts
```

## Purpose

`.arcana/` is where user-controlled autonomy lives.

Arcana core should provide the runtime and object model.

This directory should let the user define:

```txt
how strict Arcana should be
which contracts exist
which providers are allowed
which tools are risky
which skills are available
which custom checks run
```

## Status

These files are examples and documentation templates for the Agent Operating Layer branch. Runtime support is not implemented in this branch.
