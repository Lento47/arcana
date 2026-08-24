# Arcana Governance UI/UX Contract

**Status:** Product architecture proposal aligned to Arcana's execution-governance security model.

The governance UI must explain **coverage, authority, enforcement, and evidence**. It must not become an attractive dashboard that implies stronger guarantees than the underlying deployment can establish.

## 1. Product principles

1. **Security state before vanity metrics.** The home view prioritizes mediation coverage, unmediated paths, stale authority, incomplete evidence, and containment readiness.
2. **No UI authority shadowing.** Buttons and labels never become a second authorization system. Every approval, revoke, publish, contain, or retry action must route through the same authoritative engine contracts used by CLI/API flows.
3. **Progressive disclosure.** Operators first see the security decision and risk; advanced users can expand exact hashes, identity chains, capability details, proof fields, and verifier output.
4. **State provenance is visible.** Every consequential status should show where it came from: live runtime, stored evidence, external verification, or inferred discovery.
5. **Unknown is not healthy.** Missing identity, missing proof, unverified checkpoints, degraded tracing, and unmediated effects appear as explicit security states.
6. **Explain the boundary.** Arcana must distinguish "observed", "deterministically governed", and "mandatory mediated" rather than flattening them into one green badge.

## 2. Primary navigation

Recommended governance information architecture:

```text
Overview
Agents
Activity
Policies
Approvals
Authority
Tools & MCP
Incidents
Evidence
Assurance
Settings
```

### Overview

Answers: **Are consequential agent actions actually under control?**

Primary cards:

- mediation coverage;
- deterministic-enforcement coverage;
- known bypass paths;
- unmediated consequential paths;
- proof/evidence health;
- stale or outstanding authority;
- ownerless/unidentified agents;
- active containment incidents;
- assurance level (L1/L2/L3/L4) with `not assessed` preserved exactly.

Suggested layout:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ ARCANA GOVERNANCE                                      14:32 UTC     │
├──────────────────────────────────────────────────────────────────────┤
│ MEDIATION COVERAGE       PROOF HEALTH        AUTHORITY       RISKS   │
│ 94.8% mandatory          99.997% valid       1.2s p95        17      │
│ 23 bypass paths ⚠        4 incomplete        2 stale caps     3 P0   │
├──────────────────────────────────────────────────────────────────────┤
│ CONSEQUENTIAL ACTIVITY                                                │
│                                                                      │
│ Agent           Action              Decision       Evidence          │
│ cloud-ops-17    iam.role.update      DENIED         ✓ verified        │
│ finance-ap      payment.create       APPROVED       ✓ verified        │
│ support-prod    customer.export      ESCALATED      ✓ verified        │
│ unknown-319     db.query             UNMEDIATED ⚠   ✕ none            │
├──────────────────────────────────────────────────────────────────────┤
│ CRITICAL GAPS                                                         │
│ • prod-k8s MCP exposes a direct credential path                      │
│ • 3 agents have no accountable owner                                 │
│ • policy bundle v71 has never completed external reproduction        │
└──────────────────────────────────────────────────────────────────────┘
```

Do not lead with total agents, total tokens, or generic health scores.

## 3. Agents

The agent inventory is an **identity/ownership registry**, not just a list of model names.

Each agent record should separate:

```text
Accountable owner
Logical agent identity
Runtime/workload identity
Environment
Active sessions
Acting-on-behalf-of relationships
Tool/MCP exposure
Highest reachable risk class
Mediation profile
Outstanding capabilities
Last consequential action
Evidence health
```

Important states:

- `OWNER_MISSING`
- `WORKLOAD_IDENTITY_MISSING`
- `DISCOVERED_NOT_GOVERNED`
- `COOPERATIVE_ONLY`
- `MANDATORY_MEDIATED`
- `CONTAINED`
- `IDENTITY_DRIFT`

The UI should never infer ownership from the agent name.

## 4. Activity

This is the primary forensic timeline.

Default rows should show:

```text
time
agent/workload
action
resource
decision
risk
mediation profile
proof status
```

A row expands into a vertical authority chain:

```text
Request
  ├── principal / owner / agent / workload / session
  ├── exact security-relevant arguments
  └── canonical request digest
       ↓
Decision
  ├── ALLOW / DENY / REQUIRE_APPROVAL
  ├── policy version + digest
  ├── rules/reasons
  └── freshness window
       ↓
Authority
  ├── capability(s)
  ├── approval(s)
  ├── delegation chain
  └── use/revocation state
       ↓
Execution
  ├── PEP/tool identity
  ├── execution receipt
  ├── exact input digest
  └── result/resource receipt
       ↓
Evidence
  ├── event-chain inclusion
  ├── checkpoint status
  └── independent verifier result
```

If any stage is absent, show the gap at the exact stage rather than one generic warning.

## 5. Policies

Policy authoring should support three modes:

- human-readable policy explanation;
- machine policy/source view;
- historical-impact simulation.

A policy proposal should show:

```text
ALLOW payment.create
WHEN amount <= 5,000 USD
AND vendor.risk != "blocked"
AND owner_group == FinanceOperations

REQUIRE APPROVAL when amount > 1,000 USD
```

Before publish, run simulation against historical requests:

```text
4,829 unchanged
   71 newly escalated
    8 newly denied
    0 newly allowed
```

"Newly allowed" deserves special emphasis because permissive drift is usually more security-sensitive than extra denial.

Published policy UI should expose:

- policy version;
- immutable digest;
- author/approver identity;
- effective epoch/time;
- rollback history;
- affected action/resource classes;
- currently active workloads using the policy.

## 6. Approvals

Approvals must be exact-effect approvals, not generic chat confirmations.

An approval screen should show:

```text
Who is asking?
Which agent/workload?
On whose behalf?
What exact action?
Which exact resource?
Which consequential arguments?
What policy required approval?
What risk class?
How long will this approval remain valid?
Can it be reused?
What authority will be issued if approved?
```

For high-risk operations, the UI should visually emphasize parameter binding. Example:

```text
payment.create
source: account_A
destination: vendor_123
amount: 417.25 USD
invoice: 88219
```

An approval must become stale if the request hash changes.

## 7. Authority

This screen explains capabilities and delegation without forcing users to read cryptographic structures first.

Primary table:

```text
subject
issuer
action/resource scope
risk
uses remaining
expiry
revocation state
delegation depth
request binding
```

A capability detail drawer includes the canonical/security fields and the exact evidence events that created/consumed/revoked it.

Delegation visualization should be a small directed chain, not a decorative graph:

```text
human/service principal
   ↓ delegates
parent agent/workload
   ↓ attenuates
subagent/workload
   ↓ consumes
protected action
```

Any broadening should be rendered as an error, not simply another edge.

## 8. Tools & MCP

This is one of the highest-value security screens.

For every tool/MCP/resource adapter show:

```text
origin
schema hash / version
transport
credential owner
network reachability
risk class
policy enforcement point
mediation profile
known bypass paths
last schema change
last security review
```

Security-specific states:

- unknown/changed MCP schema;
- direct credential present in agent process;
- alternate network route;
- unmediated child-process spawn;
- plugin runs in-process with unrestricted host access;
- transport downgrade;
- tool description from untrusted remote content.

The primary workflow is not "connect tool"; it is **discover → classify → shadow → enforce → eliminate bypass**.

## 9. Incidents and containment

Containment must represent actual authority revocation, not a UI flag.

Recommended graduated actions:

```text
Stop issuing new capabilities
Invalidate capability/revocation epoch
Revoke tool/resource credentials
Block network/resource access
Stop or isolate workload
Snapshot/export evidence
```

Incident timeline example:

```text
10:42:01  task received
10:42:02  payment.create requested
10:42:02  decision: DENY
10:42:02  capability: NOT ISSUED
10:42:03  direct network attempt detected    CRITICAL
10:42:03  credential revoked
10:42:03  workload isolated
10:42:04  evidence checkpoint signed
```

The UI should clearly distinguish **containment requested**, **control-plane accepted**, and **resource-level effect confirmed**.

## 10. Evidence

Evidence UX should make independent verification a first-class workflow.

Primary operations:

- verify one action;
- verify a run/session;
- verify a time range;
- build an auditor/incident evidence package;
- inspect chain/checkpoint health;
- compare verification across implementations.

Export package configuration:

```text
Scope
  agent/workload
  time range
  action/resource filters

Include
  policy bundles
  signed/authenticated decisions
  capabilities/approvals
  execution receipts
  identity/delegation metadata
  evidence checkpoints
  verifier manifest

Redaction
  raw arguments / selected fields / digest only
  prompt content excluded by default unless explicitly required
```

Verification result must be one of:

- `VERIFIED`
- `FAILED`
- `INCOMPLETE`

The detail page must disclose assumptions, especially mediation profile and missing resource-side evidence.

## 11. Assurance

The Assurance screen maps directly to the existing L1–L4 program.

Never render aspirational assurance as achieved.

Recommended display:

```text
L1 Internal implementation evidence     AVAILABLE
L2 Cross-runtime conformance             AVAILABLE
L3 External reproduction                 NOT ASSESSED
L4 Independent security assessment       NOT ASSESSED
```

Each level expands to exact evidence artifacts, candidate commit, environment matrix, signer identity/fingerprint, limitations, and verifier status.

## 12. Persona-specific workflows

### Security engineer

Primary needs:

- unmediated effect discovery;
- bypass-path elimination;
- policy simulation;
- incident reconstruction;
- containment;
- proof/identity failures.

### Platform engineer

Primary needs:

- deployment profile;
- adapter/PEP health;
- credential custody;
- latency/error budgets;
- policy rollout/shadow mode;
- workload identity integration.

### Developer

Primary needs:

- why an action was denied;
- exact missing scope/identity/provenance;
- local verification;
- adapter conformance;
- policy simulation before deployment.

CLI/API should remain the fastest interface for this persona.

### Approver

Primary needs:

- exact action and parameters;
- requester/on-behalf-of identity;
- reason/risk;
- expiry/reuse semantics;
- concise approve/deny action.

### Auditor/compliance reviewer

Primary needs:

- bounded evidence scope;
- policy version and ownership;
- independent verification;
- chain/checkpoint health;
- assurance artifacts;
- explicit limitations/non-claims.

## 13. CLI/API-first vs GUI-first

### CLI/API-first

- proof verification;
- evidence export automation;
- policy CI/testing;
- conformance suites;
- adapter registration;
- workload/bootstrap integration;
- incident scripting;
- bulk policy/query operations.

### GUI-first

- mediation coverage and gaps;
- agent ownership/identity inventory;
- live decision/activity exploration;
- policy impact review;
- human approvals;
- incident investigation/containment;
- evidence package composition;
- assurance status.

The GUI must call authoritative APIs; it does not implement local policy logic.

## 14. Terminology

Prefer precise security terms over broad AI-governance language.

Use:

- `Mediated`
- `Unmediated`
- `Decision`
- `Authority`
- `Capability`
- `Approval`
- `Execution receipt`
- `Evidence`
- `Verified / Failed / Incomplete`
- `Assurance level`
- `Owner`
- `Acting principal`
- `Workload identity`

Avoid as security-status labels:

- `Safe`
- `Trusted AI`
- `Compliant` without a named control/framework/evidence scope
- `Protected` when only observed
- `Verified agent` when only one action/proof was verified

## 15. UX anti-patterns

Do not build:

- one opaque "governance score";
- green status from mere telemetry presence;
- policy editing with no historical impact simulation;
- approval prompts that omit exact arguments/resource;
- graph-heavy identity views with no actionable security state;
- generic kill switches that only flip application state;
- proof views that expose hashes without explaining which property they bind;
- a chat-centric governance experience where the model explains its own authorization;
- duplicated authorization logic in frontend code.

## 16. Recommended implementation order

### P0

- Overview with mediation/proof health;
- Activity → Request/Decision/Authority/Execution/Evidence drill-down;
- exact-effect approval UI;
- tool/MCP mediation/bypass inventory;
- evidence verifier result UI;
- explicit L1–L4 assurance status.

### P1

- identity/owner inventory;
- policy simulation/publish flow;
- capability/delegation explorer;
- incident containment workflow;
- evidence package builder.

### P2

- external checkpoint/transparency status;
- attested PEP/workload details;
- cross-organization/federated proof relationships;
- compliance framework projections fed by verified Arcana evidence.

The UI should become a readable projection of Arcana's security kernel, not a second system of record.
