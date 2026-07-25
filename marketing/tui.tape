# Arcana TUI marketing tape (vhs) — RISKY, tune per machine.
# Render:  vhs tui.tape        # -> arcana-tui.mp4
#
# Risks:
#   - TUI is interactive opentui/solid. vhs drives it via pty keystrokes.
#     Mouse features will not work; keyboard only.
#   - First-run bun JIT is slow -> long Sleep after launching `arcana`.
#   - Agent run length depends on provider. Stream ~12s then cut in edit.
#   - Needs a provider API key in env (OPENAI_API_KEY / ANTHROPIC_API_KEY).
#     vhs does not inherit your shell env reliably -> set in tape via Execute:
#       Execute "export ANTHROPIC_API_KEY=sk-..."
#     (or run vhs from a shell that already has the key exported.)
#   - If TUI does not render in the pty, fall back to OBS (see RECORDING.md).

Output arcana-tui.mp4
Set FontFamily "Cascadia Code"
Set FontSize 18
Set Width 1200
Set Height 675
Set Padding 20
Set Theme "Catppuccin Mocha"
Set Shell "bash"
Set TypingSpeed 14

# Launch arcana (no args -> TUI).
Type "arcana"
Enter
Sleep 10

# Open command palette to show slash surfaces.
Ctrl+p
Sleep 2
Escape
Sleep 1

# Type a prompt that triggers reasoning + tool calls.
Type "build a hello world http server in bun and run it"
Enter
Sleep 14

# Show memory surface.
Type "/memory"
Enter
Sleep 3
Escape
Sleep 1

# Show skills surface.
Type "/skills"
Enter
Sleep 3
Escape
Sleep 1

# Show cron surface.
Type "/cron"
Enter
Sleep 3
Escape
Sleep 1

# Quit.
Ctrl+c
Sleep 2