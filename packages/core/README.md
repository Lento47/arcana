# @arcana/core

Core runtime for the Arcana governed autonomy platform.

## Overview

Provides the foundational services for session management, capability-based security, event sourcing, and persistence.

## Key Modules

- **Capability System** — PDP/PEP authorization, grants, approvals
- **Event System** — EventV2 pub/sub, durable event store
- **Database** — SQLite + Drizzle ORM with Effect bridge
- **Crypto** — Approval lifecycle, offline policy, RunProof

## Usage

```typescript
import { Database } from "@arcana/core/database/database"
import { EventV2 } from "@arcana/core/event"
import { CapabilityGrantStore } from "@arcana/core/capability/grant-store"
```

## Dependencies

- Effect (typed DI, concurrency)
- Drizzle ORM (SQLite)
- Zod (runtime schemas)
