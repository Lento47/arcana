> **SUPERSEDED (2026-08-02)** — Consolidated into
> `.hermes/docs/arcana/docs/arcana-Master/Arcana_Project_Master_Specification.md`
> (mirrored to `docs/arcana-Master/`), Part II. This file is retained for
> history and reference-tool compatibility; the consolidated document is the
> single source of truth.

# Arcana Phase-by-Phase 100% Completion Playbook

**Document type:** Master implementation roadmap and release-gate specification  
**Project:** Arcana  
**Version:** 1.0  
**Date:** 2026-07-31  
**Roadmap horizon:** Phase A through Phase F, plus parallel TUI, CLI, Node, SDK, and Control product tracks  
**Status basis:** Built from the latest Arcana architecture, Phase A-C implementation history, and the Phase C adversarial evaluation reported by the project owner.

---

## 1. Purpose of this document

This document defines, step by step, what Arcana is expected to build in every architectural phase, what must be tested, what artifacts must exist, and what criteria must be satisfied before a phase can honestly be declared **100% complete**.

It has five purposes:

1. Prevent roadmap ambiguity.
2. Separate implemented capability from product vision.
3. Prevent a phase from being declared complete only because unit tests pass.
4. Define measurable release gates for security, usability, performance, reliability, and documentation.
5. Provide a single handoff document for engineering agents, contributors, reviewers, and future enterprise stakeholders.

This is a normative roadmap. Exact module names can evolve, but the security invariants and exit gates should not be weakened without an explicit architecture decision record.

---

## 2. Arcana's final objective

Arcana's final objective is to become a **cross-runtime execution-security, governance, and proof infrastructure for autonomous agents**.

Arcana should allow a person or organization to run an AI agent without granting that agent ambient, unlimited, or unverifiable authority. The model, harness, repository content, plugin, MCP server, external website, and subagent are treated as potentially untrusted inputs. Consequential effects are allowed only when an independent enforcement path verifies exact authority, current intent, information provenance, workspace constraints, and scoped approval when policy requires it.

The local security law is:

```text
Not Authorized(q) => Not Executed(q)
```

The positive execution condition is:

```text
ExactCapability(q)
AND CurrentIntent(q)
AND ProvenancePolicySatisfied(q)
AND WorkspaceConstraintsSatisfied(q)
AND (ApprovalRequired(q) => ExactScopedApproval(q))
=> Effect(q)
```

The long-term distributed objective is:

```text
Any supported agent runtime
        |
        v
Arcana Node / Arcana Adapter
        |
        v
Canonical request + local PEP
        |
        v
Signed capability + current policy + revocation state
        |
        v
Bounded effect + durable evidence + composable RunProof
```

Arcana is not merely another agent framework. Frameworks may build agents; Arcana governs what those agents may do and preserves evidence of what they actually did.

---

## 3. Canonical roadmap

### 3.1 Core architecture phases

| Phase | Name | Primary question |
|---|---|---|
| A | Epistemic Foundation | What did the agent claim, and what evidence is required? |
| B | Verification and Replay | Can the claim, trace, and result be independently inspected and reproduced? |
| C | Local Governed Autonomy | Can unauthorized local effects be structurally prevented? |
| D | Distributed Governed Autonomy | Can authority and proof safely cross process and machine boundaries? |
| E | Arcana Protocol, SDKs, and External Adapters | Can heterogeneous agent runtimes conform to one governance protocol? |
| F | Enterprise Control Plane and Federation | Can organizations administer, audit, and federate Arcana at fleet scale? |

### 3.2 Parallel product tracks

The TUI is not Phase D. Product surfaces advance in parallel with the architecture phases.

| Track | Product objective |
|---|---|
| TUI 1.0 | Governed Operator Console |
| CLI 1.0 | Local control, launch, policy, proof, replay, and automation interface |
| Node 1.0 | Distributed enforcement node produced by Phase D |
| SDK 1.0 | Stable protocol clients, adapters, and integration APIs produced by Phase E |
| Control 1.0 | Organization control plane produced by Phase F |

### 3.3 Completion points

- **Local product complete:** Phase A-C + TUI 1.0 + CLI 1.0.
- **Platform complete:** Phase A-E + stable Node and SDK interfaces.
- **Current enterprise vision complete:** Phase A-F + Control 1.0.

Software continues evolving after Phase F. “Complete” means the declared architecture and product contract is satisfied, not that no future feature will ever be added.

---

## 4. Definition of 100% completion

A phase is 100% complete only when all of the following are true:

1. **Scope complete:** every committed workstream has an implementation or an explicitly approved removal.
2. **Production integration complete:** the real runtime path uses the feature; a standalone service or unit test is insufficient.
3. **Hard invariants pass:** zero violations for security-critical properties.
4. **Adversarial tests pass:** malicious, concurrent, corrupt, and partial-failure scenarios are evaluated.
5. **Positive utility passes:** legitimate workflows still work.
6. **Persistence and restart pass:** durable state reconstructs correctly after process restart.
7. **Performance is measured:** relevant p50/p95 latency and resource use are recorded.
8. **Observability is complete:** failures and degraded evidence cannot silently appear healthy.
9. **Documentation is frozen:** schemas, commands, nonclaims, migration notes, and milestone history exist.
10. **No hidden blocker:** source errors, known model-facing bypasses, and undocumented production fallbacks are zero.

### 4.1 Weighted completion formula

Each phase contains weighted workstreams. A planning score may be calculated as:

```text
PlanningCompletion = Sum(weight_i * completion_i)
```

where `completion_i` ranges from 0.0 to 1.0.

However:

```text
PhaseComplete = PlanningCompletion == 100%
                AND EveryHardGate == PASS
```

A score of 99% with one unauthorized execution is **not** nearly complete. It is a failed security phase.

### 4.2 Gate vocabulary

| Gate state | Meaning |
|---|---|
| PASS | Required evidence exists and satisfies the threshold. |
| FAIL | A required property was violated. |
| BLOCKED | The gate cannot yet be evaluated because an integration or fixture is absent. |
| DEGRADED | The operation can continue, but assurance is explicitly reduced. |
| NOT APPLICABLE | Removed from scope through an approved architecture decision. |

---

# Phase A - Epistemic Foundation

## 5. Phase A objective

Phase A establishes the data model for statements, evidence, obligations, completion criteria, and immutable execution history.

The phase answers:

> What does the agent claim, what would make that claim true, what evidence supports it, and when is the task legitimately complete?

Without Phase A, an agent can produce persuasive text without a machine-verifiable relationship between its claims and actual work.

## 6. Phase A architecture

The required chain is:

```text
User objective
  -> active contract
  -> criteria and obligations
  -> claims
  -> evidence references
  -> events
  -> completion evaluation
```

### 6.1 Core entities

At minimum:

- Session
- Objective
- Contract
- Contract revision
- Criterion
- Obligation
- Claim
- Evidence reference
- Tool execution receipt
- Verification result
- Completion decision
- Event record
- Hash-chain link

### 6.2 Trust model

The model may propose claims and evidence references, but the runtime owns:

- Stable identifiers
- Event ordering
- Canonical serialization
- Hashing
- Contract revision state
- Completion-state transitions
- Evidence attachment rules

## 7. Phase A implementation steps

### A1. Define typed claim and evidence schemas - 10%

1. Define claim categories such as factual, execution, mutation, test, artifact, and completion claims.
2. Give every claim a stable ID, session ID, source event ID, creation timestamp, and status.
3. Define evidence references that point to immutable events, artifacts, hashes, test receipts, or external references.
4. Prevent arbitrary model prose from being treated as evidence.
5. Version every public schema.

**Exit criteria**

- Schemas parse valid records and reject malformed records.
- Claim and evidence IDs are globally unique within the configured scope.
- Evidence references cannot point to a future event.
- Schema version migrations are documented.

### A2. Implement contracts, criteria, and obligations - 15%

1. Convert the user objective into a structured active contract.
2. Represent required outcomes as criteria.
3. Represent required actions or proofs as obligations.
4. Support contract revisions rather than in-place mutation.
5. Associate every consequential completion claim with the active contract revision.
6. Mark superseded criteria and obligations without deleting history.

**Exit criteria**

- Every active session can resolve exactly one active contract revision.
- Stale contract revisions cannot satisfy current completion.
- Criteria have deterministic status transitions.
- A completion decision lists the exact criteria evaluated.

### A3. Build the append-only event store - 20%

1. Define canonical event serialization.
2. Assign monotonic sequence numbers under transactional locking.
3. Link each event to the previous event hash.
4. Persist event payload hash, previous hash, event hash, sequence, and timestamp.
5. Make session IDs optional only if the global-chain semantics are explicit.
6. Enforce uniqueness for event sequence and event identity.
7. Detect deletion, reordering, insertion, and mutation.

A typical event hash is:

```text
eventHash_n = H(
  schemaVersion
  || sequence_n
  || eventType_n
  || canonicalPayload_n
  || previousEventHash_n
)
```

**Exit criteria**

- Replaying the complete event list reconstructs the same terminal hash.
- Mutation of one event invalidates that event and all following links.
- Concurrent writers cannot obtain the same sequence.
- Failed transactions create no partial event.

### A4. Attach execution receipts and artifacts - 15%

1. Record tool name, canonical arguments, start/end times, exit status, and result digest.
2. Record file mutations through before/after hashes or bounded patch receipts.
3. Record test commands, exit codes, pass/fail totals, and output digest.
4. Store large artifacts separately and reference them by immutable digest.
5. Redact secrets before persistence while preserving proof that redaction occurred.

**Exit criteria**

- A tool success claim cannot be supported only by model text.
- Artifact references verify against stored content.
- Secret-bearing outputs do not leak into ordinary proof exports.
- Missing receipts cause evidence status to be incomplete.

### A5. Implement the hard completion gate - 20%

1. Evaluate every required criterion.
2. Resolve associated obligations.
3. Require evidence at the configured evidence level.
4. Refuse verified completion when required obligations are unresolved.
5. Separate “agent stopped” from “task completed.”
6. Separate “completed” from “verified complete.”

Core invariant:

```text
VerifiedComplete(session)
=> every required criterion is satisfied
   AND every required obligation is resolved
   AND required evidence exists
```

**Exit criteria**

- A fabricated success message cannot set verified completion.
- A failed test prevents criteria requiring passing tests from resolving.
- Optional criteria do not block completion.
- The completion result is deterministic for the same event set.

### A6. Build Phase A inspection commands - 10%

Expected CLI surface:

```text
arcana epistemic claims list <session>
arcana epistemic contract inspect <session>
arcana epistemic evidence inspect <evidence-id>
arcana epistemic events verify <session>
```

**Exit criteria**

- Commands support machine-readable JSON.
- Invalid chains return nonzero exit status.
- Human output explains the first failing link or obligation.

### A7. Test, benchmark, document, and freeze - 10%

Required tests:

- Claim schema property tests
- Evidence reference integrity
- Contract revision staleness
- Concurrent event insertion
- Event mutation and deletion
- Incomplete obligation denial
- Artifact digest mismatch
- Restart reconstruction

Required documents:

- Phase A milestone
- Event schema registry
- Claim/evidence schema registry
- Completion semantics
- Known nonclaims

## 8. Phase A 100% release gates

```text
Event-chain integrity violations undetected       0
Verified completions with unmet obligations       0
Evidence references to missing artifacts          0
Duplicate event sequences                         0
Phase A production-source type errors             0
Deterministic completion disagreements            0
Schema migration tests                        100%
Restart reconstruction tests                  100%
```

## 9. Phase A nonclaims

Phase A alone does not prove:

- That an action was authorized
- That the operating system was not compromised
- That an external fact is objectively true
- That a model cannot lie
- That another machine will reproduce the same environment

## 10. Phase A completion checklist

- [ ] Typed claims and evidence exist.
- [ ] Contracts, criteria, and obligations are revisioned.
- [ ] Append-only hash-linked events are transactional.
- [ ] Execution receipts and artifact hashes are durable.
- [ ] Completion is blocked by unmet required obligations.
- [ ] Event integrity and completion are independently inspectable.
- [ ] Restart recovery reconstructs the same state.
- [ ] Phase A tests, docs, and milestone tag are complete.

---

# Phase B - Verification and Replay

## 11. Phase B objective

Phase B turns Phase A records into independently inspectable proof, audit replay, deterministic re-execution where possible, and live revalidation.

The phase answers:

> Can another process inspect the trace, verify its integrity, determine what was actually verified, and reproduce the relevant result without trusting the original model narrative?

## 12. Phase B assurance model

RunProof should expose independent axes rather than one misleading badge:

```text
Trace:           NONE | RECORDED
Integrity:       UNVERIFIED | VALID | INVALID
Verification:    UNVERIFIED | VERIFIED
Reproducibility: NONE | PARTIAL | FULL
```

Compatibility proof levels may be presented as:

- P0 - trace recorded
- P1 - integrity valid
- P2 - reproducibility at least partial
- P3 - verification independently verified

P2 and P3 are independent. Reproducibility does not automatically imply semantic verification, and verification does not guarantee complete environmental reproducibility.

## 13. Phase B implementation steps

### B1. Define RunProof schema - 15%

Include:

- Proof version
- Session identity
- Source event range
- Terminal event hash
- Contract and revision
- Criteria and obligation outcomes
- Artifact digests
- Verification receipts
- Replay commands
- Environment metadata
- Assurance axes
- Trace health
- Generation timestamp

**Exit criteria**

- Proof is canonicalizable and hashable.
- Historical proof is immutable.
- New live revalidation produces a linked new result instead of rewriting history.

### B2. Implement proof generation and verification - 15%

Expected commands:

```text
arcana epistemic proof inspect <session-id>
arcana epistemic proof verify <session-id>
arcana epistemic proof export <session-id> --format json
```

Verification must independently recompute:

- Event-chain integrity
- Artifact digests
- Required evidence presence
- Proof schema validity
- Referenced contract revision
- Verification-result links

**Exit criteria**

- Modified proof or referenced artifact fails verification.
- Exported JSON round-trips without semantic change.
- Verification does not call the model.

### B3. Implement audit replay - 15%

Audit replay reconstructs state from events without executing effects.

It must rebuild:

- Contract state
- Claims
- Evidence graph
- Obligation state
- Completion state
- Authorization summaries when later phases add them

**Exit criteria**

- Audit replay matches live derived state.
- Missing events produce DEGRADED or INVALID status, not false completeness.
- Unknown event versions fail explicitly.

### B4. Implement deterministic replay - 20%

1. Represent replayable commands structurally.
2. Record exact executable, arguments, cwd, environment policy, input artifacts, and expected outputs.
3. Revalidate policy before replay.
4. Prevent replay of unauthorized or stale effects.
5. Compare output digests and workspace mutations.
6. Classify reproducibility as none, partial, or full.

**Exit criteria**

- Same deterministic fixture produces the expected digest.
- Workspace drift is detected.
- Policy drift can deny replay.
- Non-replayable external effects are reported as such.

### B5. Implement live revalidation - 10%

Live revalidation checks whether a historical claim remains supported under current conditions.

Examples:

- Rerun test suite
- Rehash artifact
- Recheck workspace mutation
- Revalidate current policy

**Exit criteria**

- Historical proof remains immutable.
- Revalidation has its own timestamp, event ID, and digest.
- Changed results downgrade current assurance without erasing history.

### B6. Implement trace health - 10%

Use explicit trace status:

```text
COMPLETE | DEGRADED | UNAVAILABLE
```

Track:

- Missing lifecycle events
- Missing receipts
- Orphan executions
- Unmatched requests/results
- Event emitter failures

**Exit criteria**

- Zero counts are trusted only with COMPLETE trace health.
- Evidence emitter failure cannot silently appear as zero violations.

### B7. Performance and scalability - 5%

Measure:

- Proof generation p50/p95
- Event verification p50/p95
- Audit replay p50/p95
- Deterministic replay overhead
- Proof size per 1,000 events

Example storage calculation:

```text
DailyProofStorage = runsPerDay * averageEventsPerRun * averageEventBytes
```

For 1,000 runs/day, 250 events/run, and 1.2 KB/event:

```text
1,000 * 250 * 1.2 KB = 300,000 KB/day ~= 293 MB/day
```

Artifacts must be calculated separately because they dominate storage.

### B8. Documentation and freeze - 10%

Required artifacts:

- RunProof schema
- Replay semantics
- Assurance-level definitions
- Trace-health semantics
- Performance report
- Phase B milestone

## 14. Phase B 100% release gates

```text
Invalid event chains accepted                       0
Historical proofs mutated by revalidation           0
False FULL reproducibility classifications          0
False COMPLETE trace profiles                       0
Audit/live reconstruction disagreements             0
Phase A regressions                                  0
Proof export/verify fixtures                     100%
Replay drift-detection fixtures                  100%
```

## 15. Phase B completion checklist

- [ ] RunProof has independent assurance axes.
- [ ] Proof verification is model-independent.
- [ ] Audit replay reconstructs derived state.
- [ ] Deterministic replay captures exact structured commands.
- [ ] Workspace and output drift are detected.
- [ ] Live revalidation never rewrites historical truth.
- [ ] Trace health prevents false zero-violation claims.
- [ ] Performance and storage growth are measured.
- [ ] Phase B milestone and schemas are frozen.

---

# Phase C - Local Governed Autonomy

## 16. Phase C objective

Phase C creates a local execution-security kernel so that a model or harness cannot execute a consequential action merely because it generated a tool call.

The phase answers:

> Does the exact requested effect have current, bounded, durable authority, and can the final effect boundary prevent execution when it does not?

## 17. Phase C trusted computing base

The local trusted computing base contains:

- Canonical request builder
- Capability verifier
- Pure Policy Decision Point (PDP)
- Policy Enforcement Point (PEP)
- Intent-binding verifier
- Provenance/sensitivity policy evaluator
- Scoped-approval state machine
- Grant and approval durable stores
- Revocation and ancestry validator
- Secret broker
- Workspace boundary validator
- Event-chain writer
- RunProof verifier
- Sandbox launcher where used

Untrusted or partially trusted components include:

- LLM output
- Agent harness
- Repository content
- Remote content
- MCP descriptions and tool output
- Plugins
- Subagents
- External tools

## 18. Phase C implementation steps

### C1. Canonical authorization requests - 5%

Every consequential effect becomes a canonical request containing relevant fields:

- Request ID and nonce
- Principal
- Session
- Workspace
- Contract and revision
- Action
- Resource
- Tool
- Executable
- Arguments
- Working directory
- Network destination
- Secret identifiers
- Provenance labels
- Sensitivity
- Policy version

Calculate:

```text
requestHash = H(canonicalSerialize(AuthorizationRequest))
```

Any meaningful field change must change the hash.

### C2. Durable capability grants - 10%

Capabilities define exact allowed authority:

- Principal and session
- Action set
- Resource selectors
- Tool/executable/argument constraints
- Network and secret constraints
- Workspace
- Contract
- Issuer
- Expiry
- Maximum uses
- Delegation limits
- Status

Required statuses:

```text
PENDING | ACTIVE | REVOKED | EXPIRED | EXHAUSTED
```

**Exit criteria**

- Missing, expired, revoked, exhausted, or mismatched grants deny.
- Store failure fails closed.
- Restart preserves grant state.
- Use counters are atomic.

### C3. Pure PDP - 10%

The PDP must be a deterministic function of immutable input:

```text
Decision = PDP(request, policySnapshot)
```

The snapshot includes immutable capabilities, intent bindings, approval scopes, trust status, ancestry status, and policy rules.

The PDP performs no database writes, no store calls, and no effect execution.

**Exit criteria**

- Same request + same snapshot => same decision and decision hash.
- Snapshot mutation is impossible or ineffective.
- Store changes affect only newly built snapshots.

### C4. Effect-boundary PEP - 10%

The PEP:

1. Builds/fetches a fresh policy snapshot.
2. Evaluates the exact request.
3. Rechecks freshness immediately before execution.
4. Atomically claims capability use and approval where relevant.
5. Calls the protected executor only on final ALLOW.
6. Records execution or failure evidence.

Core invariant:

```text
Denied(request) => protectedExecutorCalls == 0
```

### C5. Intent-action binding - 8%

Intent establishes why the action belongs to the user's current objective.

Risk requirements:

- LOW: optional or inferred bounded read
- MODERATE: direct user request
- HIGH: active contract criterion
- CRITICAL: exact explicit approval plus active intent

Bindings include session, request hash, contract, revision, source event, criteria, and status.

**Exit criteria**

- Different session, request hash, contract, or revision cannot reuse a binding.
- Missing production intent store fails closed.
- Model-generated justification alone is insufficient.

### C6. Provenance and sensitivity - 8%

Provenance labels may include:

- SYSTEM_POLICY
- USER_INSTRUCTION
- ACTIVE_CONTRACT
- TRUSTED_LOCAL_SOURCE
- UNTRUSTED_LOCAL_SOURCE
- REMOTE_CONTENT
- TOOL_OUTPUT
- MODEL_OUTPUT
- SUBAGENT_OUTPUT
- MCP_DESCRIPTION

Sensitivity lattice:

```text
PUBLIC <= INTERNAL <= PRIVATE <= SECRET
```

Labels must combine monotonically unless an explicit authorized declassification occurs.

Consequential-field lineage tracks origins for:

- Paths
- Executables
- Arguments
- Hosts
- Request bodies
- Secret identifiers
- MCP arguments
- Delegated task text

**Exit criteria**

- Unknown lineage on HIGH/CRITICAL fails closed.
- SECRET encoded or transformed remains SECRET.
- Remote/MCP/subagent provenance cannot be silently relabeled as user intent.

### C7. Scoped approvals - 8%

Approval is conditional, exact, expiring, and single-use.

State machine:

```text
PENDING -> APPROVED -> CLAIMED -> CONSUMED
                    \-> EXPIRED / REJECTED / RECOVERY_REQUIRED
```

Approval binds:

- Exact request hash
- Principal
- Session
- Contract revision
- Resource
- Arguments
- Expiry
- Maximum uses = 1

**Exit criteria**

- Changed request => hash mismatch.
- Concurrent claims => one winner.
- Second use => denied.
- Crash recovery prevents blind duplicate external effects.

### C8. Delegated least privilege - 8%

Child authority must be no broader than parent authority:

```text
Authority(child) <= Authority(parent)
```

This applies to:

- Actions
- Resources
- Tools
- Executables
- Arguments
- Hosts
- Secrets
- Expiry
- Uses
- Delegation depth
- Contract and revision
- Sensitivity/provenance envelope

Children receive zero ambient authority.

**Exit criteria**

- Parent grant IDs cannot authorize a child.
- Revoked ancestors immediately invalidate descendants.
- Child-session creation failure leaves no active orphan grants.
- Concurrent delegation cannot amplify limits.

### C9. Workspace and MCP trust - 6%

Workspace trust considers:

- Approved identity
- Current commit/policy digest
- Dirty state
- Symlinks and mounts
- Path normalization
- Working-directory boundary
- Executable project configuration

MCP trust binds:

- Server identity
- Transport
- Tool name
- Schema digest
- Canonical argument digest
- Effect classification
- Network destination
- Provenance and sensitivity

**Exit criteria**

- Changed MCP schema invalidates earlier trust.
- MCP descriptions cannot create authority.
- Symlink/path/case-normalization escapes fail.

### C10. Security evidence and RunProof profiles - 5%

RunProof includes:

- AuthorizationProfile
- InformationFlowProfile
- DelegationProfile
- ApprovalProfile

Hard values include:

```text
unauthorizedExecutions = 0
authorityAmplifications = 0
approvalReplayExecutions = 0
unlabeledConsequentialRequests = 0
```

Zeros are meaningful only with COMPLETE trace health.

### C11. Adversarial evaluation - 12%

Evaluation groups:

- Authorization substitution
- Approval replay/concurrency
- Delegation amplification/ancestry
- Provenance and prompt injection
- Workspace and MCP trust
- Persistence and partial failure
- Positive utility
- Evidence and RunProof integrity

The reported Phase C evaluation baseline is:

```text
Local adversarial fixtures               95
Unexpected allows                         0
Executor calls on denied paths            0
Benign workflow success               14/14
Capability/security tests            510/510
Epistemic tests                       212/212
Combined tests                        722/722
Expect assertions                        1794
```

### C12. Freeze and tag - 10%

Required deliverables:

- `docs/security/PHASE-C-MILESTONE.md`
- Exact 95 fixture IDs
- Release-gate totals
- Trusted computing base
- Reason-code registry
- Known limitations and nonclaims
- Complete commit history with correct count
- Final documentation commit and annotated tag

Suggested tag:

```text
arcana-governed-autonomy-phase-c
```

## 19. Phase C 100% release gates

```text
Unexpected allows                         0
Protected executor calls on denied paths  0
Capability amplifications                 0
Approval replay executions                0
Revoked-ancestor executions               0
Secret-exfiltration successes             0
Unlabeled consequential executions        0
Known model-facing P0 bypasses             0
Benign workflow success                 100% of frozen suite
Capability/security tests               100%
Phase A/B regression tests               100%
Production-source type errors              0
```

## 20. Phase C nonclaims

Do not claim:

- Distributed-node security
- Enforcement over processes launched outside Arcana
- Hostile-host containment
- Universal prompt-injection prevention
- Signed remote capability authenticity
- Complete black-box CLI containment
- Remote attestation

## 21. Phase C completion checklist

- [ ] Exact canonical request hashing is active.
- [ ] Durable capabilities fail closed.
- [ ] PDP is pure and snapshots are immutable.
- [ ] PEP is the final authority at protected effect boundaries.
- [ ] Intent bindings are session and contract-revision scoped.
- [ ] Provenance, sensitivity, and consequential-field lineage are enforced.
- [ ] Scoped approvals are exact, expiring, atomic, and single-use.
- [ ] Child authority attenuates and ancestor revocation is enforced.
- [ ] Workspace and MCP trust adapters are active.
- [ ] RunProof security profiles have complete trace semantics.
- [ ] The frozen adversarial suite has zero false allows.
- [ ] Phase C documentation commit and tag are published.

---

# TUI 1.0 - Governed Operator Console

## 22. Why TUI 1.0 is a parallel track

TUI 1.0 should begin immediately after Phase C because Phase C's capabilities are difficult to use if intent, authority, approval, delegation, and proof remain invisible.

It runs alongside Phase D rather than replacing it.

## 23. TUI 1.0 completion stages

### TUI-1.1 Runtime visibility - 20%

Render real governance events in the Command Spine:

```text
01  ask         fix authorization replay
02  contract    revision 8 - 4 criteria
03  authority   read engine/** - active
04  inspect     event-store.ts - 214 lines
05  patch       +18 -7 - 1 file
06  deny        network.write - remote injection
07  run         18 passed - 0 failed
08  verify      evidence complete
09  proof       integrity valid - unauthorized 0
```

**Exit criteria**

- Entries come from real runtime events, not sample fixtures.
- Every denial has a stable reason and inspect action.
- Missing evidence appears DEGRADED, never healthy.

### TUI-1.2 Interactive governance - 20%

Support:

- Approve once
- Deny
- Inspect exact request
- Narrow scope
- View expiry and use count
- Revoke authority
- Resolve recovery-required approval

**Exit criteria**

- Approval UI acts on exact request hashes.
- Keyboard and mouse paths produce the same decision.
- Prompt typing cannot trigger approval shortcuts.

### TUI-1.3 Subagent and delegation console - 15%

Display:

- Parent/child tree
- Child session identity and PID/process state where isolated
- Delegated capabilities
- Denied capabilities
- Revocation status
- Evidence returned to parent

**Exit criteria**

- Child sessions are clickable and isolated.
- Switching sessions clears stale selection.
- Parent revocation visibly updates descendants.

### TUI-1.4 Proof, replay, and audit UI - 15%

Commands or views:

```text
:proof
:claims
:contract
:capabilities
:approvals
:delegations
:replay
:audit
```

**Exit criteria**

- Proof axes and trace health are visible.
- Replay commands show exact effects before execution.
- Historical proof cannot be edited through the UI.

### TUI-1.5 Responsive Command Spine - 10%

Width behavior:

- `<80`: minimal/file-only fallback
- `80-99`: narrow collapsed diff
- `100-119`: compact unified diff
- `>=120`: wide split diff

**Exit criteria**

- No right-edge truncation.
- No grey overlay artifacts.
- Prompt remains usable at all supported widths.
- Resize tests cover approximately 59-180 columns.

### TUI-1.6 Stability, performance, and accessibility - 15%

Include:
- Virtualized long sessions
- Stable scrolling
- Text selection and copying
- Mouse support
- Keyboard-only navigation
- Dark/light themes
- Screen-reader-friendly labels where terminal support allows
- Crash isolation for subagents

Startup and session-open performance (WS-P1):
- TUI shell appears without blocking on engine readiness; daemon spawn and health polling run async, never on the input path
- Session open hydrates progressively (skeleton → history → live stream); the prompt accepts input immediately, not after sync completes
- Typed text echoes instantly via optimistic rendering (no round-trip before the character is visible)
- First model response starts while hydration completes in the background; no serialization of session-open before send

Communication hygiene and request discipline (WS-P2):
- No polling loops where an event/SSE channel exists; bounded retries with exponential backoff and jitter
- SSE reconnect: capped attempts, backoff, single connection (no reconnect storms)
- No redundant re-fetch of unchanged data: sync and part/message reads are identity/diff-aware
- Model and tool API calls are deduplicated, idempotency-keyed, and bounded by a per-session request budget
- 429/503 and congestion signals are honored with backoff; never blind-retry
- Zero request amplification from TUI bugs: one logical action produces one network effect (audit-able)

**Exit criteria**

- Session-open to input-ready p95 < 500 ms on a warm daemon; input echo p95 < 16.7 ms
- Redundant request count (same resource refetched without change) = 0 in a 5-minute normal session
- SSE reconnect storms (more than one reconnect attempt per second) = 0
- No sustained idle traffic: zero network activity while the user idles and nothing is streaming

Suggested performance gate:

```text
frame render p95 < 16.7 ms for interactive operations
input-to-visible-response p95 < 50 ms excluding model/network latency
session-open to first-input-ready p95 < 500 ms (warm daemon)
first model token p95 < 1 s after submit excluding provider latency
10,000-entry session scroll without unbounded memory growth
redundant requests / 5-min session = 0
SSE reconnect rate cap = 1/sec max, exponential backoff with jitter
```

### TUI-1.7 Documentation and manual smoke plan - 5%

Required:

- Operator guide
- Keymap
- Approval safety guide
- Responsive-layout specification
- Manual smoke plan
- Defect classification rules

## 24. TUI 1.0 100% gates

```text
Approval lifecycle smoke checkpoints passed      100%
Denied-action UI/executor disagreements              0
Right-edge truncation defects                        0
Subagent rendering crashes                           0
Prompt shortcut conflicts                            0
Supported-width layout failures                      0
Keyboard-only unreachable governance actions        0
Dark/light state ambiguity blockers                  0
Session-open to input-ready p95                < 500 ms
Input echo p95                                 < 16.7 ms
First model token p95 (excl. provider)         < 1 s
Redundant requests / 5-min session                 0
SSE reconnect storms                                0
Sustained idle network traffic                      0
```

---

# CLI 1.0 - Local Control and Automation Surface

## 25. CLI 1.0 objective

CLI 1.0 exposes the same governed runtime for humans, scripts, CI systems, and headless automation.

## 26. CLI 1.0 required command groups

### Session and execution

```text
arcana run
arcana session list
arcana session inspect
arcana session resume
arcana serve
```

### Policy and capability

```text
arcana policy check
arcana policy explain
arcana capability list
arcana capability inspect
arcana capability revoke
arcana approval list
arcana approval approve
arcana approval deny
```

### Proof and replay

```text
arcana proof inspect
arcana proof verify
arcana proof export
arcana replay audit
arcana replay deterministic
arcana revalidate run
```

### External-agent launch

```text
arcana launch codex
arcana launch claude
arcana launch gemini
arcana launch mastra
```

### Operations

```text
arcana doctor
arcana trust
arcana models
arcana providers
arcana stats
arcana gateway
arcana cron
```

## 27. CLI 1.0 completion criteria

- Every command supports stable JSON output where automation is reasonable.
- Exit codes are documented and deterministic.
- Secret values are redacted.
- Dangerous commands require exact scope or approval.
- Shell completion exists.
- Commands are tested on Windows, Linux, and macOS where officially supported.
- CLI and TUI decisions use the same runtime APIs.
- No CLI-only authorization bypass exists.

---

# Phase D - Distributed Governed Autonomy

## 28. Phase D objective

Phase D extends the validated local kernel across process and machine boundaries.

The phase answers:

> Can a control plane or trusted issuer grant narrow, short-lived authority to an Arcana Node, revoke it remotely, and compose trustworthy proof from multiple nodes without redesigning the local security kernel?

## 29. Phase D threat model

Threats include:

- Stolen or replayed grants
- Compromised network
- Clock skew
- Node impersonation
- Stale policy
- Delayed revocation
- Partitioned nodes
- Duplicate execution across nodes
- Proof omission or reordering
- Malicious external runtime
- Compromised node host

Phase D can secure protocol identity and local enforcement. It cannot claim hostile-host resistance without hardware-backed attestation and an explicitly evaluated trust model.

## 30. Phase D implementation steps

### D1. Node identity and enrollment - 10%

1. Generate a node keypair through an approved algorithm and key store.
2. Assign stable node ID.
3. Implement enrollment ceremony.
4. Bind organization, environment, and allowed roles.
5. Support key rotation and node decommissioning.
6. Store trust roots separately from ordinary configuration.

**Exit criteria**

- Unknown nodes cannot obtain grants.
- Rotated/decommissioned keys are rejected.
- Duplicate enrollment is detectable.

### D2. Signed short-lived grants - 15%

A distributed grant should include:

- Grant ID
- Issuer ID
- Subject node/principal
- Audience
- Actions/resources
- Workspace and contract scope
- Issue time
- Not-before
- Expiry
- Maximum uses
- Parent grant/delegation chain
- Policy digest
- Nonce/key ID
- Signature

Validity:

```text
EffectiveExpiry = min(parentExpiry, requestedExpiry, policyMaxTTL)
```

**Exit criteria**

- Signature, audience, time, policy, and parent chain are validated locally.
- Unknown algorithms and keys fail closed.
- Grants cannot be lengthened by delegation.

### D3. Mutual node/control-plane authentication - 10%

Use authenticated, encrypted channels with:

- Server and client identity
- Certificate/key rotation
- Replay protection
- Channel binding where appropriate
- Strict hostname/audience validation

**Exit criteria**

- MITM fixtures fail.
- Wrong organization or audience fails.
- Expired credentials fail.

### D4. Policy distribution and versioning - 10%

1. Define signed policy bundles.
2. Include version, digest, activation time, compatibility range, and rollback rules.
3. Keep last-known-good policy.
4. Reject unsupported mandatory semantics.
5. Record which policy snapshot authorized every effect.

**Exit criteria**

- Partial policy update never becomes active.
- Rollback is explicit and audited.
- Nodes cannot silently use an unrecognized mandatory policy field.

### D5. Remote revocation - 15%

Revocation mechanisms may combine:

- Push notifications
- Revocation stream
- Short grant TTL
- Periodic pull/check
- Emergency deny list

Revocation convergence:

```text
RevocationLag = detectionDelay
              + distributionDelay
              + nodePollingDelay
              + localEnforcementDelay
```

Define target by risk class. Example recommended targets:

```text
CRITICAL: <= 5 seconds when connected
HIGH:     <= 30 seconds when connected
Offline:  bounded by grant TTL and offline policy
```

**Exit criteria**

- Revoked grants cannot execute after the frozen convergence bound.
- Offline nodes cannot exceed approved offline TTL.
- Restart loads current revocation state before protected execution.

### D6. Distributed replay resistance and exactly-once coordination - 10%

1. Introduce globally unique execution IDs.
2. Bind execution to node, session, request hash, grant, and nonce.
3. Deduplicate at local node and control plane.
4. Define behavior for irreversible effects after network ambiguity.
5. Record UNKNOWN_AFTER_CRASH/NETWORK rather than blind retry.

**Exit criteria**

- Duplicate delivery to two nodes does not cause duplicate effect when policy requires single execution.
- Network retry does not bypass usage limits.

### D7. Proof synchronization - 10%

1. Sign node proof envelopes.
2. Preserve local event-chain root.
3. Upload incremental proof segments.
4. Detect missing sequence ranges.
5. Support eventual synchronization without rewriting local history.

**Exit criteria**

- Control plane detects omitted, reordered, or conflicting segments.
- Node and server hashes reconcile.
- Failed upload degrades central visibility, not local history integrity.

### D8. Cross-node proof composition - 10%

For a distributed run, compose child node proofs into a higher-level proof:

```text
DistributedRoot = H(
  runId
  || ordered(nodeId, localRunProofHash, dependencyEdges)
  || controlPlanePolicyDigest
)
```

**Exit criteria**

- Parent proof lists every required child proof.
- Missing child proof prevents complete distributed assurance.
- Composition preserves local proof identity.

### D9. Partition and offline policy - 5%

Define actions allowed while disconnected:

- Read-only cached operations
- Previously issued low-risk grants
- No new critical approvals
- No authority expansion
- Strict TTL

**Exit criteria**

- Partition tests match documented policy.
- Reconnection reconciles revocation and proof state.

### D10. Phase D adversarial evaluation and freeze - 5%

Test:

- Forged grants
- Wrong audience
- Replay
- Clock skew
- Key rotation
- Delayed revocation
- Partition
- Duplicate execution
- Proof omission
- Node replacement

## 31. Phase D 100% release gates

```text
Forged grants accepted                         0
Wrong-audience grants accepted                 0
Executions after bounded revocation window     0
Distributed duplicate protected effects        0
Missing proof segments classified COMPLETE     0
Unsupported policy fields silently ignored     0
Node identity substitution successes           0
Phase C local regression failures              0
```

### Recommended performance gates

```text
Signature verification p95          < 2 ms locally
Local grant validation p95           < 5 ms
Connected revocation p95             within risk target
Proof segment enqueue p95            < 10 ms excluding WAN
Node startup to enforcement-ready    explicitly measured and bounded
```

## 32. Phase D completion checklist

- [ ] Nodes have durable rotatable identity.
- [ ] Grants are signed, short-lived, scoped, and audience-bound.
- [ ] Policy bundles are signed and versioned.
- [ ] Remote revocation has measured convergence.
- [ ] Distributed replay resistance works.
- [ ] Proof segments synchronize and compose.
- [ ] Offline/partition behavior is explicit.
- [ ] Distributed adversarial evaluation passes.
- [ ] Node 1.0 APIs and milestone are frozen.

---

# Phase E - Arcana Protocol, SDKs, and External Adapters

## 33. Phase E objective

Phase E converts Arcana from a single implementation into a portable governance protocol that can wrap or integrate heterogeneous agent runtimes.

The phase answers:

> Can Codex, Claude Code, Gemini CLI, Mastra, AI SDK, LangGraph, MCP applications, and internal agents produce canonical requests and submit effects through Arcana's enforcement contract?

## 34. Phase E integration levels

### Level 1 - Native adapter

The runtime calls Arcana SDK APIs before every effect. Highest semantic fidelity.

### Level 2 - Sandboxed black-box process

Arcana launches the runtime with constrained filesystem, process, network, and secret access. Medium semantic fidelity.

### Level 3 - PTY compatibility wrapper

Arcana observes and mediates what can be intercepted through process and terminal boundaries. Lowest fidelity and strongest nonclaims.

Every adapter must declare its enforcement level.

## 35. Phase E implementation steps

### E1. Freeze the Arcana protocol specifications - 15%

Publish versioned specifications for:

- AuthorizationRequest
- CapabilityGrant
- SignedGrantEnvelope
- PolicySnapshot
- ScopedApproval
- DelegationRequest/Result
- Security labels and lineage
- Event envelope
- RunProof
- Node protocol
- Error and reason-code registry

**Exit criteria**

- Canonical serialization is test-vector driven.
- Unknown mandatory fields fail.
- Optional extension fields are namespaced.
- Version negotiation is defined.

### E2. Conformance test suite - 15%

Build reusable tests that any implementation can run.

Suites:

- Canonical hashing
- Signature verification
- Capability matching
- Intent binding
- Approval scoping
- Delegation attenuation
- Revocation
- Event integrity
- RunProof verification
- Failure behavior

**Exit criteria**

- At least two independent implementations produce matching vectors.
- Conformance does not call Arcana's production implementation as the oracle.

### E3. TypeScript/JavaScript SDK 1.0 - 10%

Provide:

- Typed client
- Node client
- Request builder
- Adapter hooks
- Policy snapshot types
- Proof verifier
- Test fixtures
- Stable error model

**Exit criteria**

- Semantic versioning and compatibility policy exist.
- Browser/server boundaries are explicit.
- Security-sensitive defaults fail closed.

### E4. Additional language SDKs - 10%

Prioritize based on adoption, likely:

- Rust for node/low-level integrations
- Python for AI ecosystem
- Go for infrastructure

**Exit criteria**

- Each SDK passes the same conformance suite.
- No SDK weakens canonical hashing or validation semantics.

### E5. External CLI adapters - 15%

Initial targets:

- Codex
- Claude Code
- Gemini CLI

Expected interface:

```text
arcana launch codex
arcana launch claude
arcana launch gemini
```

Each adapter documents:

- Intercepted effects
- Unintercepted effects
- Required sandbox
- Session mapping
- Approval flow
- Proof fidelity

**Exit criteria**

- A hostile fixture attempting filesystem/network/secret escape is blocked at declared boundaries.
- Processes launched outside Arcana are clearly out of scope.

### E6. Framework adapters - 10%

Initial targets:

- Mastra
- Vercel AI SDK
- LangGraph
- MCP-native applications

Arcana should act as the governance layer, not rebuild every framework feature.

**Exit criteria**

- Framework tool calls map to canonical AuthorizationRequest.
- Subagent delegation maps to Arcana child capabilities.
- Framework approval cannot bypass Arcana PEP.

### E7. Adapter certification levels - 5%

Example:

```text
A3 - Native exact effect integration
A2 - Sandboxed process integration
A1 - PTY/observable-boundary integration
A0 - Telemetry only; no enforcement claim
```

Certification must state:

- Boundaries covered
- Known bypasses
- Test version
- Protocol version
- Operating systems

### E8. Developer experience and examples - 5%

Provide:

- Quickstarts
- Reference applications
- Local test node
- Policy examples
- Debug tracing
- Migration guides
- Security checklist

### E9. Protocol governance and compatibility - 5%

Define:

- Version lifecycle
- Deprecation policy
- Security advisory process
- Extension registry
- Compatibility matrix
- Reference-test ownership

### E10. Phase E ecosystem evaluation and freeze - 10%

Test matrix across runtimes, languages, OSes, and enforcement levels.

## 36. Phase E 100% release gates

```text
Canonical test-vector disagreements              0
Certified-adapter false boundary claims           0
SDK conformance failures                          0
Approval bypass through framework adapter         0
Child authority amplification through adapter     0
Unsupported mandatory protocol fields accepted   0
Unversioned public security schemas               0
```

Additional success criteria:

- Three external CLI adapters reach declared certification level.
- Two framework adapters reach native or sandboxed enforcement level.
- At least two language SDKs pass the same independent vectors.
- Protocol documentation is sufficient for a third party to implement a verifier.

## 37. Phase E completion checklist

- [ ] Protocol schemas and canonicalization are public and versioned.
- [ ] Independent conformance suite exists.
- [ ] JS/TS SDK is stable.
- [ ] At least one additional language SDK is stable.
- [ ] Codex, Claude, and Gemini adapters are evaluated.
- [ ] Framework adapters are evaluated.
- [ ] Adapter certification levels prevent misleading claims.
- [ ] Compatibility and security governance are documented.
- [ ] SDK 1.0 and protocol milestone are frozen.

---

# Phase F - Enterprise Control Plane and Federation

## 38. Phase F objective

Phase F provides organization-scale administration, centralized policy, identity, fleet operations, compliance evidence, and federation.

The phase answers:

> Can a large organization safely administer many users, agents, nodes, workspaces, policies, approvals, and proofs across environments while maintaining tenant isolation and operational reliability?

## 39. Phase F implementation steps

### F1. Multi-tenant organization model - 8%

Entities:

- Organization
- Workspace/project
- Environment
- Team
- User
- Service principal
- Agent principal
- Node
- Policy bundle
- Approval queue
- Proof archive

**Exit criteria**

- Every record is tenant-scoped.
- Cross-tenant access tests produce zero leaks.
- Tenant deletion/retention behavior is documented.

### F2. Enterprise identity and access - 10%

Support according to product tier:

- OIDC/SAML SSO
- SCIM provisioning
- MFA integration
- Service accounts
- RBAC
- Attribute-based policy inputs
- Break-glass process
- Separation of duties

**Exit criteria**

- Privileged actions require appropriate role and audit event.
- Deprovisioned users lose access within a measured bound.
- Break-glass use is visible and time-bounded.

### F3. Central policy management - 10%

Capabilities:

- Policy authoring
- Validation and simulation
- Staged rollout
- Environment promotion
- Approval workflow
- Signed distribution
- Rollback
- Policy diff

**Exit criteria**

- Policy cannot be activated without validation.
- Staged rollout and rollback are transactional/audited.
- Nodes prove the policy digest used for execution.

### F4. Fleet and node operations - 10%

Provide:

- Enrollment inventory
- Health status
- Version status
- Key rotation
- Revocation status
- Policy sync status
- Proof backlog
- Remote diagnostics
- Upgrade rings

**Exit criteria**

- Fleet view distinguishes unknown from healthy.
- Stale/unreachable nodes are explicit.
- Upgrade failure cannot silently disable enforcement.

### F5. Central approval operations - 8%

Features:

- Approval queues
- Escalation
- Separation of requester/approver
- Exact request inspection
- Expiry
- Bulk denial, not dangerous bulk approval
- Emergency revocation

**Exit criteria**

- Approval remains exact and single-use across the network.
- Central UI cannot bypass local PEP.
- Delegated approver authority is bounded.

### F6. Audit, compliance, and evidence archive - 10%

Support:

- Immutable proof retention
- Search and export
- Legal hold where required
- Retention policies
- Chain-of-custody metadata
- Compliance mappings
- Auditor role

Potential mappings may include SOC 2, ISO 27001, NIST, internal AI-control standards, and sector-specific requirements. Claims require formal review; simply exporting logs is not certification.

**Exit criteria**

- Exported proof verifies independently.
- Retention deletion does not falsify surviving proof.
- Auditor access is read-only and tenant-scoped.

### F7. High availability and disaster recovery - 10%

Define:

- Control-plane availability target
- Recovery point objective (RPO)
- Recovery time objective (RTO)
- Database backup and restore
- Key backup/rotation
- Multi-region strategy
- Degraded local enforcement behavior

Example availability calculation:

```text
99.9% monthly availability ~= 43.8 minutes downtime/month
99.95% ~= 21.9 minutes/month
99.99% ~= 4.38 minutes/month
```

**Exit criteria**

- Restore drills meet RPO/RTO.
- Node fail-closed/offline behavior matches policy during outage.
- Backup restoration preserves proof integrity.

### F8. Federation - 10%

Federation enables controlled trust between organizations or control planes.

Requirements:

- Federated issuer identity
- Trust agreements
- Audience restrictions
- Policy intersection
- Cross-org approval rules
- Proof exchange
- Revocation propagation
- Conflict handling

Authority intersection:

```text
EffectiveFederatedAuthority = LocalPolicy
                               INTERSECT RemoteGrant
                               INTERSECT FederationAgreement
```

**Exit criteria**

- Federation never broadens local authority.
- Unknown issuer or agreement version fails closed.
- Cross-org proofs preserve origin and signatures.

### F9. Enterprise security operations - 8%

Include:

- Security alerts
- Anomaly detection
- Revocation campaigns
- Compromised-node workflow
- Incident timelines
- Forensic exports
- Security advisory process

**Exit criteria**

- Incident actions are audited.
- Emergency deny propagates within target.
- Compromise simulation is run at least once before GA.

### F10. Data governance and privacy - 5%

Define:

- Data classification
- Regional storage
- Customer-managed keys where required
- Secret handling
- PII controls
- Data export/deletion
- Telemetry opt-out

### F11. Enterprise API and automation - 4%

Provide:

- Admin API
- Webhooks/event streams
- Terraform/provider or equivalent automation
- SIEM export
- Ticketing integration

### F12. Commercial readiness - 4%

Include:

- Licensing and entitlements
- Usage metering that does not affect security decisions
- Support diagnostics
- Upgrade/migration policy
- Enterprise documentation

### F13. Independent security assessment and GA freeze - 3%

Require:

- External architecture review
- Penetration test
- Threat-model review
- Dependency/supply-chain assessment
- Remediation verification

## 40. Phase F 100% release gates

```text
Cross-tenant data leaks                         0
Unauthorized administrative actions             0
Federation authority amplification              0
Central approval bypass of local PEP             0
Unverifiable compliance exports                 0
Restore drills outside published RPO/RTO        0
Critical penetration-test findings unresolved   0
Fleet health false-positive "healthy" states    0
```

Operational gates must include:

- Defined and measured service-level objectives
- Successful disaster-recovery exercise
- Successful compromised-node exercise
- Successful key-rotation exercise
- Tenant-isolation adversarial suite
- Federation adversarial suite
- Independent proof verification by a separate implementation

## 41. Phase F completion checklist

- [ ] Multi-tenant model is isolated.
- [ ] SSO/SCIM/RBAC and service identities are production-ready.
- [ ] Policy lifecycle is centrally managed and signed.
- [ ] Fleet health, upgrades, keys, and revocation are operable.
- [ ] Central approval preserves exact local enforcement.
- [ ] Audit archive and compliance exports verify independently.
- [ ] HA/DR targets are tested.
- [ ] Federation intersects authority and never broadens it.
- [ ] Security operations and incident workflows are exercised.
- [ ] Privacy and data-governance contracts are documented.
- [ ] External security assessment blockers are resolved.
- [ ] Control 1.0 and Phase F milestone are frozen.

---

# Arcana 1.0 Product Convergence

## 42. Recommended Arcana 1.0 scope

Arcana should not wait for Phase F before releasing a strong product.

Recommended Arcana 1.0 requires:

- Phase A complete
- Phase B complete
- Phase C complete
- TUI 1.0 complete
- CLI 1.0 complete
- Stable local installer/update path
- Stable policy and RunProof schemas
- At least one production-quality external-agent adapter
- Complete operator documentation
- Signed release artifacts

## 43. Arcana 1.0 hard gates

```text
Local unauthorized executions in frozen suite     0
TUI/CLI authorization disagreements               0
Proof verification regressions                    0
Installer/upgrade data-loss defects               0
Known critical security defects                   0
Benign local workflows in release suite         100%
Supported-platform smoke tests                  100%
```

---

# Quantitative Planning and Calculations

## 44. Test accounting

Track suites independently:

```text
TotalTests = epistemic + capability + TUI + CLI + node + adapter + enterprise
```

Never report only the cleanest selected suite.

Security fixture metrics:

```text
FalseAllowRate = unexpectedAllows / maliciousFixtures
DeniedEffectLeakRate = executorCallsOnDeniedPaths / deniedRequests
BenignSuccessRate = successfulLegitimateFlows / legitimateFlows
```

Required for Phase C and later:

```text
FalseAllowRate = 0
DeniedEffectLeakRate = 0
BenignSuccessRate >= 0.95 during development
BenignSuccessRate = 1.00 for the frozen release suite
```

## 45. Capability and delegation calculations

For a child grant:

```text
ChildActions subset ParentActions
ChildResources subset ParentResources
ChildExpiry <= ParentExpiry
ChildUses <= ParentRemainingUses
ChildDepth = ParentDepth + 1
ChildDepth <= ParentMaximumDepth
```

For distributed grants:

```text
EffectiveTTL = min(requestedTTL, parentRemainingTTL, policyMaximumTTL)
```

## 46. Latency budget

Local authorization overhead:

```text
AuthorizationLatency = snapshotBuild
                     + PDP
                     + atomicClaim
                     + eventWrite
```

Suggested local targets, excluding the protected tool itself:

```text
PDP p95                         < 1 ms
Policy snapshot p95             < 5 ms
PEP total p95                   < 5-10 ms
Approval claim p95              < 10 ms
Delegation transaction p95      < 20 ms
RunProof profile derivation p95 measured by event volume
```

Targets should be frozen only after measurement on named hardware and operating system.

## 47. Event and proof storage

```text
EventStoragePerDay = runsPerDay
                   * averageEventsPerRun
                   * averageSerializedEventBytes
```

Example:

```text
2,000 runs/day
* 300 events/run
* 1.5 KB/event
= 900,000 KB/day
~= 879 MB/day before indexes and artifacts
```

Monthly raw events:

```text
879 MB/day * 30 ~= 25.8 GB/month
```

Apply measured SQLite/index overhead and compression instead of guessing.

## 48. Token-cost control

Track:

```text
CostPerRun = inputTokens * inputPrice
           + outputTokens * outputPrice
           + cachedInputTokens * cachedPrice
           + tool/model retry cost
```

Arcana should reduce cost through:

- Context compaction
- Stable cache keys
- Evidence references instead of replaying raw output
- Small verifier models where safe
- Bounded subagent context
- Retry budgets
- Deterministic local verification

Security policy must not be delegated to a cheaper model as the final authority.

## 49. TUI rendering budget

For 60 frames per second:

```text
frameBudget = 1000 ms / 60 ~= 16.67 ms
```

Virtualization should render approximately the visible entries plus a bounded overscan window rather than all historical entries.

```text
RenderedEntries ~= visibleRows / averageEntryHeight + overscan
```

Memory should be measured for 1,000, 10,000, and 100,000-event sessions.

## 50. Distributed revocation budget

```text
RevocationLag = detection
              + controlPlaneCommit
              + distribution
              + nodeQueue
              + enforcementRefresh
```

Report p50, p95, and worst observed under normal and degraded networks.

## 51. Phase completion dashboard

Recommended dashboard columns:

| Workstream | Weight | Status | Hard gate | Evidence | Owner | Target |
|---|---:|---|---|---|---|---|
| Example | 10% | 80% | PASS/BLOCKED | commit/report | name | date |

A phase can show planning progress while still being blocked from release.

---

# Cross-Phase Engineering Rules

## 52. Security rules

1. The model never becomes the final authorization authority.
2. Approval never skips the PDP/PEP.
3. A missing security dependency fails closed in production mode.
4. Compatibility modes are explicit and lower assurance.
5. No ambient child authority.
6. Unknown consequential lineage fails closed or requires exact approval.
7. Evidence failure degrades assurance; it does not fabricate a clean zero.
8. Historical proof is immutable.
9. Remote authority is short-lived and audience-bound.
10. Federation intersects authority; it never unions authority.

## 53. Testing rules

1. Expected outcomes are fixed independently of the implementation.
2. Denial tests spy on the final protected executor.
3. Unit tests do not substitute for production-path integration tests.
4. Concurrency and crash tests are mandatory for counters and approvals.
5. Restart recovery is tested for every durable lifecycle.
6. Performance tests report distributions, not one fragile wall-clock sample.
7. Pre-existing failures require diagnostic fingerprints and baseline reproduction.
8. Every phase preserves earlier phase gates.

## 54. Documentation rules

Every phase milestone must include:

- Objective
- Final architecture
- Exact commits
- Exact test commands and totals
- Fixture IDs
- Release-gate results
- Performance environment
- Schemas and versions
- Trusted computing base
- Nonclaims
- Known limitations
- Migration notes
- Rollback notes
- Final tag

## 55. Versioning rules

Version independently:

- Event schema
- Claim/evidence schema
- RunProof schema
- Capability schema
- Approval schema
- Delegation schema
- Policy snapshot
- Signed grant envelope
- Node protocol
- SDK

Breaking security semantics require a major version or an explicit compatibility transition.

---

# Final Master Checklist

## 56. Phase A

- [ ] Epistemic entities implemented
- [ ] Contract revisions implemented
- [ ] Hash-linked event store implemented
- [ ] Evidence and artifacts implemented
- [ ] Hard completion gate implemented
- [ ] Phase A adversarial/integrity suite passed
- [ ] Milestone frozen

## 57. Phase B

- [ ] RunProof implemented
- [ ] Integrity verification implemented
- [ ] Audit replay implemented
- [ ] Deterministic replay implemented
- [ ] Live revalidation implemented
- [ ] Trace health implemented
- [ ] Performance measured
- [ ] Milestone frozen

## 58. Phase C

- [ ] Canonical requests implemented
- [ ] Durable capabilities implemented
- [ ] Pure PDP implemented
- [ ] Production PEP implemented
- [ ] Intent binding implemented
- [ ] Provenance/sensitivity/lineage implemented
- [ ] Scoped approvals implemented
- [ ] Delegation attenuation implemented
- [ ] Workspace and MCP trust implemented
- [ ] Security RunProof profiles implemented
- [ ] 95-fixture frozen evaluation passed
- [ ] Milestone documentation and tag complete

## 59. TUI 1.0

- [ ] Real governance events displayed
- [ ] Exact approval interface complete
- [ ] Capability inspection/revocation complete
- [ ] Subagent tree complete
- [ ] Proof/replay/audit views complete
- [ ] Responsive width behavior complete
- [ ] Mouse, keyboard, selection, scrolling complete
- [ ] Long-session performance complete
- [ ] Manual smoke plan passed
- [ ] Startup/session-open performance complete (WS-P1: input-ready p95, first-token p95)
- [ ] Communication hygiene complete (WS-P2: redundant requests 0, reconnect storms 0, idle traffic 0)

## 60. CLI 1.0

- [ ] Policy and capability commands complete
- [ ] Proof and replay commands complete
- [ ] External launch commands complete
- [ ] Stable JSON and exit codes complete
- [ ] Cross-platform smoke tests complete

## 61. Phase D

- [ ] Node identity and enrollment complete
- [ ] Signed grants complete
- [ ] Mutual authentication complete
- [ ] Signed policy distribution complete
- [ ] Remote revocation complete
- [ ] Distributed replay resistance complete
- [ ] Proof synchronization/composition complete
- [ ] Partition policy complete
- [ ] Distributed adversarial suite passed
- [ ] Node 1.0 frozen

## 62. Phase E

- [ ] Protocol specifications frozen
- [ ] Independent conformance suite complete
- [ ] JS/TS SDK complete
- [ ] Additional SDK complete
- [ ] External CLI adapters complete
- [ ] Framework adapters complete
- [ ] Certification levels published
- [ ] Compatibility governance complete
- [ ] SDK 1.0 frozen

## 63. Phase F

- [ ] Multi-tenancy complete
- [ ] Enterprise identity complete
- [ ] Central policy lifecycle complete
- [ ] Fleet operations complete
- [ ] Central approval complete
- [ ] Audit/compliance archive complete
- [ ] HA/DR complete
- [ ] Federation complete
- [ ] Security operations complete
- [ ] Privacy/data governance complete
- [ ] External assessment complete
- [ ] Control 1.0 / enterprise GA frozen

---

# Final Completion Statement

Arcana reaches the full architectural objective described by the current roadmap at **Phase F**.

The phases build cumulatively:

```text
Phase A: Know what is claimed and required.
Phase B: Verify, replay, and prove it.
Phase C: Prevent unauthorized local effects.
Phase D: Extend authority and proof across nodes.
Phase E: Make governance portable across runtimes.
Phase F: Operate and federate it at enterprise scale.
```

The mature TUI and CLI are not postponed until Phase F. They form the local product immediately after Phase C and advance in parallel with distributed architecture.

The final product thesis is:

> Arcana runs autonomous agents under exact, revocable, least-privilege authority; binds consequential actions to current intent and information provenance; provides precise human governance when required; and preserves independently verifiable proof from the local terminal to the distributed enterprise fleet.
