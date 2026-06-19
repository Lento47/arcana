# Arcana VSCode Extension

> Inline AI agent panel in VS Code sidebar.

## Status: Planned

This extension is in early planning. It will provide:
- Arcana session panel in VS Code sidebar
- Inline code actions via the agent
- Session management from within the editor

## Development

```bash
cd extensions/vscode
npm install
code .
```

## Architecture

The extension communicates with arcana's HTTP API (arcana serve) or directly with the 
opencode SDK (packages/sdk/js) for local sessions.
