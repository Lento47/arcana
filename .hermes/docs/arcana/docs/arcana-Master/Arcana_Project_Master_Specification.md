**ARCANA  /  MASTER PROJECT SPECIFICATION** 

# **A R C A N A** 

## **MASTER PROJECT SPECIFICATION** 

Architecture, Product Objective, Runtime, TUI, CLI, Security Kernel, Proof System, Roadmap, and Quantitative Model 

###### **Doctrine** 

_The model may propose. The engine decides. The proof records._ 

**Repository:** Lento47/arcana (private) **Primary source branch:** phase-c-capability-security **Document date:** 31 July 2026 **Document status:** Living master specification 

**Security milestone:** Phase C evaluated locally; documentation/tag is the freeze step 

**Every action leaves proof.** 

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
|Phase D: Distributed authority|PLANNED|Node identity, signed grants, remote revocation, policy<br>distribution, proof composition.|
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
|Core promise|Every action leaves proof.|
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
|Primary working branch|phase-c-capability-security|
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

A capability grant is the fundamental authority primitive. It is durable, scoped to a principal/session/workspace/contract, constrained by actions and resources, expiring, use-limited, revocable, and evaluated at the real effect boundary. 

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
|Root package manifest|package.json on phase-c-capability-security|
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

