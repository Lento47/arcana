# Clickable Subagent Child Sessions — Implementation Plan v4 (Final)

> **For Hermes:** Execute task-by-task. Every patch verified.

**Goal:** Click subagent entry → opens child session as full command-spine view. Return via existing breadcrumb/commands.

---

## Verified Code Audit

**Already working (confirmed):**
- `session/index.tsx:1362` — `session.parent` handler navigates to parent session ✅
- `session/index.tsx:1379` — `session.child.next` handler calls `moveChild(1)` ✅
- `session/index.tsx:1390` — `session.child.previous` handler calls `moveChild(-1)` ✅
- `subagent-footer.tsx:98` — dispatches these commands via `keymap.dispatchCommand()` ✅
- `command-spine-shell.tsx:22` — `useRoute()` imported, `route.navigate()` at line 261 ✅
- `spine-entry.tsx:133` — `isAgentEntry()` in `headerToggleable` — agent entries toggle expand ✅

**Missing:**
- No way to navigate FROM spine entry TO child session — need "Open session" button inside expanded agent body
- `onNavigate` prop not wired from shell to spine entry

---

## Regression Analysis

| # | Risk | Fix | Confidence |
|---|---|---|---|
| REG-1 | Header click conflict (expand vs navigate) | Keep header for expand. Add "Open" button INSIDE expanded body | 100% |
| REG-2 | No `route` in spine-entry | Add `onNavigate` prop, wired from shell | 100% |
| REG-3 | Child session not yet created | `Show when={!!entry().source?.sessionID}` guard | 100% |
| REG-4 | Open button intrudes body display | Separate `box` below body text | 100% |

---

## Tasks

### Task 1: Add `onNavigate` prop, wire from shell

**File A:** `spine-entry.tsx:40` — add to props:

```tsx
onNavigate?: (sessionID: string) => void  // NEW — inserted after onHover
```

**File B:** `command-spine-shell.tsx:325` — add to `<SpineEntryView>`:

```tsx
onNavigate={(sid) => route.navigate({ type: "session", sessionID: sid })}
```

### Task 2: Add "Open session" button inside expanded agent body

**File:** `spine-entry.tsx` — after line 324:

```tsx
<Show when={isAgentEntry() && bodyExpanded() && !!entry().source?.sessionID}>
  <box paddingLeft={padLeft()} paddingTop={1}>
    <text onMouseUp={() => props.onNavigate?.(entry().source!.sessionID!)}>
      <span fg={t.spineBrand as any}>⤷ Open session</span>
    </text>
  </box>
</Show>
```

### Task 3: Build + typecheck

```bash
cd L:/PROJECTS/arcana && bun run typecheck && bun run build
```
