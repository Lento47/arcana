# TUI Tool Rendering Polish — Braille Animations + Smart Output Formatting

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make Arcana's TUI tool rendering feel as polished as Grok Build — braille spinners on pending todos, smart JSON detection in generic outputs, and consistent formatting across all tool types.

**Architecture:** No new files. Modify `session/index.tsx` to add braille spinner to TodoWrite pending state, extend GenericTool's JSON detection to handle tables/key-value objects, and add consistent count badges. The existing `Spinner` component with braille frames (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) and `VerbPool` themed verbs are already in place — just wire them into more tool types.

**Tech Stack:** SolidJS, OpenTUI, existing Spinner/VerbPool/branding.

---

## Full Code Path Audit

### Who renders tool parts?

| Tool | Component | Lines | Pending animation |
|---|---|---|---|
| `todowrite` | `TodoWrite` | 2798-2822 | `InlineTool` — icon "⚙", no braille |
| `bash` | `Bash` | — | Has its own status bar |
| `read` | `Read` | — | Has its own status bar |
| `edit` | `Edit` | — | Has its own status bar |
| `task` | `Task` | — | Has its own status bar |
| `apply_patch` | `ApplyPatch` | — | Has its own status bar |
| `question` | `Question` | — | Has its own status bar |
| `skill` | `Skill` | — | Has its own status bar |
| * (generic) | `GenericTool` | 2078-2136 | `InlineTool` — icon "⚙", no braille |

### Who uses Spinner/braille?

| Component | Lines | Uses braille? |
|---|---|---|
| `Spinner` | component/spinner.tsx | Yes — `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` at 80ms |
| `SigilSpinner` | component/sigil-spinner.tsx | Yes — for thought blocks |
| `InlineTool` | session/index.tsx:2138 | Has `spinner?: boolean` prop but NOT passed by any caller |

### What JSON formats appear in generic tool output?

Common patterns from agents:
- **Todo arrays**: `[{"content":"...","status":"completed"},...]` — already detected ✅
- **Key-value objects**: `{"result":"ok","count":3}` — rendered as raw JSON ❌
- **Table arrays**: `[{"file":"a.ts","status":"ok"},{"file":"b.ts","status":"err"}]` — rendered as raw JSON ❌
- **Plain text**: `"Done."` — rendered as text ✅

### What exists already (no need to build)?

- `SPINNER_FRAMES` in `component/spinner.tsx` — 10 braille characters
- `VerbPool` in `branding.ts` — themed verbs per tool type
- `parseTodos()` in `session/index.tsx:2940` — parses todo arrays
- `TodoItem` in `component/todo-item.tsx` — checkbox rendering
- `Spinner` component — `<spinner frames={...} interval={80} color={...} />`
- `InlineTool` has `spinner?: boolean` prop — unused by any caller

---

## Regression Analysis

**REG-1: Adding braille spinner to TodoWrite changes InlineTool call signature.**
The `InlineTool` component already has a `spinner?: boolean` prop (line 2145). It's just never set to `true`. Setting it won't break anything — the prop is already typed and defaulted. **No regression.**

**REG-2: Extending JSON detection in GenericTool could match false positives.**
If a tool returns `[{"content":"some text","status":"ok"}]` where `content`/`status` are coincidental field names (not actual todos), the renderer would show them as todo checkboxes. **Mitigation:** Only trigger todo rendering if ALL items have both `content` and `status` as strings. This is already implemented in the current `parsedTodos` memo. **Addressed.**

**REG-3: Table detection could conflict with todo detection.**
An array `[{file:"a.ts",status:"ok"},{file:"b.ts",status:"err"}]` could match todo detection if the fields happen to be `content`/`status`. But if the fields are named differently (e.g., `file`/`status`), todo detection won't match and table detection will. **Fix:** Check todo format FIRST (requires `content` field), then table format (requires consistent keys). Both guarded by `try/catch`. **Addressed in plan via ordering.**

**REG-4: GenericTool output overflow behavior unchanged.**
The `collapsed`/`expanded` logic and `maxLines=3` limit are untouched. Todo/table rendering respects the overflow state. **No regression.**

**REG-5: Sidebar TODO widget rendering unchanged.**
This plan only touches `session/index.tsx` tool rendering. The sidebar `todo.tsx` is not modified. **No regression.**

**REG-6: `<text bold={true}>` is not a valid OpenTUI attribute.** ⚠️
The codebase uses `<span style={{ bold: true }}>` for bold text (line 1643), not direct `bold` attribute on `<text>`. The table header rendering used `<text bold={true}>` which would be a runtime error. **Fix:** Changed to `<text><span style={{ bold: true }}>{col}</span></text>`. **Fixed in plan.**

---

## Files

| Action | Path | ~Lines |
|---|---|---|
| Modify | `packages/tui/src/routes/session/index.tsx` | +40 lines |

---

## Bite-Sized Tasks

### Task 1: Add braille spinner to TodoWrite pending state (3 min)

**Objective:** Replace the static "⚙ Inscribing…" with a braille-animated spinner, matching the thought-block spinner style.

**File:** `packages/tui/src/routes/session/index.tsx` — lines 2810-2818

**Current code:**
```tsx
        <InlineTool
          icon="⚙"
          pending={pickVerb(VerbPool.pending.todo, props.part.sessionID) + "…"}
          failure="Todo update failed"
          complete={false}
          part={props.part}
        >
          Inscribing…
        </InlineTool>
```

**Replace with:**
```tsx
        <InlineTool
          icon="⚙"
          pending={pickVerb(VerbPool.pending.todo, props.part.sessionID) + "…"}
          failure="Todo update failed"
          complete={false}
          spinner={true}
          part={props.part}
        >
          {pickVerb(VerbPool.pending.todo, props.part.sessionID)}…
        </InlineTool>
```

**Verification:** When Arcana processes a `todowrite` call, the pending state shows a braille spinner like `⠋ Inscribing…` instead of static text.

**Commit:**
```bash
git add packages/tui/src/routes/session/index.tsx
git commit -m "tui: add braille spinner to TodoWrite pending state"
```

---

### Task 2: Extend GenericTool JSON detection to handle tables and key-value objects (5 min)

**Objective:** Generic tool outputs that contain JSON arrays of objects (not just todos) should be rendered as a compact table. Key-value objects should be formatted as a list.

**File:** `packages/tui/src/routes/session/index.tsx` — extend the `parsedTodos` logic into a more general `formattedOutput` memo

**Current code** (lines 2090-2106):
```tsx
  const parsedTodos = createMemo(() => {
    const raw = output()
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(
        (item: unknown) => typeof item === "object" && item !== null && "content" in (item as any) && "status" in (item as any)
      )) {
        return parseTodos(parsed)
      }
    } catch {}
    return null
  })

  const todoCount = createMemo(() => parsedTodos()?.length ?? 0)
```

**Replace with:**
```tsx
  type FormattedOutput = 
    | { type: "todos"; items: Array<{ status: string; content: string }> }
    | { type: "table"; columns: string[]; rows: Array<Record<string, string>> }
    | { type: "kv"; entries: Array<[string, string]> }
    | { type: "raw" }

  const formattedOutput = createMemo((): FormattedOutput => {
    const raw = output()
    try {
      const parsed = JSON.parse(raw)

      // Todos: array of objects with content + status
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(
        (item: unknown) => typeof item === "object" && item !== null &&
        "content" in (item as any) && "status" in (item as any)
      )) {
        return { type: "todos", items: parseTodos(parsed) }
      }

      // Table: array of objects with consistent string keys
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(
        (item: unknown) => typeof item === "object" && item !== null
      )) {
        const keys = Object.keys(parsed[0] as object)
        if (keys.length >= 2 && keys.length <= 5) {
          const rows = parsed.map((item: any) => {
            const row: Record<string, string> = {}
            for (const k of keys) row[k] = String(item[k] ?? "")
            return row
          })
          return { type: "table", columns: keys, rows }
        }
      }

      // Key-value: flat object with string/number/boolean values
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        const entries = Object.entries(parsed as Record<string, unknown>)
          .filter(([, v]) => typeof v === "string" || typeof v === "number" || typeof v === "boolean")
          .map(([k, v]) => [k, String(v)] as [string, string])
        if (entries.length > 0) return { type: "kv", entries }
      }
    } catch {}
    return { type: "raw" }
  })

  const badge = createMemo(() => {
    const fmt = formattedOutput()
    if (fmt.type === "todos") return `${fmt.items.length} todos`
    if (fmt.type === "table") return `${fmt.rows.length} rows`
    if (fmt.type === "kv") return `${fmt.entries.length} fields`
    return ""
  })
```

**Then replace the render block** (lines 2116-2135) to use the new types:

```tsx
      <BlockTool
        title={`# ${props.tool} ${input(props.input)}`}
        part={props.part}
        onClick={collapsed().overflow ? () => setExpanded((prev) => !prev) : undefined}
      >
        <box gap={1}>
          <Switch>
            <Match when={formattedOutput().type === "todos"}>
              <For each={(formattedOutput() as { type: "todos"; items: any[] }).items}>
                {(todo) => <TodoItem status={todo.status} content={todo.content} />}
              </For>
            </Match>
            <Match when={formattedOutput().type === "table"}>
              {((): any => {
                const tbl = formattedOutput() as { type: "table"; columns: string[]; rows: Record<string,string>[] }
                return (
                  <box flexDirection="column" gap={0}>
                    <box flexDirection="row" gap={2}>
                      <For each={tbl.columns}>{(col) => 
                        <text fg={theme.textMuted} width={Math.max(8, Math.floor(ctx.width / tbl.columns.length))}><span style={{ bold: true }}>{col}</span></text>
                      }</For>
                    </box>
                    <For each={tbl.rows.slice(0, 20)}>{(row) =>
                      <box flexDirection="row" gap={2}>
                        <For each={tbl.columns}>{(col) =>
                          <text fg={theme.text} width={Math.max(8, Math.floor(ctx.width / tbl.columns.length))}>{row[col]}</text>
                        }</For>
                      </box>
                    }</For>
                  </box>
                )
              })()}
            </Match>
            <Match when={formattedOutput().type === "kv"}>
              <For each={(formattedOutput() as { type: "kv"; entries: [string,string][] }).entries}>
                {([k, v]) => (
                  <box flexDirection="row" gap={1}>
                    <text fg={theme.textMuted}>{k}:</text>
                    <text fg={theme.text}>{v}</text>
                  </box>
                )}
              </For>
            </Match>
            <Match when={true}>
              <text fg={theme.text}>{limited()}</text>
            </Match>
          </Switch>
          <Show when={collapsed().overflow}>
            <text fg={theme.textMuted}>{expanded() ? "Click to collapse" : "Click to expand"}</text>
          </Show>
        </box>
      </BlockTool>
```

**And update the fallback** (line 2111):
```tsx
          {props.tool} {input(props.input)} {badge()}
```

**Verification:** Tools returning JSON arrays of objects render as compact tables. Key-value objects render as `key: value` pairs. Todo arrays continue to render as checkboxes. Plain text is unchanged.

**Commit:**
```bash
git add packages/tui/src/routes/session/index.tsx
git commit -m "tui: smart JSON formatting in generic tool output — tables, KV, todos"
```

---

### Task 3: Add count badge to completed TodoWrite (2 min)

**Objective:** When a `todowrite` completes and shows the todo list, add a count in the title like `# Todos (3)`.

**File:** `packages/tui/src/routes/session/index.tsx` — line 2803

**Current:**
```tsx
        <BlockTool title="# Todos" part={props.part}>
```

**Replace with:**
```tsx
        <BlockTool title={`# Todos (${todos().length})`} part={props.part}>
```

**Verification:** Completed todo tool calls show `# Todos (3)` instead of just `# Todos`.

**Commit:**
```bash
git add packages/tui/src/routes/session/index.tsx
git commit -m "tui: add todo count badge to TodoWrite block title"
```

---

### Task 4: Build and verify (2 min)

```bash
cd L:/PROJECTS/arcana && bun run build
```

Expected: 8 tasks successful, 0 errors.

**Smoke test:** Run Arcana, trigger a todo_write, verify braille spinner during pending state and checkbox rendering on completion.

**Commit:** Already committed per task. Push once at end:

```bash
git push
```

---

## Risks and Open Questions

1. **Table column width uses `Math.floor(ctx.width / columns.length)`** — may produce uneven widths on narrow terminals. Acceptable for MVP; fine-tuning is cosmetic.

2. **Table row limit is 20** — large arrays show only first 20 rows. No "and X more…" indicator. Acceptable for tool outputs which are typically small.

3. **TypeScript discriminated union in SolidJS `<Switch>/<Match>`** requires casting `formattedOutput()` in each branch. Not ideal but SolidJS doesn't have native discriminated union support in `<Match when={}>`.

4. **The `Switch`/`Match` approach for formatted output** is verbose. A future refactor could use a `FormattedOutput` component that encapsulates the switch logic. Out of scope for this plan.
