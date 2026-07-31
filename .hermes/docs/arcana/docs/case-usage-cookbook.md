# Case Usage Cookbook

This cookbook shows how different users can shape Arcana without changing Arcana core.

Each case defines a recommended mode, contracts, policies, skills, plugins, verification, and memory rules.

## Core principle

```txt
Arcana ships the operating layer. Users own the autonomy model.
```

## Solo founder

Goal:

```txt
move fast, keep risk visible, avoid heavy process
```

Recommended setup:

```txt
mode: advise
contracts:
  safe-refactor
  docs-update
  dependency-change
policies:
  local-first for summaries
  approved external route for complex coding
plugins:
  dependency-intent
verification:
  typecheck/test when code changes
memory:
  repo-scoped sourced facts only
```

Best behavior:

```txt
warn clearly, continue by default, record capsules
```

## Open-source maintainer

Goal:

```txt
protect project quality while allowing contributor-friendly automation
```

Recommended setup:

```txt
mode: ask
contracts:
  docs-update
  safe-refactor
  dependency-change
policies:
  dependency changes require intent
  release files require release-check contract
plugins:
  dependency-intent
  license-review
verification:
  tests and typecheck for code changes
memory:
  repo facts only, no contributor personal data
```

Best behavior:

```txt
ask before lockfile changes, external routes, or release-sensitive edits
```

## Enterprise team

Goal:

```txt
support controlled autonomous work across a shared codebase
```

Recommended setup:

```txt
mode: enforce
contracts:
  safe-refactor
  release-check
  dependency-change
policies:
  enterprise-approved routing
  approved tools only
  memory scoped by workspace
plugins:
  internal policy checker
  custom verifier
verification:
  required for proven success
memory:
  sourced, scoped, reviewable
```

Best behavior:

```txt
block policy violations and show approved recovery paths
```

## Locked customer environment

Goal:

```txt
run autonomy in a sensitive or regulated environment
```

Recommended setup:

```txt
mode: locked
contracts:
  approved contracts only
policies:
  locked-local routing
  allowlisted tools
  approved plugins only
plugins:
  signed or approved only
verification:
  required before completion
memory:
  approved local memory only
```

Best behavior:

```txt
allow only pre-approved routes, tools, and contracts
```

## Support engineer

Goal:

```txt
summarize cases, logs, and reproduction steps without losing evidence
```

Recommended setup:

```txt
mode: advise
contracts:
  support-triage
  incident-summary
policies:
  redact sensitive customer data
  local/private route for logs
plugins:
  log redaction checker
  evidence completeness checker
verification:
  human review
memory:
  case-scoped only
```

Best behavior:

```txt
preserve evidence references, avoid storing sensitive raw logs
```

## Release manager

Goal:

```txt
prepare reliable releases without accidental publishing or missing checks
```

Recommended setup:

```txt
mode: enforce
contracts:
  release-check
policies:
  no publish/deploy without explicit approval
  release files require verification
plugins:
  release safety checker
verification:
  build, typecheck, tests, changelog review
memory:
  release process facts only
```

Best behavior:

```txt
block release-sensitive actions unless the release contract allows them
```

## Documentation maintainer

Goal:

```txt
update docs quickly while preventing accidental code changes
```

Recommended setup:

```txt
mode: advise
contracts:
  docs-update
policies:
  markdown/docs writes only
plugins:
  link checker
verification:
  docs review or link check
memory:
  docs architecture facts with source references
```

Best behavior:

```txt
fast, low interruption, warn if code changes appear
```

## Local-only developer

Goal:

```txt
use Arcana without exposing code to external providers
```

Recommended setup:

```txt
mode: ask or locked
contracts:
  safe-refactor
  docs-update
policies:
  locked-local or local-first
plugins:
  route checker
verification:
  local commands only
memory:
  local repo-scoped memory
```

Best behavior:

```txt
route locally by default and explain any external candidate rejection
```

## How to create a new case

Use this checklist:

```txt
1. choose default mode
2. define safe work
3. define risky work
4. define forbidden work
5. create one or more contracts
6. define routing policy
7. define verification expectations
8. define memory/context rules
9. add plugins only if needed
10. write CONTRACTS.md explanation
```

## Product claim

```txt
Arcana is user-shaped autonomy: one operating layer, many case models.
```
