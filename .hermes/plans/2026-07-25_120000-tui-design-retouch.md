# TUI Design System Retouch — Visual Polish Audit

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Systematic visual polish of the TUI design system — fix poor error display, improve card/token hierarchy, add turn separators, enhance status readability. Not a redesign. Focus on what looks amateur or incomplete.

**Architecture:** Touch 6 components: `spine-node.tsx`, `spine-chat.tsx`, `spine-header.tsx`, `spine-entry.tsx`, `spine-rail.tsx`, `index.tsx` (error display). All changes are small, targeted improvements — better spacing, clearer colors, missing separators.

**Tech Stack:** SolidJS, OpenTUI, existing theme tokens.

---

## Full Design Audit

### Issue 1: Error text is raw and unformatted in tool output

**File:** `session/index.tsx` — `InlineToolRow` error display (~line 2370+)

When a tool fails, the error shows as raw text in a `<Scramble>` or plain `<text>`. Long error messages overflow the compact tool row. Users see a wall of text. The error expansion toggle shows/hides but there's no formatting.

**Fix:** Add a `maxLines` clamp to error text in collapsed state. Show first line only + "Click to expand" when error is multi-line. Already have `errorExpanded` signal — use it to control truncation.

### Issue 2: Turn separators are missing — messages blend together

**File:** `spine-chat.tsx` lines 96-111, `spine-entry.tsx`

Between user messages and assistant responses, there's no visual divider. Messages stack with just `marginTop={1}`. A large conversation looks like a wall of text. Grok uses subtle horizontal rules between turns.

**Fix:** Add a thin separator line (`─`) between assistant→user transitions. Check if the PREVIOUS entry was assistant and current is user — if so, add a separator.

### Issue 3: Header brand feels weightless — no separator

**File:** `spine-header.tsx` line 131-133: `<Show when={hasContext()}><box height={1} /></Show>`

The header shows "A R C A N A" with nothing below it except a 1-cell spacer. There's no visual boundary between header and chat content. The header blends into messages.

**Fix:** Add a thin separator line below the header. Use existing `borderSubtle` token. Add `<box border={["bottom"]} borderColor={t.borderSubtle} />` after the spacer.

### Issue 4: Tool entry labels truncated — "explore" becomes "explor…"

**File:** `spine-node.tsx` line 13: `const TOOL_LABEL_WIDTH = 7`

Tool names like "explore" (7 chars) fit, but "web_search" or "apply_patch" (11 chars) truncate to "web_sea…" and "apply_p…". Users can't identify which tool ran from the label alone. The narrow layout saves 3 cells but hurts readability.

**Fix:** Increase `TOOL_LABEL_WIDTH` from 7 to 10. Add truncation only when name exceeds 10 chars. Most tool names fit. Compensate by reducing gutter width by 1 cell on minimal layouts.

### Issue 5: Gutter index numbers are meaningless

**File:** `spine-gutter.tsx` — shows "01", "02", "03"...

The gutter shows 2-digit index numbers. These have no semantic meaning — they're just entry sequence numbers. They take 2 cells of horizontal space and add visual noise. Grok doesn't show index numbers.

**Fix:** Reduce gutter to 1 cell on `minimal` layout (just a dot or empty). Keep 2 cells on `compact`/`wide` for focus navigation aid. Or: show index only when entry is focused. This saves 1 cell of horizontal space on every line.

### Issue 6: Streaming shimmer text is monotonous

**File:** `spine-chat.tsx` lines 121-127: `<ShimmerText text="writing" .../>`

While the assistant streams, it always shows "writing". This is the same text regardless of what the assistant is doing — reasoning, coding, searching. Grok varies the shimmer text: "thinking", "searching", "coding".

**Fix:** Use the `bodyLabel` or `kind` to customize the shimmer text. If the entry is "plan" (reasoning) → "thinking". If "ok" (output) → "writing". Simple 2-state variation.

### Issue 7: Focus border is invisible on dark themes

**File:** `spine-entry.tsx` line 216: `backgroundColor={props.focused ? (t.backgroundElement as any) : undefined}`

When an entry is focused (via j/k), the background changes slightly. On dark themes, `backgroundElement` is often identical to the default background — the focus state is invisible. The user has no idea which entry is focused.

**Fix:** Add a left border accent on focus. Use `border={["left"]}` + `borderColor={theme.accent}` when focused. Only for non-chat entries (chat cards already have left border).

### Issue 8: No visual distinction between active/completed subagent entries

**File:** `spine-entry.tsx` + `spine-mapper.ts` (agent entries)

Subagent entries show "agent explore" with a static summary. When the subagent is running, there's no spinner or activity indicator. When completed, there's no success indicator. They look identical in all states.

**Fix:** Add `streaming: true` to agent entries when the subagent session is active. Add `ShimmerText` to agent summaries during streaming. When completed, add "done" or a brief status to the summary.

---

## Regression Analysis

**REG-1: Error text truncation may hide important details.** Only showing the first line of an error by default means the user must click to see the full error. **Mitigation:** Always show the first line. Add "(click to expand)" hint for multi-line errors. Already have `errorExpanded` signal — just use it for truncation. No regression — this is ADDING truncation that doesn't exist.

**REG-2: Turn separators may add visual noise on short conversations.** A 2-message conversation with a separator looks silly. **Fix:** Only add separator when the previous assistant message has tool entries (multi-turn with tools). Simple check: `previousEntry.kind !== "ask"`.

**REG-3: Increasing TOOL_LABEL_WIDTH may push summary text.** The tool row is `flexDirection="row"` with label + actor + summary + elapsed. Increasing label width by 3 cells steals space from the summary. On narrow terminals (<60 cols), this could truncate summaries. **Mitigation:** On `minimal` layout (narrow), keep TOOL_LABEL_WIDTH at 7. Only increase on `compact` and `wide` layouts.

**REG-4: Gutter index removal may break j/k navigation mental model.** Users who use j/k heavily may rely on index numbers to know their position. **Mitigation:** Keep index on `compact` and `wide` layouts. Only hide on `minimal` where every cell matters.

**REG-5: Shimmer text variation needs kind context.** The shimmer text is inside `SpineChatCard` which receives `kind` prop. Adding a memo to choose the verb is trivial. **No regression.**

**REG-6: Focus border on chat cards doubles existing border.** Chat cards already have `border={["left"]}` with accent color. Adding another left border creates a double border. **Fix:** Skip focus border for chat entries (`isChatProse()` check).

**REG-7: Agent streaming status requires session data.** The spine-mapper doesn't have session completion status at entry creation time. **Scope decision:** Set `streaming: true` for ALL agent entries by default (conservative — shows activity until proven complete). The entry recomputes when session data changes.

---

## Files

| Action | Path | ~Lines |
|---|---|---|
| Modify | `packages/tui/src/shell/command-spine/spine-node.tsx` | +2 (label width) |
| Modify | `packages/tui/src/shell/command-spine/spine-chat.tsx` | +10 (shimmer variation) |
| Modify | `packages/tui/src/shell/command-spine/spine-header.tsx` | +3 (separator) |
| Modify | `packages/tui/src/shell/command-spine/spine-entry.tsx` | +5 (focus border) |
| Modify | `packages/tui/src/shell/command-spine/spine-gutter.tsx` | +3 (minimal hide) |
| Modify | `packages/tui/src/routes/session/index.tsx` | +8 (error truncation) |

---

## Bite-Sized Tasks

### Task 1: Error text truncation + denied expansion fix (3 min)

**File:** `packages/tui/src/routes/session/index.tsx`

**Step 1a: Enable error expansion for denied tools.** Denied errors can't currently be expanded — the click handler at line 2306 only responds to `failed()`. Fix:

```typescript
// Current (line 2306):
        if (failed()) {

// Replace with:
        if (failed() || denied()) {
```

And update line 2412 to show expanded text for denied too:

```typescript
// Current (line 2412):
      <Show when={props.failed && props.errorExpanded}>

// Replace with:
      <Show when={(props.failed || props.denied) && props.errorExpanded}>
```

**Step 1b: Truncate multi-line errors in collapsed state.** Wrap the error text display (~line 2375-2386):

```typescript
// Current (around line 2370-2380):
              <text ... attributes={props.denied ? TextAttributes.STRIKETHROUGH : undefined}>
                {props.error}
              </text>

// Replace with — show first line only in collapsed state:
              <text ... attributes={props.denied ? TextAttributes.STRIKETHROUGH : undefined}>
                {props.errorExpanded
                  ? props.error
                  : (props.error ?? "").split("\n")[0]}
              </text>
```

Add "(click to expand)" hint when error has multiple lines:

```typescript
// After the error text, add:
              <Show when={(props.error ?? "").includes("\n") && !props.errorExpanded}>
                <text fg={theme.textMuted}> (click to expand)</text>
              </Show>
```

**Commit:**
```bash
git add packages/tui/src/routes/session/index.tsx
git commit -m "tui: truncate multi-line tool errors in collapsed state"
```

---

### Task 2: Turn separator above user messages (2 min)

**File:** `packages/tui/src/shell/command-spine/spine-chat.tsx`

Add a thin separator INSIDE the card box as its first child (after line 111's opening tag):

```typescript
    >
      {/* Turn separator — thin line above user messages */}
      <Show when={isUser()}>
        <box border={["bottom"]} borderColor={(t.borderSubtle ?? t.textMuted) as any} width="100%" />
      </Show>
      {/* Header — single row, no markdown here */}

**Commit:**
```bash
git add packages/tui/src/shell/command-spine/spine-chat.tsx
git commit -m "tui: add turn separator above user messages"
```

---

### Task 3: Header separator + brand polish (1 min)

**File:** `packages/tui/src/shell/command-spine/spine-header.tsx`

After the `<Show when={hasContext() || showBrand()}>` block at line 131-133 (the spacer), add a separator:

```typescript
      <Show when={hasContext() || showBrand()}>
        <box height={1} />
        <box border={["bottom"]} borderColor={t.borderSubtle as any} marginBottom={1} />
      </Show>
```

**Commit:**
```bash
git add packages/tui/src/shell/command-spine/spine-header.tsx
git commit -m "tui: add header separator for visual boundary"
```

---

### Task 4: Increase tool label width on non-minimal layouts (2 min)

**File:** `packages/tui/src/shell/command-spine/spine-node.tsx`

Line 13: `const TOOL_LABEL_WIDTH = 7`. Change to:

```typescript
// Wider tool labels on compact/wide layouts for readability
const TOOL_LABEL_WIDTH_WIDE = 10
```

And update line 100:
```typescript
// Current:
  const labelWidth = createMemo(() => (isChat() ? CHAT_LABEL_WIDTH : TOOL_LABEL_WIDTH))

// Replace with:
  const labelWidth = createMemo(() => {
    if (isChat()) return CHAT_LABEL_WIDTH
    return layout() === "minimal" ? 7 : TOOL_LABEL_WIDTH_WIDE
  })
```

**Verification:** Tool names "apply_patch" now show fully instead of truncating to "apply_p…".

**Commit:**
```bash
git add packages/tui/src/shell/command-spine/spine-node.tsx
git commit -m "tui: wider tool labels on compact/wide layouts"
```

---

### Task 5: Vary shimmer text by kind (1 min)

**File:** `packages/tui/src/shell/command-spine/spine-chat.tsx`

Lines 121-127: `<ShimmerText text="writing" .../>`. Add a memo:

```typescript
  const shimmerVerb = createMemo(() => {
    if (kind() === "plan") return "thinking"
    return "writing"
  })
```

And use it:
```typescript
            <ShimmerText
              text={shimmerVerb()}
              active={true}
              background={(cardBg() ?? t.background) as any}
            />
```

**Verification:** During "plan" (reasoning) turns, the shimmer shows "thinking". During "ok" (output) turns, it shows "writing".

**Commit:**
```bash
git add packages/tui/src/shell/command-spine/spine-chat.tsx
git commit -m "tui: vary streaming shimmer text by turn kind"
```

---

### Task 6: Focus border for non-chat entries (2 min)

**File:** `packages/tui/src/shell/command-spine/spine-entry.tsx`

After the focused background check (line 216), add a border when focused AND not chat prose:

```typescript
// Inside the entry header box (around line 211-233), modify the header row:
            <box
              flexDirection="row"
              flexShrink={0}
              alignItems="flex-start"
              backgroundColor={props.focused ? (t.backgroundElement as any) : undefined}
              border={props.focused && !isChatProse() ? (["left"] as any) : undefined}
              borderColor={props.focused && !isChatProse() ? (t.accent as any) : undefined}
              onMouseDown={headerToggleable() ? handleHeaderMouseDown : undefined}
              onMouseUp={headerToggleable() ? handleHeaderMouseUp : undefined}
            >
```

**Verification:** Focused tool/agent entries show a visible accent left border. Chat cards are unaffected (skip via `!isChatProse()`).

**Commit:**
```bash
git add packages/tui/src/shell/command-spine/spine-entry.tsx
git commit -m "tui: add accent left border on focused non-chat entries"
```

---

### Task 7: Hide gutter index on minimal layout (1 min)

**File:** `packages/tui/src/shell/command-spine/spine-gutter.tsx`

Compute width inline (no new imports needed — `createMemo` and `Show` are not imported):

```typescript
export function SpineGutter(props: {
  index: number
  layout: SpineLayout
  active?: boolean
}) {
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>
  const width = props.layout === "minimal" ? 0 : spineGutterWidth(props.layout)
  if (width === 0) return null  // save 1 cell on narrow terminals
  // ... rest of existing code
```

**Commit:**
```bash
git add packages/tui/src/shell/command-spine/spine-gutter.tsx
git commit -m "tui: hide gutter index on minimal layout"
```

---

### Task 8: Build and verify (2 min)

```bash
cd L:/PROJECTS/arcana && bun run build
```

Expected: 8/8 successful.

```bash
git push
```

---

## Risks

1. **Error truncation hides stack traces.** First-line-only display may hide the actual error cause (which is often on line 2+). **Mitigation:** The "click to expand" hint is always visible for multi-line errors.

2. **Turn separators may look repetitive.** Every user message gets a separator. On rapid back-and-forth conversations, this adds visual overhead. **Acceptable for MVP — can tune later with a "only for multi-tool turns" rule.**

3. **Gutter index removal on minimal layout.** Users lose position awareness on narrow terminals. **Mitigation:** j/k navigation still works — index numbers were cosmetic, not functional.
