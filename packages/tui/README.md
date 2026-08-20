# @arcana/tui

Terminal User Interface for Arcana — the governed autonomy runtime.

## Overview

Built with OpenTUI + SolidJS, the TUI provides an interactive terminal interface for managing sessions, reviewing governance events, approving actions, and monitoring agent activity.

## Key Features

- **Command Spine** — Timeline of tool calls, chat messages, and governance events
- **Approval Gates** — Interactive approval/denial of governed actions
- **Streaming Animation** — Real-time feedback during LLM responses
- **Session Management** — Switch between sessions, view history

## Architecture

```
src/
├── app.tsx              # Main TUI surface
├── shell/               # Command spine, layout, rendering
├── routes/              # Session, home routes
├── component/           # Dialogs, spinners, UI components
├── context/             # SolidJS contexts (KV, sync, theme)
└── config/              # TUI configuration
```

## Development

```bash
bun run dev:tui    # Start TUI development
bun test packages/tui  # Run TUI tests
```
