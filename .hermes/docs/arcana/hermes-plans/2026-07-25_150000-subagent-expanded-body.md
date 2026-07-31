# Subagent Spine Entry — Visible When Expanded

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Subagent entries are now clickable/expandable (v0.3.52) but the expanded state shows nothing visible because the body display `<Show>` guard checks `hasToolBody()` which returns false when `body` is empty. Fix: always show body for agent entries.

**Architecture:** One condition change in `spine-entry.tsx` — make the body display unconditional for agent kind.

**Tech Stack:** SolidJS, OpenTUI.

---

## Full Code Path Audit

### Current state (v0.3.52)

| Layer | Status |
|---|---|
| Entry creation (spine-mapper.ts:1893-1894, 1912-1913) | `body` + `collapsible: true` set ✅ |
| `canToggleSpineEntry` (spine-navigation.ts:20) | `kind === "agent"` → `true` ✅ |
| `headerToggleable` (spine-entry.tsx:131) | `isAgentEntry()` first check ✅ |
| `headerDisclosure` (spine-entry.tsx:123) | `isAgentEntry()` first check ✅ |
| **Body display** (spine-entry.tsx:320) | **`hasToolBody()` guard — FAILS when body empty** ❌ |

### Why it fails

```typescript
// spine-entry.tsx:75-77
const hasToolBody = createMemo(() => {
    if (isChatProse() || isThink()) return false
    return !!entry().body?.trim() || hasListing()
})

// spine-entry.tsx:320 — body display section
<Show when={!isThink() && hasToolBody() && bodyExpanded()}>
```

When agent entry has `body: part.description || part.prompt || ""` and both fields are undefined → `body` = `""` → `"".trim()` = `""` → falsy → `hasToolBody()` = false → body display doesn't render → expanded entry shows empty.

For "agent" type: `body: part.description || part.prompt || \`subagent: ${part.name}\`` — this HAS a fallback, so body is non-empty. But for "subtask" type, the fallback is `""` which can be empty.

---

## Regression Analysis

**REG-1: All agent entries show body display even when empty.** After fix, expanded agent entries always show the body section. If body is empty, the text renders as empty string. **Mitigation:** Use `entry().body || entry().summary` as fallback — always shows something. Addressed in plan.

**REG-2: Non-agent tool entries with empty body still hidden.** This is correct — only agent entries bypass the `hasToolBody()` guard. Existing tool entries (shell, inspect, etc.) continue to use the existing behavior. **No regression.**

---

## Files

| Action | Path | ~Lines |
|---|---|---|
| Modify | `packages/tui/src/shell/command-spine/spine-entry.tsx` | +1 line |

---

## Bite-Sized Tasks

### Task 1: Show body for agent entries regardless of hasToolBody (1 min)

**Objective:** Agent entries always show body content when expanded.

**File:** `packages/tui/src/shell/command-spine/spine-entry.tsx` — line 320

**Current:**
```typescript
          {/* Expandable body for non-chat/non-think entries (agent tools, etc.) */}
          <Show when={!isThink() && hasToolBody() && bodyExpanded()}>
            <box paddingLeft={padLeft()} paddingTop={1}>
              <text fg={t.text as any}>{entry().body}</text>
            </box>
          </Show>
```

**Replace with:**
```typescript
          {/* Expandable body for non-chat/non-think entries (agent tools, etc.) */}
          <Show when={!isThink() && (hasToolBody() || isAgentEntry()) && bodyExpanded()}>
            <box paddingLeft={padLeft()} paddingTop={1}>
              <text fg={t.text as any}>{entry().body || entry().summary}</text>
            </box>
          </Show>
```

Two changes:
1. `hasToolBody()` → `(hasToolBody() || isAgentEntry())` — agent entries always pass
2. `{entry().body}` → `{entry().body || entry().summary}` — fallback when body is empty

**Verification:** Click on subagent entry → expands → shows summary text (at minimum).

**Commit:**
```bash
git add packages/tui/src/shell/command-spine/spine-entry.tsx
git commit -m "tui: show body content for expanded agent entries"
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
