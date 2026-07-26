# TUI Shell Tool Fixes — Never-Ending Spinner + Missing Output

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Fix two Shell/Bash tool bugs: (1) the braille spinner/pending text never transitions to completed state, and (2) completed commands show "(no output)" even when output exists.

**Architecture:** The root cause is reactive fragility. `ToolPart` component passes a plain `toolprops` object with getters to `Shell`. The `Shell` component's `<Match when={stringValue(props.metadata.output) !== undefined}>` at line 2484 depends on the getter returning a string — but `props.metadata` is a getter reading `props.part.state.status`, which may not trigger re-renders reliably. Add an explicit `isCompleted` reactive signal to force the transition.

**Tech Stack:** SolidJS, existing components.

---

## Full Code Path Audit

### How Shell tool reactivity works (current)

```
ToolPart (line 1992)
  ↓ creates toolprops with getters (line 2003-2019)
  ↓ passes to <Shell {...toolprops} /> (line 2025)
Shell (line 2453)
  ↓ reads props.metadata (getter)
  ↓ getter returns {} if status==="pending", else metadata
  ↓ <Match when={stringValue(props.metadata.output) !== undefined}>
  ↓  if match → BlockTool with output
  ↓  if no match → InlineTool with pending/spinner
```

**Problem:** `props.metadata` is a getter on a plain object. When `props.part.state.status` changes from "running" to "completed", the ToolPart component must re-render, recreate `toolprops` with a new getter closure, and Shell must receive the new props. If any link in this chain breaks (SolidJS batching, stale closure, non-reactive access), the `<Match>` never re-evaluates and the spinner stays forever.

### Why "no output" appears

Line 2484: `<Match when={stringValue(props.metadata.output) !== undefined}>`
- If `output` is an empty string `""`: `stringValue("")` returns `""`, `"" !== undefined` is `true` → Match fires → BlockTool renders
- Inside BlockTool: `output()` memo at line 2458 produces `""` (empty string)
- `<Show when={output()}>` at line 2493: empty string is falsy → children hidden
- User sees: command line but no output text — looks like "(no output)"

**The user's actual complaint:** Sometimes commands that DO produce visible output also show no output. This happens when `props.metadata.output` is `undefined` at render time (status = completed but output hasn't arrived yet) → falls through to InlineTool → shows pending forever.

---

## Regression Analysis

**REG-1: Adding `isCompleted` as explicit dependency forces Shell to re-render on status change.** The `metadata` getter at line 2004 checks `props.part.state.status`. If this access is not tracked reactively, the Shell never sees the transition. Adding an explicit `status()` signal that Shell reads directly forces SolidJS to track it. **Fix: create `status()` memo in Shell that reads `props.part.state.status`, then use it in the Match condition. Addressed in plan.**

**REG-2: Empty output should show "(no output)" instead of hiding output entirely.** When a shell command succeeds with no stdout (e.g., `sed -i`), the Shell component shows the command but hides the output area entirely. This is confusing. **Fix: When output is empty AND tool is completed, show "(no output)" text in the output area. Addressed in plan.**

**REG-3: The `metadata` getter returns `{}` when status is "pending".** This means during the running state, `output` memo produces `""` (empty string from `stripAnsi(undefined?.trim())`). But the getter only returns metadata after status !== "pending". The transition from "pending" → "running" or "completed" must trigger re-evaluation. If the metadata.output is populated during "running" (not "completed"), it would be visible. **No change needed — the getter already handles this.**

**REG-4: InlineTool fallback shows spinner indefinitely if Match condition never re-evaluates.** The fallback `<Match when={true}>` at line 2502 catches all cases. If the first Match fails due to reactivity, this fires and shows the pending InlineTool. **Fix: same as REG-1 — force reactivity.**

**REG-5: Bash/shell tool display name.** `const display = createMemo(() => toolDisplay(props.part.tool))` at line 1994. For shell commands, `toolDisplay("bash")` returns `"bash"`. This matches `<Match when={display() === "bash"}>` at line 2024. ✅

---

## Files

| Action | Path | ~Lines |
|---|---|---|
| Modify | `packages/tui/src/routes/session/index.tsx` | +15 lines |

---

## Bite-Sized Tasks

### Task 1: Fix Shell reactivity + empty output display (5 min)

**Objective:** Force the Shell component to re-evaluate when tool status changes, and show "(no output)" for successfully completed commands with empty stdout.

**File:** `packages/tui/src/routes/session/index.tsx` — Shell function (lines 2453-2509)

**Current code** (lines 2457-2484):
```tsx
  const isRunning = createMemo(() => props.part.state.status === "running")
  const output = createMemo(() => stripAnsi(stringValue(props.metadata.output)?.trim() ?? ""))
  ...
  return (
    <Switch>
      <Match when={stringValue(props.metadata.output) !== undefined}>
```

**Replace with:**
```tsx
  const isRunning = createMemo(() => props.part.state.status === "running")
  // Explicitly track status to force re-render when tool completes
  const status = createMemo(() => props.part.state.status)
  const isCompleted = createMemo(() => status() === "completed")
  const output = createMemo(() => stripAnsi(stringValue(props.metadata.output)?.trim() ?? ""))
  ...
  return (
    <Switch>
      <Match when={status() !== "pending"}>
        <BlockTool
          title={title()}
          part={props.part}
          spinner={isRunning()}
          onClick={collapsed().overflow ? () => setExpanded((prev) => !prev) : undefined}
        >
          <box gap={1}>
            <text fg={theme.text}>$ {stringValue(props.input.command)}</text>
            <Show
              when={output()}
              fallback={
                <Show when={isCompleted()}>
                  <text fg={theme.textMuted}>(no output)</text>
                </Show>
              }
            >
              <text fg={theme.text}>{limited()}</text>
            </Show>
            <Show when={collapsed().overflow}>
              <text fg={theme.textMuted}>{expanded() ? "Click to collapse" : "Click to expand"}</text>
            </Show>
          </box>
        </BlockTool>
      </Match>
```

Wait — this replaces the existing BlockTool + output Show pattern. Let me be more precise with what changes.

The key changes are:
1. Add `const status = createMemo(() => props.part.state.status)` — force reactive tracking
2. Add `const isCompleted = createMemo(() => status() === "completed")` — check for completion
3. Change `<Match when={stringValue(props.metadata.output) !== undefined}>` to `<Match when={status() !== "pending"}>` — broader condition that catches completed AND running states
4. Add fallback for empty output: `<Show when={isCompleted()}><text>(no output)</text></Show>`

**New full Shell function:**
```tsx
function Shell(props: ToolProps) {
  const { theme } = useTheme()
  const pathFormatter = usePathFormatter()
  const ctx = use()
  const isRunning = createMemo(() => props.part.state.status === "running")
  // Force reactive tracking of status — fixes spinner-never-ends bug
  const status = createMemo(() => props.part.state.status)
  const isCompleted = createMemo(() => status() === "completed")
  const output = createMemo(() => stripAnsi(stringValue(props.metadata.output)?.trim() ?? ""))
  const [expanded, setExpanded] = createSignal(false)
  const maxLines = 10
  const maxChars = createMemo(() => maxLines * Math.max(20, ctx.width - 6))
  const collapsed = createMemo(() => collapseToolOutput(output(), maxLines, maxChars()))
  const limited = createMemo(() => {
    if (expanded() || !collapsed().overflow) return output()
    return collapsed().output
  })

  const workdirDisplay = createMemo(() => {
    const workdir = stringValue(props.input.workdir)
    if (!workdir || workdir === ".") return undefined
    return pathFormatter.format(workdir)
  })

  const title = createMemo(() => {
    const desc = stringValue(props.input.description) ?? "Shell"
    const wd = workdirDisplay()
    if (!wd) return `# ${desc}`
    if (desc.includes(wd)) return `# ${desc}`
    return `# ${desc} in ${wd}`
  })

  return (
    <Switch>
      <Match when={status() !== "pending"}>
        <BlockTool
          title={title()}
          part={props.part}
          spinner={isRunning()}
          onClick={collapsed().overflow ? () => setExpanded((prev) => !prev) : undefined}
        >
          <box gap={1}>
            <text fg={theme.text}>$ {stringValue(props.input.command)}</text>
            <Show
              when={output()}
              fallback={
                <Show when={isCompleted()}>
                  <text fg={theme.textMuted}>(no output)</text>
                </Show>
              }
            >
              <text fg={theme.text}>{limited()}</text>
            </Show>
            <Show when={collapsed().overflow}>
              <text fg={theme.textMuted}>{expanded() ? "Click to collapse" : "Click to expand"}</text>
            </Show>
          </box>
        </BlockTool>
      </Match>
      <Match when={true}>
        <InlineTool icon="$" pending={pickVerb(VerbPool.pending.shell, props.part.sessionID) + "…"} complete={stringValue(props.input.command)} part={props.part}>
          {stringValue(props.input.command)}
        </InlineTool>
      </Match>
    </Switch>
  )
}
```

**Verification:**
1. Run a shell command that produces output → output is visible
2. Run `echo ""` (produces empty output) → shows "(no output)" when completed
3. Run a command during agent workflow → spinner shows during running, transitions to output when complete

**Commit:**
```bash
git add packages/tui/src/routes/session/index.tsx
git commit -m "tui: fix Shell tool spinner-never-ends and missing output"
```

---

### Task 2: Build and verify (2 min)

```bash
cd L:/PROJECTS/arcana && bun run build
```

Expected: 8/8 tasks successful.

**Commit + push:**
```bash
git push
```

---

## Risks and Open Questions

1. **`status()` memo depends on `props.part.state.status`.** If `props.part` is NOT reactive (plain object), `createMemo(() => props.part.state.status)` won't re-run. This depends on how ToolPart props are passed. If the fix doesn't work, the next step is to wrap `part.state` in a SolidJS `createStore`.

2. **`textFaint` theme token doesn't exist.** Changed to `theme.textMuted`. Also dropped `dimColor` prop (not a valid OpenTUI `text` attribute).

4. **InlineTool fallback still exists.** The `<Match when={true}>` fallback catches edge cases where status is "pending" (initial state before first render). This is correct — the spinner should show during pending.
