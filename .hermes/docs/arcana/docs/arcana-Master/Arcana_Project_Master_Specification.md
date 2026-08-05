---
document_class: architecture_compendium
authority: reference
status: current
architecture_version: "1.0"
status_source: docs/STATUS.md
evaluated_commit: c07faba6
current_branch_at_publication: phase-d-implementation
published_at: 2026-08-02
historical_parts_present: true
historical_statements_authoritative: false
---

# Arcana — Architecture and Program Compendium

**Comprehensive reader (2026-08-02), not the live status authority.** This
compendium consolidates the previously separate master documents:

- Part I — Master Project Specification
- Part II — 100% Completion Playbook
- Part III — Final Product Design
- Part IV — Competitive Thesis (stable)

Current operational truth lives in `docs/STATUS.md` (mirrored to
`.hermes/docs/arcana/docs/STATUS.md`). The previous files are retained with
SUPERSEDED banners for history and reference-tool compatibility. Parts I–III
are historical snapshots: architecture and conceptual material remain useful,
but branch names, implementation status, test totals, dates, roadmap progress
and product availability inside them are superseded by `docs/STATUS.md`.

## Correction ledger (2026-08-02)

Status corrections applied from `edit-title-here-arcana-update.md` (now Part IV)
and the 2026-08-01 branch/milestone reconciliation audit. Where this ledger
conflicts with statements inside the historical Parts, the ledger wins.

| Topic | Corrected statement |
|---|---|
| Current branch | `phase-d-implementation` (committed HEAD `c07faba6` at ledger time; move status to a live `docs/STATUS.md` going forward) |
| Default branch | `master` / `origin/master` are stale: Phase B/C, D-7, and TUI-2 milestone commits are not on them; mainline promotion is pending |
| Phase C | Evaluation passed; tags `arcana-governed-autonomy-phase-c` and `phase-c-production-enforcement` exist and are reachable from the current branch; release sign-off = Approve with exceptions (2026-08-01) |
| Phase D | NOT planned-at-0%: implementation has progressed through D-8A; D-7 is frozen as a local distributed-authority milestone; D-8A proof batching is implemented; several earlier work packages remain partial; roughly 45–55% by playbook weighting. Remaining: D-6B-T transport, D-7.1 containment, live Linux workload identity, D-8B remote proof registration, node enrollment/key rotation, offline policy, operational deployment, hostile-node validation, Node 1.0 freeze |
| TUI | TUI-2 is frozen (`arcana-tui-2-interactive-authority-control`). TUI-2.1 is mounted and automated-green, but its freeze is NOT authorized (manual smoke, width/theme matrices, approval lifecycle observation, restart recovery, session isolation, performance, live stream validation pending). TUI-1 is a historical independent tag, not part of current branch ancestry |
| Product positioning | "Arcana is a local-first execution trust and proof runtime for autonomous agents. It binds consequential effects to exact capability, current intent, provenance, workspace and scoped approval; enforces those decisions at a dedicated execution boundary; and records enough durable evidence to distinguish attempted work, executed work and verified completion." Guarantees apply to declared Arcana-mediated execution paths; external CLI adapters, hardened host containment, distributed fleet enforcement and independent conformance validation remain under development |
| Proof claim | "Every consequential action crossing an Arcana-governed effect boundary leaves durable proof" — not "every action leaves proof" |
| Validation levels | L0 unit/property, L1 production-path integration, L2 internal adversarial evaluation, L3 independent reproduction, L4 third-party assessment, L5 bounded-pilot production evidence. Arcana is currently strongest at L1–L2; L3+ is not yet obtained |
| Documentation discipline | This specification is an architecture reference, not a living status report. Operational status moves to a live `docs/STATUS.md`; sign-offs move to `releases/`; historical handovers move to `archive/` |

### Applied documentation artifacts (2026-08-01/02)

| Artifact | Status |
|---|---|
| `docs/audits/ARCANA-SIGNOFF-2026-08-01.md` | Release sign-off for Phase A/B/C + frozen TUI-2 only; decision: Approve with exceptions (2026-08-01); TUI-2.1 and unfinished Phase D are out of scope |
| `docs/audits/TUI-2.1-FREEZE-SIGNOFF-2026-08-01.md` | TUI-2.1 freeze NOT AUTHORIZED; tag target TBD at the exact post-verification commit; the 6-checkpoint stream live-validation protocol is folded in |
| `docs/audits/ARCANA-HANDOVER-2026-08-01.md` | Reconciled milestone status table is authoritative; historical sections marked superseded |
| `docs/audits/TUI-1.1-GOVERNANCE-VISIBILITY-2026-08-01.md` | Stale open gates resolved (capability lifecycle publishers, TUI/CLI revoke surfaces, RunProof restart, derivation latency); genuinely open gates retained |
| `docs/architecture/phase-d-remaining-roadmap.md` | Replaces `phase-d-kickoff.md`; progress report (D-1..D-8A status) plus remaining work; does not restart completed work |
| `docs/architecture/tui-2-polish.md` | Scoped to TUI-2.1 production polish; T1–T8 candidates (T9 optional) plus the full freeze matrix; implemented spine pass recorded |
| `docs/arcana-Master/Arcana_Project_Master_Specification.md` | This consolidated file; previous master docs retained with SUPERSEDED banners |

### TUI-2.1 spine polish (implemented 2026-08-01/02)

- Real monotonic gutter indices: the 2-column "99" cap is gone; the gutter
  grows (2 → 3+ columns) with session length.
- Governance aggregation: consecutive governance events collapse into one
  `governed` row (`6 governed actions · 6 authorized · 6 executed · 0 denied`
  plus duration); individual events and full payloads open in the inspector
  (children).
- Thinking rows collapse to `Thinking/Thought · duration`; the reasoning
  title/body appears only when expanded.
- RunProof rows collapse by default and separate Overall assurance from
  Recorded trace, Authorization trace, Intent, Integrity, Completion, and
  Verification.
- Semantic tool labels: search rows show the query; inspect bursts aggregate
  targets (`3× inspect · src/a, src/b`).
- View filters (`f`): all → conversation → tools → governance → proof;
  security-critical rows (denials, pending approvals, degraded proof) always
  break through.
- Governance and proof rows are always compact (never chat cards), whole-row
  click toggles collapsed blocks with focus retention, expanded governance
  groups auto-collapse on new turns, `H`/`G` scroll to top/bottom, and
  approval-required events read `pending approval` rather than `failed`.

### Verification evidence (2026-08-01/02 checkpoint)

- TUI suite: 777 pass / 1 skip / 0 fail (778 tests).
- Repo-wide typecheck: 16/16 packages.
- Build: 8/8 tasks (engine binaries smoke-tested).
- Core suite: 1256 pass / 7 skip / 0 fail (clean rerun 2026-08-02; the earlier
  `Npm.add` network timeout was a one-off flake that passes in isolation).
- Engine full suite: CLEAN full run 2026-08-02 — 4248 pass / 74 skip / 1
  todo / 0 fail (4,323 tests, 1,044s). Both prior flake classes were
  root-caused and fixed (`session-lock` own-PID reacquire; `prompt.test.ts`
  cancel/concurrency budgets). Re-verify at the exact final commit.
- TUI-2.1 freeze: still NOT AUTHORIZED until the manual smoke test, width and
  theme matrices, restart/session isolation, performance measurements, and the
  6-checkpoint live stream protocol pass at the exact final commit.

### Enforcement boundary model (2026-08-02)

- **Logical enforcement boundary** — the Arcana PEP makes the final
  authorization decision and calls the protected adapter.
- **Physical containment boundary** — the operating system, sandbox,
  container, credential broker or network mediator prevents alternative
  execution outside the approved path.

Strong Effect Assurance = Logical PEP Enforcement ∧ Physical Bypass
Resistance ∧ Complete Evidence. A TypeScript wrapper is not kernel-enforced
containment; `docs/security/EFFECT-COVERAGE.md` records which boundary each
effect path actually has.

### Product tracks (2026-08-05)

Per `docs/design/ADR-004-m1-product-surface-boundary.md` (ratified via
PR #79), Arcana M1 has exactly one product journey and two user-facing
clients: CLI/TUI (primary AI work surface) and Arcana Desktop (local approval
and forensic companion). The Arcana Runtime is the authoritative local service
used by both clients, not a third user-facing surface. Desktop supervises the
local runtime lifecycle, renders the same canonical governance semantics, and
presents routed approvals, evidence, proofs, restart recovery, and native
notifications; it never becomes an independent policy, approval, execution, or
evidence authority. The minimal M1 Desktop surface: runtime lifecycle,
reconnect/resync, pending-approval notification, exact-request inspection,
approve/deny through the authoritative runtime, proof inspection, and restart
recovery. Arcana Manager is a transport/discovery adapter name, not a separate
product or authority surface. Enterprise consoles are preserved implementation
tracks, not M1 release surfaces. Immediate roadmap: TUI-2.1 freeze → CLI 1.0 →
local daemon/API/event contract → first external adapter → Desktop 1.0 → Node
1.0 → Control 1.0.


---

> [!WARNING]
> HISTORICAL SNAPSHOT — NON-AUTHORITATIVE FOR CURRENT STATUS.
>
> Architecture and conceptual material remain useful. Branch names,
> implementation status, test totals, dates, roadmap progress, and product
> availability in this Part are superseded by docs/STATUS.md.

## PART I — MASTER PROJECT SPECIFICATION



**ARCANA  /  MASTER PROJECT SPECIFICATION** 

# **A R C A N A** 

## **MASTER PROJECT SPECIFICATION** 

Architecture, Product Objective, Runtime, TUI, CLI, Security Kernel, Proof System, Roadmap, and Quantitative Model 

###### **Doctrine** 

_The model may propose. The engine decides. The proof records._ 

**Repository:** Lento47/arcana (private) **Historical source branch at original publication:** phase-c-capability-security **Original document date:** 31 July 2026 **Document status:** Historical architecture reference; current implementation status: see docs/STATUS.md

**Security milestone:** Phase C evaluated locally; documentation/tag is the freeze step 

**Every consequential action crossing an Arcana-governed effect boundary leaves durable proof.** 

Page **1** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

### **Document Control** 

|**Field**|**Value**|
|---|---|
|Purpose|Canonical internal reference for Arcana’s product identity, architecture, implementation status,<br>final objective, and future roadmap.|
|Audience|Founder, engineers, security reviewers, product/design collaborators, future enterprise buyers,<br>and integration partners.|
|Source basis|Repository package manifest, README, architecture documents, Command Spine specification,<br>database schema, project conversation decisions, and owner-reported Phase A/B/C evaluation<br>results.|
|Status labels|IMPLEMENTED = code exists; OPERATIONALLY VALIDATED = exercised through defined<br>tests; PARTIAL = incomplete integration; PLANNED = approved direction; ASPIRATIONAL =<br>north-star concept.|
|Interpretation rule|Repository code and frozen milestone reports override this synthesis when conflicts appear.<br>Planned elements are not represented as shipped functionality.|
|Scope boundary|Local runtime and product architecture. Distributed hostile-node security, universal prompt-<br>injection prevention, and hostile-host containment remain nonclaims.|



###### **Accuracy note** 

This specification deliberately distinguishes repository-verified facts, project-owner-reported results, and future architecture. “All details” means the broadest coherent specification available from the current repository and project record; it is not a substitute for a generated filesystem manifest or source-level API reference. 

### **Contents** 

**1.** <u>Executive Summary</u> 

**2.** <u>Project Identity and Final Objective</u> 

**3.** <u>Product Doctrine and Differentiation</u> 

**4.** <u>Current Status and Validated Milestones</u> 

**5.** <u>Repository and Package Structure</u> 

**6.** <u>End-to-End Runtime Architecture</u> 

**7.** <u>CLI: Protocol and Automation Surface</u> 

**8.** <u>TUI: Governed Operator Console</u> 

**9.** <u>Engine and Execution Pipeline</u> 

**10.** <u>Governed Autonomy Security Kernel</u> 

**11.** <u>Epistemic Assurance and RunProof</u> 

**12.** <u>Capability, Intent, Provenance, Approval, and Delegation</u> 

**13.** <u>Tools, Workspaces, MCP, Plugins, and Skills</u> 

**14.** <u>Memory, Context, Tokens, Models, and Routing</u> 

**15.** <u>Gateway, Cron, Daemon, Server, SDK, and Web</u> 

**16.** <u>Data Architecture and Event Model</u> 

**17.** <u>Quantitative Model and Calculations</u> 

**18.** <u>Testing, Evaluation, and Release Gates</u> 

**19.** <u>Deployment Topologies</u> 

**20.** <u>Roadmap: Core Phases and Product Tracks</u> 

**21.** <u>Competitive Positioning</u> 

**22.** <u>Business and Enterprise Objective</u> 

**23.** <u>Risks, Nonclaims, and Governance</u> **24.** <u>Recommended Execution Plan</u> 

**A.** <u>Appendix: CLI Command Catalog</u> **B.** <u>Appendix: Package Inventory</u> 

**C.** <u>Appendix: Security and Assurance Formula Sheet</u> **D.** <u>Appendix: Glossary</u> **E.** <u>Appendix: Source Register</u> 

Page **2** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

### **1. Executive Summary** 

Arcana is evolving from an OpenCode-derived AI coding CLI into a governed autonomy runtime: a local-first execution security kernel, operator interface, proof system, and future distributed control layer for autonomous agents. Its purpose is not merely to help a model call tools. Its purpose is to ensure that every consequential effect is exactly authorized, bound to current user intent, constrained by provenance and workspace policy, independently evidenced, and auditable after execution. 

**¬Authorized(q)  ⇒  ¬Executed(q)** 

_Primary local enforcement invariant validated by the Phase C adversarial evaluation._ 

**Effect(q) ⇒ ExactCapability(q) ∧ CurrentIntent(q) ∧ ProvenancePolicySatisfied(q) ∧ WorkspaceConstraintsSatisfied(q) ∧ [ApprovalRequired(q) ⇒ ExactScopedApproval(q)]** 

_Canonical authorization condition. Approval is conditional, not universal._ 

###### **Final objective** 

Make any agent, coding harness, CLI, workflow engine, or autonomous process useful without requiring it to be trusted. Arcana should govern what it may do, constrain delegated authority, preserve evidence of what happened, and expose those controls through a comprehensible TUI/CLI. 

Arcana’s intended product stack has five mutually reinforcing layers: 

- Arcana Engine — the local execution kernel and session runtime. 

- Arcana Security Kernel — canonical requests, capability PDP/PEP, intent binding, provenance policy, scoped approvals, delegation attenuation, revocation, and effect-boundary enforcement. 

- RunProof — append-only evidence, integrity verification, replay, reproducibility, authorization profiles, delegation profiles, approval profiles, and information-flow evidence. 

- Governed Operator Console — the Command Spine TUI that makes intent, authority, action, evidence, and completion visible and controllable. 

- Arcana Node / Control Plane / Protocol — the future distributed layer for signed short-lived grants, remote revocation, framework adapters, fleet policy, and cross-node proof composition. 

|**Area**|**Status**|**Meaning**|
|---|---|---|
|Phase A: Epistemic foundation|COMPLETE|Claims, evidence, completion contracts, proof obligations,<br>append-only event foundation.|
|Phase B: Verification and replay|COMPLETE|RunProof assurance axes, audit replay, deterministic<br>replay, reproducibility, revalidation.|
|Phase C: Local governed autonomy|EVALUATION PASS|95 adversarial fixtures; 0 unexpected allows; 0 protected<br>executor calls on denied paths; 722/722 combined security<br>+ epistemic tests.|
|TUI product maturity|PARTIAL|Command Spine is the default shell; governance visibility<br>and interactive controls need a dedicated TUI 1.0 track.|
|Phase D: Distributed authority|ACTIVE DEVELOPMENT — progress through D-8A; see docs/STATUS.md|Node identity, signed grants, remote revocation, policy<br>distribution, proof composition.|
|Protocol/SDK/Enterprise|PLANNED|Framework adapters, cross-runtime conformance,<br>organization control plane, federation.|



### **2. Project Identity and Final Objective** 

#### **2.1 Category definition** 

Arcana should be defined as an execution-security kernel and proof layer for autonomous software agents. The CLI and TUI are important product surfaces, but the category-defining asset is the authority boundary between untrusted intelligence and real effects. 

Page **3** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

```
Untrusted intelligence
    model · harness · repository · MCP description · plugin · remote content
                    │
                    ▼
             ARCANA KERNEL
 identity · canonical request · capability · intent · provenance · approval
                    │
                    ▼
              EFFECT BOUNDARY
 filesystem · process · network · secrets · git · deploy · MCP · delegation
                    │
                    ▼
                 RUNPROOF
```

#### **2.2 North-star statement** 

###### **North star** 

Arcana is the governed operating layer for agentic work: the model proposes, the engine decides, the effect boundary enforces, and RunProof records enough evidence for independent inspection. 

#### **2.3 Final product goal** 

The final Arcana product should allow a user or organization to run local or remote agents—including Arcana-native agents, Codex, Claude Code, Gemini CLI, Mastra, LangGraph, AI SDK harnesses, and internal workflows—under exact, revocable, least-privilege authority. The same product should provide a live operator console and portable evidence demonstrating which actions were requested, authorized, denied, executed, verified, reproduced, delegated, approved, or revoked. 

#### **2.4 Success conditions** 

- No consequential action can execute without an exact current authorization path. 

- A model cannot enlarge its own authority through prompt content, tool descriptions, subagents, or transformed data. 

- A human approval authorizes one exact bounded request—not a callback, vague category, or unlimited session. 

- A child agent receives zero ambient authority and can only receive explicit attenuated grants. 

- Revocation is immediate, durable, and enforced again immediately before execution. 

- Completion is based on evidence and obligations, not the model’s confidence or prose. 

- Every denial and execution is projected into an auditable, integrity-verifiable RunProof. 

- The TUI makes governance understandable without becoming a noisy security dashboard. 

- The CLI remains scriptable and stable enough to operate as a protocol surface. 

- Future distributed nodes preserve the local kernel’s invariants instead of replacing them with cloud trust. 

#### **2.5 Brand and product language** 

|**Element**|**Definition**|
|---|---|
|Primary doctrine|The model may propose. The engine decides. The proof records.|
|Core promise|Every consequential action crossing an Arcana-governed effect boundary leaves durable proof.|
|Strategic category|Governed autonomy / Agentic Zero Trust + Epistemic Assurance.|
|Logo geometry|A thick inverted-U arch with rounded top and ends; a cobalt-blue four-point sigil centered inside the<br>opening, with long vertical points, shorter horizontal points, concave edges, a pinched center, and<br>no contact with the arch.|
|Visual constraints|Premium, exact, restrained; avoid generic cyberpunk, neon-dashboard clutter, simplistic star<br>substitutions, and AI-slop aesthetics.|
|TUI identity|Command Spine: a living execution chronicle, not a conventional chat transcript or permanent<br>multi-panel dashboard.|



Page **4** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

### **3. Product Doctrine and Differentiation** 

#### **3.1 Architectural doctrine** 

- The TUI is never the source of truth; it observes engine state. 

- The CLI is a protocol and automation surface, not the authority. 

- Tool calls become canonical authorization requests before execution. 

- The PDP is pure and deterministic over an immutable policy snapshot. 

- The PEP revalidates immediately before the effect and owns enforcement. 

- File mutation should converge on a diff/mutation authority in governed modes. 

- Verifier state and completion contracts are engine objects, not persuasive text. 

- Compatibility layers are explicit, bounded, removable, and lower-assurance. 

- Security evidence failures degrade assurance rather than silently producing reassuring zeros. 

- Local operation must remain useful even when a cloud control plane is absent. 

#### **3.2 Trusted computing base** 

|**Trusted component**|**Responsibility**|
|---|---|
|Canonical request builder|Normalizes principal, session, action, resource, executable, arguments, cwd, destination,<br>sensitivity, provenance, intent, and policy version.|
|PDP|Pure deterministic allow/deny/approval decision over an immutable snapshot.|
|PEP|Fresh-context check, stale-decision rejection, atomic grant/approval claim, exact-once<br>execution boundary.|
|Capability verifier/store|Durable grant state, expiry, use counters, ancestry, revocation, persistence, transactional<br>delegation.|
|Intent binding provider|Binds exact request hashes to user objectives, contracts, criteria, sessions, and revisions.|
|Secret broker|Keeps secret values outside the model and only releases them to authorized effect<br>adapters.|
|Event-chain writer|Append-only sequencing, integrity hashes, lifecycle evidence, trace health.|
|RunProof verifier|Validates integrity, verification, reproducibility, and security profiles.|
|Sandbox/effect adapters|Apply OS/process/network/filesystem constraints at the real executor.|



#### **3.3 Explicitly untrusted inputs** 

- LLM outputs and tool arguments 

- Repository files and README instructions 

- Remote web content 

- MCP tool descriptions and results 

- Plugin-provided text and metadata 

- Subagent output 

- External CLI behavior 

- Model-generated justifications 

- Untrusted workspace configuration 

#### **3.4 Strategic differentiation** 

Generic agent frameworks increasingly provide tools, memory, workflows, approvals, subagents, sandboxes, and observability. Arcana should not compete by duplicating those features. Its defensible center is cross-runtime authority and independent proof. Other frameworks should become Arcana workloads or adapters. 

Page **5** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

```
Mastra / LangGraph / AI SDK / Codex / Claude / Gemini / internal agents
                              │
                              ▼
                        ARCANA NODE
         exact capability · intent · provenance · approval · revocation
                              │
                              ▼
                     local effect boundary
                              │
                              ▼
                         RUNPROOF
```

#### **3.5 Design principles** 

- Do not preserve backward compatibility. 

- Choose the simplest implementation that fully meets the current requirements. 

- Prefer established, well-maintained libraries over custom implementations. 

### **4. Current Status and Validated Milestones** 

#### **4.1 Phase A — Epistemic foundation** 

- Typed claims, evidence, completion contracts, proof obligations, and a hard completion gate. 

- Append-only, hash-linked event storage with sequence integrity and deterministic replay foundations. 

- Run lifecycle evidence for started, completed, and crashed states. 

- CLI proof inspect, verify, export, audit replay, and deterministic replay surfaces. 

#### **4.2 Phase B — Verification, replay, and assurance** 

RunProof exposes independent assurance axes rather than a single misleading score: 

|**Axis**|**Values**|**Meaning**|
|---|---|---|
|Trace|NONE / RECORDED|Whether relevant execution evidence exists.|
|Integrity|UNVERIFIED / VALID / INVALID|Whether the event chain and proof material verify.|
|Verification|UNVERIFIED / VERIFIED|Whether completion evidence satisfied verifier requirements.|
|Reproducibility|NONE / PARTIAL / FULL|Whether the result can be reconstructed or rerun from<br>recorded data.|



Compatibility badges P0–P3 are convenience labels, but P2 reproducibility and P3 verification remain independent properties. 

#### **4.3 Phase C — Local governed autonomy** 

Phase C introduced capability-based authorization, production PEP enforcement, authorization evidence, provenance and sensitivity labels, intent-action binding, exact scoped approvals, delegated least privilege, workspace/MCP trust, consequential-field lineage, replay resistance, and adversarial evaluation. 

|**Metric**|**Reported result**|
|---|---|
|Adversarial fixtures|95|
|Unexpected allows|0|
|Protected executor calls on denied paths|0|
|Benign workflows|14 / 14 successful|
|Capability/security tests|510 / 510|
|Epistemic tests|212 / 212|
|Combined tests|722 / 722|
|Expect assertions|1,794|



Page **6** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

###### **Defensible milestone claim** 

Arcana operationally validates local governed autonomy across 95 adversarial fixtures. Consequential actions require exact, durable authority bound to current intent, provenance policy, workspace constraints, and exact scoped approval when required. Across the evaluated production boundaries, denied actions caused zero protected executor calls. 

#### **4.4 Phase C nonclaims** 

- The evaluation does not prove universal security or mathematical correctness. 

- It does not govern processes launched outside Arcana’s effect boundary. 

- It does not prove hostile-host containment. 

- It does not yet establish distributed signed-grant security or hostile-node resistance. 

- It does not prove universal prompt-injection prevention; it proves bounded runtime-authority containment across evaluated paths. 

### **5. Repository and Package Structure** 

#### **5.1 Monorepo foundation** 

|**Property**|**Current branch value**|
|---|---|
|Repository|Lento47/arcana (private)|
|Historical primary working branch|phase-c-capability-security (current implementation status: see docs/STATUS.md)|
|Package name|arcana (private monorepo root); npm distribution arcana-ai; executable arcana|
|Manifest version on inspected branch|0.3.67|
|Runtime/package manager|Bun 1.3.14|
|Language|TypeScript 7.0.2, ECMAScript modules|
|Task orchestration|Turborepo 2.9.18|
|License direction|Repository describes MIT + Commercial dual licensing; LICENSE must remain the<br>legal authority and wording needs consistency review.|



#### **5.2 Logical directory map** 

|`arcana/`<br>||
|---|---|
|`├─ packages/`<br>`│  ├─ arcana/`<br>`│  ├─ engine/`<br>`│  ├─ core/`<br>`│  ├─ tui/`<br>`│  ├─ ui/`<br>`│  ├─ enterprise/`<br>`│  ├─ server/`<br>|`CLI distribution and user commands`<br>`session engine, TUI host, agents, tools, PEP integration`<br>`Effect runtime, persistence, capabilities, events, projects`<br>`OpenTUI + SolidJS presentation components`<br>`web UI component library`<br>`web dashboard / organization surface`<br>`Hono + Effect HTTP API`<br>|
|`│  ├─ sdk/js/`<br>`│  ├─ llm/`<br>`│  ├─ memory/`<br>`│  ├─ cron/`<br>`│  ├─ gateway/`<br>`│  ├─ skills/`<br>`│  ├─ plugin/`<br>`│  ├─ plugin-legacy/`<br>`│  ├─ ml/`<br>`│  ├─ effect-drizzle-sqlite/`<br>`│  ├─ effect-sqlite-node/`<br>`│  ├─ http-recorder/`<br>`│  ├─ function/`<br>`│  └─ script/`<br>`├─ docs/`<br>`├─ skills/`<br>`├─ script/`<br>`├─ package.json`<br>`└─ turbo.json`|`typed client and server spawner`<br>`schema-first model and provider layer`<br>`SQLite + FTS5 memory`<br>`scheduled autonomous jobs`<br>`Telegram / Discord / Slack / WhatsApp adapters`<br>`skill discovery and catalog`<br>`current plugin extension surface`<br>`compatibility boundary`<br>`signal and quality evaluation engine`<br>`Effect ↔ Drizzle bridge`<br>`SQLite platform integration`<br>`VCR-style deterministic HTTP recording`<br>`Cloudflare Worker / sync infrastructure`<br>`build, release, migration, smoke tooling`<br>`product, architecture, security, operations, ADRs`<br>`repository skill library`<br>`root automation and smoke scripts`<br>`workspace catalog and root commands`<br>`task graph`|



Page **7** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

###### **Inventory note** 

The repository describes 20+ packages. The list above is the documented package inventory, not a generated directory-tree attestation. A future release artifact should include a machine-generated package manifest with owners, visibility, dependencies, APIs, and test commands. 

#### **5.3 Layered architecture** 

|**Layer**|**Packages**|**Primary responsibility**|
|---|---|---|
|Entry|arcana, engine, enterprise|CLI dispatch, TUI process, web application.|
|Presentation|tui, ui|Terminal rendering, web components, themes, localization.|
|Service|server, gateway, plugin, plugin-legacy, sdk|HTTP API, messaging adapters, extension hooks, client<br>access.|
|Core runtime|core, memory, cron, skills, ml|Sessions, capabilities, events, memory, scheduling, quality<br>signals.|
|Foundation|llm, effect-drizzle-sqlite, effect-sqlite-node|Provider protocols and typed persistence bridges.|
|Infrastructure|http-recorder, function, script|Testing cassettes, cloud functions, builds and releases.|



#### **5.4 Principal technology choices** 

|**Technology**|**Role**|
|---|---|
|Bun|Runtime, package manager, tests, compilation to standalone binary.|
|Effect|Typed dependency injection, concurrency, failure channels, resource safety.|
|Drizzle + SQLite|Durable local state, migrations, transactional capability and event data.|
|SolidJS + OpenTUI|Reactive terminal operator interface.|
|Hono|Local/remote HTTP APIs and service integration.|
|AI SDK 6|Unified model/provider interface where appropriate.|
|Zod|Runtime schemas and canonical validation.|
|Turborepo|Cross-package task graph for build, typecheck, and test.|
|FTS5|Local memory and full-text retrieval.|



Page **8** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

### **6. End-to-End Runtime Architecture** 

#### **6.1 Canonical local flow** 

```
User intent
  ↓
CLI / TUI input admission
  ↓
Session + active contract snapshot
  ↓
Prompt/context assembly + model call
  ↓
Model proposes tool or delegated action
  ↓
Canonical AuthorizationRequest H(q)
  ↓
SessionPolicyProvider builds immutable snapshot
  ↓
Pure PDP: ALLOW | DENY | REQUIRE_APPROVAL
  ↓
PEP loads fresh context and rejects stale decisions
  ↓
Atomic grant / approval / use claim
  ↓
Real effect adapter executes exactly once
  ↓
Authorization, effect, evidence, verification events
  ↓
RunProof projection + TUI/CLI projection
```

#### **6.2 Runtime authorities** 

|**Authority**|**Owner**|**Decision**|
|---|---|---|
|Intent|Session/contract subsystem|What the user authorized as an objective.|
|Plan|Planner / agent runtime|How work is decomposed; not itself authority.|
|Risk|Risk classifier + policy inputs|Required controls based on action and context.|
|Policy|PDP|Allow, deny, or require exact approval.|
|Enforcement|PEP + effect adapter|Whether the effect can physically execute.|
|Mutation|Current write tools; future diff gate<br>authority|Propose/apply/rollback file changes.|
|Verification|Completion contracts and verifier|Whether evidence supports completion.|
|Proof|Event store + RunProof projector|Canonical evidence and assurance status.|
|Operator control|TUI/CLI|Inspect, approve, deny, narrow, revoke, replay; never invent truth.|



#### **6.3 Local daemon model** 

Arcana supports an architecture in which the TUI connects to a local daemon, auto-detects or auto-spawns it, and can fall back to an in-process worker. The daemon owns durable session/runtime services while the TUI remains a projection and input surface. This separation is important for crash isolation, background jobs, gateway/cron operation, and future Arcana Node evolution. 

#### **6.4 External harness governance** 

The long-term execution pattern is not to reimplement every agent. Arcana should wrap or integrate existing runtimes at one of three levels: 

|**Integration level**|**Mechanism**|**Assurance**|
|---|---|---|
|Native adapter|Framework emits canonical requests directly to Arcana PEP.|Highest observability and field<br>lineage.|



Page **9** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

|**Integration level**|**Mechanism**|**Assurance**|
|---|---|---|
|Sandboxed black-box CLI|Arcana launches process, controls<br>filesystem/network/secrets/process effects.|Strong effect containment;<br>weaker semantic visibility.|
|PTY compatibility|Arcana supervises a terminal process and gates selected<br>external effects.|Compatibility-first; explicitly<br>lower assurance.|



### **7. CLI: Protocol and Automation Surface** 

#### **7.1 CLI role** 

The CLI is Arcana’s stable protocol surface for humans, scripts, CI systems, gateways, schedulers, and future control planes. It must remain composable, deterministic, machine-readable where requested, and separate from TUI presentation concerns. 

#### **7.2 Current principal commands** 

|**Command**|**Purpose**|
|---|---|
|arcana|Open the interactive TUI.|
|arcana run "query"|Run or attach to an agent session.|
|arcana doctor|Check local installation, provider, database, runtime, and environment health.|
|arcana console login|Pair the CLI with the Arcana console using device flow.|
|arcana trust|Trust the current workspace for project plugins, tools, or local MCP.|
|arcana models|List detected/available models.|
|arcana providers|Inspect or manage provider credentials.|
|arcana session list|List session records.|
|arcana history list/show/resume|Browse and resume prior sessions.|
|arcana stats|Display usage and cost summaries.|
|arcana serve|Start a local headless HTTP server; loopback by default.|
|arcana gateway|Run configured chat platform adapters.|
|arcana cron ...|Create, list, pause, resume, remove, or run scheduled jobs.|
|arcana memory ...|Search sessions, facts, and memory statistics.|
|arcana skills ...|List, search, install, or invoke skills.|
|arcana daemon status/stop|Inspect or stop the local daemon.|



#### **7.3 Governance and proof commands** 

```
arcana epistemic proof inspect <session-id>
arcana epistemic proof verify <session-id>
arcana epistemic proof export <session-id> --format json
arcana epistemic replay audit <session-id>
arcana epistemic replay deterministic <session-id>
arcana epistemic revalidate run <session-id>
```

These commands expose trace state, integrity, verification, reproducibility, authorization profiles, delegation profiles, approval profiles, information-flow evidence, and replay behavior. Command names should eventually be simplified behind stable aliases without removing machine-readable output. 

Page **10** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

#### **7.4 Future launch protocol** 

```
arcana launch codex
arcana launch claude
arcana launch gemini
arcana launch mastra
arcana launch --policy ./arcana.policy.ts -- codex ...
```

The launch command should create a session identity, active contract, policy snapshot, grants, sandbox context, evidence stream, and RunProof before starting the external runtime. The same command should work locally and later route through an Arcana Node. 

#### **7.5 CLI output requirements** 

- Human-readable default and explicit JSON/NDJSON modes. 

- Stable exit codes for denied, approval-required, verification-failed, replay-invalid, and infrastructure-error outcomes. 

- No security truth inferred from colored text; structured fields remain canonical. 

- Secret redaction before output or model context. 

- Session, request, grant, approval, event, and proof identifiers exposed for automation. 

- Commands must remain usable without the web console or cloud control plane. 

### **8. TUI: Governed Operator Console** 

#### **8.1 Current Command Spine shell** 

The Command Spine is the current default TUI shell. It replaces the conventional chat-feed center of gravity with an indexed execution chronicle. The TUI observes session, kernel, permission, tool, and proof state; it must never invent completion, permission, or RunProof truth. 

|`┌────`<br>`│ A R`<br>`├────`|`─────────────`<br>`C A N A`<br>`─────────────`|`─────────────────────────────────────┐`<br>`project · model · mode │`<br>`─────────────────────────────────────┤`|
|---|---|---|
|`│ 01`<br>|`ask`<br>◆<br>|`fix authorization replay            │`<br>|
|`│ 02`<br>|`├ contract`<br>|`revision 8 · 4 criteria             │`<br>|
|`│ 03`<br>|`├ authority`<br>|`write engine/** · active            │`<br>|
|`│ 04`<br>|`├ inspect`<br>|`event-store.ts · L1–214             │`<br>|
|`│ 05`<br>|`├ patch`<br>|`+18 −7 · 1 file                     │`<br>|
|`│ 06`<br>|`├ deny`<br>|`network.write · unrelated intent    │`<br>|
|`│ 07`<br>|`├ delegate`<br>|`test agent · read + exact test      │`<br>|
|`│ 08`<br>|`├ approval`<br>|`git.push · exact · single use       │`<br>|
|`│ 09`<br>|`├ run`<br> <br>|`722 passed · 0 failed               │`<br>|
|`│ 10`<br>`├────`|<br>`proof`<br>◎<br>`─────────────`|`valid · unauthorized 0              │`<br>`─────────────────────────────────────┤`|
|`│ per`<br>`├────`|`mission / que`<br>`─────────────`|`stion gate                           │`<br>`─────────────────────────────────────┤`|
|`│`<br>`✶`<br>`│`<br>`│`|`┌────────────`<br>`│  prompt`<br>`❯`<br>`└────────────`|`──────────────────────────────────┐  │`<br>`model  │  │`<br>`──────────────────────────────────┘  │`|
|<br>`│`<br>`└────`|<br>`elapsed · tok`<br>`─────────────`|<br>`ens · cost · key hints               │`<br>`─────────────────────────────────────┘`|



#### **8.2 Layout zones** 

|**Zone**|**Primary implementation**|**Responsibility**|
|---|---|---|
|Header|spine-header.tsx|Wordmark, project/session identity, model, mode.|
|Timeline|spine-entry.tsx / spine-rail.tsx / mapper|Ask, plan, inspect, patch, run, deny, approve, delegate,<br>verify, complete.|
|Gates|Shared permission/question dialogs|Collect exact user decisions; not an independent<br>authority.|
|Composer|spine-prompt.tsx + shared Prompt|Input, shell mode, slash commands, model selection.|
|Metrics|metrics-bar.tsx|Elapsed time, token/cost summaries, key hints.|



Page **11** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

#### **8.3 Responsive behavior** 

|**Layout**|**Width**|**Behavior**|
|---|---|---|
|minimal|< 80 columns|Minimal chrome, file-only diffs, compressed receipts.|
|narrow|80–99|Reduced hints and tightly collapsed diffs.|
|compact|100–119|Unified diff excerpts and moderate metadata.|
|wide|≥ 120|Expanded receipts, optional proof tape, richer diff presentation.|



A ±5-column hysteresis band prevents layout thrash during resize. The activity hint poll interval is approximately 220 ms, or 4.55 polls per second. 

#### **8.4 TUI 1.0 product track** 

|**Milestone**|**Outcome**|
|---|---|
|TUI-1 Governance visibility|Real capability, intent, provenance, policy, effect, verifier, and RunProof events mapped<br>into the spine.|
|TUI-2 Interactive governance|Approve once, deny, narrow scope, inspect exact request hash, revoke authority, show<br>expiry/use state.|
|TUI-3 Delegation console|Clickable subagent sessions, authority tree, child grant summaries, ancestor revocation,<br>process isolation.|
|TUI-4 Proof/replay/audit|In-TUI proof inspection, audit replay, deterministic replay, evidence gaps, trace-health<br>diagnostics.|
|TUI-5 Production polish|Scrolling, mouse, copy/select, right-edge correctness, virtualization, accessibility, crash<br>isolation, light/dark stability.|



#### **8.5 Non-negotiable TUI rules** 

- No second permission truth in UI state. 

- No permanent dashboard clutter; detailed governance appears contextually or on inspection. 

- Approval cards show the exact action, resource, arguments, destination, principal, expiry, and single-use scope. 

- Denied actions remain visible as receipts with precise reason codes. 

- Subagent sessions must be isolated enough that child rendering or hydration failures do not crash the parent TUI. 

- Timeline rendering must be virtualized for large sessions and avoid O(N²) remapping. 

- No truncated words at the far right, stale branding, duplicated tool bodies, or misaligned overlays. 

#### **8.6 TUI quality gate** 

The existing manual smoke-test plan contains 11 phases and more than 50 checkpoints: startup, approval trigger, inspector, approval lifecycle, denial lifecycle, prompt conflicts, session isolation, nine resize breakpoints, dark/light themes, restart recovery, and mouse/keyboard continuity. Defects are classified as release blocker, polish blocker, or non-blocking. 

### **9. Engine and Execution Pipeline** 

#### **9.1 Engine responsibility** 

The engine is the product’s operational center. It owns sessions, agents, prompts, model calls, tool registration, permissions, policy-provider integration, PEP execution, event projection, verifier flow, token/cost accounting, compaction, and TUI/server synchronization. 

Page **12** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

#### **9.2 Session lifecycle** 

```
create / resume session
  → acquire session lock
  → load project/workspace/account/provider state
  → load active goal/contract and context epoch
  → admit user input with sequence number
  → assemble system prompt + memory + skills + policy context
  → stream model response
  → convert tool request to canonical effect request
  → authorize / approve / deny / execute
  → persist messages, parts, events, costs, diffs, receipts
  → compact context when thresholds require
  → verify obligations and update RunProof
  → archive / resume / replay
```

#### **9.3 Agent modes and contracts** 

Built-in agents such as build, general, tester/QA, explore, or subagents should be treated as runtime principals with explicit policy profiles—not just prompt presets. Session goals and contracts establish objective scope and completion criteria. Mutating agents can be gated until a goal exists and frozen after a goal is marked complete until a new contract is created. 

#### **9.4 Tool pipeline** 

|**Stage**|**Function**|
|---|---|
|Definition|Tool schema, description, argument validation, output schema.|
|Admission|Resolve principal, session, workspace, contract, model, and provenance context.|
|Canonicalization|Build exact action/resource/executable/argument/cwd/destination fields and request hash.|
|Policy snapshot|Load grants, intent bindings, approved scopes, trust state, ancestry, policy version.|
|PDP|Pure deterministic decision.|
|PEP|Fresh revalidation, atomic use/approval claim, stale decision rejection.|
|Execution|Call protected filesystem/process/network/MCP/secret/git adapter.|
|Post-processing|Redaction, truncation, receipts, artifact extraction, output labels.|
|Evidence|Emit lifecycle and authorization events; update proof projection.|



#### **9.5 Completion authority** 

The agent that performs work cannot self-certify completion. A session is complete only when required criteria are resolved through evidence, verifier results, explicit recorded limitations, or a human override. This prevents “done” from being a rhetorical model output. 

### **10. Governed Autonomy Security Kernel** 

#### **10.1 Canonical authorization request** 

```
AuthorizationRequest {
  requestId, requestHash, nonce, policyVersion,
  principalId, sessionId, workspaceId,
  contractId, contractRevision, criterionIds[],
  action, tool, resource,
  executable, arguments[], cwd, destination,
  provenanceLabels[], sensitivity, fieldLineage[],
  requestedAt, riskClass
}
```

Page **13** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

The request hash must cover every consequential field. Any change to principal, session, resource, arguments, working directory, destination, secret, contract revision, policy version, or nonce yields a different authorization identity. 

#### **10.2 PDP and PEP split** 

|**Component**|**Invariant**|
|---|---|
|Policy Decision Point|Pure function of request + immutable serializable snapshot. No store calls or state<br>mutation.|
|Policy Enforcement Point|Obtains fresh context, detects stale policy, atomically claims grant/approval/use, calls<br>effect exactly once.|
|Policy provider|Fails closed when required stores are absent or unavailable in REQUIRED mode.|
|Compatibility mode|LEGACY_COMPAT is explicit migration behavior and must degrade assurance.|



#### **10.3 Primary risk classes** 

|**Class**|**Typical examples**|**Intent requirement**|
|---|---|---|
|LOW|Read-only inspection|Optional binding; still subject to<br>workspace/provenance policy.|
|MODERATE|Ordinary writes or bounded execution|Direct user request or explicit approval<br>depending on policy.|
|HIGH|Process execution, deletion, sensitive mutation|Active contract criterion and exact<br>capability.|
|CRITICAL|git push, deploy, policy modification, external consequential send|Exact explicit approval plus all other<br>controls.|



#### **10.4 Security trace health** 

Security profiles must expose whether evidence is COMPLETE, DEGRADED, or UNAVAILABLE. Zero violation counts are meaningful only when the corresponding trace is complete. 

**ActionAssured ⇔ TraceHealth = COMPLETE ∧ unauthorizedExecutions = 0 ∧ orphanExecutions = 0** 

### **11. Epistemic Assurance and RunProof** 

#### **11.1 Purpose** 

RunProof is Arcana’s canonical portable evidence layer. It records what was requested, which policies and capabilities were evaluated, which actions executed, which evidence was produced, how completion was verified, whether the event chain is intact, and whether the result is reproducible. 

#### **11.2 Hash-linked event chain** 

**eventHashᵢ = H(canonical(eventᵢ)  eventHashᵢ₁)∥ ₋** 

_Every event binds to the prior event. Sequence uniqueness and transactional insertion prevent ambiguous ordering._ 

**runRoot = H(runMetadata  terminalEventHash  proofSchemaVersion)∥ ∥** 

_The RunProof root commits to the run’s final evidence state._ 

#### **11.3 Security profiles** 

|**Profile**|**Representative fields**|
|---|---|
|AuthorizationProfile|requests, allowed, denied, approvalsRequired, staleDecisions, executed, failures,<br>unauthorizedExecutions, capabilityViolations, trace health.|



Page **14** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

|**Profile**|**Representative fields**|
|---|---|
|InformationFlowProfile|labeled inputs, derived values, secret use, denied secret flows, declassification requests,<br>tampering attempts, unlabeled consequential requests.|
|DelegationProfile|requested, created, denied, maximum depth, invalidated descendants, authority amplifications,<br>trace health.|
|ApprovalProfile|requested, approved, rejected, expired, claimed, consumed, replay attempts, hash<br>mismatches, recovery required, trace health.|



#### **11.4 Replay modes** 

|**Mode**|**Goal**|
|---|---|
|Audit replay|Reconstruct historical events and decisions without re-executing effects.|
|Deterministic replay|Rebuild structured commands, exact output digests, workspace mutations, and policy decisions<br>under controlled fixtures.|
|Live revalidation|Evaluate whether historical evidence still satisfies current policy without rewriting historical truth.|



#### **11.5 Epistemic completion contract** 

```
User objective
  → acceptance criteria
  → proof obligations
  → evidence sources
  → verifier result
  → completion state
```

```
No evidence / unmet criterion / invalid integrity
  → not verified complete
```

### **12. Capability, Intent, Provenance, Approval, and Delegation** 

#### **12.1 Exact durable capabilities** 

A capability grant is the fundamental authority primitive. It is durable, scoped to a principal/session/workspace/contract, constrained by actions and resources, expiring, use-limited, revocable, and evaluated at the logical PEP enforcement boundary; physical containment is tracked separately (docs/security/EFFECT-COVERAGE.md). 

#### **12.2 Capability attenuation** 

**Authority(child) ⪯ Authority(parent) Actions(child) ⊆ Actions(parent) Resources(child) ⊆ Resources(parent) Expiry(child) ≤ Expiry(parent) Uses(child) ≤ Uses(parent)** 

##### **DelegationDepth(child) = DelegationDepth(parent)+1 ≤ MaxDepth(parent)** 

A child receives zero ambient authority. Parent grant identifiers are not directly usable by the child. Revoked, expired, exhausted, missing, or cyclic ancestors invalidate the descendant at execution time. 

#### **12.3 Intent-action binding** 

**Execute(q) ⇒∃ b: Binds(b,q) ∧ b.requestHash = H(q) ∧ b.sessionId = q.sessionId ∧ b.contractRevision = activeRevision** 

Page **15** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

Intent bindings answer why a request is authorized. High-impact actions require an active contract criterion; critical actions require exact explicit approval. Model-generated justification is not sufficient authority. 

#### **12.4 Provenance and sensitivity** 

|**Provenance label**|**Meaning**|
|---|---|
|SYSTEM_POLICY|Trusted system policy content.|
|USER_INSTRUCTION|Direct user instruction.|
|ACTIVE_CONTRACT|Current objective/criterion state.|
|TRUSTED_LOCAL_SOURCE|Approved local source.|
|UNTRUSTED_LOCAL_SOURCE|Repository/local source without trust.|
|REMOTE_CONTENT|Web/network-originated content.|
|TOOL_OUTPUT|Tool-derived content.|
|MODEL_OUTPUT|Model-generated content.|
|SUBAGENT_OUTPUT|Delegated agent result.|
|MCP_DESCRIPTION|Untrusted MCP schema/description content.|



|**Sensitivity**|**Ordering**|
|---|---|
|PUBLIC|Lowest|
|INTERNAL|Above public|
|PRIVATE|Above internal|
|SECRET|Highest; may not be exposed to model or external destination without explicit brokered<br>policy.|



#### **12.5 Consequential-field lineage** 

Tool-level provenance classification is insufficient because content can be laundered across model transformations. Arcana tracks the origin of consequential fields such as executable, arguments, path, host, message body, secret identifier, MCP arguments, and delegated task text. UNKNOWN lineage on HIGH or CRITICAL actions fails closed; encoded SECRET data remains SECRET. 

#### **12.6 Scoped approvals** 

- `REQUIRE_APPROVAL → persist PENDING exact request → user approves requestHash → APPROVED → PEP atomically claims APPROVED → CLAIMED → fresh revalidation → exact effect executes once → execution receipt → CLAIMED → CONSUMED` 

Changing any covered field requires a new approval. Concurrent claims produce one winner. Crash recovery uses an idempotency key derived from approval ID, session ID, and request hash; uncertain irreversible effects enter a recovery-required state rather than blindly retrying. 

Page **16** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

#### **12.7 Delegation lifecycle** 

```
Parent requests bounded child work
  → select explicit parent grants
  → validate parent/ancestor state
  → validate attenuation
  → transactionally insert PENDING child grants
  → create child session/principal
  → activate grants only after identity confirmation
  → child executes through normal PDP/PEP
  → parent/ancestor revocation invalidates child
```

### **13. Tools, Workspaces, MCP, Plugins, and Skills** 

#### **13.1 Built-in tool categories** 

|**Category**|**Representative tools/effects**|
|---|---|
|Inspection|read_file, search_files, glob, grep, git status/diff, web search/fetch.|
|Mutation|write_file, edit, patch, apply_patch, future diff gate.|
|Execution|terminal/shell, tests, package commands, scripts.|
|Network|web fetch, outbound message, provider calls, MCP transport.|
|Session|questions, todos, goals, compaction, history.|
|Delegation|task/subagent execution.|
|Secrets|environment/credential broker operations.|
|SCM/release|git commit/push, publish, deploy adapters.|



#### **13.2 Workspace trust adapter** 

- Workspace approval and stable identity. 

- Dirty-state policy and current revision/digest. 

- Symlink, mount, traversal, and case-normalization checks. 

- Project plugins, MCP servers, executable configuration, and hooks disabled until trusted. 

- Trust influences grant issuance; it never bypasses PDP/PEP. 

#### **13.3 MCP trust adapter** 

Every MCP call should bind server identity, transport, tool name, schema digest, canonical argument digest, declared effects, resource selectors, destination, sensitivity, and provenance. A changed schema or server identity invalidates the prior trust decision. MCP descriptions cannot create authority. 

#### **13.4 Plugin system** 

The plugin layer provides 30+ hook points across authentication, providers, chat, commands, tools, and lifecycle events. The security direction is to treat plugin metadata and behavior as untrusted unless explicitly installed, trusted, and constrained. Legacy plugin support belongs behind an explicit compatibility boundary. 

#### **13.5 Skills system** 

Skills are SKILL.md modules discovered from the repository and user directories. They provide curated instructions and procedures, not authority. Skill content must inherit local or remote provenance, cannot alter system policy, and should be selected within token budgets. The repository reports a large catalog across 28 categories; catalog totals have changed over time and should be generated automatically for releases. 

Page **17** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

### **14. Memory, Context, Tokens, Models, and Routing** 

#### **14.1 Memory architecture** 

Arcana uses a separate SQLite + FTS5 memory database for sessions, messages, facts, artifacts, feedback, skills usage, and search. Memory facts should be sourced, confidence-scored, inspectable, deduplicated, and subject to privacy and retention controls. 

#### **14.2 Context supply chain** 

```
System policy
+ active contract
+ session context epoch
+ relevant messages
+ memory facts with sources
+ selected skills
+ workspace state
+ tool results with provenance
− redacted secrets/PII
− stale or low-value context
= model context pack
```

#### **14.3 Compaction** 

Session compaction should preserve goals, unresolved obligations, decisions, capabilities, evidence references, and active context while removing redundant raw history. Hysteresis avoids repeated compaction near thresholds. Compaction must not erase security events or rewrite RunProof history. 

#### **14.4 Provider layer** 

The repository uses a schema-first LLM layer and AI SDK provider adapters. The manifest includes OpenAI, Anthropic, Google, OpenAI-compatible providers, Bedrock-compatible paths, and a models.dev-powered catalog. Provider selection can use BYOK credentials or a future Arcana proxy/control-plane route. 

#### **14.5 Model routing objective** 

Routing should optimize quality, latency, cost, privacy, context capacity, tool reliability, and assurance—not simply choose the cheapest or largest model. The final router should be policy-aware: sensitive tasks may require local or approved providers; high-impact tasks may require stronger verifier models; low-risk summarization may use cheaper models. 

#### **14.6 Research-loop direction** 

A future Arcana Loop subsystem can run parallel strategies against objective contracts, immutable evaluators, lane budgets, checkpoints, and proof certificates. The differentiator is governed optimization: cache-aware portfolio search, multi-fidelity promotion, memory layers, cost accounting, and no silent fallback when a verifier or dependency is missing. 

### **15. Gateway, Cron, Daemon, Server, SDK, and Web** 

#### **15.1 Gateway** 

Gateway adapters connect agent sessions to Telegram, Discord, Slack, and WhatsApp. Each inbound sender must map to an identity, session, workspace, and policy. Outbound messages are network effects and require capability, intent, sensitivity, destination, and approval checks as appropriate. 

#### **15.2 Cron** 

Cron provides persistent scheduled agent jobs. A schedule does not create authority. Every execution must receive a bounded principal, task contract, grants, budget, workspace, and proof stream. Missed runs, concurrency, retries, and revocations must be durable and inspectable. 

Page **18** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

#### **15.3 Daemon and local server** 

The local daemon/server supports long-lived sessions, TUI reconnection, background jobs, gateway/cron operation, and API access. Non-loopback serving requires authentication. The local Node evolution should preserve local enforcement even when the cloud is unreachable. 

#### **15.4 SDK** 

The JavaScript SDK exposes typed API access and server spawning. The future Arcana SDK should additionally expose canonical authorization requests, grant issuance/verification, intent contracts, event emission, RunProof verification, and adapters for external frameworks. 

#### **15.5 Enterprise web surface** 

The enterprise package is a SolidJS/Start dashboard for organization-level visibility. It should eventually manage identities, policies, node fleets, approvals, revocation, proof search, audit export, provider routing, cost budgets, and compliance reporting. It must not become a cloud-only authorization dependency for local effects. 

### **16. Data Architecture and Event Model** 

#### **16.1 Databases** 

|**Database**|**Technology**|**Purpose**|
|---|---|---|
|Core database|SQLite + Drizzle + Effect|Sessions, projects, messages, inputs, events,<br>accounts, workspaces, permissions/capabilities,<br>approvals, audit, migrations.|
|Memory database|SQLite + raw SQL + FTS5|Searchable sessions/messages, facts, artifacts,<br>feedback, skills memory, long-term recall.|



#### **16.2 Core entities** 

|**Entity**|**Key relationships**|
|---|---|
|Project|Owns worktrees, directories, workspaces, permissions, sessions.|
|Session|Belongs to project/workspace; may have parent; owns messages, inputs, context epoch,<br>todos, events, costs.|
|Message/Part|Ordered conversation and tool-result records.|
|AuthorizationRequest|Exact canonical effect request bound to policy snapshot.|
|CapabilityGrant|Authority scoped to principal/session/workspace/contract and ancestry.|
|IntentBinding|Exact request-to-objective relationship.|
|ScopedApproval|Single-use exact approval lifecycle.|
|Event|Append-only sequence member with typed payload and integrity linkage.|
|RunProof|Projection over events, evidence, verification, replay, and security profiles.|
|MemoryFact|Sourced long-term fact with confidence and retention metadata.|



#### **16.3 Event families** 

|**Family**|**Examples**|
|---|---|
|Session|session.started, input.admitted, model.started, session.completed, session.crashed.|
|Authorization|authorization.requested, allowed, denied, approval_required, stale, executed, execution_failed.|
|Capability|capability.created, revoked, exhausted, delegated, delegation_denied, ancestor_invalidated.|



Page **19** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

|**Family**|**Examples**|
|---|---|
|Approval|approval.requested, approved, rejected, claimed, consumed, expired, recovery_required.|
|Mutation|diff.proposed, approved, applied, rejected, rollback.created/applied.|
|Verification|criterion.resolved, verification.completed, limitation.recorded, completion.resolved.|
|Information flow|label.applied, declassification.requested, secret_flow.denied, tampering.detected.|



#### **16.4 Data consistency rules** 

- Append-only evidence events; historical outcomes are not rewritten by revalidation. 

- Unique per-aggregate sequence numbers allocated transactionally. 

- Canonical serialization before hashing. 

- Grant, approval, delegation, and execution claims use atomic state transitions. 

- PENDING child grants are never usable. 

- Store failure in REQUIRED enforcement mode becomes denial. 

- Evidence emission failure marks trace DEGRADED or UNAVAILABLE. 

### **17. Quantitative Model and Calculations** 

#### **17.1 Evaluation arithmetic** 

|**Measure**|**Calculation**|**Interpretation**|
|---|---|---|
|Observed adversarial false-allow rate|0 / 95 = 0.00%|Observed result only; not a proof of zero population<br>risk.|
|Approximate 95% upper bound with zero<br>observed failures|3 / 95 ≈ 3.16%|Rule-of-three statistical interpretation under simple<br>independent-trial assumptions.|
|Combined test pass rate|722 / 722 = 100.00%|Capability/security plus epistemic regression suites.|
|Benign workflow success rate|14 / 14 = 100.00%|Above the proposed ≥95% utility gate.|
|Assertion density|1,794 / 722 ≈ 2.48|Average expect assertions per test; not equivalent<br>to code coverage.|
|Adversarial-to-benign fixture ratio|95 / 14 ≈ 6.79:1|Evaluation emphasizes hostile paths while retaining<br>positive utility checks.|



#### **17.2 Authorization latency budget** 

|**Operation**|**Planning p95 target**|**Upper-bound serial rate**|
|---|---|---|
|Pure PDP evaluation|< 1 ms|≈1,000 decisions/s/core before overhead.|
|PEP excluding effect|< 5 ms|≈200 authorizations/s/core before overhead.|
|Policy snapshot|< 5 ms|Store/index dependent.|
|Approval claim|< 10 ms|≈100 claims/s connection, limited by SQLite<br>contention.|
|Delegation transaction|< 20 ms|≈50 delegations/s connection before contention.|



###### **Performance interpretation** 

These are engineering budgets, not measured guarantees in the final Phase C summary. Real throughput is lower because database locking, event writes, process launch, provider latency, and filesystem/network effects dominate. 

#### **17.3 TUI rendering complexity** 

**Naive render work = O(N); virtualized render work ≈ O(V), where V ≪ N** 

Page **20** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

For a 10,000-entry session with 60 visible entries, virtualization reduces the active entry-render set from 10,000 to approximately 60—about a 166.7× reduction in per-frame component work before overscan and bookkeeping. 

#### **17.4 Polling frequency** 

##### **pollsPerSecond = 1000 ms / 220 ms ≈ 4.55** 

The Command Spine activity-hint poll is deliberately low-frequency and projection-only; it must not replace authoritative events. 

#### **17.5 Token and model cost equation** 

##### **Cost = Tᵢ·Pᵢ + Tₒ·Pₒ + Tcr·Pcr + Tcw·Pcw + Ctools + Csandbox** 

Tᵢ/Tₒ are fresh input/output tokens; Tcr/Tcw are cache reads/writes; P values are per-token prices; tool and sandbox costs are added separately. Arcana should record provider-reported usage rather than estimate when possible. 

Illustrative normalized example—not a provider quote: 

|**Scenario**|**Token mix**|**Normalized cost**|
|---|---|---|
|Baseline|100k fresh input + 20k output|100k×$3/M + 20k×$15/M = $0.60|
|Curated + cache-aware|40k fresh input + 60k cache read + 20k output|40k×$3/M + 60k×$0.3/M +<br>20k×$15/M = $0.438|
|Illustrative saving|($0.60 − $0.438) / $0.60|27.0%|



#### **17.6 Context efficiency** 

##### **ContextEfficiency = usefulContextTokens / totalContextTokens** 

A context pack with 45,000 useful tokens inside a 60,000-token prompt has 75% estimated context efficiency. This metric requires an evaluation oracle or attribution method and should not be inferred from prompt length alone. 

#### **17.7 Event-storage planning** 

Illustrative capacity model: 

```
500 events/run × 1.5 KB/event ≈ 750 KB/run
10,000 runs × 750 KB ≈ 7.5 GB raw events
Assume 2× for indexes, metadata, proofs, and fragmentation ≈ 15 GB
```

For 100 Arcana Nodes running 50 sessions/day with 300 events/session: 100 × 50 × 300 = 1,500,000 events/day. At 1.5 KB average, raw ingestion is approximately 2.25 GB/day before compression and indexes. These are planning assumptions, not measured production values. 

#### **17.8 Delegation budget arithmetic** 

##### **Σ childUses ≤ parentRemainingUses** 

##### **max(childExpiry) ≤ parentExpiry** 

If a parent has 100 remaining uses, two children with limits 60 and 50 would exceed authority by 10 and must be rejected or rebalanced. Concurrency requires transactional reservation so two simultaneous delegations cannot each observe the same remaining budget. 

#### **17.9 Assurance equations** 

**DelegationAssured ⇔ trace = COMPLETE ∧ authorityAmplifications = 0** 

**ApprovalAssured ⇔ trace = COMPLETE ∧ approvalReplayExecutions = 0 ∧ hashSubstitutionsAccepted = 0** 

**InformationFlowAssured ⇔ trace = COMPLETE ∧ secretExfiltrationSuccesses = 0 ∧ unlabeledConsequentialRequests = 0** 

Page **21** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

### **18. Testing, Evaluation, and Release Gates** 

#### **18.1 Phase C adversarial categories** 

|**Group**|**Coverage**|
|---|---|
|A Authorization substitution|Missing/wrong grants, principal/session/workspace/contract/action/resource/args/cwd/host,<br>replay, policy drift, revocation, store failure.|
|B Scoped approvals|Exact match, substitution, expiry, rejection, concurrent claim, replay, crash recovery, stricter<br>policy.|
|C Delegation|Zero ambient authority, all amplification dimensions, ancestry, cycles, restart, concurrency,<br>orphan grants.|
|D Provenance and injection|README/web/MCP/tool/subagent injection, lineage laundering, encoded secrets, tampering,<br>unknown lineage.|
|E Workspace and MCP trust|Symlink/traversal/case/digest changes, server/schema/tool identity substitution, secret-bearing<br>MCP.|
|F Availability and persistence|Store failures, restart points, final-use races, transaction rollback, corrupted rows, incomplete<br>snapshots.|
|G Positive utility|Authorized reads, writes, tests, MCP, delegation, approvals, contracts, replacement grants.|
|H Evidence and RunProof|Event chains, denials, lifecycle records, replay attempts, trace degradation, immutability, audit<br>replay.|



#### **18.2 Hard release gates** 

|**Gate**|**Required result**|
|---|---|
|Unauthorized executions|0|
|Executor calls on denied paths|0|
|Capability amplifications|0|
|Approval replay executions|0|
|Revoked-ancestor executions|0|
|Secret-exfiltration successes|0|
|Unlabeled consequential executions|0|
|Known model-facing P0 bypasses|0|
|Benign authorization success|≥95%|
|Source errors in touched production code|0|
|Phase A/B regressions|0|



#### **18.3 Test hierarchy** 

- Unit tests for canonicalization, reason codes, matching, label algebra, intent, attenuation, and proof projection. 

- Property-based tests for label operations, path/resource narrowing, and deterministic PDP behavior. 

- Integration tests through SessionPolicyProvider, PEP, durable SQLite stores, and TaskTool. 

- Adversarial fixtures spying on final process/filesystem/network/MCP/secret executors. 

- Restart/recovery and concurrency tests for claims, use counters, delegation, and revocation. 

- Manual TUI smoke tests across widths, themes, keyboard, mouse, restart, and session isolation. 

- Full repository typecheck/build/test plus documented baseline failures outside changed scope. 

Page **22** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

### **19. Deployment Topologies** 

#### **19.1 Local all-in-one** 

```
TUI / CLI
   ↓
local Arcana daemon + local Arcana Node
   ↓
SQLite grants/events/memory + local sandbox/effects
   ↓
optional direct provider APIs
```

Best for individual developers. The control plane and Node are co-located; all enforcement and proof remain local. 

#### **19.2 Local Node with cloud control plane** 

`Arcana Cloud Control Plane policy · identity · organization · proof index · approvals` ⇅ `signed short-lived grants / revocation / proofs Local Arcana Node PDP/PEP · sandbox · secret broker · effect adapters · local evidence` 

The cloud distributes policy and receives proof, but the local Node remains the effect-boundary authority. Offline policy should be explicit and bounded. 

#### **19.3 Enterprise fleet** 

Multiple Nodes run near developer machines, CI workers, servers, or agent runtimes. Organization policy defines issuers, roles, capability templates, approval routes, retention, providers, budgets, and compliance exports. Nodes verify signed grants and maintain local revocation state. 

#### **19.4 External CLI wrapper** 

```
arcana launch codex
  → create identity + contract + grants
  → launch Codex in governed workspace/sandbox
  → intercept or constrain effects
  → emit RunProof
```

#### **19.5 Native framework adapter** 

```
withArcanaGovernance(mastraOrAgent, {
  policy, principal, workspace, evidence: "required"
})
```

Native adapters should provide stronger semantic requests and provenance than black-box process supervision. 

### **20. Roadmap: Core Phases and Product Tracks** 

#### **20.1 Core architecture phases** 

|**Phase**|**Name**|**Primary outcome**|
|---|---|---|
|A|Epistemic Foundation|Claims, evidence, contracts, obligations, event integrity.|
|B|Verification and Replay|RunProof axes, replay, reproducibility, revalidation.|
|C|Local Governed Autonomy|Capabilities, PDP/PEP, intent, provenance, approvals, delegation, trust<br>adapters.|
|D|Distributed Governed Autonomy|Arcana Node identity, signed short-lived grants, remote revocation, policy<br>distribution, cross-node proofs.|



Page **23** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

|**Phase**|**Name**|**Primary outcome**|
|---|---|---|
|E|Arcana Protocol and SDK|Portable schemas, conformance suite, framework/CLI adapters, partner<br>integrations.|
|F|Enterprise Control Plane|Fleet governance, federation, compliance, organization policy, approvals,<br>cost and provider controls.|



#### **20.2 Parallel product tracks** 

|**Track**|**Milestones**|
|---|---|
|TUI 1.0|Governance visibility → interactive approvals/capabilities → delegation tree → proof/replay →<br>polish.|
|CLI 1.0|Stable commands, JSON/NDJSON, launch protocol, proof/policy/audit, daemon lifecycle.|
|Node 1.0|Local enforcement daemon, signed grants, remote policy, revocation, proof sync.|
|SDK 1.0|Canonical request, grant, approval, event, RunProof, adapters.|
|Control 1.0|Organization identities, policy templates, nodes, approvals, audit, budgets.|



#### **20.3 Immediate sequence after Phase C freeze** 

1. Create and tag the Phase C milestone document with exact commit history and 95 fixture identifiers. 

2. Start TUI-1 Governance Visibility so users can see the local kernel they already have. 

3. Begin Phase D with Node identity and signed short-lived grants without redesigning the local kernel. 

4. Create one high-value external adapter—preferably a coding harness or Mastra integration—to prove crossruntime governance. 

5. Publish a conformance/evaluation report demonstrating zero protected executor calls on denied paths across the frozen fixture set. 

### **21. Competitive Positioning** 

#### **21.1 Category overlap** 

Modern frameworks and coding agents already provide model routing, tools, workflows, memory, subagents, approvals, sandboxes, observability, and attractive interfaces. Arcana should assume these outer features are becoming commodities. 

#### **21.2 Positioning statement** 

###### **Positioning** 

Agent frameworks build and operate agents. Arcana governs what agents are allowed to do and produces independent proof of what they actually did. 

#### **21.3 Competitive moat** 

- Framework-independent canonical authorization request. 

- Durable exact capabilities and fresh PEP enforcement. 

- Intent binding to active contract revision. 

- Provenance/sensitivity/field-lineage policy. 

- Exact single-use approvals. 

- Formal capability attenuation and ancestor revocation. 

- Append-only RunProof with integrity, replay, verification, and reproducibility. 

- Adversarial conformance suite that spies on final protected executors. 

- Local-first operation and future distributed Nodes. 

Page **24** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

#### **21.4 What Arcana should not compete on first** 

- Generic visual workflow builders 

- A proprietary RAG stack 

- The largest integration catalog 

- Generic memory features 

- A provider catalog race 

- A conventional web agent studio 

- A TUI that merely imitates other coding assistants 

#### **21.5 Demonstration strategy** 

The strongest market demonstration is the same agent run twice: once under its native framework configuration and once governed by Arcana. The fixture should include malicious repository content, privilege amplification, approval substitution, revocation between decision and execution, MCP schema change, and encoded secret exfiltration. Arcana’s output is not “we also have approvals”; it is zero protected effects when authorization fails, accompanied by replayable proof. 

### **22. Business and Enterprise Objective** 

#### **22.1 Value proposition by user** 

|**User**|**Value**|
|---|---|
|Individual developer|Safer autonomous coding, inspectable approvals, reliable completion evidence, local privacy,<br>reproducible runs.|
|Security team|Least privilege, revocation, provenance policy, audit evidence, conformance testing, secret<br>controls.|
|Platform team|One governance layer across heterogeneous agent frameworks and CLIs.|
|Engineering manager|Delegated autonomy with bounded risk, proof of tests/results, cost and provider control.|
|Compliance/audit|Portable evidence, immutable event chains, explicit trace health, policy/version history.|
|Agent vendor/framework|Arcana adapter provides enterprise-grade governance without rebuilding the full control plane.|



#### **22.2 Product packaging direction** 

|**Edition**|**Potential scope**|
|---|---|
|Open local runtime|CLI/TUI, local Node, capabilities, RunProof verification, local policies, SDK basics.|
|Pro developer|Advanced policy packs, long-term proof retention, adapters, team sharing, premium model<br>routing.|
|Enterprise control plane|Organization identities, node fleet, remote approvals, signed grants, compliance export,<br>SSO/RBAC, retention, budgets.|
|Protocol/conformance|Certification suite, partner integrations, signed adapters, RunProof verification services.|



#### **22.3 Enterprise buying reason** 

The enterprise reason to buy Arcana is not “another coding assistant.” It is a control and evidence layer that allows an organization to adopt many agents without accepting every agent runtime as a trusted security boundary. 

#### **22.4 Licensing risk** 

###### **Legal cleanup required** 

The README uses “MIT + Commercial” and also describes MIT as non-commercial, which is not standard MIT terminology. The LICENSE and commercial terms should be reviewed and made internally consistent before enterprise sales or broad distribution. 

Page **25** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

### **23. Risks, Nonclaims, and Governance** 

#### **23.1 Primary technical risks** 

|**Risk**|**Mitigation**|
|---|---|
|Authority bypass outside instrumented effects|Expand protected adapters, sandbox black-box CLIs, explicitly disclose uncovered effects.|
|Host compromise|Do not claim hostile-host security; future hardware-backed identity/attestation may reduce<br>risk.|
|Policy complexity|Canonical schemas, reason-code registry, simulation, conformance fixtures, secure<br>defaults.|
|Evidence gaps|Trace-health semantics; incomplete evidence degrades assurance.|
|Provenance laundering|Consequential-field lineage, conservative UNKNOWN handling, secret broker.|
|SQLite contention|Short transactions, WAL mode, indexes, idempotency, performance gates, future node-<br>local stores.|
|TUI/runtime divergence|TUI observes engine events; no duplicate policy state.|
|Compatibility bypass|Explicit LEGACY_COMPAT, degraded assurance, removal plan.|
|Framework competition|Focus on cross-runtime governance/proof rather than generic agent features.|
|Scope expansion|Freeze milestone contracts and run adversarial gates before new architecture.|



#### **23.2 Permanent nonclaims until proven** 

- Universal prevention of prompt injection. 

- Security for effects outside Arcana’s PEP/sandbox boundary. 

- Hostile operating-system or administrator containment. 

- Distributed node authenticity before signed identity and revocation are complete. 

- Mathematical proof of all implementation properties. 

- Reproducibility for nondeterministic external systems without recorded fixtures. 

#### **23.3 Human responsibility** 

Arcana reduces operational trust in agents; it does not remove human responsibility. Humans or organization policy remain responsible for objective contracts, protected assets, escalation rules, kill conditions, approval authority, legal/compliance boundaries, and acceptable residual risk. 

### **24. Recommended Execution Plan** 

#### **24.1 Immediate 0–30 days** 

1.  Freeze and tag Phase C with exact commits, fixture IDs, release gates, TCB, nonclaims, and schema versions. 

2.  Create a generated package/API/test manifest to eliminate documentation drift. 

3.  Wire Phase C governance events into TUI-1 Command Spine entries. 

4.  Ship exact approval inspector and capability/revocation inspector in the TUI. 

5.  Repair or quarantine known baseline test-suite DI/filesystem failures so full repository health is measurable. 

6.  Publish the Phase C evaluation report internally and prepare a public redacted version. 

#### **24.2 Near term 30–90 days** 

1.  Complete TUI-2 and TUI-3: interactive governance and subagent authority tree. 

2.  Build Arcana Node identity and signed short-lived grant prototype. 

3.  Implement remote revocation with local fail-closed cache semantics. 

4.  Build one external adapter and run the Phase C conformance suite against it. 

Page **26** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

5.  Stabilize diff-gate/mutation authority and verifier-owned completion for production workflows. 

6.  Define Arcana Protocol v0 schemas and compatibility guarantees. 

#### **24.3 Medium term 3–6 months** 

1.  Node fleet and control-plane proof sync. 

2.  Organization policy templates, identities, approval routing, and budgets. 

3.  TUI-4 proof/replay/audit and TUI-5 polish. 

4.  SDK 1.0 with Mastra/LangGraph/AI SDK/Codex/Claude/Gemini adapters. 

5.  Independent security review and third-party conformance fixtures. 

6.  Enterprise pilot with a limited set of protected workflows and explicit nonclaims. 

#### **24.4 Decision rule** 

###### **Build rule** 

Do not add a new broad feature category until the previous authority boundary is visible, enforced through the real production entry point, adversarially evaluated, and represented in RunProof. 

### **Appendix A — CLI Command Catalog** 

|**Command**|**Purpose**|
|---|---|
|arcana|Open TUI|
|arcana run <query>|Run/attach agent session|
|arcana doctor|Health checks|
|arcana console login|Device-flow pairing|
|arcana trust|Trust current workspace|
|arcana models|List models|
|arcana providers|Provider credentials|
|arcana session list|List sessions|
|arcana history list/show/resume|History|
|arcana stats|Usage statistics|
|arcana serve|Headless server|
|arcana daemon status/stop|Daemon lifecycle|
|arcana memory search/sessions/facts/stats|Memory operations|
|arcana learn list/show/moc|Learning catalog|
|arcana skills list/search/install|Skill management|
|arcana gateway|Messaging adapters|
|arcana cron add/list/remove/pause/resume/run/start|Scheduled jobs|
|arcana epistemic proof inspect/verify/export|RunProof operations|
|arcana epistemic replay audit/deterministic|Replay|
|arcana epistemic revalidate run|Current-policy revalidation|
|arcana launch <runtime>|Planned external runtime governance|



Page **27** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

### **Appendix B — Package Inventory** 

|**Package**|**Visibility/layer**|**Purpose**|
|---|---|---|
|@arcana/arcana|Entry/public|CLI commands and npm distribution|
|@arcana/engine|Private|TUI host, sessions, agents, prompts, tools, enforcement<br>integration|
|@arcana/core|Private|Effect runtime, persistence, events, capabilities, projects|
|@arcana/tui|Private|OpenTUI + Solid components and themes|
|@arcana/ui|Public|Web component library|
|@arcana/enterprise|Private|Web dashboard/control-plane surface|
|@arcana/server|Private|Hono HTTP API|
|@arcana/sdk|Public|Typed client and server spawner|
|@arcana/llm|Private|Provider protocols, requests, streaming, caching|
|@arcana/memory|Public|SQLite/FTS5 memory|
|@arcana/cron|Public|Persistent scheduled jobs|
|@arcana/gateway|Public|Chat platform adapters|
|@arcana/skills|Public|Skill catalog/discovery|
|@arcana/ml|Public|Signals and quality evaluation|
|@arcana/plugin|Public|Current extension hooks|
|@arcana/plugin-legacy|Compatibility|Legacy plugin boundary|
|@arcana/effect-drizzle-sqlite|Foundation|Effect/Drizzle bridge|
|@arcana/effect-sqlite-node|Foundation|SQLite platform binding|
|@arcana/http-recorder|Infrastructure|Deterministic HTTP cassettes|
|@arcana/function|Infrastructure|Cloudflare functions/sync|
|@arcana/script|Infrastructure|Build, release, smoke, migration tooling|



### **Appendix C — Security and Assurance Formula Sheet** 

|**Concept**|**Formula**|
|---|---|
|Local enforcement|¬Authorized(q)<br>¬Executed(q)<br>⇒|
|Exact execution preconditions|Effect(q)<br>Capability  Intent  ProvenancePolicy  Workspace  conditional Approval<br>⇒<br>∧<br>∧<br>∧<br>∧|
|Intent binding|Execute(q)<br>b: b.requestHash=H(q)  b.session=q.session  b.contractRevision=active<br>⇒∃<br>∧<br>∧|
|Delegation|Authority(child)<br>Authority(parent)<br>⪯|
|Hash chain|eventHashᵢ = H(canonical(eventᵢ)  eventHashᵢ₁)<br>∥<br>₋|
|Action assurance|trace COMPLETE  unauthorized=0  orphan=0<br>∧<br>∧|
|Approval assurance|trace COMPLETE  replayExecutions=0  substitutionsAccepted=0<br>∧<br>∧|
|Information flow assurance|trace COMPLETE  secretExfiltration=0  unlabeledConsequential=0<br>∧<br>∧|
|Benign success|successful legitimate operations / all legitimate operations|
|Context efficiency|useful context tokens / total context tokens|
|Token cost|fresh input + output + cache read/write + tool/sandbox costs|



Page **28** 

**ARCANA  /  MASTER PROJECT SPECIFICATION** 

|**Concept**|**Formula**|
|---|---|
|Storage|runs × events/run × bytes/event × index/metadata multiplier|



### **Appendix D — Glossary** 

|**Term**|**Definition**|
|---|---|
|Agentic Zero Trust|No agent, model, subagent, plugin, or content source receives implicit authority based on identity or<br>location.|
|Capability|Durable, exact, revocable authority to perform bounded actions on bounded resources.|
|PDP|Policy Decision Point; pure deterministic policy evaluation.|
|PEP|Policy Enforcement Point; fresh revalidation and effect-boundary enforcement.|
|Intent binding|Evidence that an exact request is required by the current user objective/contract.|
|Provenance|Origin labels attached to data and authorization fields.|
|Sensitivity|PUBLIC/INTERNAL/PRIVATE/SECRET classification.|
|Field lineage|Source-event and transformation history for consequential request fields.|
|Scoped approval|Exact, expiring, single-use user authorization for one request hash.|
|Attenuation|The rule that delegated authority can only become narrower.|
|RunProof|Portable execution evidence with integrity, verification, reproducibility, and security profiles.|
|Trace health|COMPLETE/DEGRADED/UNAVAILABLE evidence quality state.|
|Command Spine|Arcana’s indexed TUI execution chronicle.|
|Arcana Node|Future local enforcement daemon with identity, signed grants, revocation, sandbox, and proof sync.|
|Control Plane|Organization policy/identity/approval/proof coordination layer that does not replace local enforcement.|



### **Appendix E — Source Register** 

Repository and project sources used for this synthesis: 

|**Source**|**Reference**|
|---|---|
|Root package manifest|package.json (historical branch at original publication: phase-c-capability-security; current: see docs/STATUS.md)|
|Repository README|README.md|
|Documentation index|docs/README.md|
|System architecture|docs/architecture/system-architecture.md|
|Database schema|docs/architecture/database-schema.md|
|Command Spine UI|docs/architecture/command-spine-ui.md|
|Core Engine Vision|docs/core-engine-vision.md|
|Arcana Native Runtime|docs/architecture/arcana-native-runtime.md|
|Comprehensive guide|docs/arcana-comprehensive-guide.md|
|Project milestone record|Owner-reported Phase A/B/C implementation and evaluation summaries through 31<br>July 2026.|



**END OF MASTER SPECIFICATION** 

Page **29** 



---

> [!WARNING]
> HISTORICAL SNAPSHOT — NON-AUTHORITATIVE FOR CURRENT STATUS.
>
> Architecture and conceptual material remain useful. Branch names,
> implementation status, test totals, dates, roadmap progress, and product
> availability in this Part are superseded by docs/STATUS.md.

## PART II — 100% COMPLETION PLAYBOOK



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



---

> [!WARNING]
> HISTORICAL SNAPSHOT — NON-AUTHORITATIVE FOR CURRENT STATUS.
>
> Architecture and conceptual material remain useful. Branch names,
> implementation status, test totals, dates, roadmap progress, and product
> availability in this Part are superseded by docs/STATUS.md.

## PART III — FINAL PRODUCT DESIGN



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

> **Every consequential action crossing an Arcana-governed effect boundary leaves durable proof. Every effect has authority. Every agent remains bounded.** 


---



## PART IV — COMPETITIVE THESIS (stable)

Arcana differentiates through exact intent-bound authorization,
provenance-aware effect control, verified completion and portable proof.
Competitor capabilities and product maturity are tracked in dated market
assessments; the 2026-08-02 assessment lives at
`docs/competitive/2026-08-02-market-assessment.md` and is scheduled for
refresh after 2026-09-02.

> Every consequential action crossing an Arcana-governed effect boundary
> leaves durable proof. Every effect has authority. Every agent remains
> bounded — within the declared Arcana-mediated enforcement boundary.
