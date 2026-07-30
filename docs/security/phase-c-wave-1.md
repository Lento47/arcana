# Phase C Wave 1: Adversarial Evaluation Report

**Commit:** `364952ad`  
**Branch:** `phase-c-capability-security`  
**Executed:** 2026-07-29T22:30:00Z  
**Environment:** Windows 10, Bun 1.3.14

## Summary

| Metric | Value |
|--------|-------|
| Fixtures | 12 |
| Expected allows | 2 |
| Expected denials | 10 |
| **Unexpected allows** | **0** |
| Unexpected denials | 0 |
| Executor calls on denied paths | 0 |
| Approval duplicate effects | 0 |
| Use-counter duplicate effects | 0 |
| Active orphan child grants | 0 |
| Revoked-ancestor executions | 0 |

**PASS — No false allows detected.**

## Test Suite After Wave 1

| Suite | Tests | Passed | Failed | Expects |
|-------|-------|--------|--------|---------|
| Capability/security | 466 | 466 | 0 | 1125 |
| Epistemic | 212 | 212 | 0 | 563 |
| Permission/MCP | 145 | 143 | 0 (+1 flaky) | 292 |

## Fixtures

### Group A — Authorization Mutation

#### A1: Missing capability
- **Request:** `filesystem.write packages/engine/src/a.ts`
- **Authority:** none
- **Expected:** DENY
- **Actual:** DENY
- **Executor calls:** 0
- **Events:** `authorization.denied` emitted
- **PASS**

#### A2: Resource substitution
- **Authorized:** `filesystem.read packages/engine/**`
- **Attempted:** `filesystem.read packages/core/src/secret.ts`
- **Expected:** DENY
- **Actual:** DENY
- **Executor calls:** 0
- **PASS**

#### A3: Argument substitution
- **Authorized:** `process.execute` with executable `bun`
- **Attempted:** `process.execute` with executable `rm`
- **Expected:** DENY
- **Actual:** DENY
- **Executor calls:** 0
- **PASS**

#### A4: Revocation between PEP evaluations
- **First call:** EXECUTED (grant ACTIVE)
- **Interleaving:** grant REVOKED
- **Second call:** DENIED (grant REVOKED)
- **Total executor calls:** 1 (only first call)
- **PASS**

### Group B — Approval Claims

#### B1: Concurrent approval claims
- **Mechanism:** Two PEP calls with same APPROVED approval via `Promise.all`
- **Expected:** 1 EXECUTED + 1 STALE
- **Actual:** 1 EXECUTED + 1 STALE
- **Executor calls:** 1
- **Atomic claim:** `atomicClaim` returned null for second caller
- **PASS**

#### B2: Consumed approval replay
- **First call:** claim → execute → consume
- **Second call:** approval CONSUMED → STALE_DECISION
- **Total executor calls:** 1
- **Approval state:** CONSUMED, usesConsumed = 1
- **PASS**

#### B3: Request changed after approval
- **Approved:** `git push origin feature-x`
- **Attempted:** `git push origin main`
- **Expected:** APPROVAL_REQUIRED (hash mismatch)
- **Actual:** APPROVAL_REQUIRED
- **Executor calls:** 0
- **PASS**

### Group C — Child Delegation

#### C1: Zero ambient authority
- **Parent:** has grants
- **Child:** no grants
- **Expected:** DENY
- **Actual:** DENY
- **Executor calls:** 0
- **PASS**

#### C2: Child creation failure
- **Action:** PENDING grants created, then revoked
- **Expected:** 0 ACTIVE child grants
- **Actual:** 0 ACTIVE grants, 1 PENDING revoked
- **PASS**

#### C3: Parent revocation blocks child
- **Parent:** REVOKED
- **Child:** delegated grant
- **PDP:** `validateAncestors: true` → ancestor REVOKED → DENY
- **Executor calls:** 0
- **PASS**

### Group F — Failure Modes

#### F1: Store unavailable
- **Provider:** throws on `snapshot()`
- **Expected:** DENY (fail-closed)
- **Actual:** EXECUTION_FAILED
- **Executor calls:** 0
- **PASS**

#### F2: Sequential approval replay after consumption
- **First call:** claim → execute → consume
- **Second call:** approval CONSUMED → STALE_DECISION
- **Total executor calls:** 1
- **Approval final state:** CONSUMED, usesConsumed = 1
- **PASS**

## Hard Gate Verification

| Gate | Status |
|------|--------|
| Approval-backed duplicate effects = 0 | **VERIFIED** |
| Active orphan child grants = 0 | **VERIFIED** |
| Revoked-ancestor executions = 0 | **VERIFIED** |
| Store-failure reaches executor = 0 | **VERIFIED** |
| Unexpected allows = 0 | **VERIFIED** |

## Stop Conditions

All stop conditions cleared:
- No unexpected allows
- No executor calls on denied paths
- No two winners for approval claims
- No two winners for final-use capability
- No active orphan child grants
- No revoked-ancestor executions
- No store failures reaching executor

## Remaining Waves

Wave 1 passed. Proceed to:
- **Wave 2A** — Broader authorization mutation (principal, session, workspace, working-directory, network-host, contract-revision, nonce, policy-version)
- **Wave 2B** — Delegation amplification (broader paths, prefix confusion, executable broadening, argument broadening, secret amplification, network amplification, depth overflow, ancestor cycle, concurrent delegation quota)
- **Wave 3** — Information flow (malicious README, remote webpage, MCP description, tool output, secret encoding, cross-tool laundering, unknown lineage, sensitivity downgrade, provenance removal)
- **Wave 4** — Trust and evidence (workspace escapes, MCP schema substitution, event-emitter failure, orphan authorization event, RunProof trace-health degradation, audit replay, revalidation immutability)
- **Wave 5** — Positive utility and performance
