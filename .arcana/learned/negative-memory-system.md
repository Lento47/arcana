---
tags: [security, negative-memory, anti-patterns, learning, mistakes]
date: 2026-06-21
source: session-transactional-engineering
---

# Negative Memory System — Anti-Pattern Enforcement

**Rule:** Arcana stores what should NEVER be suggested again in a repo, not just what worked. Anti-patterns are checked before proposing plans, edits, or commands.

**Scope:** `.arcana/learned/` — wiki files tagged `mistake`, indexed under `## Mistakes` in [[LEARNED]]. Enforced by [[transactional-engineering-skill]].

**Trigger:** Before any plan, edit, or shell command proposal, scan `LEARNED.md` Mistakes section.

**Reason:** Current AI tools accumulate positive context but keep repeating subtle mistakes. Negative memory attacks the "almost right" tax — forbidden patterns, false friends, brittle fixes, and prior bad instincts that keep resurfacing.

**Safer alternative:** When an anti-pattern matches, block the proposal and say: "I was about to suggest X, but this repo has a negative memory against it. Here's why, and here's the safer alternative."

## Anti-Pattern Format

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

## LEARNED.md Structure

```
## Project — facts about this codebase
## Patterns — reusable techniques discovered
## Mistakes — errors made + corrections (anti-patterns)
```

Each entry is a [[wikilink]] to `.arcana/learned/{slug}.md`.

## `/anti` Command

Part of [[transactional-engineering-skill]]:
1. Read all mistakes in `LEARNED.md` > `## Mistakes`
2. List active anti-patterns with their rules
3. Check if current task touches any anti-pattern scope
4. Warn if current approach matches a known anti-pattern

## Three-Strikes Auto-Promotion

If the same mistake class appears 3 times, the skill instructs the model to automatically create an anti-pattern and notify the user.

## History

- 2026-06-21: Designed as part of transactional-engineering skill. Existing `learning.ts` already had mistakes category with wiki files, [[wikilinks]], cross-referencing. Added `/anti` command and pre-execution anti-pattern check to the skill.

## Related

- [[ghost-preview-system]] — Risk labels provide complementary safety surface
- [[prompt-injection-guard]] — Different attack vector, different defense layer
- [[confidence-decay-pipeline]] — Model trust decay is another form of negative memory
- [[transactional-engineering-skill]] — The skill that enforces anti-pattern checks

Related: [[arcana-governance-model-location]] [[arcana-shell-execution-goal-gate]] [[arcana-security-model]] [[demo-gated-actions-via-minimal-goal]] [[shell-run-before-binding-goal]] [[arcana-evalcondition-bypass]] [[arcana-audit-baseline]] [[governed-codebase-audit-method]]
