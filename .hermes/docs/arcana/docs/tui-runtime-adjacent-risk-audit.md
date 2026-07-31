# TUI runtime adjacent risk audit

This document extends the slash-command audit beyond the command definitions themselves.

Conclusion: the Arcana placeholder command map in `packages/tui/src/app.tsx` is still the main hard blocker for the current slash-command acceptance criteria. There are, however, adjacent runtime surfaces that can still make the TUI feel inconsistent if old plugin/server code uses them to inject fake slash prompts or stale command names.

## Hard blocker

### Arcana placeholder command map

File: `packages/tui/src/app.tsx`

This is the direct blocker. It still registers the old placeholder Arcana commands from a string list and fake-executes them by navigating to a session and showing a placeholder toast.

Impact:

- Removed commands can still appear.
- Retained commands do not have stable `arcana.*` IDs.
- Retained commands do not define direct `title`, `desc`, and `category` fields.
- Runtime behavior does not open real surfaces or precise fallbacks.

Fix this before polishing adjacent behavior.

## Adjacent runtime risks

### External command dispatch event

File: `packages/tui/src/app.tsx`

The TUI listens for `tui.command.execute` and dispatches the command name through the keymap.

This is good when the command exists in the cleaned keymap. It becomes risky if old plugin/server code emits stale names such as removed Arcana commands or old cockpit names.

Risk level: medium.

Follow-up:

- After replacing the Arcana command map, stale command names should fail instead of silently doing fake behavior.
- Consider adding logging or warnings for unknown external command dispatches if the keymap does not already report them.

### External prompt append event

File: `packages/tui/src/component/prompt/index.tsx`

The prompt listens for `tui.prompt.append` and inserts sanitized text into the prompt input.

This is a generic feature and not inherently wrong. It is risky only if old plugin/server code appends slash-like text as a fake command or prompt template.

Risk level: medium.

Follow-up:

- Keep the event for legitimate prompt insertion.
- Do not use this event to implement Arcana slash commands.
- If old cockpit code used prompt append for slash commands, migrate that behavior to real keymap commands.

### Server and MCP autocomplete entries

File: `packages/tui/src/component/prompt/autocomplete.tsx`

Server and MCP command rows are added separately from local keymap slash commands. Selecting one inserts slash text into the prompt instead of dispatching a TUI command.

Risk level: medium.

Follow-up:

- Decide whether server and MCP slash rows are prompt-level commands or executable TUI commands.
- If prompt-level, visually separate them from executable slash commands.
- If executable, register them into the same command/keymap system.
- Deduplicate final autocomplete rows across local and server sources.

### Skills selector prompt insertion

File: `packages/tui/src/component/prompt/index.tsx`

The `/skills` command opens a real selector, but selecting a skill inserts slash-like prompt text into the input.

Risk level: low to medium.

Follow-up:

- This may be intentional because skills can be prompt-level affordances.
- Keep it out of the Arcana command cleanup unless the product rule becomes: every slash row must execute a TUI action.

### Generic toast event

File: `packages/tui/src/app.tsx`

The TUI listens for `tui.toast.show` and displays arbitrary toast content from events.

Risk level: low.

Follow-up:

- This is not a blocker.
- Avoid using this event for fake command execution messages such as placeholder slash command output.

### Session select event

File: `packages/tui/src/app.tsx`

The TUI listens for `tui.session.select` and navigates to a concrete session ID.

Risk level: low.

Follow-up:

- This is not a blocker.
- The bad pattern is only the placeholder Arcana command map navigating to a session route without a real session target.

## Not currently a blocker

### Keybind defaults

File: `packages/tui/src/config/keybind.ts`

The keybind config defines generic application, session, model, prompt, input, and dialog bindings. It does not appear to define the bad Arcana placeholder slash commands directly.

Risk level: low.

## Practical priority

1. Replace the placeholder Arcana command map in `packages/tui/src/app.tsx`.
2. Verify removed slash commands no longer appear.
3. Verify retained commands use `arcana.*` IDs and direct metadata fields.
4. Then decide whether server/MCP commands and skills are allowed to remain prompt-level slash behaviors.
5. Add safeguards for external command dispatch or prompt append only if stale plugin/server behavior is observed.
