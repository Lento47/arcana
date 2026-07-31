# TUI slash command audit

This document records the current undesired and transitional code paths found during the Arcana slash-command cleanup.

The intended direction is executable TUI commands. Slash autocomplete, command palette, keybinds, and execution should all come from the same command definitions. Slash rows should be executable TUI actions or intentionally open real TUI surfaces. Arcana-specific commands should use stable `arcana.*` IDs and explicit `title`, `desc`, and `category` fields.

## Desired Arcana command set

Keep only these Arcana slash commands for now:

| Slash | Internal ID | Desired behavior |
| --- | --- | --- |
| `/contract` | `arcana.contract` | Inspect active execution contract, or warn precisely if no view is connected yet. |
| `/actions` | `arcana.actions` | Show execution action timeline, or warn precisely if no view is connected yet. |
| `/diffgate` | `arcana.diffgate` | Show diff gate state, or warn precisely if no view is connected yet. |
| `/verify` | `arcana.verify` | Open verifier/status surface. Current closest surface: `DialogStatus`. |
| `/sovereignty` | `arcana.sovereignty` | Open provider/model sovereignty surface. Current closest surface: `DialogModel`. |

Hide or remove until real implementations exist: `/mission`, `/risk`, `/proof`, `/tokens`, `/rollback`, and `/compat`.

## Confirmed undesired code paths

### 1. Placeholder Arcana command map

File: `packages/tui/src/app.tsx`

The app command list currently builds Arcana slash commands from a string array. This is undesired because it exposes too many placeholder commands, uses bare command names instead of stable `arcana.*` IDs, omits direct `title`, `desc`, and `category` fields, and fake-executes by navigating to a session route and showing a vague informational toast.

Required fix: replace the array/map block with explicit command objects. Keep only `/contract`, `/actions`, `/diffgate`, `/verify`, and `/sovereignty`. Use real surfaces when available. Otherwise, show a precise warning toast and do not pretend to execute.

### 2. Stale command-registry copy

File: `packages/tui/src/command/command-registry.ts`

The registry contains copy for both retained and removed Arcana commands. Removed command names still appear in `ARCANA_COMMAND_COPY`: `mission`, `risk`, `proof`, `tokens`, `rollback`, and `compat`.

This is undesired because it acts like a second source of truth for command labels and can keep aspirational command copy alive after runtime command definitions change.

Current branch status: `CommandPaletteDialog` and `useCommandSlashes()` no longer import this registry. If the file is unused, prefer deleting it. If deletion is unsafe, reduce it to retained commands only. Do not add a new command registry or replacement abstraction.

### 3. Server-command slash autocomplete inserts prompt text

File: `packages/tui/src/component/prompt/autocomplete.tsx`

Server and MCP commands are appended to slash autocomplete separately from local keymap commands. Selecting one inserts slash text into the prompt instead of dispatching a TUI command.

This is risky because executable local slash commands and prompt-level server commands are visually mixed. It is closer to prompt-template behavior than executable TUI action behavior.

Do not remove blindly. Server or MCP slash commands may be intentionally interpreted by the backend after prompt submission. If that behavior remains, the UI should visually distinguish server prompt commands from executable TUI actions. If Arcana wants strict executable slash commands only, server commands should be registered into the same command/keymap system instead of inserted as prompt text.

### 4. `/skills` command inserts slash-like prompt text

File: `packages/tui/src/component/prompt/index.tsx`

The `/skills` command opens a real surface, but selecting a skill inserts slash-like prompt text into the prompt.

This may be intentional, but it is not the same model as executable TUI commands. Keep it separate from Arcana TUI action commands unless the product decision is that all slash rows must be executable TUI actions.

### 5. Duplicate slash rows from multiple command sources

Files: `packages/tui/src/keymap.tsx` and `packages/tui/src/component/prompt/autocomplete.tsx`

Local app commands, prompt commands, plugin commands, and server commands can all contribute slash rows. `useCommandSlashes()` now deduplicates local keymap command slashes, but server commands are still appended separately in `autocomplete.tsx`, so duplicates can still appear across local and server command sources.

Required follow-up: deduplicate the final autocomplete list across both local executable commands and server prompt commands, or separate them visually. Prefer executable local commands when the same slash exists in both sources.

## Already aligned on this branch

### Command palette field source

File: `packages/tui/src/component/command-palette.tsx`

The command palette reads `entry.command.title`, `entry.command.desc`, and `entry.command.category` directly. It no longer relies on command-registry normalization for palette labels.

### Slash command deduplication

File: `packages/tui/src/keymap.tsx`

`useCommandSlashes()` now tracks seen slash display names, skips duplicate local keymap slash rows, and reads descriptions directly from command fields.

## Implementation sequence

1. Replace the placeholder Arcana command map in `packages/tui/src/app.tsx`.
2. Re-run QA for removed commands and fake execution strings.
3. Remove or shrink `packages/tui/src/command/command-registry.ts` if unused.
4. Decide whether server slash commands are executable commands or prompt-level commands.
5. Decide whether `/skills` remains a prompt-level command or moves into a separate non-action category.
6. Deduplicate final autocomplete rows across both local and server sources.

## Final expected behavior

After cleanup, there should be no user-facing `Cockpit:` labels, no `cockpit.*` IDs for Arcana commands, no `Switched to cockpit` toast, no removed placeholder commands in app slash definitions, no fake session navigation for Arcana commands, and no fake slash execution toast. Retained Arcana commands should use `arcana.*` IDs and direct command fields. Slash autocomplete and command palette should read from existing command definitions without a new registry or normalization layer.
