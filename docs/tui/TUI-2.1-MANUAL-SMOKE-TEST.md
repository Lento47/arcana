# TUI-2.1 Manual Smoke Test Plan

**Branch:** `phase-d-implementation`  
**Commit:** `ae1a6333`  
**Date:** 2026-07-30  

---

## Prerequisites

```bash
cd /l/PROJECTS/arcana
bun run dev:tui
```

Open the TUI in a terminal at ~120 columns for the initial test.

---

## Phase 1: Startup Verification

### 1.1 Clean startup
- [ ] TUI opens without crash
- [ ] No stale "OpenCode" branding visible
- [ ] Command spine renders existing session entries
- [ ] Prompt is usable
- [ ] No raw object output visible

**Expected:** Clean command spine with messages, no approval entries visible (no pending approvals yet).

---

## Phase 2: Trigger Approval

### 2.1 Create an approval-required action
Trigger any action that requires approval (e.g., a consequential tool call that needs capability approval).

- [ ] A new entry appears in the command spine
- [ ] Entry glyph: `◤` (approve)
- [ ] Entry label: `approval required`
- [ ] Entry summary: `<hash-prefix> · exact request required`
- [ ] Entry is expanded by default
- [ ] Entry appears once (no duplicate)

### 2.2 Select the approval
- [ ] Press `j`/`k` to navigate to the approval entry
- [ ] Entry becomes focused (highlighted)
- [ ] Focus does not shift when scrolling past non-navigable entries

---

## Phase 3: Inspector

### 3.1 Open inspector
- [ ] Press `v` on the focused approval
- [ ] Inspector opens showing complete values:
  - Approval ID
  - Version (should be 1)
  - State: PENDING
  - Session ID
  - Workspace ID
  - Full request hash (not truncated)
  - Contract revision
  - Expiry time

### 3.2 Close inspector
- [ ] Press `Esc`
- [ ] Inspector closes
- [ ] Focus returns to the approval entry (or clears)
- [ ] Prompt regains usability

---

## Phase 4: Approval Lifecycle

### 4.1 Approve
- [ ] Focus the approval entry (`j`/`k`)
- [ ] Press `a`
- [ ] Brief "SUBMITTING" state visible
- [ ] Entry updates to: `✓` glyph, `approved once · operator <name>`
- [ ] Entry kind changes to `ok`
- [ ] Entry is NOT shown as "executed"

### 4.2 Claimed
- [ ] Wait for CLAIMED event
- [ ] Entry updates: `▷` glyph, `claimed · execution <id>`
- [ ] Entry kind changes to `run`

### 4.3 Consumed
- [ ] Wait for CONSUMED event
- [ ] Entry updates: `▣` glyph, `consumed · execution <id>`
- [ ] Second receipt line: `authority approval consumed · 0 uses`
- [ ] Entry kind changes to `ok`
- [ ] RunProof/assurance header updates

---

## Phase 5: Denial Lifecycle

### 5.1 Trigger another approval
Create another approval-required action.

- [ ] New approval entry appears
- [ ] Entry glyph: `◤`
- [ ] Entry summary: `<hash> · exact request required`

### 5.2 Deny
- [ ] Focus the approval
- [ ] Press `d`
- [ ] Entry updates: `✗` glyph, `denied by operator <name>`
- [ ] Second line: `approval rejected`
- [ ] Executor calls: **0** (verify in RunProof/header)
- [ ] Approval cannot be reused (try pressing `a` again → error)

---

## Phase 6: Prompt Conflict Protection

### 6.1 Typing in prompt
- [ ] Click on the prompt (or Tab to focus it)
- [ ] Type `a` → letter "a" appears in prompt
- [ ] Type `d` → letter "d" appears in prompt
- [ ] Type `v` → letter "v" appears in prompt
- [ ] **No approval command is triggered**

### 6.2 Return to spine
- [ ] Press `j`/`k` to refocus spine
- [ ] Navigate to an approval entry
- [ ] Press `a` → approval command fires (if PENDING)

### 6.3 Rapid key press
- [ ] Focus a PENDING approval
- [ ] Rapidly press `a` 5 times
- [ ] Only ONE approval command fires
- [ ] Entry transitions to APPROVED (not multiple versions)

---

## Phase 7: Session Isolation

### 7.1 Switch sessions
- [ ] With an approval selected, switch to a different session
- [ ] Selection clears (no stale approval focused)
- [ ] New session's entries render correctly
- [ ] No approval from the old session appears in the new session

### 7.2 Switch back
- [ ] Return to the original session
- [ ] Approval state is correct (APPROVED/CONSUMED from Phase 4)

---

## Phase 8: Resize

### 8.1 Resize with approval selected
- [ ] Focus an approval entry
- [ ] Resize terminal to 59 columns
- [ ] No crash
- [ ] Entry text truncates with `…` (not clipped silently)
- [ ] Approval actions remain discoverable
- [ ] Prompt remains usable

### 8.2 Resize with inspector open
- [ ] Open inspector (`v`)
- [ ] Resize to 80 columns
- [ ] Inspector remains readable
- [ ] No viewport overflow
- [ ] Close inspector (`Esc`)

### 8.3 Width matrix
Test at each width. For each, verify:
- No right-edge clipping
- No broken rail alignment
- Prompt usable
- Approval actions discoverable

| Width | Pass? | Notes |
|-------|-------|-------|
| 59    |       |       |
| 60    |       |       |
| 79    |       |       |
| 80    |       |       |
| 99    |       |       |
| 100   |       |       |
| 119   |       |       |
| 120   |       |       |
| 180   |       |       |

---

## Phase 9: Theme Validation

### 9.1 Dark theme
- [ ] All approval states visible and distinguishable
- [ ] Glyphs distinct: `◤` `✓` `✗` `▷` `▣` `×`
- [ ] Security states readable without color alone

### 9.2 Light theme
- [ ] Switch to light theme
- [ ] All approval states still distinguishable
- [ ] Contrast sufficient for all glyphs and labels
- [ ] Recovery/invalidation text readable

### 9.3 State copy verification
Verify these exact texts appear correctly:

| State | Expected Text |
|-------|--------------|
| APPROVED | `authorized, not executed` (or `approved once · operator <name>`) |
| INVALIDATED | `new authorization required` |
| RECOVERY_REQUIRED | `effect outcome uncertain` + `automatic replay blocked` |

---

## Phase 10: Restart Recovery

### 10.1 Restart
- [ ] Kill the TUI process
- [ ] Restart: `bun run dev:tui`
- [ ] Open the same session
- [ ] Approval lifecycle reconstructs from durable state
- [ ] CONSUMED approvals show as consumed (not re-rendered as PENDING)
- [ ] PENDING approvals still actionable

### 10.2 Crash recovery
- [ ] Force-kill during SUBMITTING state
- [ ] Restart
- [ ] Approval state is correct (APPROVED if command was sent, PENDING if not)
- [ ] No duplicate executions

---

## Phase 11: Mouse Interaction

### 11.1 Click to select
- [ ] Click on an approval entry
- [ ] Entry becomes selected (focused)
- [ ] Same as keyboard `j`/`k` navigation

### 11.2 Inspect via keyboard after mouse select
- [ ] Click to select an approval
- [ ] Press `v` → inspector opens
- [ ] Same inspector as keyboard-only flow

### 11.3 Approve via keyboard after mouse select
- [ ] Click to select a PENDING approval
- [ ] Press `a` → approval fires
- [ ] Same path as keyboard-only flow

---

## Defect Log

Record any issues found:

### Issue Template
```
ID: <sequential>
Steps: <exact reproduction>
Terminal: <terminal app>
Width: <columns>
Theme: <dark/light>
Session: <session ID>
Approval state: <state>
Expected: <what should happen>
Observed: <what happened>
Classification: Release blocker | Polish blocker | Non-blocking
```

### Found Issues

_(Add issues here as you find them)_

---

## Classification Guide

### Release Blocker
- Typing triggers approval command
- Wrong session approval is actionable
- Duplicate approval command
- APPROVED shown as executed
- INVALIDATED can be reused
- RECOVERY_REQUIRED can retry
- Approval disappears incorrectly
- Durable state and receipt disagree
- RunProof falsely says COMPLETE
- Crash or state corruption

### Polish Blocker
- Right-edge clipping
- Inspector unreadable
- Focus trapped
- Keyboard and mouse disagree
- Selection lost during resize
- Critical states hidden by filters
- Light-theme contrast failure
- Prompt focus not restored

### Non-blocking
- Small spacing inconsistency
- Non-critical wording preference
- Minor animation timing
- Decorative alignment difference

---

## Sign-off

When all phases pass with no release or polish blockers:

- [ ] All 11 phases pass
- [ ] No release blockers
- [ ] No polish blockers
- [ ] Defects logged for non-blocking issues
- [ ] Ready to freeze TUI-2.1
