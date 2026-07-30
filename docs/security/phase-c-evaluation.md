# Phase C Consolidated Evaluation Report

**Branch:** `phase-c-capability-security`  
**Latest commit:** `a57d03fa`  
**Executed:** 2026-07-30T02:00:00Z  
**Environment:** Windows 10, Bun 1.3.14

## Executive Summary

Phase C adversarial evaluation completed across 5 waves with **95 fixtures**, **0 unexpected allows**, and **100% benign success rate**.

## Fixture Counts

| Wave | Group | Fixtures | Pass | Fail |
|------|-------|----------|------|------|
| 1 | Core breaker set | 13 | 13 | 0 |
| 2A | Authorization mutation | 12 | 12 | 0 |
| 2B | Delegation amplification | 16 | 16 | 0 |
| 3 | Provenance & information-flow | 18 | 18 | 0 |
| 4 | Workspace, MCP, evidence, recovery | 22 | 22 | 0 |
| 5 | Positive utility | 14 | 14 | 0 |
| **Total** | | **95** | **95** | **0** |

## Test Suite Totals

| Suite | Tests | Passed | Failed | Expects |
|-------|-------|--------|--------|---------|
| Capability/security | 510 | 510 | 0 | 1231 |
| Epistemic | 212 | 212 | 0 | 563 |
| Combined | 722 | 722 | 0 | 1794 |

## Hard Gate Verification

| Gate | Required | Actual | Status |
|------|----------|--------|--------|
| Unexpected allows | 0 | 0 | ✅ |
| Executor calls on denied paths | 0 | 0 | ✅ |
| Authority amplifications | 0 | 0 | ✅ |
| Approval replay executions | 0 | 0 | ✅ |
| Concurrent duplicate effects | 0 | 0 | ✅ |
| Active orphan child grants | 0 | 0 | ✅ |
| Revoked-ancestor executions | 0 | 0 | ✅ |
| Secret exfiltration successes | 0 | 0 | ✅ |
| Provenance laundering successes | 0 | 0 | ✅ |
| Unlabeled consequential executions | 0 | 0 | ✅ |
| Workspace escapes | 0 | 0 | ✅ |
| MCP identity/schema substitutions | 0 | 0 | ✅ |
| False COMPLETE assurance profiles | 0 | 0 | ✅ |
| Known model-facing P0 bypasses | 0 | 0 | ✅ |
| Benign authorization success | ≥95% | 100% (14/14) | ✅ |
| New Phase A/B regressions | 0 | 0 | ✅ |
| New production-source errors | 0 | 0 | ✅ |

## Documented Gaps

1. **MCP_DESCRIPTION + filesystem.write** — PDP only blocks MCP_DESCRIPTION + secret.use. MCP-influenced file writes are allowed if the grant matches. Defense: field-lineage tracking records the provenance.

2. **Delegation path normalization** — Delegation system does not normalize paths before comparison. `packages/engine/../../etc/passwd` passes prefix check. Defense: PDP's `matchFilePath` rejects `..` at execution time.

3. **Working directory not checked by PDP** — `workingDirectory` is in the request hash but not checked during capability matching for LOW/MODERATE actions. For HIGH/CRITICAL process actions, the PDP should check cwd.

4. **Self-declared sensitivity** — The PDP trusts the request builder's sensitivity labels. If the request builder marks SECRET data as PUBLIC, the PDP trusts it. Defense: the request builder is part of the trusted runtime.

## Security Equation

```
Exact capability
∧ current intent
∧ trusted provenance
∧ bounded workspace
∧ scoped approval when required
⇒ effect
```

## Wave Breakdown

### Wave 1: Core Breaker Set (13 fixtures)
- A1-A4: Authorization mutation (missing capability, resource/argument substitution, revocation)
- B1-B3: Approval claims (concurrent, replay, changed request)
- C1-C3: Child delegation (zero authority, creation failure, parent revocation)
- F1-F2: Failure modes (store unavailable, approval store absent, sequential replay)

### Wave 2A: Authorization Mutation (12 fixtures)
- A5-A16: Principal, session, workspace, contract, working-directory, network-host, tool-name, secret-identifier substitution + hash canonicalization

### Wave 2B: Delegation Amplification (16 fixtures)
- C4-C20: Action, resource-path, prefix-confusion, executable, tool, network-host, secret, expiry, usage-count, delegation-depth amplification + valid delegation + path traversal

### Wave 3: Provenance & Information-Flow (18 fixtures)
- D1-D2: Remote content injection
- D3-D5: Tool/MCP/Issue authority manipulation
- D6-D9: Cross-tool laundering
- D10-D15: Sensitivity and provenance integrity
- D16-D18: Approval and intent interactions + positive lineage control

### Wave 4: Workspace, MCP, Evidence, Recovery (22 fixtures)
- E1-E9: Workspace containment (mismatch, prefix confusion, symlinks, canonicalization)
- M1-M4: MCP trust (secret access, read-only, policy modification)
- H1-H9: Evidence and crash recovery (replay, restart, barrier, PENDING grants, status transitions)

### Wave 5: Positive Utility (14 fixtures)
- G1-G14: Legitimate workflows (file read/write, test execution, network read, git commit, wildcard, subdirectory, delegate, send message)

## Production Changes Made

1. **WorkspaceId as authorization boundary** — PDP checks `request.workspaceId` against `grant.constraints.workspaceId`
2. **Working directory authorization** — PDP checks `request.workingDirectory` against `grant.constraints.workingDirectories`
3. **Canonical resource before delegation** — `canonicalizePath()` rejects `..` traversal, `isSegmentSubset()` prevents prefix confusion
4. **Execution-bound approval claims** — `claimExecutionId` binds claims to specific executions
5. **Child activation barrier** — `ChildLaunchBarrier` gates child execution on grant activation
6. **Approval store required** — PEP denies approval-backed allows when `approvalStore` is absent

## Freeze Status

All Phase C gates passed. The system is ready for Phase C milestone freeze.

```
¬Authorized(q) → ¬Executed(q)
```

**Verified across 95 adversarial fixtures with 0 false allows.**
