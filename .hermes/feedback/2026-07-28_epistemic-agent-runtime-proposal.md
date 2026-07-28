# Arcana Epistemic Agent Runtime — Feedback & Architecture Proposal

> Received: 2026-07-28 | Author: lejzer

---

Arcana should become an 
epistemic agent runtime
The winning objective is not to build "the smartest CLI" or "an agent that never lies."
No probabilistic model can be guaranteed never to generate a false statement. External documentation can be outdated, tests can be incomplete, tools can return corrupted data, and several agents can confidently repeat the same mistake.
A stronger and achievable invariant is:
A model-generated claim must never silently become a trusted fact, an authorized action, or a completed result without satisfying explicit proof obligations.
The model proposes.
Arcana governs.
The environment verifies.
RunProof records what actually happened.
That is a much more defensible product category than another coding assistant.


⸻


First: a skeptical assessment of the current innovations
Your seven systems are valuable, but several uniqueness claims are no longer defensible as of July 2026.
Claude Code now has repository-scoped auto-memory containing learned patterns and preferences, Codex has generated local memories with summaries, durable entries, recent inputs and supporting evidence, and Hermes explicitly advertises a closed learning loop, autonomous skill creation, session search and user modeling. 
Therefore:
Arcana capability
Product value
Defensible moat today
Learning memory
High
Low unless provenance-aware
Confidence decay
Potentially high
High if statistically calibrated
RunProof
Very high
Extremely high if cryptographically attested
Five-level compaction
Medium
Medium
Workspace trust
High
High if enforcement is outside the model
Daemon/session lock
Useful infrastructure
Low
Cross-device sync
Useful
Low without conflict, privacy and integrity semantics
The strongest existing ideas
RunProof and workspace trust are the foundations of a real moat.
The memory and confidence systems can become strong, but currently have dangerous weaknesses:
A session can teach Arcana a false conclusion.
Model-reported confidence is not the same as calibrated correctness.
Randomly injecting two memories does not mathematically prevent recency bias.
A known Git remote does not prove that repository contents or local configuration are safe.
"Replayable" is ambiguous when remote APIs, nondeterministic models and mutable dependencies are involved.
FACTS.md can synchronize stale facts, secrets, contradictions and poisoned memories as efficiently as valid knowledge.
Arcana should transform these from convenience features into a formal reliability system.


⸻


The proposed architecture: 
Arcana Epistemic OS
Arcana should be composed of ten cooperating systems:
User intent
    ↓
1. Intent Compiler
    ↓
2. Epistemic Kernel ─────── 3. Persona Posterior
    ↓
4. Evidence Graph ───────── 5. Memory Metabolism
    ↓
6. Verifier Mesh ────────── 7. Trust-Calibrated Model Router
    ↓
8. Capability Kernel ────── 9. Context Virtual Memory
    ↓
10. RunProof / Attestation Store
The LLM is not the kernel. It is one replaceable reasoning component inside the system.


⸻


1. Intent Compiler: turn requests into completion contracts
Agents often fail because they optimize for sounding finished rather than being finished.
Before planning, Arcana should compile a user request into a structured contract:
type CompletionContract = {
  objective: string
  deliverables: Deliverable[]
  constraints: Constraint[]
  acceptanceCriteria: Criterion[]
  forbiddenOutcomes: string[]
  assumptions: ClaimRef[]
  riskClass: "read" | "modify" | "publish" | "irreversible"
  budget: {
    maxTokens?: number
    maxCost?: number
    maxWallTime?: number
  }
}
For example:
Request:
"Fix the subagent TUI crash."

Compiled contract:
- Reproduce the crash.
- Identify the failing state transition.
- Produce a minimal patch.
- Main TUI must survive child-session failure.
- Existing session-resume behavior must continue working.
- All affected tests must pass.
- No completion claim without executable verification.
This changes Arcana's loop from:
prompt → plausible work → confident summary
into:
contract → evidence → implementation → verification → proof
Liveness invariant
"Never stop until complete" is unsafe because some goals are impossible, contradictory or externally blocked.
Arcana should stop only in one of four explicit states:
VERIFIED_COMPLETE
PROVABLY_BLOCKED
BUDGET_EXHAUSTED
DECISION_REQUIRED
It must never convert "I ran out of ideas" into "done."


⸻


2. Epistemic Kernel: typed truth instead of prose confidence
Every material statement should have an epistemic type.
type ClaimStatus =
  | "observed"
  | "derived"
  | "assumed"
  | "predicted"
  | "reported"
  | "contradicted"
  | "superseded"
  | "verified"

type Claim = {
  id: string
  proposition: string
  status: ClaimStatus

  scope: {
    workspace?: string
    branch?: string
    file?: string
    symbol?: string
  }

  provenance: EvidenceRef[]
  dependencies: ClaimRef[]
  contradicts: ClaimRef[]

  validFrom?: string
  validUntil?: string
  lastVerifiedAt?: string

  confidence: number
  calibrationDomain: string
}
This prevents language such as:
"The crash happens because SolidJS renders before hydration."
from being treated as fact merely because an agent said it fluently.
Instead:
HYPOTHESIS h_17
SolidJS reads child session state before hydration.

Evidence:
+ stack trace references reactive render
+ failure disappears when child creation is delayed
- no failing deterministic test yet

Status: DERIVED
Confidence: 0.61
Required proof: reproducible race or instrumentation trace
The critical invariant
ASSUMED ≠ OBSERVED
REPORTED ≠ VERIFIED
HIGH CONFIDENCE ≠ TRUE
TEST PASSED ≠ REQUIREMENT SATISFIED
Arcana should make it structurally impossible for these categories to collapse into one generic "the agent thinks so" state.


⸻


3. Persona should be a posterior distribution, not a character prompt
A static persona file eventually becomes a caricature:
The user likes concise, elite, innovative answers.
That causes overgeneralization and generic imitation. The user may want concise debugging instructions but deep architectural research. Preferences are contextual.
Arcana should model a user as a latent, uncertain, task-conditioned preference vector:
\theta_{u,d}
=
\begin{bmatrix}
\text{depth}\\
\text{directness}\\
\text{risk tolerance}\\
\text{novelty preference}\\
\text{evidence burden}\\
\text{autonomy preference}\\
\text{visual density}\\
\text{implementation bias}
\end{bmatrix}
Here, u is the user and d is the task domain.
For two candidate outputs A and B, Arcana can model preference using:
P(A \succ B \mid \theta)
=
\sigma\left(
\theta^\top
\left[\phi(A)-\phi(B)\right]
\right)
Where:
\phi(A) describes observable properties of response A.
\theta represents inferred preference weights.
\sigma is the logistic function.
User edits, rejections and selections update the posterior over \theta.
Research on latent preference learning and user edits supports treating personalization as an inferred, multidimensional preference problem rather than a single natural-language profile. 
Four separate persona stores
Arcana should never mix these:
Explicit identity facts
Only information directly stated or confirmed by the user.
Language: English and Spanish
Timezone: America/Costa_Rica
Stable preferences
Learned from repeated evidence, but editable and revocable.
For architecture research:
  depth preference: 0.91 ± 0.05
  evidence burden: 0.88 ± 0.08
Situational intent
Applies only to the current task.
Current request:
  favor radical innovation
  include mathematical reasoning
Hypotheses about the user
Never injected as facts.
Hypothesis:
  user may prefer Rust implementation
Confidence: 0.43
Action: do not apply without confirmation or stronger evidence
This gives Arcana discernment without pretending it "knows the real person."


⸻


4. Evidence Graph: every conclusion carries lineage
The current FACTS.md model should evolve into a graph:
claim ──supported_by──> source
claim ──derived_from──> claim
claim ──contradicts───> claim
claim ──tested_by─────> execution
execution ─produced───> artifact
artifact ─modified────> repository state
A claim confidence could be estimated using a correlation-aware log-odds model:
\operatorname{logit}P(c)
=
\operatorname{logit}\pi_c
+
\sum_j w_j r_j s_j
-
\gamma D(c)
-
\delta A(c)
Where:
\pi_c: prior probability for the claim class.
r_j: historical reliability of source j.
s_j: strength of evidence j.
D(c): evidence-dependence penalty.
A(c): staleness penalty.
The dependence penalty matters. Five articles repeating one press release are not five independent sources. Five subagents using the same model and context are also not five independent verifiers.
Proof obligations by claim type
Claim
Minimum obligation
"File contains X"
Direct file observation
"Function is unused"
Static reference search plus dynamic caveat
"Patch fixes bug"
Reproduction fails before and passes after
"No regression"
Relevant regression suite, not one test
"Dependency is safe"
Version, provenance and vulnerability policy
"Competitor lacks feature"
Current primary-source search
"Deployment succeeded"
External state observation
"This design is novel"
Prior-art search plus bounded wording
Arcana should be allowed to say:
I have not established that.
That is an intelligence feature, not a weakness.


⸻


5. Confidence Trust Index: replace badges with calibration
The current idea—
3 mismatches → [CONF:LOW]
—is directionally useful but statistically crude.
Three failures in CSS generation should not make a model untrusted for Rust debugging. Conversely, 100 easy successes should not prove reliability for an irreversible production migration.
Hierarchical model trust
Maintain trust by:
model
  └─ domain
      └─ task class
          └─ tool/environment
For a model m, domain d, and task k:
p_{m,d,k} \sim \operatorname{Beta}(\alpha_{m,d,k}, \beta_{m,d,k})
After an outcome y \in [0,1]:
\alpha_t = \rho\alpha_{t-1} + w y
\beta_t = \rho\beta_{t-1} + w(1-y)
Where:
\rho < 1 introduces time decay.
w reflects evidence strength.
Partial success can use 0<y<1.
Unverified agent self-assessment receives nearly zero weight.
Executable tests receive substantially higher weight.
Calibration mismatch
If a model predicts confidence p_i and outcome is y_i, track the Brier score:
BS = \frac{1}{n}\sum_{i=1}^n(p_i-y_i)^2
A model that says "99%" and repeatedly fails is penalized more than one that reports uncertainty.
Self-reported model confidence should not be treated as ground truth. Research finds that post-alignment models can be overconfident, and iterative self-improvement may increase overconfidence unless calibration is applied throughout the loop. 
Semantic uncertainty
Arcana can generate several independent answers, group them by meaning, and compute semantic entropy:
H_{\text{sem}}
=
-\sum_{k=1}^{K} p_k \log p_k
High entropy means the model's answer changes substantially across equivalent attempts. Semantic entropy has been shown to detect a subset of arbitrary incorrect generations, but it is not itself a proof of truth. A consistently wrong model can have low entropy. 
Selective execution
Arcana should support abstention:
Confidence sufficiently calibrated → continue
Uncertain but low-risk               → inspect more
Uncertain and high-impact            → independent verifier
Still uncertain                      → ask or refuse execution
This is far better than showing [CONF:LOW] and proceeding anyway.


⸻


6. Verifier Mesh: verification must be independent
Ordinary "reflection" frequently means asking the same model to reread its own answer. That creates correlated self-approval.
Chain-of-Verification improves factuality by separating draft generation, verification-question generation, independent answering and final revision. 
Arcana should generalize this into a verifier mesh:
PROPOSER
    generates candidate

CHALLENGER
    searches for counterexamples and missing assumptions

ENVIRONMENT VERIFIER
    executes tests, compilers, linters, queries or simulations

SPEC VERIFIER
    checks acceptance criteria

SECURITY VERIFIER
    checks capabilities, taint and policy

PROOF AGGREGATOR
    decides whether obligations were satisfied
Isolation requirements
Verifier independence should be measurable:
Different context windows.
Separate process IDs.
Read-only verifier workspaces.
No access to the proposer's persuasive narrative where unnecessary.
Different model families for high-impact decisions.
Independent retrieval queries.
Environment-based verification preferred over model judgment.
For Arcana subagents, separate processes are valuable not only for crash isolation but for epistemic isolation:
parent PID
├── proposer PID        writable worktree
├── challenger PID      read-only worktree
├── test verifier PID   isolated container
└── security PID        policy-only context
Subagents should communicate through typed events, not shared reactive state or concatenated prose.


⸻


7. Memory Metabolism: learning without poisoning itself
Arcana should not automatically promote every extracted "learning" into reusable knowledge.
Use this lifecycle:
experience
   ↓
quarantine
   ↓
classification
   ↓
evidence linking
   ↓
contradiction search
   ↓
validation
   ↓
consolidation
   ↓
decay / revalidation / forgetting
Proposed memory object
type Memory = {
  id: string

  kind:
    | "fact"
    | "preference"
    | "procedure"
    | "failure_pattern"
    | "hypothesis"
    | "decision"
    | "artifact"

  statement: string
  scope: MemoryScope

  evidence: EvidenceRef[]
  contradictions: MemoryRef[]

  confidence: number
  sensitivity: "public" | "private" | "secret"
  provenanceTrust: number

  validFrom?: string
  validUntil?: string
  lastUsedAt?: string
  lastVerifiedAt?: string

  state:
    | "quarantined"
    | "active"
    | "contested"
    | "stale"
    | "revoked"
}
Never compile these into 
FACTS.md
Unverified conclusions from an interrupted run.
Guesses about user identity.
Secrets or credentials.
Temporary branch state.
Failed procedures presented as success.
Facts sourced only from another memory.
Claims whose source has disappeared.
Model preferences learned from one isolated choice.
Replace random injection
"Two random learnings" does not guarantee relevance, diversity or resistance to recency bias.
Memory retrieval should solve a constrained selection problem:
\max_{S}
\left[
\sum_{i\in S} U(i,q)
-
\lambda\sum_{i\ne j}\operatorname{sim}(i,j)
\right]
subject to:
\sum_{i\in S}\operatorname{tokens}(i) \le B
Where utility includes:
relevance
× confidence
× scope match
× freshness
× expected decision impact
Then add diversity so five nearly identical memories do not occupy the context.
Agent-memory research increasingly treats memory as a hierarchy with retrieval, consolidation, updating and conflict handling rather than a flat store. MemGPT introduced OS-like virtual context management, while newer memory benchmarks evaluate retrieval, test-time learning, long-range understanding and conflict handling as separate competencies. 


⸻


8. Context Virtual Memory: replace compaction levels with demand paging
Your five levels have a conceptual problem:
Level 1: drop all tool results
Level 2: summarize tool results >1000 chars
Level 2 retains more information than Level 1, so the hierarchy is not monotonic. More importantly, dropping evidence from the prompt must not delete evidence from RunProof.
Arcana needs four physically separate layers:
Immutable Event Store
    exact prompts, outputs, tool calls and artifacts

Context Pages
    content-addressed retrievable chunks

Working Set
    material currently injected into the model

Derived Summaries
    lossy summaries with links back to original pages
Context page
type ContextPage = {
  digest: string
  kind: "source" | "tool-output" | "decision" | "summary" | "schema"
  tokenCount: number
  sourceEvents: EventRef[]
  summaryOf?: PageRef[]
  dependencies: PageRef[]
  lastAccessedAt: string
  utilityEstimate: number
}
Page policies
Pin: system policy, user objective, current contract.
Hot: active files, unresolved claims, recent failures.
Warm: architectural decisions and relevant summaries.
Cold: raw historical outputs.
Reloadable: tool schemas and repository maps.
Never summarize: exact errors, hashes, permission decisions and critical evidence.
Summarize with lineage: long logs and exploratory conversation.
Discard from model context only: duplicated rendering or transport metadata.
OS-inspired context management has already been explored through MemGPT, and MEM1 reports long-horizon reasoning with near-constant context size. 
Cache-aware prompt construction
The system prompt should have a stable prefix:
Arcana kernel policy
Tool protocol version
Workspace capability policy
Stable project instructions
──────────────────────── cache boundary
Current contract
Current working set
Latest events
Do not reorder stable sections on every turn. Demand-load tool schemas rather than injecting every tool. Content-address summaries so unchanged context pages remain cacheable.


⸻


9. Trust-Calibrated Model Router
A static "best model" setting wastes money and weakens reliability.
The router should optimize expected verified utility:
m^*
=
\arg\max_m
\left[
P(\text{verified success}\mid m,x)
-
\lambda_c C_m
-
\lambda_l L_m
-
\lambda_r \operatorname{CVaR}_\alpha(\text{loss}_m)
+
\lambda_h H_m
\right]
Where:
C_m: expected token cost.
L_m: latency.
\operatorname{CVaR}: expected loss in bad-tail outcomes.
H_m: expected cache advantage.
x: task features, risk, domain and available verifiers.
Model roles, not one universal model
Local small model:
  classification, retrieval ranking, secret detection,
  compaction proposals, duplicate detection

Fast inexpensive model:
  routine exploration, repository navigation,
  simple transformations

Strong reasoning model:
  architecture, difficult debugging, synthesis

Independent model:
  adversarial review and contradiction search

Deterministic tools:
  actual verification
RouteLLM demonstrates that learned routers can preserve much of a stronger model's benchmark performance while substantially reducing cost, and FrugalGPT studies cascades that escalate only when weaker models are insufficient. 
Dynamic test-time compute
Do not run five agents for every trivial task.
Allocate additional computation when:
semantic entropy is high
model trust for the domain is low
action is difficult to reverse
acceptance criteria remain unresolved
verifiers disagree
The loop should estimate the value of one more inference:
VOI =
\frac{
\mathbb{E}[\text{reduction in decision loss}]
}{
\text{token cost}+\text{latency cost}
}
Continue only while VOI exceeds the execution threshold.


⸻


10. Capability Kernel: security outside the language model
Workspace trust is a good beginning, but:
remote URL is known
does not imply:
checked-out files are safe
local hooks are safe
dependency versions are safe
configuration has not changed
Arcana should use capability-based execution:
type Capability = {
  operation: "read" | "write" | "exec" | "network" | "publish" | "secret"
  resources: string[]
  constraints: {
    commands?: string[]
    hosts?: string[]
    maxBytes?: number
    expiresAt?: string
  }
  issuer: "user" | "policy" | "parent-agent"
}
A subagent receives only the capabilities required for its task.
Taint model
Every input should carry a trust label:
SYSTEM_POLICY       highest authority
USER_INTENT         trusted instruction
LOCAL_SOURCE        data, not instruction
REMOTE_SOURCE       untrusted data
TOOL_OUTPUT         untrusted data
GENERATED_TEXT      untrusted proposal
VERIFIED_RESULT     environment-backed evidence
A web page, email, issue description or README must never gain authority merely because it contains imperative language.
Indirect prompt-injection benchmarks show that tool-integrated agents can be manipulated by instructions embedded in external content. A large 2026 red-team study likewise found successful attacks across every evaluated frontier model, reinforcing that prompt-only obedience rules are not a sufficient security boundary. 
Therefore:
Authorization must be checked at tool-execution time by deterministic code, not decided only inside the model prompt.
Signed project configuration
Executable Arcana configuration should require one of:
Explicit local trust approval.
Valid organization signature.
Repository policy hash approved by the user.
Sandboxed evaluation before activation.
Dependency or build attestations can follow in-toto/SLSA-style provenance semantics, where inputs, builders, parameters and output digests are recorded and verifiable. 


⸻


RunProof 2.0: from logs to proof-bearing execution
A transcript is not a proof.
RunProof should be an append-only event DAG:
type ProofEvent = {
  id: string
  parentHashes: string[]
  timestamp: string

  actor: {
    kind: "user" | "model" | "tool" | "policy" | "verifier"
    identity: string
    version?: string
  }

  operation: string
  inputDigests: string[]
  outputDigests: string[]

  claimsAdded: ClaimRef[]
  claimsChanged: ClaimRef[]
  capabilitiesUsed: CapabilityRef[]

  environmentDigest?: string
  cost?: TokenCost
  signature?: string
}
Each event hash includes the previous event hash:
h_i =
H(h_{i-1}\,\|\,\operatorname{canonicalize}(e_i))
A Merkle root can attest to the entire run while allowing selective verification of individual events.
W3C PROV provides a standard conceptual model for entities, activities and agents involved in provenance. In-toto and SLSA provide useful software-attestation models, and transparency systems such as Rekor demonstrate append-only auditability for signed artifact metadata. 
Three replay modes
Calling everything "replayable" would be misleading.
Audit replay
Render the previously recorded events exactly.
No tools rerun.
No claim that the same result would happen today.
Deterministic replay
Rerun using:
Frozen repository tree.
Pinned dependencies.
Recorded environment image.
Deterministic tools.
Stored model responses or a deterministic local model.
No mutable network dependencies.
Live revalidation
Rerun against the current environment and compare:
previous result
current result
changed inputs
changed dependencies
changed external observations
This is often more valuable than pretending that a changing external world can be deterministically replayed.
Proof levels
P0 TRACE
Events were recorded.

P1 INTEGRITY
The event chain and artifacts are tamper-evident.

P2 REPRODUCIBLE
The deterministic portion can be rerun.

P3 VERIFIED
Acceptance criteria passed.

P4 ATTESTED
An independent verifier signed the proof.

P5 CONTINUOUS
The result is revalidated when dependencies change.
This could become Arcana's strongest enterprise differentiation.


⸻


The Creativity Compiler: originality without "AI slop"
You cannot guarantee that every output is globally unique. That would require exhaustive knowledge of everything ever created.
You can, however, optimize for:
novelty
× contextual appropriateness
× usefulness
× feasibility
× user fit
− genericness
− self-repetition
Creativity research increasingly emphasizes that novelty alone is insufficient: novelty must be conditional on appropriateness or value. Recent work also uses determinantal objectives to improve semantic diversity without necessarily sacrificing response quality. 
Do not ask one model to "be more creative"
That usually changes adjectives, colors or metaphors while preserving the same underlying concept.
Instead, Arcana should manipulate structured representations.
Step 1: decompose the problem
For a CLI interface:
objects:
  session, command, agent, evidence, decision, artifact

relations:
  causes, modifies, verifies, blocks, delegates, contradicts

constraints:
  terminal grid, keyboard-first, responsive width,
  low visual noise, continuous execution state

existing paradigms:
  chat transcript, dashboard, command palette,
  timeline, split-pane IDE
Step 2: apply transformation operators
Each candidate must come from a declared operator:
INVERSION
What if the output, not the prompt, is primary?

TEMPORAL DISPLACEMENT
What if the TUI is organized around future obligations?

MATERIALIZATION
What if verification behaves like physical evidence?

SCALE SHIFT
What if one command expands into an explorable execution world?

MECHANISM TRANSFER
What if process supervision behaved like a flight recorder?
CONSTRAINT COLLISION
What if a terminal had cinematic temporal transitions
without becoming visually noisy?

COUNTERFACTUAL
What if chat had never been invented?

SUBTRACTION
What disappears if Arcana exposes only consequential state?
This is much stronger than sampling five temperature variations.
Step 3: generate independently
Produce candidates with different:
Transformation operators.
Context subsets.
Model families.
Seeds.
Critical assumptions.
Step 4: select for quality and diversity
Let q_i be candidate quality and K a semantic similarity kernel:
S^*
=
\arg\max_S
\left[
\sum_{i\in S}
(q_i-\beta G_i)
+
\lambda\log\det(K_S+\epsilon I)
\right]
Where G_i is genericness.
The determinant rewards candidates spanning different semantic directions rather than paraphrasing one idea.


⸻


Anti-slop linter
Before presenting a creative answer, Arcana should calculate:
Template similarity
Embedding similarity against:
Arcana's prior outputs.
Common marketing structures.
Common UI-design proposals.
Repeated internal solution patterns.
Cliché density
Detect phrases such as:
seamless experience
powerful platform
next-generation
revolutionary
elegant and intuitive
AI-powered solution
The phrases are not universally forbidden, but each requires concrete support.
Structural repetition
Detect repeated patterns:
three cards
left sidebar + main panel
hero + glowing orb
dashboard with status chips
chat message + tool card
Unsupported grandeur
Every superlative creates a proof obligation:
"fastest"       → benchmark required
"unique"        → prior-art qualification
"secure"        → threat model required
"reliable"      → measured failure rate
"self-learning" → demonstrated retained improvement
Realization score
A concept is not useful merely because it sounds original.
R =
0.25N +
0.25V +
0.20F +
0.15P +
0.15T
Where:
N: novelty.
V: user value.
F: feasibility.
P: persona fit.
T: testability.
Creative work should not leave ideation until at least one candidate has an implementation path and falsifiable success criteria.


⸻


How this should appear in the Arcana TUI
The command spine is an ideal surface for epistemic execution.
01  ◆  intent      fix subagent rendering without destabilizing main TUI
02  ├  assume      child session state may hydrate asynchronously
03  ├  inspect     session store + SolidJS owner boundaries
04  ├  observe     child record is undefined during first reactive pass
05  ├  challenge   test whether rendering guard alone resolves crash
06  ├  reproduce   8/8 runs fail under forced scheduling delay
07  ├  patch       isolate child process and validate IPC envelope
08  ├  verify      crash reproduction 0/100 · parent remained alive
09  ├  regress     124 passed · 0 failed
10  ◎  proof       P3 verified · root 8e21…44bc
Receipts can expose material state without adding dashboard cards:
claims       7 verified · 1 assumed · 0 contradicted
evidence     12 local · 3 executable
model trust  rust/debug 0.87 ± 0.06
risk         medium → low after verification
cost         38.4k input · 7.2k output · 61% cache
proof        P3 VERIFIED
Useful commands:
:claims
:assumptions
:contradictions
:why 07
:evidence 04
:challenge
:counterexample
:trust
:proof inspect
:proof verify
:replay audit
:replay deterministic
:memory audit
:memory quarantine
:budget
:novelty
This preserves Arcana's chronological spine while making the chronology epistemically meaningful.


⸻


Arcana's self-improvement loop
Do not let the agent modify its own durable policy merely because a run appeared successful.
Use a gated loop:
1. Observe failure or repeated inefficiency.
2. Form a proposed learning.
3. Link it to exact evidence.
4. Search for counterexamples.
5. Evaluate on historical replay fixtures.
6. Evaluate on held-out tasks.
7. Measure regressions, cost and calibration.
8. Promote only if confidence exceeds policy.
9. Keep rollback pointer.
10. Re-evaluate after future use.
A skill update should resemble a software release:
candidate skill
baseline score
candidate score
confidence interval
regression set
cost delta
affected domains
proof root
rollback target
No recursive self-certification
The same agent must not be able to:
propose learning
evaluate learning
approve learning
publish learning
without an external criterion.
That is how a self-improving system gradually institutionalizes its own mistakes.


⸻


Evaluation: how Arcana proves it is better
Do not market Arcana using feature counts. Publish measurable system behavior.
Reliability metrics
Unsupported Assertion Rate
False Completion Rate
Claim Precision by epistemic class
Contradiction Detection Recall
Brier Score
Expected Calibration Error
Selective Risk–Coverage Curve
Memory Contamination Rate
Stale Memory Activation Rate
Replay Fidelity
Regression Escape Rate
Security metrics
Indirect Prompt Injection Attack Success Rate
Unauthorized Tool Attempt Rate
Capability Escalation Rate
Secret Exposure Rate
Malicious Workspace Activation Rate
Policy False-Positive Rate
Agent Security Bench and InjecAgent can provide starting points for security evaluation, while custom Arcana tasks should test repository instructions, poisoned tool output, malicious MCP descriptions and dependency attacks. 
Efficiency metrics
Verified successes per million tokens
Verified successes per unit cost
Cache hit ratio
Context waste ratio
Tool-schema tokens per turn
Verifier cost versus errors prevented
Time to verified completion
Escalation rate by model tier
Coding capability
Use SWE-bench Verified, but do not optimize only for leaderboard resolution. It contains 500 human-validated software-engineering instances and evaluates generated patches by executing repository tests. 
Arcana should additionally measure:
test gaming
unnecessary diff size
dependency changes
security regressions
proof completeness
reproduction quality
cost per resolved issue
Creativity metrics
Novelty conditional on appropriateness
Semantic diversity across candidates
Self-repetition rate
Template similarity
Executable realization rate
Human pairwise preference
Idea-to-working-artifact conversion rate
A strange idea is not automatically creative. A creative Arcana result must be both unusual and realizable.


⸻


Implementation priorities
Phase A — Epistemic foundation
Build first:
Claim and Evidence types.
Completion contracts.
Explicit assumptions and contradictions.
Proof-obligation registry.
False-completion detector.
Immutable event store.
Without these, "self-learning" will amplify mistakes.
Phase B — RunProof 2.0
Add:
Canonical event serialization.
Hash-linked event DAG.
Artifact digests.
Environment manifests.
Audit, deterministic and live-revalidation modes.
Proof levels.
Optional signatures and attestations.
Phase C — Security kernel
Add:
Capability tokens.
Per-subagent process isolation.
Typed IPC.
Tool-input and tool-output taint.
Signed workspace policy.
Secret boundaries.
Prompt-injection test suite.
Phase D — Memory metabolism
Replace automatic extraction with:
Quarantine.
Evidence linkage.
Contradiction search.
Scope and time validity.
Sensitivity classification.
Consolidation tests.
Revocation and rollback.
Phase E — Trust router and context VM
Implement:
Domain-conditioned model trust.
Calibration history.
Cost/latency/risk routing.
Demand-loaded tool schemas.
Context pages.
Cache-aware stable prefixes.
Value-of-information stopping.
Phase F — Creativity compiler
Only after truth and execution infrastructure exists:
Concept decomposition.
Transformation operators.
Independent candidate generation.
Diversity selection.
Anti-slop linting.
Feasibility tests.
Novelty archive.


⸻


What Arcana can and cannot become
Achievable
Arcana can become a system where:
Unsupported claims remain visibly unsupported.
High-risk actions cannot execute without capabilities.
Completion requires machine-checkable criteria.
Model reliability is tracked by domain and actual outcomes.
Memory cannot become durable without provenance.
Every action has tamper-evident lineage.
Verification receives more compute when uncertainty or impact rises.
Context usage is optimized as a working-set problem.
Creative candidates are structurally diverse rather than cosmetically varied.
Self-improvement is benchmarked, reversible and independently approved.
Not honestly achievable
Arcana cannot guarantee:
Absolute truth in an open world.
Perfect confidence under every domain shift.
Globally unique ideas.
Exact replay of mutable remote systems.
Correct inference of a person's inner identity.
Safe unrestricted autonomy.
Reliable self-improvement without external criteria.
That passing tests proves the absence of all bugs.
The strongest system is not the one that denies these limits. It is the one that represents them explicitly and behaves safely around them.


⸻


The actual Arcana thesis
Arcana is a proof-bearing agent runtime that converts probabilistic model proposals into governed, evidence-linked, reproducible execution.
Its moat is not:
memory
subagents
daemon
compaction
model switching
Those are becoming standard.
Its moat should be:
typed epistemics
calibrated model trust
proof obligations
capability-secure execution
memory with provenance and revocation
cost-aware context virtualization
independent verification
cryptographically attestable RunProofs
measurable, realization-oriented creativity
The decisive design principle is:
Do not try to make the language model incapable of lying. Build Arcana so that language alone has no authority to establish truth, grant permission, or declare success.
That is technically possible—and it would move Arcana beyond the category of Claude Code, Codex, Hermes and OpenCode rather than merely competing with them feature for feature.
