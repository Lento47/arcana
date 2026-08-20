# @arcana/server

HTTP API server for Arcana — provides REST endpoints for external clients.

## Overview

Built with Hono, the server exposes session management, governance, and proof verification APIs.

## Key Endpoints

- `/api/sessions` — Session CRUD and prompt submission
- `/api/approvals` — Approval management
- `/api/proofs` — RunProof verification
- `/api/events` — SSE event stream

## Usage

```typescript
import { createServer } from "@arcana/server/server"
```

## Development

```bash
bun run dev        # Start development server
bun test           # Run tests
```
