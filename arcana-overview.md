# Arcana Project Nodes Overview

## Core Architecture
The Arcana project is structured into distinct technical components:
1. **Engine** - Session framework and execution pipeline
2. **Core** - Foundation runtime with Effect concurrency system
3. **TUI** - Terminal interface implementation layer
4. **Proof** - Verifiable execution verification system

## Technical Stack
```mermaid
mindmap
    root Arcana Infrastructure
    |-- Language Layer
    |   |-- TypeScript 7.x (strict mode)
    |   |-- Domains/DomainsHost
    
    |-- Execution Layer
    |   |-- Effect system (concurrency
    |   |-- Drizzle ORM (SQLite backend)
    |   |-- SolidJS (reactive UI)
    |
    |-- Service Layer
      |-- Server services (Hono API)
      |-- LLMs & AI SDK
      |-- Plugin ecosystem

## File Organization
- Project structure:
  ```text
  packages/
  ├── arcana/          # CLI commands & Interfaces
  ├── engine/          # Session core & TUI
  ├── core/            # Runtime foundation
  ├── llm/             # Language Processing
  ├── server/          # HTTP Services
  └── skills/          # Capability extensions
  ```

- Configuration files:
  - Primary: `arcana.json` (project root)
  - Session data: `.arcana/session.json`
  - Permissions: `.arcana/permissions.json`

## Component Interactions
Components communicate through:
1. Effect managers for state handling
2. Module system for cross-package dependencies
3. Worker execution for async tasks

## File System Management
- Tool commands:
  - `bash` for system operations
  - `glob` for pattern matching
  - `grep` for content search
  - `read/write` for direct file access

- State tracking:
  - `makeRuntime` for workspace session
  - `InstanceState` for per-connection cleanup
