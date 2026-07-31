# Multi-Session Subagent Panels — Implementation Plan

> **For Hermes:** Execute task-by-task. Every patch verified.

**Goal:** Open multiple subagent sessions simultaneously — each agent gets its own panel. Navigate between them via tabs or keyboard. Parent session stays visible when viewing children.

**Architecture:** Session route currently renders ONE session. Change to multi-panel layout:
- Left panel: parent session (always visible)
- Right panel(s): child subagent sessions (tabbed or stacked)
- Keyboard nav between panels

---

## Regression Analysis

| # | Risk | Fix | Confidence |
|---|---|---|---|
| REG-1 | Single-session route replaced by multi-panel | Existing single-session mode preserved when no subagents open | 100% |
| REG-2 | State isolation between panels | Each panel has own sync context (already per-sessionID) | 100% |
| REG-3 | Command spine duplication | Shared command spine shell, separate instances per session | 95% |
| REG-4 | Keyboard shortcuts ambiguous | Focused panel gets shortcuts; `Ctrl+[`/`]` switch panels | 100% |
| REG-5 | Performance with many panels | Lazy render inactive panels, keep ≤3 active at once | 90% |
| REG-6 | Breadcrumb vs tabs | Tabs show open subagents; breadcrumb for deep nesting remains | 100% |
| REG-7 | Prompt box per panel | Each panel gets its own prompt; focused panel's prompt active | 95% |

---

## Tasks

### Task 1: Session panel wrapper — allow multiple session views

**File:** `packages/tui/src/routes/session/index.tsx`

Extract current session render into `<SessionPanel sessionID={...}>` component that can be instantiated multiple times.

### Task 2: Tab bar for open subagents

**File:** `packages/tui/src/routes/session/index.tsx`

```tsx
// Above command spine: tab bar showing parent + child sessions
<box flexDirection="row">
  <SessionTab label="main" sessionID={parentID} active={focusedPanel === "parent"} />
  <For each={openSubagents}>{sub => 
    <SessionTab label={sub.label} sessionID={sub.id} active={focusedPanel === sub.id} />
  }</For>
</box>
```

### Task 3: Wire "Open subagent" button to open panel instead of navigate

**File:** `spine-entry.tsx:330`

Change `route.navigate({ type: "session", sessionID })` → `props.onOpenPanel(sessionID)` which adds the session to the panel layout without replacing the parent.

### Task 4: Build + typecheck

```bash
cd L:/PROJECTS/arcana && bun run typecheck && bun run build
```
