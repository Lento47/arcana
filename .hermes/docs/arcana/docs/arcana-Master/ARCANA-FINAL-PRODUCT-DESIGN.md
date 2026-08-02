> **SUPERSEDED (2026-08-02)** — Consolidated into
> `.hermes/docs/arcana/docs/arcana-Master/Arcana_Project_Master_Specification.md`
> (mirrored to `docs/arcana-Master/`), Part III. This file is retained for
> history and reference-tool compatibility; the consolidated document is the
> single source of truth.

# ARCANA — Final Product Design

> **Document type:** Canonical product vision and system design  
> **Status:** Final-product target, not a claim that every component is implemented  
> **Product category:** Governed agent execution infrastructure  
> **Core promise:** Every consequential agent action is authorized, bounded, observable, and provable

---

## 1. Executive Definition

Arcana is a governed execution system for AI agents.

It sits between an agent’s intent and the real-world effects that agent attempts to cause. Arcana does not merely log agent activity after the fact. It decides whether an action is authorized, verifies that the exact authorized request is the one executed, constrains where and how the effect may occur, records the causal evidence, and produces a durable proof of what happened.

Arcana is designed to govern:

- Coding agents
- CLI agents
- Autonomous research agents
- Enterprise copilots
- MCP-connected agents
- Local models
- Cloud models
- Subagent systems
- Scheduled agents
- Distributed agent runtimes

Arcana can launch and govern third-party agent runtimes such as Codex, Claude Code, Gemini CLI, internal company agents, or custom model-driven workflows.

The final product is not only a TUI or CLI. It is a complete system composed of:

1. **Arcana Runtime** — local policy decision and enforcement
2. **Arcana TUI** — governed operator console
3. **Arcana CLI** — automation and scripting interface
4. **Arcana Node** — distributed enforcement runtime
5. **Arcana Protocol** — signed authority and proof exchange
6. **Arcana SDK** — integration kit for external agents and tools
7. **Arcana Control** — enterprise governance and fleet management plane
8. **RunProof** — verifiable evidence of authorization, execution, and integrity

---

## 2. Product Thesis

Modern AI agents can reason, invoke tools, modify repositories, access credentials, communicate externally, deploy software, delegate work, and operate for long periods.

Most systems treat these capabilities as ordinary tool calls.

Arcana treats them as **authority-bearing effects**.

The central product thesis is:

> An agent should never gain authority merely because it can generate a tool call.

Every consequential effect must be justified by current intent, exact capability, trusted provenance, bounded resources, fresh policy, valid identity, and scoped operator approval when required.

The foundational execution invariant is:

\[
Effect(q)
\Rightarrow
ExactCapability(q)
\land IntentBindingSatisfied(q)
\land ProvenancePolicySatisfied(q)
\land WorkspaceConstraintsSatisfied(q)
\land DecisionFresh(q)
\land RequestIntegrityValid(q)
\land
\left(
ApprovalRequired(q)
\Rightarrow ExactScopedApproval(q)
\right)
\]

Operationally:

```text
No authorization
→ no execution

Wrong principal
→ no execution

Wrong session
→ no execution

Wrong workspace
→ no execution

Stale decision
→ no execution

Changed request
→ no execution

Revoked capability
→ no execution

Missing evidence
→ no false assurance
```

---

## 3. Product Promise

Arcana gives users and organizations six guarantees.

### 3.1 Exact authority

A tool may execute only if a current capability covers:

- The exact principal
- The exact action
- The exact resource
- The exact session
- The exact workspace
- The exact executable or destination when constrained
- The exact delegation ancestry
- The current policy version
- The current revocation state

### 3.2 Current intent

Past permission does not automatically authorize present action.

Arcana binds consequential actions to current user intent, active task contracts, acceptance criteria, and explicit approvals.

### 3.3 Bounded effects

Filesystem, process, network, Git, secret, deployment, and delegation actions are constrained to explicit scopes.

### 3.4 Durable accountability

Every decision, approval, denial, claim, execution, failure, and receipt is recorded in a tamper-evident event chain.

### 3.5 Operator control

Humans can inspect exact requests, approve once, deny, revoke, quarantine, terminate, and reconcile uncertain outcomes.

### 3.6 Verifiable evidence

Arcana produces RunProof artifacts that show what authority existed, which decision was made, what effect occurred, and whether the evidence chain is complete and valid.

---

## 4. Design Principles

### 4.1 Default deny

Missing authority is a denial, not an implicit allow.

### 4.2 Deny overrides

Decision precedence:

```text
DENY
> REQUIRE_APPROVAL
> ALLOW
```

### 4.3 Exact request execution

The request evaluated by policy must be the request executed by the enforcement point.

```text
PDP decision
→ immutable request
→ freshness recheck
→ exact effect
→ receipt
```

Never:

```text
PDP approves request A
→ runtime executes request B
```

### 4.4 Durable state is authoritative

The UI may show temporary local states such as `SUBMITTING`, but lifecycle truth comes from durable records.

### 4.5 Local enforcement remains sovereign

A remote control plane may issue signed authority, but it cannot bypass the local enforcement kernel.

### 4.6 Authority attenuates

Delegation can only reduce authority.

\[
ChildAuthority \subseteq ParentAuthority
\]

### 4.7 Evidence is part of execution

An action without the expected evidence cannot be represented as fully assured.

### 4.8 Security meaning is never color-only

All critical states use:

- Glyph
- Label
- Text
- Tone
- Persistent placement

### 4.9 No hidden expansion of authority

Models, tool descriptions, remote content, MCP metadata, and tool output cannot create new authority by themselves.

### 4.10 Honest assurance

Arcana distinguishes:

- What was authorized
- What executed
- What was recorded
- What was verified
- What remains uncertain

---

## 5. Product Architecture

```text
┌────────────────────────────────────────────────────────────────────┐
│                         ARCANA CONTROL                             │
│  Fleet policy · node registry · revocation · proofs · audit       │
└───────────────────────┬────────────────────────────────────────────┘
                        │ signed policy / grants / revocations
                        │ proof registration / node status
                        ▼
┌────────────────────────────────────────────────────────────────────┐
│                         ARCANA NODE                                │
│ Identity · sync · offline enforcement · local policy cache         │
│ workload observation · proof batching · outbox                     │
└───────────────────────┬────────────────────────────────────────────┘
                        │ local authority
                        ▼
┌────────────────────────────────────────────────────────────────────┐
│                       ARCANA RUNTIME                               │
│                                                                    │
│ Intent → PDP → PEP → Effect → Receipt → RunProof                  │
│                                                                    │
│ Capability Store   Approval Store   Event Store   Contract Store   │
│ Revocation State   Workspace Guard  Provenance    Trace Health     │
└───────────────┬───────────────────────────────┬────────────────────┘
                │                               │
                ▼                               ▼
┌──────────────────────────────┐   ┌─────────────────────────────────┐
│        ARCANA TUI            │   │          ARCANA CLI             │
│ Operator console             │   │ Automation and scripting        │
│ Command spine                │   │ Launch, inspect, verify, export  │
└──────────────────────────────┘   └─────────────────────────────────┘
                │
                ▼
┌────────────────────────────────────────────────────────────────────┐
│ AGENTS AND TOOLS                                                   │
│ Codex · Claude · Gemini · internal agents · MCP · local models     │
└────────────────────────────────────────────────────────────────────┘
```

---

## 6. Product Surfaces

## 6.1 Arcana Runtime

The runtime is the security kernel.

Responsibilities:

- Construct canonical authorization requests
- Resolve authenticated principals
- Load capabilities
- Load intent bindings
- Load current policy
- Load revocation state
- Evaluate deterministic policy
- Require approval when needed
- Revalidate before execution
- Execute the exact request
- Record events
- Produce receipts
- Build RunProof
- Fail closed on missing or corrupt state

The runtime is not a UI component and does not trust UI state.

---

## 6.2 Arcana TUI

The TUI is the primary interactive operator experience.

It is not a chat interface with security badges added afterward. It is a governed execution console centered on the command spine.

Primary responsibilities:

- Show user intent
- Show agent reasoning summaries
- Show tool execution
- Show approval requirements
- Show denials
- Show execution receipts
- Show proof health
- Show session and subagent relationships
- Let operators inspect exact requests
- Let operators approve once or deny
- Let operators navigate evidence
- Preserve state across restart

The TUI must never execute effects directly.

---

## 6.3 Arcana CLI

The CLI exposes Arcana to automation, CI, scripts, servers, and third-party launch workflows.

Representative commands:

```bash
arcana
arcana run "<task>"
arcana launch codex
arcana launch claude
arcana launch gemini
arcana launch --agent ./my-agent
arcana session list
arcana approval list
arcana approval inspect <id>
arcana approval approve <id>
arcana approval deny <id>
arcana proof inspect <run>
arcana proof verify <run>
arcana proof export <run>
arcana replay <run>
arcana node status
arcana node enroll
arcana policy inspect
arcana capability inspect
arcana doctor
```

The CLI uses the same runtime authority path as the TUI.

---

## 6.4 Arcana Node

Arcana Node is the distributed enforcement runtime.

A node can run on:

- Developer workstation
- CI worker
- Build server
- Kubernetes pod
- Enterprise host
- Edge device
- Secure execution environment

Responsibilities:

- Maintain node identity
- Observe workload identity
- Verify signed authority envelopes
- Synchronize policy
- Synchronize revocations
- Enforce offline rules
- Quarantine on invalid state
- Batch local proofs
- Register proofs with Arcana Control
- Persist durable state and outbox records

---

## 6.5 Arcana Protocol

The protocol defines how authority and proof move between Arcana components.

Primary objects:

- Signed capability envelope
- Signed policy envelope
- Node identity certificate
- Revocation statement
- Sync request
- Sync response
- Durable ACK
- Proof batch
- Registration receipt

Canonical envelope processing:

```text
PARSE
→ SCHEMA
→ SIGNATURE
→ TRUST
→ AUDIENCE
→ FRESHNESS
→ REVOCATION
```

Arcana uses deterministic canonical serialization and domain-separated signatures.

---

## 6.6 Arcana SDK

The SDK allows external systems to integrate with Arcana without reimplementing its authority model.

SDK targets:

- TypeScript
- Python
- Rust
- Go
- Java
- .NET

Core SDK operations:

```ts
const arcana = new ArcanaClient({
  endpoint: "http://127.0.0.1:9142",
})

const decision = await arcana.authorize({
  principalId: "agent:build",
  sessionId: "ses_123",
  action: "filesystem.write",
  resource: {
    kind: "file",
    path: "packages/api/src/index.ts",
  },
})

if (decision.kind === "ALLOW") {
  const receipt = await arcana.executeExact(decision, async (request) => {
    return writeFile(request.resource.path, content)
  })
}
```

The SDK must make the safe path easier than bypassing Arcana.

---

## 6.7 Arcana Control

Arcana Control is the enterprise governance plane.

Main capabilities:

- Organization and workspace management
- Node enrollment
- Node trust state
- Issuer and key management
- Policy publishing
- Capability issuance
- Revocation
- Fleet status
- Proof registration
- Audit search
- Risk dashboards
- Approval queues
- Compliance export
- Incident response
- Quarantine and recovery

Arcana Control never directly executes local effects. It distributes signed authority and receives proof.

---

## 7. Identity Model

Arcana separates identity into layers.

```text
Node
→ Workload
→ Agent execution
→ Session
→ Tool request
```

### 7.1 Node identity

Represents a registered Arcana runtime instance.

### 7.2 Workload identity

Derived from observable runtime properties such as:

- Executable digest
- Process identity
- Parent lineage
- Process start time
- OS principal
- Namespace or container identity
- Signed binary state
- Hardware attestation when available

### 7.3 Agent principal

Represents the logical agent making the request.

Examples:

```text
agent:build
agent:review
agent:security
agent:research
```

### 7.4 Session identity

Scopes authority to one governed task or conversation.

### 7.5 Operator identity

Represents the human or service approving, denying, revoking, or inspecting authority.

---

## 8. Capability Model

A capability defines what a principal may attempt.

A capability includes:

- Capability ID
- Schema version
- Principal
- Issuer
- Actions
- Resources
- Session constraints
- Workspace constraints
- Contract constraints
- Tool constraints
- Executable constraints
- Network constraints
- Working-directory constraints
- Expiry
- Maximum uses
- Delegation permissions
- Delegation depth
- Status
- Creation event

Representative capability:

```json
{
  "id": "cap_01J...",
  "schemaVersion": "1",
  "principal": {
    "kind": "agent",
    "id": "agent:build"
  },
  "issuer": {
    "kind": "policy",
    "id": "workspace:engineering"
  },
  "actions": [
    "filesystem.read",
    "filesystem.write",
    "process.execute"
  ],
  "resources": [
    {
      "kind": "directory",
      "pattern": "packages/**"
    }
  ],
  "constraints": {
    "sessionId": "ses_123",
    "workspaceId": "ws_arcana",
    "workingDirectories": [
      "L:/PROJECTS/arcana"
    ],
    "expiresAt": "2026-08-01T04:00:00Z"
  },
  "delegation": {
    "allowed": false,
    "maximumDepth": 0,
    "currentDepth": 0
  },
  "status": "ACTIVE"
}
```

---

## 9. Intent Binding

Capabilities define possible authority.

Intent binding determines whether that authority is relevant to the current task.

Sources of intent:

- Direct user request
- Active task contract
- Acceptance criterion
- Necessary substep
- Explicit approval
- Policy-mandated workflow

Risk-sensitive intent policy:

```text
LOW
→ active capability may be enough

MODERATE
→ current user request or task binding required

HIGH
→ active contract criterion required

CRITICAL
→ explicit approval and active contract required
```

Remote content cannot create consequential intent.

---

## 10. Provenance and Information Flow

Every consequential request carries provenance labels.

Examples:

- `USER_INSTRUCTION`
- `MODEL_OUTPUT`
- `TOOL_OUTPUT`
- `REMOTE_CONTENT`
- `TRUSTED_LOCAL_SOURCE`
- `UNTRUSTED_LOCAL_SOURCE`
- `MCP_DESCRIPTION`
- `SUBAGENT_OUTPUT`
- `SYSTEM_POLICY`

Sensitivity labels:

- `PUBLIC`
- `INTERNAL`
- `PRIVATE`
- `SECRET`

Arcana can deny flows such as:

```text
SECRET
→ model-visible output

SECRET
→ external network write

MCP description
→ secret access

Tool output
→ policy modification

Remote content
→ consequential action without user binding
```

---

## 11. Policy Decision Point

The PDP is pure, deterministic, and side-effect free.

Inputs:

- Canonical authorization request
- Fresh capability snapshot
- Intent bindings
- Policy rules
- Workspace trust
- Approved scopes
- Revocation state
- Delegation ancestry
- Current time

Outputs:

```text
ALLOW
DENY
REQUIRE_APPROVAL
```

A decision includes:

- Decision ID
- Request hash
- Principal
- Policy version
- Matched capabilities
- Reasons
- Timestamp
- Risk class

The PDP never executes tools, mutates state, consumes approvals, or writes events.

---

## 12. Policy Enforcement Point

The PEP is the execution boundary.

Execution sequence:

```text
1. Receive canonical request
2. Freeze request
3. Compute request hash
4. Load fresh policy context
5. Evaluate PDP
6. Stop on DENY
7. Stop and create durable approval on REQUIRE_APPROVAL
8. Claim scoped approval when applicable
9. Revalidate fresh authority
10. Execute exact immutable request
11. Record actual result
12. Consume one-use approval
13. Emit receipt and proof events
```

Security invariant:

\[
Executed(e)
\Rightarrow
\exists d:
d.decision = ALLOW
\land d.requestHash = e.requestHash
\land d.principalId = e.principalId
\land d.policyVersion = e.policyVersion
\]

---

## 13. Approval System

Approvals are durable, exact, scoped, and one-use by default.

Lifecycle:

```text
PENDING
→ APPROVED
→ CLAIMED
→ CONSUMED
```

Alternative terminal paths:

```text
PENDING → DENIED
PENDING → EXPIRED
APPROVED → INVALIDATED
CLAIMED → RECOVERY_REQUIRED
```

### PENDING

The exact request is waiting for operator decision.

### APPROVED

The request is authorized, but not executed.

### CLAIMED

One runtime worker has atomically claimed the approval.

### CONSUMED

The approved effect completed and the approval can no longer be reused.

### INVALIDATED

Authority changed after approval.

Examples:

- Capability revoked
- Policy changed
- Workspace changed
- Request became stale
- Node quarantined

### RECOVERY_REQUIRED

The runtime cannot prove whether the effect occurred.

Automatic replay is forbidden.

---

## 14. Delegation and Subagents

Arcana governs delegation as authority transfer.

A parent agent may create a child only when:

- Parent has `delegate`
- Delegation is allowed
- Maximum depth is not exceeded
- Child scope is an attenuation
- Child identity is bound
- Child session is recorded
- Child activation barrier passes

Child authority:

\[
ChildGrant
\subseteq
ParentGrant
\cap TaskScope
\cap WorkspaceScope
\cap TimeScope
\]

The operator can:

- Inspect child tree
- Inspect exact child authority
- Inspect child status
- Revoke child authority
- Request termination
- Quarantine child activity
- View child proof chain

The TUI never calls `process.kill` directly.

---

## 15. Workspace Containment

Arcana treats workspace boundaries as security boundaries.

Required protections:

- Reject absolute outside paths
- Reject lexical traversal
- Reject null bytes
- Canonicalize paths
- Validate opened object identity
- Read and write through validated handles
- Enforce file type and size
- Prevent path substitution where platform support exists

Linux target:

```text
workspace directory fd
→ openat2 relative path
→ RESOLVE_BENEATH
→ RESOLVE_NO_MAGICLINKS
→ optional RESOLVE_NO_SYMLINKS
→ fstat/read/write same fd
```

Windows target:

```text
native file handle
→ reparse inspection
→ final path from opened handle
→ volume + file identity
→ workspace containment verification
```

Arcana must clearly distinguish user-space checks from kernel-enforced containment.

---

## 16. Distributed Authority

Arcana extends local governance to distributed nodes.

Node state axes:

```text
identity:
UNREGISTERED | PENDING | TRUSTED | SUSPENDED | REVOKED

connectivity:
ONLINE | OFFLINE

enforcement:
ONLINE | OFFLINE_RESTRICTED | OFFLINE_READ_ONLY | QUARANTINED

policy:
CURRENT | STALE | INVALID | UNAVAILABLE

revocation:
CURRENT | STALE | INVALID | UNAVAILABLE
```

Core invariants:

```text
Trusted
→ not Revoked

Revoked
→ QUARANTINED

QUARANTINED
→ no consequential effects

Node effect
→ Trusted
  ∧ not Revoked
  ∧ not QUARANTINED
  ∧ PolicyFresh
  ∧ RevocationFresh
```

Offline authority must never increase.

---

## 17. Synchronization Protocol

Arcana synchronization is transport-neutral at the state-machine layer.

```text
IDLE
→ REQUESTING
→ RECEIVING
→ VERIFYING
→ REDUCING
→ PERSISTING
→ ACKNOWLEDGING
→ COMPLETED
```

Quarantine is terminal until explicit recovery.

Durable ACK invariant:

\[
AcceptedAck
\Rightarrow
StateDurable
\land ArtifactDurable
\land EventIntentDurable
\land ReplayRecordDurable
\]

Production transport:

- Mutual TLS
- Signed sync messages
- Bounded message sizes
- Replay protection
- Nonces
- Request IDs
- Expiry
- Node and server identity
- ACK only after durable commit

---

## 18. RunProof

RunProof is Arcana’s evidence artifact.

It answers:

- Who requested the action?
- Which principal executed it?
- Which capability authorized it?
- Which intent justified it?
- Which policy version decided it?
- Was approval required?
- Who approved?
- Was the request changed?
- Was authority fresh at execution?
- What effect occurred?
- What result was returned?
- Is the evidence chain complete?
- Is the chain internally consistent?

Canonical causal chain:

```text
envelope or local authority
→ verification
→ grant
→ authorization request
→ PDP decision
→ PEP enforcement
→ effect
→ receipt
```

Trace health:

- `COMPLETE`
- `DEGRADED`
- `INVALID`
- `INCOMPLETE`
- `UNAVAILABLE`

Assurance axes are separate:

```text
ActionAssured
RunVerified
TraceHealth
Integrity
```

Overall assurance may require all of them.

---

## 19. Proof Batching

Nodes batch RunProofs for efficient registration.

A proof batch contains:

- Node identity
- Sequence range
- Ordered proofs
- Merkle root
- Previous batch root
- Batch root
- Signature
- Created time

Properties:

- Deterministic ordering
- Gap detection
- Duplicate detection
- Previous-root continuity
- Signature verification
- Node-local ordering
- Registration receipt

Registration proves that the service accepted the batch, not that every event was truthful.

---

## 20. Event Store

Arcana uses a durable event chain.

Every event contains:

- ID
- Sequence
- Session ID
- Timestamp
- Previous hash
- Current hash
- Actor
- Type
- Payload

Representative events:

```text
session.started
intent.recorded
contract.created
capability.issued
authorization.requested
authorization.allowed
authorization.denied
authorization.approval_required
approval.approved
approval.claimed
authorization.executed
effect.receipt
proof.completed
session.completed
session.crashed
```

The event store must support:

- Transactional append
- Global sequence
- Hash-chain verification
- Session filtering
- Replay
- Export
- Trace-health accounting
- Failure recording

---

## 21. Task Contracts

Arcana can compile a user goal into an execution contract.

A contract includes:

- Objective
- Risk class
- Acceptance criteria
- Forbidden outcomes
- Assumptions
- Obligations
- Revision
- Status
- Resolution

Example:

```yaml
objective: Evaluate arcana-site app shell
risk: moderate

acceptance_criteria:
  - inspect routing architecture
  - inspect shell composition
  - identify performance risks
  - identify accessibility risks
  - produce evidence-backed findings

forbidden_outcomes:
  - modify production files
  - deploy changes
  - access secrets
```

Contracts bind consequential actions to explicit task requirements.

---

## 22. Arcana TUI Design

## 22.1 Core layout

```text
A R C A N A                                      session title

01                  │ ◆ you
                    │   inspect the application shell
02                  │
                    │   Thinking · 3.8s
03                  │ ▸ inspect  packages/web
                    │   18 files · 420 ms
04                  │ ✓ arcana
                    │   The shell has three architectural risks...

                    └ ✦ prompt
```

The command spine is the primary visual structure.

### Header

Displays:

- Arcana wordmark
- Session title
- Runtime status
- Action assurance
- Run verification
- Trace health
- Node state when distributed

### Spine gutter

Displays:

- Stable sequence number
- Optional elapsed time
- Optional timestamp

### Rail

Displays lifecycle continuity and relationships.

### Entries

Entry types:

- User intent
- Arcana response
- Thinking
- Plan
- Tool execution
- Inspection
- Patch
- Approval
- Denial
- Failure
- Receipt
- Proof
- Subagent activity

### Prompt

Sticky at the bottom, visually connected to the spine.

---

## 22.2 Responsive modes

```text
<60      Minimal
60–79    Narrow
80–99    Compact
100–119  Standard
≥120     Wide
```

Rules:

- No silent clipping
- Visible ellipsis
- Full values available in inspector
- Security-critical state always visible
- Prompt always usable
- Rail alignment stable
- Selection identity preserved

---

## 22.3 Thinking

While active:

```text
Thinking ▸
```

After completion:

```text
Thinking · 4.2s
```

Thinking is secondary and collapsed by default.

---

## 22.4 Tools

Running:

```text
▸ run  bun test
│ running · 1.2s
```

Completed:

```text
✓ run  bun test
│ 722 passed · 0 failed · 4.01s
│ ▸ output
```

Failure:

```text
✗ run  bun test
│ exit 1 · 3 failures
│ ▸ details
```

Tool identity remains stable through lifecycle updates.

---

## 22.5 Approvals

Pending:

```text
◤ approval required
│ process.execute · exact request
│ a approve once · d deny · v inspect
```

Approved:

```text
✓ approved once
│ authorized, not executed
```

Claimed:

```text
▷ claimed
│ execution exec_...
```

Consumed:

```text
▣ approval consumed
│ execution completed · 0 uses remaining
```

Recovery:

```text
! recovery required
│ effect outcome uncertain
│ automatic replay blocked
│ manual reconciliation required
```

---

## 22.6 Keyboard model

Primary commands:

```text
j / k      navigate
enter      expand or open
v          inspect
a          approve once
d          deny
esc        close inspector or clear selection
/          command palette
?          help
```

Prompt conflict rules:

- Typing `a`, `d`, or `v` in the prompt inserts text
- Approval shortcuts activate only when spine interaction owns focus
- Inspector Escape outranks prompt interrupt
- Mouse and keyboard use the same controller path

---

## 22.7 Themes

Arcana ships with intentional dark and light themes.

Dark theme:

- Deep charcoal background
- Warm neutral text
- Cobalt or indigo accent
- Restrained status tones
- High code readability

Light theme:

- Warm off-white background
- Dark graphite text
- Cobalt or indigo accent
- Strong but quiet borders
- No washed-out security states

---

## 23. Arcana CLI Design

CLI output is structured, scriptable, and human-readable.

Example:

```text
$ arcana proof verify run_01J...

Run              run_01J...
Action assured   yes
Run verified     yes
Trace health     COMPLETE
Integrity        VALID
Policy version   pol_184
Capability       cap_92F
Principal        agent:build
Session          ses_123
Effect           filesystem.write
Result           succeeded
```

Machine output:

```bash
arcana proof verify run_01J... --json
```

Exit codes are stable and documented.

---

## 24. Arcana Control Design

Primary navigation:

```text
Overview
Nodes
Runs
Approvals
Policies
Capabilities
Revocations
Proofs
Audit
Settings
```

### Overview

Shows:

- Trusted nodes
- Quarantined nodes
- Active runs
- Pending approvals
- Denied effects
- Invalid proofs
- Stale policy
- Revocation lag

### Node detail

Shows:

- Node identity
- Trust state
- Connectivity
- Enforcement mode
- Policy freshness
- Revocation freshness
- Workloads
- Recent proofs
- Quarantine controls

### Run detail

Tabs:

- Timeline
- Authority
- Tools
- Approvals
- RunProof
- Artifacts
- Audit events

### Policy editor

Supports:

- Versioned policy
- Simulation
- Diff
- Test fixtures
- Staged rollout
- Rollback
- Approval before publish

---

## 25. Integration Model

Arcana can govern external agents in four ways.

### 25.1 Launch wrapper

```bash
arcana launch codex
arcana launch claude
arcana launch gemini
```

Arcana injects governed tool adapters, identity, session, policy, and evidence collection.

### 25.2 SDK integration

The external runtime calls Arcana before effects.

### 25.3 MCP gateway

Arcana exposes or wraps MCP tools through governed capability boundaries.

### 25.4 Host enforcement

Arcana Node governs processes, files, network, and credentials at the host or container boundary.

---

## 26. Deployment Topologies

## 26.1 Local developer

```text
Arcana TUI
→ Arcana Runtime
→ local tools
→ local SQLite
```

## 26.2 Team server

```text
Multiple users
→ Arcana Runtime service
→ shared policy
→ shared approval queue
→ proof storage
```

## 26.3 Enterprise fleet

```text
Arcana Control
→ signed policy
→ many Arcana Nodes
→ local enforcement
→ proof registration
```

## 26.4 CI/CD

```text
CI job
→ Arcana Node
→ temporary workload identity
→ bounded capability
→ build/test/deploy
→ signed RunProof
```

## 26.5 Air-gapped

```text
Offline policy bundle
→ short-lived authority lease
→ offline restricted mode
→ local proof batch
→ later registration
```

---

## 27. Storage

Local storage:

- SQLite
- WAL
- `synchronous=FULL`
- Foreign keys
- Transactional lifecycle transitions
- Version-based compare-and-swap
- Durable outbox

Core tables:

- Sessions
- Events
- Trace health
- Capabilities
- Capability ancestry
- Intent bindings
- Contracts
- Criteria
- Obligations
- Approvals
- Executions
- Receipts
- Node state
- Policy state
- Revocation state
- Sync replay records
- Outbox
- Proofs
- Proof batches
- Artifacts

---

## 28. Failure Semantics

Arcana must fail clearly.

### Denied

No effect occurred.

### Approval required

No effect occurred. Durable approval is pending.

### Execution failed

The effect started and returned a known failure.

### Retryable failure

The effect definitely did not start.

### Recovery required

The system cannot prove whether the effect occurred.

### Degraded trace

The effect may have occurred, but expected evidence is missing.

### Invalid proof

Hash, signature, or causal integrity failed.

### Quarantined

The node may not perform consequential effects.

---

## 29. Security Boundaries

Arcana protects:

- Principal identity
- Session identity
- Workspace identity
- Capability scope
- Request integrity
- Intent relevance
- Provenance
- Sensitivity
- Approval scope
- Decision freshness
- Revocation freshness
- Delegation ancestry
- Effect-result evidence

Arcana does not claim:

- Universal prompt-injection prevention
- Perfect semantic understanding
- Complete kernel sandboxing on every platform
- Security for processes operating outside Arcana
- Truthfulness of a compromised host
- Perfect hardware attestation
- Universal protection against all supply-chain compromise

These are explicit nonclaims, not hidden limitations.

---

## 30. Performance Targets

Runtime:

```text
Local PDP decision p95             <5 ms
PEP overhead excluding effect      <10 ms
Approval append p95                <20 ms
Inspector open p95                 <50 ms
Resize reflow p95                  <50 ms
Session switch p95                 <100 ms
Filter update p95                  <100 ms
10,000-event TUI load              <2 s
```

Distributed:

```text
Policy verification p95            <20 ms
Revocation application p95         <20 ms
Proof batch verification p95       <100 ms
Online revocation ACK objective     <5 min
```

---

## 31. Reliability Targets

- No executor calls after denial
- No duplicate approval execution
- No cross-session approval
- No authority amplification
- No post-revocation execution
- No false `COMPLETE`
- No silent state corruption
- No permissive recovery from database corruption
- No automatic replay from uncertain execution
- No UI shortcut causing direct effect

---

## 32. Brand and Visual Identity

Arcana’s identity represents bounded authority and verified execution.

### Logo

The Arcana icon consists of:

- A thick inverted-U arch
- Uniform rounded stroke
- Rounded top and ends
- A centered cobalt-blue four-point sigil
- Long vertical points
- Shorter horizontal points
- Concave edges
- Pinched center
- No contact between sigil and arch

The arch represents:

- Boundary
- Containment
- Gateway
- Authority
- Protection

The sigil represents:

- Exact action
- Verified intent
- Proof
- Execution point

### Visual language

- Refined
- Editorial
- Forensic
- Precise
- Warm
- Technical without cyberpunk clichés
- Minimal without feeling generic
- Premium without ornamental excess

Avoid:

- Neon cyberpunk
- Generic AI gradients
- Futuristic dashboards
- Excessive glassmorphism
- Random star symbols
- Overdecorated security imagery

---

## 33. Product Packaging

### Arcana Community

- Local runtime
- TUI
- CLI
- Local policy
- Local RunProof
- Basic agent launch wrappers
- Single-node operation

### Arcana Team

- Shared policy
- Shared approvals
- Team audit
- Managed nodes
- Proof registration
- Collaboration

### Arcana Enterprise

- Fleet control
- SSO and SCIM
- Policy federation
- Hardware-backed identity
- Advanced revocation
- Compliance exports
- Retention controls
- Private deployment
- Air-gapped operation
- Enterprise support

---

## 34. Competitive Differentiation

Arcana is not primarily:

- An agent framework
- A prompt-management product
- A model router
- A generic workflow builder
- A chat UI
- A simple approval dashboard
- A logging-only observability platform

Arcana’s differentiated position is:

> A runtime-enforced authority, evidence, and governance layer for AI agents.

Key differences:

1. Authorization occurs before effect
2. Exact request binding
3. Intent-aware authority
4. Provenance-aware policy
5. Durable one-use approvals
6. Delegation attenuation
7. Local enforcement under remote policy
8. RunProof evidence
9. Offline-safe distributed nodes
10. Operator-first command-spine UX

---

## 35. Roadmap

## Phase A — Epistemic Foundation

- Event chain
- Claims
- Contracts
- Trace health
- Proof levels
- Deterministic replay

## Phase B — Verification and Replay

- Proof verification
- Replay
- Export
- Failure semantics
- Assurance model

## Phase C — Local Governed Autonomy

- Capability model
- PDP
- PEP
- Provenance
- Sensitivity
- Intent binding
- Delegation
- Scoped approvals
- Workspace containment

## Phase D — Distributed Governed Autonomy

- Signed envelopes
- Node identity
- Policy sync
- Revocation sync
- Offline enforcement
- Distributed PEP
- Proof batching
- Production transport

## Phase E — Arcana Protocol and SDK

- Stable protocol
- Public SDKs
- External agent adapters
- Compatibility suites
- Developer documentation

## Phase F — Enterprise Control Plane and Federation

- Fleet policy
- Node management
- Proof registry
- Cross-organization trust
- Federation
- Enterprise compliance

---

## 36. Product Release Sequence

### TUI

```text
TUI-1  Governance observability
TUI-2  Interactive authority control
TUI-2.1 Production integration and polish
TUI-3  Delegation and subagent operations
TUI-4  Proof, replay, and forensic audit
TUI-5  Reliability and final polish
```

### Runtime

```text
Runtime 1.0
Node 1.0
Protocol 1.0
SDK 1.0
Control 1.0
```

---

## 37. Definition of Finished

Arcana is finished as a complete product when:

### Runtime

- Every consequential effect passes the PEP
- Exact request binding is enforced
- Current intent is enforced
- Revocation is fresh
- Workspace containment is platform hardened
- Approval lifecycle is durable
- RunProof is complete and verifiable

### TUI

- All core states are understandable
- No clipping or overflow
- No focus conflicts
- Dark and light themes pass
- Long sessions remain responsive
- Approvals and recovery are safe
- Subagent operations are governed

### CLI

- Stable commands
- Stable JSON output
- Deterministic exit codes
- Complete proof and replay workflows
- Agent launch wrappers

### Node

- Enrollment
- Signed sync
- Offline enforcement
- Revocation
- Quarantine
- Proof batching
- Recovery

### Protocol and SDK

- Versioned stable schemas
- Cross-runtime conformance
- Public documentation
- Compatibility test suite
- Multiple language SDKs

### Control Plane

- Fleet management
- Policy distribution
- Node trust
- Approval queues
- Proof registry
- Audit
- Incident response
- Enterprise identity

### Operational

- Installation
- Upgrade
- Backup
- Recovery
- Diagnostics
- CI
- Signed releases
- Security review
- Documentation
- Support process

---

## 38. Final Product Statement

Arcana is the authority layer between AI intent and real-world effect.

It allows agents to remain powerful without being implicitly trusted.

It gives operators a precise view of:

- What the agent intended
- What it requested
- What authority it had
- Why policy allowed or denied it
- Whether approval was required
- What actually executed
- What evidence exists
- Whether the result can be trusted

The final product should make this statement true:

> **Every action leaves proof. Every effect has authority. Every agent remains bounded.**
