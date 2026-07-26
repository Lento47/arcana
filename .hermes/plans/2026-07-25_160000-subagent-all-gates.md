# Subagent Clickability — Fix Last 2 Gates + Move isAgentEntry

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Subagent entries still not interactive after 3 guard bypasses. Two remaining gates + a critical placement bug: `isAgentEntry` (line 131) referenced by `showToggleRow` (line 100) — temporal dead zone. Fix: move `isAgentEntry` above `showToggleRow`, then add it to both remaining gates.

**Architecture:** Move one memo up, add two condition checks. All in `spine-entry.tsx`.

**Tech Stack:** SolidJS, OpenTUI.

---

## Complete Gate Audit (Final)

| # | Gate | File:Line | Agent? | Status |
|---|---|---|---|---|
| 1 | `canToggleSpineEntry` | spine-navigation.ts:20 | ✅ `kind==="agent"` | Done |
| 2 | `headerToggleable` | spine-entry.tsx:133 | ✅ `isAgentEntry()` | Done |
| 3 | `headerDisclosure` | spine-entry.tsx:123 | ✅ `isAgentEntry()` | Done |
| 4 | `canToggle` | spine-entry.tsx:83 | ✅ `!!onToggle` | Always |
| 5 | `showToggleRow` | spine-entry.tsx:105 | ❌ needs `isAgentEntry()` but TDZ | **FIX** |
| 6 | body display (section 1) | spine-entry.tsx:320 | ❌ needs `isAgentEntry()` | **FIX** |
| 7 | body display (section 2 — SpineProse) | spine-entry.tsx:364 | ❌ needs `hasToolBody()` | **SKIP** (overkill for agent, section 1 handles it) |
| 8 | `handleToggle→toggleEntry` | spine-entry.tsx:177 | ✅ no extra gate | Intact |

---

## Regression Analysis

**REG-1 (CRITICAL): `isAgentEntry` defined after `showToggleRow` — TDZ crash.**
`const isAgentEntry` at line 131 is referenced at line 105. `const` declarations are NOT hoisted — accessing before definition causes `ReferenceError`. **Fix: Move `isAgentEntry` definition to line ~97, before `showToggleRow` at line 100.**

**REG-2: `showToggleRow` shows for agent even without content.** The "▸ show details" row appears. Header chevron already shows. Two indicators but not overlapping. **Acceptable.**

**REG-3: Body uses `summary` as fallback for empty body.** Always shows text. **No regression.**

---

## Files

| Action | Path | ~Lines |
|---|---|---|
| Modify | `packages/tui/src/shell/command-spine/spine-entry.tsx` | move 1 memo + change 2 conditions |

---

## Bite-Sized Tasks

### Task 1: Move `isAgentEntry` above `showToggleRow` + fix both gates (2 min)

**File:** `packages/tui/src/shell/command-spine/spine-entry.tsx`

**Step 1a: Remove `isAgentEntry` from its current position (around line 130-131).** Delete:
```typescript
  // Agent entries (subagent tasks) — always interactive
  const isAgentEntry = createMemo(() => kind() === "agent")
```

**Step 1b: Re-add it above `showToggleRow` (before line 100).** Insert after the existing memos (after `hasListing`, around line 96):
```typescript
  // Agent entries (subagent tasks) — always interactive
  const isAgentEntry = createMemo(() => kind() === "agent")
```

**Step 1c: Fix `showToggleRow` (line 105):**
```typescript
// Current:
      && (hasChildren() || hasToolBody()),

// Replace with:
      && (hasChildren() || hasToolBody() || isAgentEntry()),
```

**Step 1d: Fix body display (line 320):**
```typescript
// Current:
          <Show when={!isThink() && hasToolBody() && bodyExpanded()}>

// Replace with:
          <Show when={!isThink() && (hasToolBody() || isAgentEntry()) && bodyExpanded()}>
```

And the body text fallback (same block):
```typescript
// Current:
              <text fg={t.text as any}>{entry().body}</text>

// Replace with:
              <text fg={t.text as any}>{entry().body || entry().summary}</text>
```

**Verification:** No TDZ crash. Subagent entries show ▸/▾ toggle row. Click expands with summary text.

**Commit:**
```bash
git add packages/tui/src/shell/command-spine/spine-entry.tsx
git commit -m "tui: fix isAgentEntry TDZ, showToggleRow, and body display for subagent entries"
```

---

### Task 2: Build and verify (2 min)

```bash
cd L:/PROJECTS/arcana && bun run build
```

Expected: 8/8 successful.

```bash
git push
```
