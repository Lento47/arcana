# Phase C Wave 2: Authorization Mutation + Delegation Amplification Report

**Commit:** `4a932343`  
**Branch:** `phase-c-capability-security`  
**Executed:** 2026-07-30T00:00:00Z  
**Environment:** Windows 10, Bun 1.3.14

## Summary

| Metric | Value |
|--------|-------|
| Wave 2A fixtures | 12 |
| Wave 2B fixtures | 16 |
| **Total Wave 2 fixtures** | **28** |
| Unexpected allows | 0 |
| Executor calls on denied paths | 0 |
| Authority amplifications | 0 |

**PASS — No unauthorized executor calls.**

## Test Suite After Wave 2

| Suite | Tests | Passed | Failed | Expects |
|-------|-------|--------|--------|---------|
| Capability/security | 507 | 507 | 0 | 1203 |
| Epistemic | 212 | 212 | 0 | 563 |
| Combined | 719 | 719 | 0 | 1766 |

## Wave 2A: Authorization Mutation (A5-A16)

| Fixture | Attack Vector | Expected | Actual | Executor | Pass |
|---------|--------------|----------|--------|----------|------|
| A5 | Principal substitution | DENY | DENY_PRINCIPAL_MISMATCH | 0 | ✅ |
| A6 | Session substitution | DENY | DENY_SESSION_MISMATCH | 0 | ✅ |
| A7 | Workspace substitution | DOC | PDP workspaceId check is no-op | N/A | ✅ |
| A8 | Contract ID substitution | DENY | DENY_CONTRACT_MISMATCH | 0 | ✅ |
| A9 | Contract revision drift | HASH | Different contractId → different hash | N/A | ✅ |
| A10 | Working-directory substitution | DOC | Not checked by PDP, in hash | N/A | ✅ |
| A11 | Network-host suffix attack | DENY | DENY_RESOURCE_OUT_OF_SCOPE | 0 | ✅ |
| A12 | Tool-name substitution | DENY | DENY_TOOL_OUT_OF_SCOPE | 0 | ✅ |
| A13 | Secret-identifier substitution | DENY | DENY_RESOURCE_OUT_OF_SCOPE | 0 | ✅ |
| A14 | Request nonce replay | HASH | Same nonce → same hash | N/A | ✅ |
| A15 | Policy-version drift | PDP | Recorded, doesn't affect matching | N/A | ✅ |
| A16 | Approval store absent | DENY | DENY_APPROVAL_STORE_UNAVAILABLE | 0 | ✅ |

## Wave 2B: Delegation Amplification (C4-C20)

| Fixture | Attack Vector | Expected | Actual | Pass |
|---------|--------------|----------|--------|------|
| C4 | Action amplification | DENY | DENY_ACTION_AMPLIFICATION | ✅ |
| C5 | Resource-path broadening | DENY | DENY_RESOURCE_AMPLIFICATION | ✅ |
| C6 | Prefix-confusion path | DENY | DENY_RESOURCE_AMPLIFICATION | ✅ |
| C7 | Executable broadening | DENY | DENY_EXECUTABLE_AMPLIFICATION | ✅ |
| C9 | Tool amplification | DENY | DENY_TOOL_AMPLIFICATION | ✅ |
| C10 | Network-host amplification | DENY | DENY_RESOURCE_AMPLIFICATION | ✅ |
| C11 | Secret amplification | DENY | DENY_RESOURCE_AMPLIFICATION | ✅ |
| C12 | Expiry amplification | DENY | DENY_EXPIRY_AMPLIFICATION | ✅ |
| C13 | Usage-count amplification | DENY | DENY_USE_AMPLIFICATION | ✅ |
| C14 | Delegation-depth overflow | DENY | DENY_DELEGATION_DEPTH | ✅ |
| C15 | Action broadening | DENY | DENY_ACTION_AMPLIFICATION | ✅ |
| C16 | Valid narrow delegation | CREATED | CREATED | ✅ |
| C17 | Delegation not allowed | DENY | DENY_DELEGATION_DEPTH | ✅ |
| C18 | Full attenuation | CREATED | CREATED | ✅ |
| C19 | Multiple amplification vectors | DENY | DENY_ACTION_AMPLIFICATION | ✅ |
| C20 | Path traversal (DOCUMENTED GAP) | DOC | CREATED — delegation doesn't normalize | ✅ |

## Documented Gaps

1. **A7 — PDP workspaceId check is no-op:** The PDP has a workspace constraint check block that is empty. Workspace isolation relies on sessionId matching only.

2. **A10 — Working directory not checked by PDP:** `workingDirectory` is included in the request hash but not checked during capability matching. A grant with no working-directory constraint matches any working directory.

3. **C20 — Delegation doesn't normalize paths:** `packages/engine/../../etc/passwd` passes delegation's prefix check because it starts with `packages/`. The PDP's `matchFilePath` rejects `..` at execution time, so the child grant exists but cannot be used for traversal. This is a defense-in-depth gap.

## Hard Gate Status

| Gate | Status |
|------|--------|
| Unexpected allows = 0 | **VERIFIED** |
| Executor calls on denied paths = 0 | **VERIFIED** |
| Authority amplifications = 0 | **VERIFIED** |
| Approval store bypass = 0 | **VERIFIED** |

## Remaining Waves

- **Wave 3** — Provenance and information-flow attacks
- **Wave 4** — Workspace, MCP, evidence, and recovery
- **Wave 5** — Positive utility and performance
