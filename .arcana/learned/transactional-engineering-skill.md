---
tags: [skill, transactional-engineering, prove, brief, anti, contract, recap]
date: 2026-06-21
source: session-proof-driven-engineering
---

# Transactional Engineering Skill

**Rule:** Lazy skill (no engine changes) that teaches the model proof-driven engineering discipline. Every AI action leaves a trace, shell commands show risk before execution, and completed work produces a brief with evidence.

**Scope:** `skills/arcana/transactional-engineering/SKILL.md` — markdown skill file with YAML frontmatter.

**Trigger:** User invokes `/prove`, `/brief`, `/recap`, `/anti`, `/contract`, or says "be careful", "track everything", "show your work", "security review", "production change".

## Commands

### `/prove`
1. List every file touched during this session
2. Show the diff
3. Run any available tests related to the changes
4. Check for policy violations (secrets in code, files outside scope)
5. Output the evidence block

### `/brief`
1. Summarize the goal and outcome in 2-3 sentences
2. List changed files with brief purpose
3. Show test results
4. Output a suggested commit message (Conventional Commits format)
5. Flag any remaining risks or follow-up items

### `/recap`
- Startup recap: read `LEARNED.md`, `git log --oneline -10`, `git diff --stat HEAD~1`
- Show: last worked on, files changed, active goals, recent anti-patterns
- `/recap off` — suppress recap (writes `.arcana/.norecap`)
- `/recap on` — re-enable

### `/anti`
- Read all mistakes in `LEARNED.md` > `## Mistakes`
- List active anti-patterns with their rules
- Check if current task touches any anti-pattern scope
- Warn if current approach matches a known anti-pattern

### `/contract "description"`
1. Restate the goal clearly
2. List acceptance criteria (what "done" means)
3. Declare scope boundaries (allowed files, forbidden operations)
4. State verification plan (which tests, what to check)
5. Get explicit user approval before starting work

## Risk Labels (Skill-Level)

The skill teaches the model to prepend risk labels to state-mutating shell commands:
- `[SAFE]` — Read-only, no side effects
- `[WRITE]` — Modifies files in workspace
- `[MUTATE]` — Changes system state outside workspace
- `[DANGER]` — Destructive or irreversible
- `[NETWORK]` — Contacts external services

## Evidence Log Format

After task completion, the skill produces:
```
## Evidence
**Goal:** <one-line goal>
**Changed:** <file list with insertions/deletions>
**Commands run:** 4 (0 failures)
**Tests:** 3 passed, 0 failed
**Policy violations:** 0
**Files outside scope touched:** 0
**Remaining risks:** <risk or "none">
```

## Anti-Pattern Enforcement

Before proposing any plan, edit, or shell command, scan `LEARNED.md` > `## Mistakes`. If found: block and explain with safer alternative. Three-strikes auto-promotion of repeating mistakes.

## History

- 2026-06-21: Created as lazy skill (no engine divergence). Implements proof-driven engineering concept from research analysis of what developers actually need from AI tools.

## Related

- [[ghost-preview-system]] — Engine-level implementation of the same risk/confidence concepts
- [[negative-memory-system]] — Anti-patterns enforced by `/anti` command
- [[confidence-decay-pipeline]] — Model trust tracking complementing the skill
