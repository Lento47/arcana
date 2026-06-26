# End-to-End Examples

This document shows how Arcana's Agent Operating Layer should work across realistic user flows.

These examples are documentation only. Runtime implementation is not added in this branch.

## Core flow

```txt
contract → mode → route → execute → record → verify → remember → replay
```

Arcana should turn a vague task into structured autonomous work without forcing strict governance unless the selected mode requires it.

## Example 1: Safe refactor

User intent:

```txt
Refactor the route handling code without changing public behavior.
```

Selected contract:

```txt
safe-refactor
```

Selected mode:

```txt
advise
```

Flow:

```txt
1. Arcana loads safe-refactor contract.
2. Arcana selects advise mode.
3. Arcana records a Route Decision.
4. Agent reads source and tests.
5. Agent edits scoped source/test files.
6. Arcana records file changes into a Run Capsule.
7. Arcana runs or records requested verification.
8. If verification passes, status is proven for declared criteria.
9. If verification is missing, status is unproven.
10. Arcana may propose Memory Receipts for durable repo facts.
```

Expected output:

```txt
Run: completed
Proof: proven | unproven
Contract: safe-refactor
Mode: advise
Scope: respected
Verification: typecheck/test recorded
Capsule: available
```

## Example 2: Dependency change

User intent:

```txt
Add a package to parse cron expressions.
```

Selected contract:

```txt
dependency-change
```

Selected mode:

```txt
ask
```

Flow:

```txt
1. Arcana detects package.json/bun.lock changes.
2. Dependency intent plugin emits risk=medium.
3. In ask mode, Arcana requests confirmation before proceeding.
4. User confirms or cancels.
5. Arcana records dependency intent questions and answers.
6. Verification records install/typecheck/test status.
7. Run Capsule records package change, intent, risk, and verification.
```

Expected confirmation:

```txt
This adds a dependency and changes the lockfile.
Risk: medium.
Proceed and record dependency intent? [y/N]
```

Expected capsule fields:

```txt
dependency added
intent recorded
alternatives considered
license metadata reviewed if available
verification status
```

## Example 3: Docs update

User intent:

```txt
Update the README to explain Arcana's autonomy modes.
```

Selected contract:

```txt
docs-update
```

Selected mode:

```txt
advise
```

Flow:

```txt
1. Arcana loads docs-update contract.
2. Writes are restricted to docs and markdown files.
3. Code changes trigger warning or block depending on mode.
4. Verification may be review-based rather than test-based.
5. Capsule records changed docs and summary.
```

Expected behavior:

```txt
Fast, permissive, low interruption.
```

## Example 4: Release check

User intent:

```txt
Prepare this branch for release.
```

Selected contract:

```txt
release-check
```

Selected mode:

```txt
enforce
```

Flow:

```txt
1. Arcana loads release-check contract.
2. Release-sensitive files are inspected.
3. Required verification is planned.
4. Publishing/deploy actions are forbidden unless explicitly approved.
5. Missing verification blocks proven success.
6. Capsule records release readiness and blocked items.
```

Expected status examples:

```txt
completed + unproven:
  release checks were not run

completed + proven:
  required checks passed

blocked:
  publish/deploy attempted without approval
```

## Example 5: Secure code review

User intent:

```txt
Review authentication-related code for realistic security risks and remediation guidance.
```

Selected skill:

```txt
secure-code-review
```

Selected mode:

```txt
ask
```

Flow:

```txt
1. Arcana loads secure-code-review skill and contract.
2. Contract is read-only by default.
3. External provider route may require confirmation for sensitive files.
4. Findings are separated into confirmed risks and hypotheses.
5. Output includes evidence, confidence, impact, and remediation.
6. Capsule records context sources, route decision, and review output.
```

Expected behavior:

```txt
Evidence-backed review, no destructive actions, no hidden data exposure.
```

## Example 6: Locked local-only run

User intent:

```txt
Summarize proprietary code in a client environment.
```

Selected mode:

```txt
locked
```

Selected routing policy:

```txt
locked-local
```

Flow:

```txt
1. Arcana allows only local model/tool routes.
2. External provider candidates are rejected.
3. Rejection is recorded as a Route Decision.
4. Capsule records local-only execution.
5. No unapproved tool or provider is used.
```

Expected denial:

```txt
Denied by locked policy.
Reason: external provider is not allowlisted.
Recovery: use local route or revise approved policy.
```

## What these examples prove

```txt
Arcana can be permissive for low-risk work.
Arcana can ask at risk boundaries.
Arcana can enforce contracts when needed.
Arcana can lock down for sensitive environments.
Arcana records work consistently across all modes.
```

## Product claim

```txt
Arcana adapts to the user's case: fast for safe work, careful for risky work, strict for controlled work.
```
