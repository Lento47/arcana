# Arcana Project Nodes Overview

## Project Structure
The Arcana project is organized into core technical components:
1. **Engine** - Session framework and execution pipeline
2. **Core** - Effect runtime and persistence layer
3. **TUI** - Terminal user interface components
4. **Proof** - Verifiable execution system

## Key Features
- Governed autonomy through capability/approval channels
- Pure deterministic execution with transparency
- Cross-package dependency management

## Technical Architecture
```mermaid
mindmap
    root Engineering
    |-- Language Stack
    |   |-- TypeScript 7.x + ESM
    |   |-- Bun 1.3+ runtime
    
    |-- Runtime Layer
    |   |-- Effect system for concurrency
    |   |-- Drizzle + SQLite persistence
    |   |-- SolidJS for reactive UI
    
    |-- Service Layers
    |   |-- Server/services (Hono API)
    |   |-- LLMs (AI SDK + providers)
    |   |-- Plugin system for extensions

## Development Tools
- Bash commands for workspace operations
- `glob``/grep` for file/component search
- Sandboxed skill execution for isolated tasks
- TUI-specific constraints for session security

## Configuration
- All project nodes follow strict directory patterns:
  `packages/{component}/{path}`
- Configuration files:
  - `arcana.json` (primary settings)
  - Session-specific config in `.arcana/`

## State Management
- Workspace state tracked via `makeRuntime` service
- Per-instance cleanup with `InstanceState`
- Proof provenance tracking for auditability
/`grep` for file/component search
- Sandboxed skill execution for isolated tasks
- TUI-specific constraints for session security

## Configuration
- All project nodes follow strict directory patterns:
  `packages/{component}/{path}`
- Configuration files:
  - `arcana.json` (primary settings)
  - Session-specific config in `.arcana/`

## State Management
- Workspace state tracked via `makeRuntime` service
- Per-instance cleanup with `InstanceState`
- Proof provenance tracking for auditability
