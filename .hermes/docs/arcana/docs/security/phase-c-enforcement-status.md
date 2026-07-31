---
title: Phase C Enforcement Status
status: ACTIVE
branch: phase-c-capability-security
---

# Phase C Enforcement Status

## What is genuinely complete

- Fail-closed SessionPolicyProvider
- Session/workspace grant filtering
- Immediate revocation behavior
- Storage failure resulting in denial
- Capability-based PEP tests
- Consistent MCP decision semantics
- No Phase A/B regressions

## Two blockers (now resolved)

### 1. Grants were not yet persisted

Previously described only:
- CapabilityGrantStore interface
- InMemoryGrantStore implementation

An in-memory implementation does not survive process restart.

Resolution: SqliteGrantStore implemented in packages/core/src/capability/grant-store-sqlite.ts. Backed by the existing database layer via a dedicated capability_grants table with migration 20260729000000_capability_grants.

### 2. Production was permissive

The defaultPolicyProvider in tools.ts was the permissive migration shim. Real runtime enforcement was not activated.

Resolution: SessionPolicyProvider is now the production provider. The permissive shim has been removed. No grants means DENY. Storage failure means DENY.

## Current status

- PDP: COMPLETE
- PEP: COMPLETE
- Tool adapter: COMPLETE
- Fail-closed provider implementation: COMPLETE
- In-memory grant-store tests: COMPLETE
- Durable capability persistence: COMPLETE
- Production provider activation: COMPLETE
- Real least-privilege enforcement: ACTIVE

## Security boundary audit targets

- P0 boundaries: 16/16
- P0 deterministic enforcement: 16/16
- P0 permissive migration paths: 0
- P0 direct bypass paths: 0
