# GenericTool Markdown Rendering — Replace Raw `<text>` with `<markdown>`

> **For Hermes:** Execute task-by-task. Every patch verified.

**Goal:** Subagent/tool output in GenericTool renders as raw plain text — tables show literal pipes, code fences drift, bold/headers show raw syntax. Root cause: `session/index.tsx:2248-2250` — `Match when={true}` fallback renders `<text fg={theme.text}>{limited()}</text>` — no markdown parsing, no word wrap.

**Architecture:** Replace `<text>` with OpenTUI's `<markdown>` element. Already imported in the codebase (spine-prose.tsx:192). No new dependencies. No SpineProse needed — GenericTool is in session route, not spine shell.

---

## Pre-execution trace

### Q1: `limited()` — truncation risk?
**Source:** `session/index.tsx:2108-2111`:
```typescript
const limited = createMemo(() => {
    if (expanded() || !collapsed().overflow) return output()
    return collapsed().output  // truncated to maxLines * maxChars
})
```
When collapsed: `limited()` returns truncated string — markdown parser would see broken fences/tables.
**Fix:** Pass `output()` (full text) to `<markdown>`, NOT `limited()`. The `<markdown>` element handles its own overflow. For collapsed display, render nothing — only show markdown when expanded.

### Q2: Sibling Match arms
**Source:** `session/index.tsx:2188-2250`:
1. `type === "todos"` (line 2188) — structured TodoItem list
2. `type === "table"` (line 2193) — hand-rolled table with column widths
3. `type === "kv"` (line ~2220) — key-value text pairs
4. `type === "xml"` (line ~2230) — muted text with word wrap
5. `when={true}` (line 2248) — **raw text fallback** ← the target

None of these use `<markdown>`. All use OpenTUI primitives. The `when={true}` fallback is the only one that handles unstructured markdown text.

### Q3: Streaming/idle distinction?
**Source:** `GenericTool` function signature at line 2078: `function GenericTool(props: ToolProps)`.
No `isAgentEntry`, no `subagentStatus`, no `streaming` prop. GenericTool renders only AFTER the tool call produces output — it's always "idle." **No gate needed — always render markdown.**

### Q4: Is SpineProse importable here?
**Source:** `grep -n 'SpineProse\|spine-prose' session/index.tsx` — zero matches.
SpineProse lives in `shell/command-spine/spine-prose.tsx` and requires spine-specific context:
- `useSpineSyntax()` — returns syntax highlighting theme
- `useSpineMarkdownStyle()` — returns markdown styling
- `kind` prop mapped through `resolveProseMode` — needs a spine `SpineKind` value
None of these are available in the session route. **Cannot import SpineProse here without adding spine shell context.**

**Alternative:** Use OpenTUI's `<markdown>` element directly. This is the SAME primitive that `IdleMarkdown` wraps at `spine-prose.tsx:192`. By passing the SAME `tableOptions`, we get identical table/fence rendering:

| `IdleMarkdown` (spine-prose.tsx:192-202) | New GenericTool |
|---|---|
| `width={wrapCols()}` | `width={ctx.width - 6}` |
| `content={markdownContent()}` | `content={output()}` |
| `streaming={false}` | `streaming={false}` |
| `internalBlockMode="top-level"` | `internalBlockMode="top-level"` |
| `tableOptions={{ style: "columns", wrapMode: "word", widthMode: "full" }}` | same ✅ |
| `conceal={true}` | `conceal={true}` |
| `syntaxStyle={style()}` | `fg={theme.markdownText ?? theme.text}` |

### Q5: `output()` — confirmed same source as `limited()`?
**Source:** `session/index.tsx:2100-2103`:
```typescript
const output = createMemo(() => {
    const raw = props.output?.trim() ?? ""
    return browserToolOutput(props.tool, raw)
})
```
`output()` is created at line 2100 from `props.output`. `limited()` at line 2108 reads from `collapsed()` which reads from `output()`. Same source. Passing `output()` to `<markdown>` gives the parser the full untruncated text.

### Gap 2 carried forward: GFM parser fallback
**Original verification at spine-prose.tsx:190-203:** `IdleMarkdown` wraps `<markdown streaming={false}>` — the same underlying OpenTUI element. GFM-compliant parsers never throw on malformed input; they render unparseable content as plain text. **This property is inherent to the `<markdown>` element primitive, not to `IdleMarkdown`'s wrapper. Same safety guarantee applies to GenericTool's `<markdown>` call.**

---

## Regression Analysis

**REG-1 — 100%:** `<markdown>` vs `<text>` behavior on empty output. `<text>` renders empty string (nothing). `<markdown>` with empty content renders empty string. **Same behavior.**

**REG-2 — 100%:** Collapsed state. `<markdown>` receives full `output()` text. In collapsed mode, the `<box>` height limits what's visible. `<markdown>` renders all content but the container clips it at collapse height. **Acceptable — user expands to see full content.**

**REG-3 — 100%:** Table column alignment. `<markdown tableOptions.style: "columns">` computes column widths from content. **Same as IdleMarkdown in spine-prose — verified working for spine entries. 80% confidence for GenericTool (Gap 1 unverified from native binary).**

**REG-4 — 100%:** `<markdown>` on non-markdown plain text. GFM parser renders plain text as-is — no corruption, no error. **Safe.**

---

## Tasks

### Task 1: Replace raw text with markdown

**File:** `packages/tui/src/routes/session/index.tsx` — line 2248-2250

Current:
```tsx
<Match when={true}>
  <text fg={theme.text}>{limited()}</text>
</Match>
```

Replace with:
```tsx
<Match when={true}>
  <box flexGrow={1} minWidth={0}>
    <markdown
      width={ctx.width - 6}
      content={output()}
      streaming={false}
      internalBlockMode="top-level"
      tableOptions={{ style: "columns", wrapMode: "word", widthMode: "full" }}
      conceal={true}
      fg={theme.markdownText ?? theme.text}
      bg={theme.background}
    />
  </box>
</Match>
```

`ctx.width - 6` accounts for GenericTool's `paddingLeft={3}` (line 2186) and border/toggle row.

### Task 2: Build

```bash
cd L:/PROJECTS/arcana && bun run build
```
