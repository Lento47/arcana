---
document_class: competitive_assessment
authority: reference
status: current
research_date: 2026-08-02
refresh_after: 2026-09-02
evaluated_commit: c07faba6
---

# Arcana — Market Assessment (2026-08-02)

**Dated competitive research.** This assessment supersedes the embedded Part IV
that previously lived inside `Arcana_Project_Master_Specification.md`; the
compendium now carries only the stable competitive thesis. Refresh this
document after 2026-09-02 or when a cited competitor ships a material change.

---
> **SUPERSEDED (2026-08-02)** — Consolidated into
> `.hermes/docs/arcana/docs/arcana-Master/Arcana_Project_Master_Specification.md`
> (mirrored to `docs/arcana-Master/`), Part IV. This file is retained for
> history; the consolidated document is the single source of truth.

# Assessment

**Arcana’s in-development technical core is unusually strong. Its market readiness is not.**

My current scoring:

| Dimension                        |      Score | Position                                             |
| -------------------------------- | ---------: | ---------------------------------------------------- |
| Security architecture            | **8.5/10** | Top-tier among early-stage agent-governance projects |
| Intent-bound authorization       |   **9/10** | Potentially category-leading                         |
| Proof and verified completion    | **8.5/10** | Strong differentiation                               |
| Durable approvals and revocation |   **8/10** | Competitive                                          |
| Local host containment           | **4.5/10** | Materially incomplete                                |
| External-agent coverage          | **2.5/10** | Mostly roadmap today                                 |
| Distributed/fleet governance     |   **4/10** | Substantial work exists, but unfinished              |
| TUI/operator experience          | **6.5/10** | Distinctive, automated-green, not fully frozen       |
| External validation              | **1.5/10** | Major weakness                                       |
| Enterprise/ecosystem readiness   |   **3/10** | Far behind Microsoft, AWS, and established vendors   |
| Documentation depth              |   **8/10** | Exceptionally detailed                               |
| Documentation consistency        |   **5/10** | Too many overlapping truths                          |

These scores are analytical judgments, not independent benchmark results.

## The important conclusion

Arcana is **not merely a promising design**. The uploaded evidence describes a real production path connecting:

```text
contract
→ intent binding
→ canonical authorization request
→ deterministic PDP
→ fresh PEP enforcement
→ atomic capability/approval claim
→ effect
→ durable evidence
→ verified completion
→ RunProof
→ Command Spine
```

It includes exact request hashing, contract-revision binding, durable intent storage, capability-use exhaustion, cascade revocation, restart reconstruction, fail-visible trace health, obligation-backed completion, generated SDK paths, HTTP APIs, SSE projection and TUI presentation. 

The strongest project-owned results include:

* 95 adversarial fixtures with zero unexpected allows
* Zero protected executor calls on denied paths
* 617 capability tests with 1,474 assertions
* File-backed restart reconstruction
* Atomic use counters and approval/capability claims
* RunProof derivation over 500 events with single-digit-millisecond p95 measurements
* Full TUI suite at 762 passed, one skipped, zero failed

Those results are meaningful engineering evidence, although they remain internally produced rather than independently validated. 

---

# Where Arcana is stronger than competitors

## 1. Arcana governs the relationship between an action and the current objective

Most products answer:

> Is this tool generally permitted?

Arcana is attempting to answer:

> Is this exact immutable request permitted for this principal, session, workspace, contract revision and acceptance criterion, based on the current user objective and provenance of the request?

The durable intent implementation is especially strong:

* Exact request-hash lookup
* Session binding
* Contract and contract-revision binding
* Criterion binding
* Expiration and revocation
* No substitution of ordinary approval for missing intent
* Rejection of changed requests on approval retry
* Failure closed when required intent storage is unavailable
* No automatic intent binding for remote content, MCP output, tool output or subagent-derived requests

That is much deeper than a conventional tool allowlist. 

### Direct comparison with Microsoft AGT

Microsoft’s Agent Governance Toolkit is Arcana’s most important architectural competitor. It has a much broader ecosystem: multiple language packages, framework integrations, identity, sidecars, execution rings, sandbox packages, SRE tooling, compliance mappings and enterprise integrations. It is also still a public preview with APIs that may change. ([GitHub][1])

However, Microsoft’s own limitations document currently says:

* It evaluates individual actions but does not correlate allowed actions into malicious workflows.
* Intent declaration and plan validation are still being built.
* Its audit logs primarily record attempts and decisions, not verified real-world outcomes.
* Post-action validation and outcome attestation are future work.
* It does not presently provide knowledge provenance or classification-aware information-flow governance.
* It does not automatically revoke task-scoped credentials at context switches.
* A configuration with no loaded policies defaults to allowing actions unless strict mode is explicitly selected. ([GitHub][2])

Arcana already claims implemented paths for several of those areas:

* Durable current-intent enforcement
* Provenance and sensitivity labels
* Contract-scoped authority
* Completion obligations
* Verified completion from durable evidence
* Capability and intent revocation at contract completion
* Fail-visible `DEGRADED` or `UNAVAILABLE` states
* Hard denial when required governance state cannot be loaded

That is Arcana’s strongest competitive finding.

> **Arcana is narrower than Microsoft AGT, but its core model is presently deeper in intent, provenance, task completion and proof semantics.**

It would be inaccurate to say Arcana is stronger overall. Microsoft wins overwhelmingly in ecosystem, integrations, languages, deployment choices, recognition and organizational resources. But Arcana has a credible architectural advantage in **semantic execution assurance**.

---

## 2. Arcana distinguishes authorization from verified completion

Most governance systems stop at:

```text
requested
→ allowed
→ tool returned success
```

Arcana adds:

```text
objective
→ acceptance criteria
→ proof obligations
→ execution evidence
→ obligation resolution
→ verified completion
```

The completion verifier does not equate “the assistant stopped” with “the task is complete.” Required obligations have to resolve through supported evidence types, while comparison, human-decision and external-confirmation obligations remain pending until explicitly verified. Contract resolution then revokes remaining intent bindings and capabilities. 

Microsoft AGT acknowledges that its current audit layer does not establish whether the intended outcome actually occurred. AWS AgentCore provides deterministic Cedar authorization at its gateway, but its primary security boundary is still agent-to-tool access rather than an evidence-backed task-completion contract. ([GitHub][2])

This gives Arcana a differentiated combination:

> **Pre-effect authorization plus post-effect epistemic verification.**

Very few competitors combine both in one coherent state model.

---

## 3. RunProof is more defensible than ordinary observability

Arcana does not describe one generic “secure” badge. It separates:

* Trace existence
* Trace health
* Chain integrity
* Authorization assurance
* Intent enforcement
* Verification
* Reproducibility
* Delegation
* Approval lifecycle
* Information flow

Missing evidence does not produce a reassuring zero. It produces `DEGRADED` or `UNAVAILABLE`. That is an important security design decision because an absent recorder must not look identical to a perfectly clean run. 

Many competitors have tamper-resistant audit logs, telemetry or action records. Arcana’s additional opportunity is to make its proof independently portable and verifiable without requiring access to the original running application.

That advantage is not completely established until Arcana publishes:

* Stable proof schemas
* Canonical serialization rules
* Independent verification tooling
* Public test vectors
* At least one verifier implementation outside the main repository

Until then, RunProof is a strong internal system, not yet a public protocol moat.

---

## 4. Arcana’s approvals are structurally stronger than ordinary permission dialogs

Arcana models:

```text
PENDING
→ APPROVED
→ CLAIMED
→ CONSUMED
```

It binds approval to an immutable request and prevents a rebuilt request from reusing an earlier binding. It also treats policy, capability, workspace or request changes as invalidation conditions. 

Codex, Claude Code and Gemini CLI now have increasingly sophisticated sandbox, approval and policy systems:

* Codex separates sandbox capability from approval policy, supports command rules and can route selected escalations to a separate reviewer agent. ([OpenAI Developers][3])
* Claude Code offers filesystem/network sandboxing, configurable permissions and pre-tool/permission hooks. ([Claude Platform Docs][4])
* Gemini CLI has a TOML policy engine with allow, deny and ask decisions, trusted-folder controls and tool/process sandboxing. ([Gemini CLI][5])

Those systems are mature within their own product boundaries. Arcana’s potential advantage is that one lifecycle could apply consistently across Codex, Claude, Gemini, MCP and internal agents.

But that remains potential until the external launch adapters exist.

---

# Where Arcana is currently weak

## 1. It does not yet govern the competitor CLIs it names

Your master specification correctly labels:

```text
arcana launch <runtime>
```

as planned external-runtime governance. 

This is the largest gap between the product claim and the current product.

Today, Arcana appears strongest as:

> **A governed local runtime for actions that already enter Arcana’s own execution boundary.**

It is not yet demonstrably:

> **A universal governance layer for Codex, Claude Code, Gemini CLI and arbitrary desktop agents.**

A launch wrapper that observes PTY output is insufficient. For each external runtime, Arcana needs a declared assurance level:

| Level | Meaning                                            |
| ----- | -------------------------------------------------- |
| A0    | Telemetry only                                     |
| A1    | PTY/process observation; incomplete interception   |
| A2    | Sandboxed black-box process with host restrictions |
| A3    | Native exact-effect integration through Arcana PEP |

Your playbook already proposes essentially this structure. It should become a public product contract, not remain buried in the roadmap. 

## 2. Host containment is not yet the strongest boundary

Arcana’s documents acknowledge that it does not govern processes launched outside its effect boundary and does not claim hostile-host containment. 

That is honest, but commercially significant.

Native products already provide real sandbox surfaces:

* Codex controls filesystem and network access through sandbox profiles. ([OpenAI Developers][6])
* Claude Code provides sandboxed Bash execution and working-directory boundaries. ([Claude Platform Docs][7])
* Gemini CLI provides process and tool-level sandbox options. ([Gemini CLI][8])
* Cursor provides cross-platform local-agent sandboxing and requests approval when leaving it. ([Cursor][9])

Arcana needs its policy semantics connected to equivalent OS-level enforcement:

* Linux namespaces, seccomp, cgroups and `openat2`
* Windows job objects, restricted tokens, network controls and reparse-safe handle validation
* Container or VM isolation
* Credential brokering outside the agent process
* Egress mediation
* Process-tree containment

Without this, Arcana’s policy layer can be excellent while a black-box agent still possesses ambient authority elsewhere.

## 3. No independent verification exists yet

The project evidence is extensive, but it is:

* Produced by the same project
* Run against privately controlled fixtures
* Not independently reproduced
* Not externally audited
* Not tested against a public conformance suite
* Not proven on diverse production hosts

This does not invalidate the results. It limits the claim.

The correct wording is:

> “Operationally validated against the frozen internal evaluation suite.”

Not:

> “Proven secure.”

## 4. TUI maturity remains incomplete

TUI-2.1 is mounted and automated-green, but its freeze is explicitly unauthorized pending:

* Manual Windows Terminal testing
* Width matrix
* Light/dark theme matrix
* Observed approval lifecycle
* Restart recovery
* Session isolation
* Performance measurements
* Live streaming validation



That means the TUI is a strong prototype and operator surface, but not yet a finished product-quality competitive advantage.

## 5. Phase D and fleet capability are not ready

The handover says Phase D has progressed through D-8A and is approximately 45–55% complete by playbook weighting. 

That is meaningful progress, but Microsoft, AWS and enterprise security companies already offer:

* Multiple SDK languages
* Identity integrations
* Sidecar deployments
* Policy distribution
* Fleet visibility
* Organization controls
* Cloud deployment guides
* Existing procurement paths

Arcana should not compete on enterprise breadth yet.

---

# Competitive position by opponent

| Competitor group                     | Arcana advantage                                                                    | Arcana disadvantage                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Microsoft AGT**                    | Current intent, contract criteria, provenance, verified completion, proof semantics | Ecosystem, languages, identity, deployment, sidecars, discovery, enterprise credibility |
| **AWS AgentCore**                    | Local-first, provider-neutral, richer proof and task semantics                      | Managed scale, IAM integration, gateway adoption, operational infrastructure            |
| **Codex / Claude / Gemini / Cursor** | Vendor-neutral governance and common evidence model                                 | Their native sandbox is already integrated and polished                                 |
| **Prompt-security vendors**          | Deterministic effect authorization rather than probabilistic filtering alone        | Weaker prompt-injection detection, content inspection and threat intelligence           |
| **Identity vendors**                 | Knows what the process may do after authentication                                  | Weak identity ecosystem and enterprise directory integration                            |
| **Governance dashboards**            | Real runtime enforcement and evidence                                               | Weak inventory, fleet administration, reporting and procurement maturity                |

## Realistic market standing

As an **architecture and codebase**, Arcana is competitive with serious research-grade projects.

As a **developer product**, it is early.

As an **enterprise platform**, it is not yet competitive.

As a **potential category-defining kernel**, it is credible.

---

# Documentation changes to make immediately

## P0 — Fix source-of-truth problems

### 1. Create one live `docs/STATUS.md`

This should be the only current-status authority.

Include:

```text
Evaluated commit
Current implementation branch
Default branch state
Release version
Last verification date
Current supported platforms
Current enforcement boundaries
Milestone status
Known blockers
Current nonclaims
```

Use a status matrix with independent columns:

| Capability | Code exists | Production mounted | Automated validated | Manually validated | Externally validated | Released |
| ---------- | ----------: | -----------------: | ------------------: | -----------------: | -------------------: | -------: |

Do not use one overloaded word such as `COMPLETE`.

Your current documents conflict:

* The master specification references `phase-c-capability-security`.
* The handover names `phase-d-implementation` as the current source of truth.
* The master specification says Phase D is planned.
* The handover says Phase D is already approximately 45–55% complete.
* The master specification describes TUI maturity using an earlier worldview.
* The current sign-offs describe later frozen and pending milestones.

 

This does not make the architecture weak, but it makes an evaluator question every status claim.

### 2. Stop making the master specification a living status report

`Arcana_Project_Master_Specification.md` is trying to be all of these simultaneously:

* Product definition
* Architecture reference
* Current status
* Roadmap
* Competitive analysis
* Package inventory
* Release evidence

Freeze it as a versioned architecture document:

```text
Master Specification v1.0
Applicable architecture version
Approved date
Superseded-by field
```

Move changing implementation information into `STATUS.md`.

### 3. Separate documents into four authority classes

```text
docs/
  PRODUCT.md                  # What Arcana is
  STATUS.md                   # What exists now

  architecture/              # Normative design
  security/                  # Threat model and invariants
  protocol/                  # Public schemas and vectors
  evaluations/               # Frozen evidence
  roadmap/                   # Future work
  releases/                  # Sign-offs
  operations/                # Installation and recovery
  archive/                   # Historical handovers
```

Every document header should contain:

```yaml
document_class:
authority:
status:
applies_to_commit:
last_verified:
supersedes:
superseded_by:
owner:
```

## P0 — Tighten product claims

### 4. Qualify “Every action leaves proof”

Presently that statement is broader than your declared enforcement boundary.

Use:

> **Every consequential action crossing an Arcana-governed effect boundary leaves durable proof.**

Or:

> **Every Arcana-mediated consequential action leaves verifiable evidence.**

This remains powerful and is technically defensible.

### 5. Change the current category statement

Current future-facing language:

> Cross-runtime execution-security, governance and proof infrastructure.

Better current wording:

> **Arcana is a local-first execution trust and proof runtime for autonomous agent actions. It enforces exact, intent-bound authority over Arcana-mediated effects and produces durable evidence of authorization, execution and completion. Cross-runtime adapters and fleet governance are under active development.**

This keeps the ambition while accurately representing the present system.

### 6. Distinguish product promises by tense

Use three labels everywhere:

* **Available now**
* **In active development**
* **Target architecture**

For example:

```text
AVAILABLE NOW
Arcana-native runtime PEP, durable capabilities, intent bindings,
scoped approvals, RunProof and Command Spine projection.

IN ACTIVE DEVELOPMENT
Distributed node authority, proof synchronization and TUI-2.1 freeze.

TARGET
Codex/Claude/Gemini launch adapters, public protocol SDKs and
enterprise fleet control.
```

## P0 — Document the actual security boundary

### 7. Add `security/EFFECT-COVERAGE.md`

This may become the most important Arcana document.

For every effect path, record:

| Effect           | Entry point | Canonicalized | PDP | PEP | OS-enforced | Receipt | Known bypass |
| ---------------- | ----------- | ------------: | --: | --: | ----------: | ------: | ------------ |
| File read        | …           |           Yes | Yes | Yes |     Partial |     Yes | …            |
| File write       | …           |           Yes | Yes | Yes |     Partial |     Yes | …            |
| Shell process    | …           |           Yes | Yes | Yes |     Partial |     Yes | …            |
| Network request  | …           |           Yes | Yes | Yes |  No/Partial |     Yes | …            |
| MCP invocation   | …           |           Yes | Yes | Yes |     Gateway |     Yes | …            |
| Git push         | …           |             … |   … |   … |           … |       … | …            |
| Secret retrieval | …           |             … |   … |   … |           … |       … | …            |
| Child process    | …           |             … |   … |   … |           … |       … | …            |

The central question an evaluator will ask is:

> “Which real effects can still occur without passing Arcana?”

Answer it before they do.

### 8. Add a formal trusted computing base document

`security/TCB.md` should name:

* Components trusted for authorization
* Components trusted for effect execution
* Components trusted for evidence
* SQLite assumptions
* Clock assumptions
* OS assumptions
* Cryptographic assumptions
* What the model controls
* What plugins control
* What MCP servers control
* What external CLIs can bypass
* What a compromised host can falsify

Your specification contains much of this material, but it needs to be one reviewable security artifact. 

## P0 — Make evaluation reproducible

### 9. Create an immutable evaluation bundle

```text
evaluations/phase-c/
  MANIFEST.json
  fixtures/
  expected-results.json
  commands.md
  environment.json
  commit.txt
  result-summary.json
  result-hashes.txt
  limitations.md
```

Include all 95 fixture identifiers, not merely the aggregate totals.

Record:

* Exact commit
* OS
* Runtime versions
* Database configuration
* Random seeds
* Timeouts
* Expected deny reason
* Expected executor-call count
* Actual result
* Artifact hashes

The completion playbook already requires this level of evidence discipline. 

### 10. Separate internal validation from independent validation

Add a validation-level field:

```text
L0 — unit/property tested
L1 — production-path integration tested
L2 — internal adversarial evaluation
L3 — independent reproduction
L4 — third-party security assessment
L5 — production evidence from a bounded pilot
```

Arcana is currently strongest around L1–L2, not L3–L5.

---

# File-specific corrections

## `Arcana_Project_Master_Specification.md`

Change:

* Current branch
* Phase D status
* TUI status
* Current test totals
* Launch-wrapper status
* Mutation/diff-gate production status
* Current source register
* References to owner-reported versus repository-verified evidence

Then freeze it. Do not keep appending operational updates.

## `ARCANA-FINAL-PRODUCT-DESIGN.md`

Keep this as the target architecture, but add a visible status marker to every major section:

```text
CURRENT
PARTIAL
TARGET
```

Representative commands such as `arcana launch codex` must say **TARGET**, not merely appear in a general command list. 

## `ARCANA-HANDOVER-2026-08-01.md`

Move it to an archive directory.

A handover should describe a moment in time; it should not become the long-term source of milestone truth. It currently contains historical layers, superseded statements and later appended corrections. 

## `ARCANA-SIGNOFF-2026-08-01.md`

An approved sign-off should not contain unchecked subordinate checklist rows.

Either:

* Mark every applicable row with its actual decision, or
* Rename the unchecked table to “supporting evidence checklist—not separately approval-gated.”

The document should also record one exact evaluated commit, not only milestone tags and branch relationships. 

## `TUI-2.1-FREEZE-SIGNOFF-2026-08-01.md`

This document is correctly conservative. Keep it pending until the manual and live validation matrices are completed. Do not let broader product documents imply that TUI-2.1 is released. 

## `arcana-breaking-change-map.md`

Reconcile every “required next break” against current implementation:

* Still absent
* Primitive exists only
* Shadow-mounted
* Production-mounted
* Adversarially validated
* Frozen

A primitive existing in `kernel/` is not equivalent to every production write path being unable to bypass it.

## `database-schema.md`

Generate this file from migrations or schema introspection.

Add:

```text
Schema version
Migration terminal ID
Generated-at commit
Database file
Authoritative schema source
```

Hand-maintained database documents become stale rapidly and are dangerous in a security product.

---

# Standards documentation

Create a control crosswalk against:

* OWASP Agentic Top 10 2026
* NIST AI Agent Standards Initiative
* NIST AI RMF
* CSA Agentic Trust concepts
* MCP authorization and security requirements

NIST is actively working on trusted, interoperable agent standards, including agent security and identity, while OWASP’s 2026 framework focuses specifically on autonomous-agent risks. ([NIST][10])

Do not write:

> “Arcana is OWASP compliant.”

Write:

| Risk/control | Arcana mechanism | Production path | Evidence | Coverage | Gap |
| ------------ | ---------------- | --------------- | -------- | -------- | --- |

This makes the documentation useful for security review rather than primarily marketing.

---

# Best defensible positioning today

> **Arcana is a local-first execution trust and proof runtime for autonomous agents. It binds consequential effects to exact capability, current intent, provenance, workspace and scoped approval; enforces those decisions at a dedicated execution boundary; and records enough durable evidence to distinguish attempted work, executed work and verified completion.**

Then add:

> **Today, these guarantees apply to declared Arcana-mediated execution paths. External CLI adapters, hardened host containment, distributed fleet enforcement and independent conformance validation remain under development.**

That positioning is both strong and honest.

## Final judgment

Arcana is probably **ahead of most small and mid-sized competitors in architectural depth**, particularly in the integration of:

* Intent
* Authority
* Provenance
* Effect enforcement
* Evidence
* Completion verification

It is **not ahead of Microsoft AGT or major cloud platforms as an overall product**.

The opportunity is to become the deeper, more exact layer:

> Microsoft, AWS or an enterprise control plane may define identity and organizational policy. Arcana proves that the exact local effect was currently authorized, actually occurred as recorded, and contributed to a verified objective.

That is a real competitive position.

The next moat is not another feature. It is:

1. Publishing the proof and request contracts
2. Proving complete effect-boundary coverage
3. Shipping one serious external-runtime adapter
4. Adding OS-backed containment
5. Obtaining independent reproduction of the Phase C evaluation

At that point, Arcana stops looking like an unusually ambitious private project and starts looking like credible security infrastructure.

[1]: https://github.com/microsoft/agent-governance-toolkit/blob/main/agent-governance-python/agent-os/README.md "agent-governance-toolkit/agent-governance-python/agent-os/README.md at main · microsoft/agent-governance-toolkit · GitHub"
[2]: https://github.com/microsoft/agent-governance-toolkit/blob/main/docs/LIMITATIONS.md "agent-governance-toolkit/docs/LIMITATIONS.md at main · microsoft/agent-governance-toolkit · GitHub"
[3]: https://developers.openai.com/codex/agent-approvals-security?utm_source=chatgpt.com "Agent approvals & security | ChatGPT Learn"
[4]: https://docs.anthropic.com/en/docs/claude-code/hooks?utm_source=chatgpt.com "Hooks reference - Claude Code Docs"
[5]: https://geminicli.com/docs/reference/policy-engine/?utm_source=chatgpt.com "Policy engine"
[6]: https://developers.openai.com/codex/sandboxing?utm_source=chatgpt.com "Sandbox | ChatGPT Learn"
[7]: https://docs.anthropic.com/en/docs/claude-code/security?utm_source=chatgpt.com "Security - Claude Code Docs"
[8]: https://geminicli.com/docs/cli/sandbox/?utm_source=chatgpt.com "Sandboxing in Gemini CLI"
[9]: https://cursor.com/blog/agent-sandboxing?utm_source=chatgpt.com "Implementing a secure sandbox for local agents"
[10]: https://www.nist.gov/artificial-intelligence/ai-agent-standards-initiative?utm_source=chatgpt.com "AI Agent Standards Initiative | NIST"


---

# Competitive update (2026-08-02)

## Microsoft AGT has moved fast — the gap is narrowing

Microsoft Agent Governance Toolkit is now on a **5.0.0 public-preview line**
with further unreleased breaking changes. Its current changelog includes:

* First-party Claude Code and OpenCode governance packages
* Linux/macOS kernel-backed sandbox support through Landlock or Seatbelt
* Shell interception
* Credential injection and offload
* Protocol-aware policy facets
* A major ACS policy-runtime migration
* Multiple package consolidations and breaking releases

Microsoft also explicitly says all releases remain public previews and may
break before GA. The earlier comparison should no longer imply that AGT is
merely application middleware without containment options: its core policy
layer is application-level, but its ecosystem now includes dedicated sandbox
providers and process controls.

## Where Arcana's differentiation still holds

Microsoft AGT still documents these limitations, which are almost exactly the
areas where Arcana is technically strongest:

* It primarily governs individual actions, not complete malicious workflows.
* Intent declaration and plan validation remain future work.
* Audit records do not verify achievement of the external outcome.
* Post-action validation and outcome attestation remain future work.
* Knowledge provenance and classification-aware information flow remain gaps.
* Task-scoped credential revocation at context changes remains future work.
* An initialized evaluator with no loaded policies can default to allow.

| Area | Arcana | Microsoft AGT documented state |
|---|---|---|
| Exact current intent | Durable request/contract/criterion binding | Intent declaration under development |
| Outcome verification | Obligations and verified completion | Audit attempts and decisions; outcome verification planned |
| Knowledge provenance | Provenance, sensitivity and field lineage | Explicitly documented gap |
| Task authority cleanup | Contract completion revokes bindings and grants | Credential context-switch revocation planned |
| Missing policy state | Required stores fail closed | No-policy initialization may allow |
| Assurance health | Degraded/unavailable rather than false zero | Strong audit, but different proof model |

## Revised scores (2026-08-02)

| Dimension | Previous | Revised |
|---|---:|---:|
| Security architecture | 8.5 | 8.7 |
| Intent-bound authorization | 9.0 | 9.0 |
| Proof and verified completion | 8.5 | 8.8 |
| Durable approvals/revocation | 8.0 | 8.4 |
| Host containment | 4.5 | 5.2 |
| External-agent coverage | 2.5 | 2.5 |
| Distributed governance | 4.0 | 5.0 |
| TUI/operator experience | 6.5 | 7.2 |
| External validation | 1.5 | 1.5 |
| Enterprise readiness | 3.0 | 3.2 |
| Documentation consistency | 5.0 | 7.5 |

The host-containment increase reflects the documented Linux `openat2`, cgroup
and platform-hardening direction — not proof that those protections are fully
deployed across every effect path.

## Standards alignment

* NIST AI Agent Standards Initiative — interoperable protocols, agent
  authentication and identity, security evaluation, authorization, auditing
  and non-repudiation. Directly aligns with Arcana's Node identity, signed
  grants, approval lifecycle, RunProof and conformance roadmap.
* OWASP Agentic Top 10 2026 — goal hijacking, tool misuse, privilege abuse,
  supply-chain compromise, unexpected code execution, memory poisoning,
  insecure inter-agent communication, cascading failures, human trust
  exploitation, rogue agents.
* OWASP crosswalk priority gaps — agent identity, runtime containment,
  architectural monitoring, supply-chain attestation, schema controls. This is
  a near-direct checklist for Arcana's remaining implementation and
  documentation priorities.

Crosswalks: `docs/compliance/OWASP-ASI-2026-CROSSWALK.md` and
`docs/compliance/NIST-AGENT-IDENTITY-CROSSWALK.md`.

## Sources

[1]: https://github.com/microsoft/agent-governance-toolkit/blob/master/CHANGELOG.md
[2]: https://github.com/microsoft/agent-governance-toolkit/blob/main/docs/LIMITATIONS.md
[3]: https://www.nist.gov/artificial-intelligence/ai-agent-standards-initiative
[4]: https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
[5]: https://genai.owasp.org/resource/aiuc-1-crosswalks-owasp-top-10-for-agentic-applications/
