---
name: transactional-engineering
description: >
  Proof-driven engineering discipline. Every AI action leaves a trace — shell commands
  show risk before execution, file changes are logged, verification steps are explicit,
  and completed work produces a brief with evidence. Turns AI-assisted coding from
  "vibes" into verifiable engineering transactions.
  Use when the user asks for /prove, /brief, /ledger, /contract, or says "be careful",
  "track everything", "show your work", "security review", "production change".
platforms: [linux, macos, windows]
version: 1.0.0
author: arcana
license: MIT
category: arcana
metadata:
  arcana:
    tags: [security, evidence, audit, verification, quality]
---

# Transactional Engineering

Treat every AI-assisted change as a verifiable transaction. No invisible actions. No "trust me" vibes.

## Principles

1. **Intent before action.** Declare what you're about to do and what success looks like.
2. **Risk before execution.** For shell commands that modify state (install, delete, move, permission changes), show risk level before running.
3. **Evidence after action.** Every significant change leaves a record: what was read, what was written, what was run, what passed.
4. **Verify before claim.** Don't claim "done" without test output, diff review, or explicit verification.
5. **Brief on completion.** Summarize: goal, what changed, evidence, remaining risks.

## Risk Labels

For every shell command that modifies state, prepend a risk label:

```
[SAFE]     Read-only, no side effects (cat, ls, grep, git status, git diff, git log)
[WRITE]    Modifies files in workspace (write, edit, git add, git commit)
[MUTATE]   Changes system state outside workspace (npm install, pip install, apt, brew)
[DANGER]   Destructive or irreversible (rm -rf, drop table, force push, curl | sh)
[NETWORK]  Contacts external services (curl, fetch, API calls)
```

Command format: `[RISK] description of intent → \`the command\``

Example:
```
[WRITE] Commit the prompt injection guard fix → git commit -m "security: untrusted-data guard on file reads"
```

## Evidence Log

At the end of a significant task, produce a compact evidence block:

```
## Evidence

**Goal:** <one-line goal>

**Changed:**
- `path/to/file.ts` (2 insertions, 1 deletion)

**Commands run:** 4 (0 failures)
**Tests:** 3 passed, 0 failed
**Policy violations:** 0
**Files outside scope touched:** 0

**Remaining risks:**
- <risk or "none">
```

## /prove Command

When the user invokes `/prove`:
1. List every file touched during this session
2. Show the diff
3. Run any available tests related to the changes
4. Check for policy violations (secrets in code, files outside scope)
5. Output the evidence block

## /brief Command

When the user invokes `/brief`:
1. Summarize the goal and outcome in 2-3 sentences
2. List changed files with brief purpose
3. Show test results
4. Output a suggested commit message (Conventional Commits format)
5. Flag any remaining risks or follow-up items

## /contract Command

When the user invokes `/contract "description"`:
1. Restate the goal clearly
2. List acceptance criteria (what "done" means)
3. Declare scope boundaries (allowed files, forbidden operations)
4. State verification plan (which tests, what to check)
5. Get explicit user approval before starting work

## Edge Cases

- **No tests exist:** Note it, don't fake it. Flag as a risk.
- **Command failed:** Log the failure, show the error, do not silently retry.
- **File outside scope:** Flag it, ask. Don't silently touch.
- **Secrets detected:** Block and warn. Never commit credentials.
- **Ambiguous goal:** Ask the user to sharpen the contract before proceeding.
