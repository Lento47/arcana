---
name: transactional-engineering
description: >
  Proof-driven engineering with negative memory. Every AI action leaves a trace — shell
  commands show risk before execution, anti-patterns from past mistakes block bad
  suggestions before they happen, and completed work produces a brief with evidence.
  Turns AI-assisted coding from "vibes" into verifiable, self-correcting transactions.
  Use when the user asks for /prove, /brief, /anti, /ledger, /contract, or says
  "be careful", "track everything", "show your work", "security review", "production change".
platforms: [linux, macos, windows]
version: 1.0.0
author: arcana
license: MIT
category: arcana
metadata:
  arcana:
    tags: [security, evidence, audit, verification, quality, negative-memory, anti-patterns]
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

## /recap — Session Startup Recap

When starting a new session, check if a prior session exists. If so, produce a compact recap of what was done and what's pending:

### Procedure

1. Read `LEARNED.md` to find recent wiki entries (last session's learnings)
2. Run `git log --oneline -10` to show recent commits
3. Run `git diff --stat HEAD~1` to show last change scope
4. Format as a compact block before beginning work

### Format

```
## Since last session

**Last worked on:** <date> — <1-line summary from LEARNED.md>
**Files changed:** <count> (git diff --stat summary)
**Active goals:** <any incomplete goals from last session>
**Recent anti-patterns:** <any new mistakes recorded>

**Resume?** <suggested next action or "nothing pending">
```

### Controlling Recap

- `/recap` — show recap now (mid-session)
- `/recap off` — suppress recap for this project (writes `.arcana/.norecap`)
- `/recap on` — re-enable recap
- If `.arcana/.norecap` exists, skip recap on startup.

### Edge Cases

- **First session in project:** No recap. Just start.
- **No previous LEARNED.md:** Skip, note "fresh project."
- **Recap too long:** Truncate to last 3 topics. Link to LEARNED.md for full context.

## /contract Command

When the user invokes `/contract "description"`:
1. Restate the goal clearly
2. List acceptance criteria (what "done" means)
3. Declare scope boundaries (allowed files, forbidden operations)
4. State verification plan (which tests, what to check)
5. Get explicit user approval before starting work

## Negative Memory — Anti-Patterns

Arcana stores anti-patterns in `.arcana/learned/` as wiki files tagged `mistake` and indexed under `## Mistakes` in `LEARNED.md`. Before proposing any plan, edit, or shell command, scan this section.

### Anti-Pattern Format

Each anti-pattern wiki file should contain:

```markdown
---
tags: [mistake, <technology>, <subsystem>]
date: YYYY-MM-DD
---

# <slug>

**Rule:** <one-line prohibition — what must NEVER be done>
**Scope:** <files, subsystems, or situations this applies to>
**Trigger:** <what to watch for before suggesting this>
**Reason:** <why it's wrong — what broke before>
**Safer alternative:** <what to do instead>

## History
- Date: what happened, what was the fix.
```

### Before Acting

Read `LEARNED.md` Mistakes section. For each proposed action, ask:

1. Does any anti-pattern match this file path or subsystem?
2. Does any anti-pattern match this command or pattern?
3. Has this exact mistake been recorded?

If yes: **block and explain.** Say "I was about to suggest X, but this repo has a negative memory against it. Here's why, and here's the safer alternative."

### /anti Command

When the user invokes `/anti`:
1. Read all mistakes in `LEARNED.md` > `## Mistakes`
2. List active anti-patterns with their rules
3. Check if the current task touches any anti-pattern scope
4. Warn if the current approach matches a known anti-pattern

### Creating Negative Memory

After a failure or reversal:
- The user says "no, not like that" or reverts a change → offer to create an anti-pattern.
- Format: "Should I save this as a negative memory? Arcana will never suggest this pattern here again."
- If the same mistake class appears 3 times, automatically create an anti-pattern and notify the user.
- Anti-patterns are version-controlled — they travel with the repo.

### Checking Before Proposing Code

Before generating code or commands, check anti-patterns and state:

```
[ANTI CHECK]
- Checked 4 active anti-patterns in this repo
- 0 matches for current proposal
- Proceeding.
```

Or:

```
[ANTI BLOCK]
- Anti-pattern match: "never use left-pad in this project"
- Reason: caused a production outage on 2026-03-15
- Safer alternative: use native String.padStart()
- Skipping this approach. Suggesting the safe alternative instead.
```

## Edge Cases

- **No tests exist:** Note it, don't fake it. Flag as a risk.
- **Command failed:** Log the failure, show the error, do not silently retry.
- **File outside scope:** Flag it, ask. Don't silently touch.
- **Secrets detected:** Block and warn. Never commit credentials.
- **Ambiguous goal:** Ask the user to sharpen the contract before proceeding.
- **Anti-pattern not in LEARNED.md yet:** Scan `.arcana/learned/` directly — MOC may be stale.
