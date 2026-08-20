# arcana

CLI distribution and user commands for Arcana.

## Overview

The main CLI package that provides user-facing commands for managing Arcana sessions, proofs, and governance.

## Commands

- `arcana session` — Session management
- `arcana proof` — RunProof verification
- `arcana capability` — Capability management
- `arcana mcp` — MCP server management

## Usage

```bash
arcana session list          # List sessions
arcana proof inspect <id>    # Inspect a proof
arcana capability revoke     # Revoke capabilities
```

## Development

```bash
bun run dev          # Start development
bun test             # Run tests
```
