# Arcana slash-command cleanup: undesired code paths

Branch: `fix/command-registry-alignment`

This note tracks code paths that are not aligned with the desired OpenCode-style command behavior.

## Confirmed: remove / replace

### 1. Placeholder Arcana command map in `packages/tui/src/app.tsx`

Current code registers eleven slash commands through a string array:

```ts
...["contract", "mission", "actions", "risk", "diffgate", "verify", "proof", "tokens", "rollback", "sovereignty", "compat"].map((cmd) => ({
  name: cmd,
  slashName: cmd,
  run: () => {
    route.navigate({ type: "session" } as any)
    toast.show({ message: `/ ${cmd}`, variant: "info" })
    dialog.clear()
  },
})),
```

Why this is undesired:

- It keeps aspirational placeholders visible in slash autocomplete.
- It exposes removed commands: `/mission`, `/risk`, `/proof`, `/tokens`, `/rollback`, `/compat`.
- It gives commands unstable/bare IDs instead of stable `arcana.*` IDs.
- It does not provide `title`, `desc`, or `category` directly on the command definitions.
- It fake-executes by navigating to session and showing `/ cmd` in a toast.
- It makes `/contract`, `/actions`, `/diffgate`, `/verify`, and `/sovereignty` look executable even when most do not open real TUI surfaces.

Desired replacement:

- Replace the array/map with explicit command objects only for:
  - `arcana.contract` with `/contract`
  - `arcana.actions` with `/actions`
  - `arcana.diffgate` with `/diffgate`
  - `arcana.verify` with `/verify`
  - `arcana.sovereignty` with `/sovereignty`
- Use direct `title`, `desc`, `category: "Arcana"` fields.
- Real views when available:
  - `/verify` can open `DialogStatus` as the closest current verification/status surface.
  - `/sovereignty` can open `DialogModel` as the closest current provider/model sovereignty surface.
- Otherwise, show a precise warning toast and do not pretend to execute.

## Watch / decide before changing

### 2. Server-command slash autocomplete inserts prompt text

File: `packages/tui/src/component/prompt/autocomplete.tsx`

Current behavior:

```ts
for (const serverCommand of sync.data.command) {
  if (serverCommand.source === "skill") continue
  const label = serverCommand.source === "mcp" ? ":mcp" : ""
  results.push({
    display: "/" + serverCommand.name + label,
    description: serverCommand.description,
    onSelect: () => {
      const newText = "/" + serverCommand.name + " "
      const cursor = props.input().logicalCursor
      props.input().deleteRange(0, 0, cursor.row, cursor.col)
      props.input().insertText(newText)
      props.input().cursorOffset = Bun.stringWidth(newText)
    },
  })
}
```

Why this may be undesired:

- It does not dispatch the TUI keymap command system.
- It inserts slash text into the prompt, which is closer to prompt-template behavior than executable TUI action behavior.
- It means some slash autocomplete entries come from `useCommandSlashes()` and execute immediately, while server commands only write text.

Do not remove blindly:

- This may be intentional for server/MCP commands if the backend interprets submitted slash text.
- If Arcana wants strict OpenCode-style TUI actions only, this path needs a design decision: either register server commands into the same keymap command system or visually separate them from executable TUI commands.

### 3. `/skills` selection inserts slash-like prompt text

File: `packages/tui/src/component/prompt/index.tsx`

Current behavior:

```ts
{
  title: "Skills",
  name: "prompt.skills",
  category: "Prompt",
  slashName: "skills",
  run: () => {
    dialog.replace(() => (
      <DialogSkill
        onSelect={(skill) => {
          input.setText(`/${skill} `)
          setStore("prompt", {
            input: `/${skill} `,
            parts: [],
          })
          input.gotoBufferEnd()
        }}
      />
    ))
  },
}
```

Why this may be undesired:

- Selecting a skill inserts a slash-like prompt command instead of dispatching a keymap/TUI command.
- This is explicitly prompt-template-like behavior.

Do not remove blindly:

- Skills may be intentionally prompt-level commands, not TUI actions.
- For the Arcana slash-command cleanup, keep this separate from the `arcana.*` command work unless the product decision is that all slash rows must be executable TUI actions.

## Already aligned on this branch

### 4. Command palette now reads command fields directly

`CommandPaletteDialog` reads `entry.command.title`, `entry.command.desc`, and `entry.command.category` directly instead of relying on a command normalization layer.

### 5. Slash autocomplete deduplicates slash rows

`useCommandSlashes()` now tracks seen slash display names and skips duplicates.

## QA search terms

After the `app.tsx` block is replaced, run these checks:

```bash
rg "Cockpit:" packages/tui/src
rg "cockpit\." packages/tui/src
rg "Switched to cockpit" packages/tui/src
rg 'mission|risk|proof|tokens|rollback|compat' packages/tui/src/app.tsx
rg 'route\.navigate\(\{ type: "session" \} as any\)' packages/tui/src/app.tsx
rg 'toast\.show\(\{ message: `/ \$\{cmd\}`' packages/tui/src/app.tsx
```

Expected:

- No user-facing `Cockpit:` labels.
- No `cockpit.*` IDs for Arcana commands.
- No `Switched to cockpit` toast.
- Removed placeholder commands do not appear in `app.tsx` slash definitions.
- No fake session navigation for Arcana commands.
- No `/ ${cmd}` fake execution toast.
