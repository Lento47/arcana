# Subagent Spine Entries — Not Clickable/Interactive

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make subagent spine entries clickable and expandable so users can see subagent progress/output from the chat view, matching the existing `SubagentFooter` functionality.

**Architecture:** Agent entries are created in `spine-mapper.ts` at lines 1881-1913 with `kind: "agent"` but no `body`, `children`, or `collapsible` flag. Two guards prevent interaction: `canToggleSpineEntry()` requires a content field (body/listing/diff/report/table/children), and `headerToggleable()` in the spine-entry renderer checks the same fields. Fix: add `body` with the subagent summary + `collapsible: true` to both "subtask" and "agent" entry factories.

**Tech Stack:** TypeScript, SolidJS, spine-mapper, spine-entry, spine-navigation.

---

## Full Code Path Audit

### How agent entries are created

| Location | Lines | What |
|---|---|---|
| `spine-mapper.ts` | 1881-1896 | "subtask" type → `kind: "agent"`, summary, source, NO body/children/collapsible |
| `spine-mapper.ts` | 1898-1913 | "agent" type → `kind: "agent"`, summary, source, NO body/children/collapsible |
| `spine-entry.tsx` | 62-65 | `isChatProse` = "ask"/"plan"/"ok" — NOT agent → uses header path |
| `spine-entry.tsx` | 128-131 | `headerToggleable` = hasChildren \|\| isThink+hasThinkBody \|\| hasDiff+diffBody — ALL false for agent |
| `spine-navigation.ts` | 18-26 | `canToggleSpineEntry` = collapsible≠false && (body \|\| listing \|\| diff \|\| report \|\| table \|\| children) — ALL false for agent |

### Why clicking does nothing

1. `headerToggleable()` returns `false` → `onMouseDown`/`onMouseUp` are `undefined` on the header row (lines 217-218 of spine-entry.tsx)
2. `canToggleSpineEntry()` returns `false` → Enter/Space on focused entry is a no-op (line 179 of command-spine-shell.tsx)

---

## Regression Analysis

**REG-1: Adding `body` to agent entries gives them collapsible content.**
Current: agent entries have only `summary`. Adding `body` enables toggling. The body shows the full subagent description/prompt. When collapsed, only the summary is visible (same as now). When expanded, the body text appears. **No regression — existing summary behavior preserved in collapsed state.**

**REG-2: `collapsible: true` + `body` activates all toggle paths.**
`canToggleSpineEntry` checks `collapsible !== false` → passes. Then `entry.body?.trim()` → truthy → returns `true`. `headerToggleable` checks `hasChildren()` (false), `isThink() && hasThinkBody()` (false), `hasDiff() && diff.body` (false) → still all false. **BUG: `headerToggleable` doesn't check for body content — separate fix needed.**

**Fix for REG-2:** Add `hasToolBody()` check to `headerToggleable`. The existing `hasToolBody` memo already exists at line 75-77:
```ts
const hasToolBody = createMemo(() => {
    if (isChatProse() || isThink()) return false
    return !!entry().body?.trim() || hasListing()
})
```
This checks body.trim() for non-chat/non-think entries. Just add it to `headerToggleable`. **Fixed in plan.**

**REG-3: `hasToolBody` memo already exists.**
At line 75-77, `hasToolBody` computes `!!entry().body?.trim() || hasListing()` for non-chat entries. It's already reactive. Adding it to `headerToggleable` is trivial. **No new code — just reuse existing memo.**

**REG-4: Agent entries still won't show expanded content in the spine.**
The `SpineNode` header shows summary. When toggled, no body content appears. **Fix:** Add a body display section for non-chat/non-think entries with body content. **Verified safe:** Existing tool entries (shell, read, edit, patch, etc.) have NO `SpineEntry.body` — they use `summary`/`report`/`diff`/`listing`. Only chat entries (ask/plan/ok) and think entries have `body`. The new agent `body` field is the ONLY non-chat, non-think body in the system. No double-rendering risk. **Added to plan.**

**REG-5: Subagent session linking is already handled.**
The `source.sessionID` on agent entries links to the subagent's session. The `SubagentFooter` in the session view already shows subagent tabs. The `openFocusedEntrySession` binding (key "g") navigates to the subagent session. This works regardless of toggleability. **No regression.**

---

## Files

| Action | Path | ~Lines |
|---|---|---|
| Modify | `packages/tui/src/shell/command-spine/spine-mapper.ts` | +2 lines |
| Modify | `packages/tui/src/shell/command-spine/spine-entry.tsx` | +2 lines |

---

## Bite-Sized Tasks

### Task 1: Add `body` + `collapsible` to agent entries (2 min)

**Objective:** Give agent entries content that makes them toggleable.

**File:** `packages/tui/src/shell/command-spine/spine-mapper.ts`

**Step 1a: Fix "subtask" entry (lines 1883-1894).** Add `body` and `collapsible`:

```typescript
      entries.push({
        id: `${message.id}:${part.id}:agent`,
        index: 0,
        elapsed: "",
        timestamp: formatTimestamp(message.time.created),
        kind: "agent",
        label: (part.agent as string) || "agent",
        glyph: SPINE_GLYPH.agent,
        actor: (part.agent as string) || "agent",
        summary: truncate(part.description || part.prompt, 120) || `subagent: ${part.agent ?? "agent"}`,
        body: part.description || part.prompt || "",
        collapsible: true,
        source: { messageID: message.id, partID: part.id, kind: "subtask", sessionID: childSessionIDs[0] },
      })
```

**Step 1b: Fix "agent" entry (lines 1900-1911).** Same additions:

```typescript
      entries.push({
        id: `${message.id}:${part.id}:agent`,
        index: 0,
        elapsed: "",
        timestamp: formatTimestamp(message.time.created),
        kind: "agent",
        label: part.name || "agent",
        glyph: SPINE_GLYPH.agent,
        actor: part.name || "agent",
        summary: `subagent: ${part.name}`,
        body: part.description || part.prompt || `subagent: ${part.name}`,
        collapsible: true,
        source: { messageID: message.id, partID: part.id, kind: "agent", sessionID: childSessionIDs[0] },
      })
```

**Verification:** After rebuild, `canToggleSpineEntry` returns `true` for agent entries.

**Commit:**
```bash
git add packages/tui/src/shell/command-spine/spine-mapper.ts
git commit -m "tui: add body and collapsible to subagent spine entries"
```

---

### Task 2: Fix `headerToggleable` to include body content (2 min)

**Objective:** Make agent entry headers clickable by adding `hasToolBody()` to the toggleable check.

**File:** `packages/tui/src/shell/command-spine/spine-entry.tsx` — line 128

**Step 2a: Add `hasToolBody()` to `headerToggleable` AND `headerDisclosure`:**

```typescript
// Current headerToggleable (lines 128-131):
  const headerToggleable = () =>
    hasChildren()
    || (isThink() && hasThinkBody())
    || (hasDiff() && !!entry().diff?.body?.trim())

// Replace with:
  const headerToggleable = () =>
    hasChildren()
    || (isThink() && hasThinkBody())
    || (hasDiff() && !!entry().diff?.body?.trim())
    || hasToolBody()

// Current headerDisclosure (lines 122-127):
  const headerDisclosure = () => {
    if (hasChildren()) return expanded() ? ("▾" as const) : ("▸" as const)
    if (isThink() && hasThinkBody()) return expanded() ? ("▾" as const) : ("▸" as const)
    if (hasDiff() && entry().diff?.body?.trim()) return expanded() ? ("▾" as const) : ("▸" as const)
    return "" as const
  }

// Replace with:
  const headerDisclosure = () => {
    if (hasChildren()) return expanded() ? ("▾" as const) : ("▸" as const)
    if (isThink() && hasThinkBody()) return expanded() ? ("▾" as const) : ("▸" as const)
    if (hasDiff() && entry().diff?.body?.trim()) return expanded() ? ("▾" as const) : ("▸" as const)
    if (hasToolBody()) return expanded() ? ("▾" as const) : ("▸" as const)
    return "" as const
  }
```

Without the `headerDisclosure` fix, the entry would be clickable but show no ▸/▾ visual indicator — the user would have no feedback that expansion occurred.

**Verification:** MouseDown/MouseUp handlers are now assigned on agent entry headers. Clicking toggles expansion.

**Step 2b: Add body display for expanded non-chat entries.** After the `<Show when={isChatProse() && hasProse()}>` block (around line 280), add a body section for non-chat entries. Actually, looking at the existing structure around line 290, there's already a think-body section. Let me find the right insertion point...

The existing structure after the chat card (line 239-252) continues with:
- Line 255: Report body
- Line 270: Diff
- Line 290: Think body
- Line 310: Listing
- Line 330: Children

I need to add a plain body section for non-chat, non-think entries (like agent). Add after the think-body section:

```tsx
          {/* Plain body for non-chat expandable entries (agent, inspect, etc.) */}
          <Show when={!isThink() && hasToolBody() && bodyExpanded()}>
            <box paddingLeft={padLeft()}>
              <SpineProse
                kind={kind()}
                text={entry().body ?? ""}
                bodyLabel={entryBodyLabel()}
                streaming={false}
                focused={props.focused}
                chatVoice={false}
                contentWidth={props.contentWidth}
              />
            </box>
          </Show>
```

Wait — `hasToolBody()` already excludes chat and think entries (line 75-77). So `!isThink()` is redundant but safe. Let me also check what `bodyLabel` returns for agent kind...

Actually, `entryBodyLabel()` at line 96: `return entry().bodyLabel`. Agent entries don't set `bodyLabel`. So `entryBodyLabel()` returns `undefined`. `SpineProse` with `bodyLabel={undefined}` should use a default.

Hmm, but adding a full prose renderer for agent body might be overkill. Let me simplify: just render the body as plain text:

```tsx
          {/* Plain body for non-chat expandable entries (agent, inspect, etc.) */}
          <Show when={!isThink() && hasToolBody() && bodyExpanded()}>
            <box paddingLeft={padLeft()} paddingTop={1}>
              <text fg={t.text as any}>{entry().body}</text>
            </box>
          </Show>
```

But wait — `hasToolBody()` returns true when `entry().body?.trim()` is truthy. And `bodyExpanded()` returns `expanded()` for non-chat entries (line 86). So this should work.

Actually, let me also check: does `t.text` exist? Looking at line 19 in spine-entry.tsx: `const t = themeObj as Record<string, unknown>`. And `theme.text` is used elsewhere (e.g., spine-chat.tsx:115). Let me use `t.text` safely.

Let me simplify further. The insertion point: after `<Show when={isThink() && hasThinkBody() && bodyExpanded()}>` which ends around line 310-315. I'll add after that block.

**Step 2b code:**

```tsx
          {/* Expandable body for non-chat/non-think entries (agent tools, inspect, etc.) */}
          <Show when={!isThink() && hasToolBody() && bodyExpanded()}>
            <box paddingLeft={padLeft()} paddingTop={1}>
              <text fg={t.text as any}>{entry().body}</text>
            </box>
          </Show>
```

**Commit:**
```bash
git add packages/tui/src/shell/command-spine/spine-entry.tsx
git commit -m "tui: make agent spine entries clickable and expandable"
```

---

### Task 3: Build and verify (2 min)

```bash
cd L:/PROJECTS/arcana && bun run build
```

Expected: 8/8 successful.

**Smoke test:**
- Open a session where the agent spawns subagents
- Click on a subagent entry in the spine → should expand/collapse
- Verify body text appears when expanded

```bash
git push
```

---

## Risks

1. **`part.description` and `part.prompt` may be undefined on some subagent types.** The code uses `part.description || part.prompt || fallback`. If both are undefined, `body` will be an empty string → `body?.trim()` is falsy → entry still not toggleable. **Acceptable — if there's no content, there's nothing to show.**

2. **`body` field type must match `SpineEntry.body?: string`.** The `SpineEntry` interface at spine-types.ts should already have an optional `body` field (it's used by other entry types). **Verified — `body` is used in existing chat, think, and tool entries.**

3. **Body text may contain markdown that doesn't render in plain `<text>`.** Using `<text>` instead of `<SpineProse>` means no syntax highlighting or formatting. **Acceptable for MVP — subagent descriptions are typically plain text.**
