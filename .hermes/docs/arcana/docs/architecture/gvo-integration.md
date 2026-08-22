# GVO Integration — Governed Variation Operators for Arcana

**Source:** arXiv:2603.24517v1 (NVIDIA, March 2026) — adapted as GVO for Arcana
**Status:** Research reference — not yet implemented
**Relevance:** High — aligns with Arcana's governed autonomy architecture

---

## 1. Core Concept

GVO (Governed Variation Operators) elevates an autonomous coding agent from "candidate generator" to "the variation operator itself" in evolutionary search, with Arcana's governance model as the correctness gate.

**Traditional LLM-augmented search:**
```
Search framework decides:
  - where to sample
  - when to call LLM
  - what the LLM sees
  - when to evaluate
  - how to update population

LLM does:
  - generate candidate
```

**GVO approach:**
```
Search framework exposes:
  - lineage
  - domain knowledge
  - evaluator
  - tools

Agent decides:
  - what to inspect
  - what to try
  - how to edit
  - when to test
  - how to debug
  - when to change strategy
  - what successful candidate to return

Governance ensures:
  - authorization before execution
  - non-regressing commits
  - audit trail via RunProof
```

---

## 2. Key Architecture

```text
Inputs
├── lineage/population P_t
│   ├── x_1, score(x_1)
│   ├── x_2, score(x_2)
│   └── ...
│
├── knowledge base K
│   ├── domain documentation
│   ├── reference implementations
│   └── technical specifications
│
└── evaluator f
    ├── authorization (hard constraint — Arcana governance)
    ├── correctness (hard constraint)
    └── quality/performance (optimization objective)

                ↓

GVO main agent
├── planning
├── code implementation
├── execution (governed — requires authorization)
├── benchmarking
├── profiling
├── debugging
├── documentation retrieval
├── persistent conversation memory
└── strategy revision

                ↕
        supervisor agent
        └── intervene on stagnation

                ↓

accepted candidate
└── git commit + score + RunProof
```

---

## 3. Key Invariants

### 3.1 Authorization Before Execution (Arcana Governance)
```text
if unauthorized:
    score = 0
    execution blocked
```

### 3.2 Correctness Before Performance
```text
if incorrect:
    score = 0
```

### 3.3 Non-Regressing Committed Lineage
```text
commit(candidate)
only if:
    candidate.authorized
    and candidate.correct
    and candidate.score >= best_committed_score
```

### 3.4 Internal Failures Are Information
- 500+ attempted directions
- Only 40 committed versions
- Failed attempts inform future strategy

### 3.5 Supervisor Intervention
- Monitor stagnation
- Review accumulated trajectory
- Propose fresh optimization directions
- Redirect exploration when plateaued

---

## 4. Relevance to Arcana

### 4.1 Alignment with Arcana's Core Invariant

Arcana's core invariant: `¬Authorized(q) ⇒ ¬Executed(q)`

GVO's correctness-before-performance aligns perfectly:
- Hard constraint: authorization (maps to Arcana governance)
- Hard constraint: correctness (maps to test verification)
- Optimization objective: performance (maps to efficiency)

### 4.2 Goal System Integration

Arcana's goal system (`packages/core/src/session/goal.ts`) could implement GVO-style long-running optimization:

```typescript
// Current goal system
goal = {
  objective: "optimize X",
  maxRounds: 10,
  status: "active"
}

// GVO-enhanced goal
goal = {
  objective: "optimize X",
  lineage: [...previousAttempts],
  knowledgeBase: [...domainDocs],
  evaluator: (candidate) => ({ authorized: bool, correct: bool, score: number }),
  supervisor: stagnationDetector,
  nonRegressing: true,  // Only commit improvements
  persistentMemory: true
}
```

### 4.3 Session as Evolutionary Lineage

Each Arcana session could serve as an evolutionary lineage:
- Session messages = lineage entries
- Git commits = accepted versions
- RunProof = optimization trajectory evidence
- Governance events = decision audit trail

### 4.4 Tool System as Variation Operator

Arcana's tool system provides the capabilities GVO needs:
- `read` — inspect prior solutions
- `edit` — implement changes
- `bash` — compile/test/benchmark
- `grep` — search documentation
- `web_search` — consult external knowledge

### 4.5 Proof System as Optimization Evidence

RunProof could track:
- Each optimization attempt
- Authorization decisions
- Correctness verification
- Performance measurements
- Decision rationale
- Stagnation detection
- Supervisor interventions

---

## 5. Implementation Approach

### 5.1 Phase 1: GVO-Ready Goal System

Extend the goal system to support:
- Lineage tracking (previous attempts and scores)
- Non-regressing commits (only accept improvements)
- Persistent memory across rounds
- Executable evaluator integration

### 5.2 Phase 2: Supervisor Mechanism

Add a supervisor agent that:
- Monitors goal progress
- Detects stagnation (no improvement for N rounds)
- Reviews accumulated trajectory
- Proposes fresh optimization directions
- Redirects exploration when plateaued

### 5.3 Phase 3: Knowledge Base Integration

Connect domain documentation to the agent:
- Technical specifications
- Reference implementations
- API documentation
- Performance benchmarks

### 5.4 Phase 4: Long-Running Autonomous Evolution

Enable multi-day optimization sessions:
- Persistent state across restarts
- Continuous evaluation
- Progressive refinement
- Automatic commit of improvements

---

## 6. Concrete Applications

### 6.1 Code Optimization

Use GVO to optimize Arcana's own code:
- Profile hot paths
- Identify bottlenecks
- Implement optimizations
- Verify correctness
- Measure improvement
- Commit non-regressing changes

### 6.2 Configuration Tuning

Use GVO to tune Arcana's configuration:
- Test different settings
- Measure performance impact
- Find optimal configurations
- Persist best settings

### 6.3 Skill Development

Use GVO to develop and refine skills:
- Start with basic implementation
- Test against benchmarks
- Identify improvements
- Iterate until optimal
- Commit final version

### 6.4 Agent Prompt Optimization

Use GVO to optimize agent prompts:
- Test different prompt strategies
- Measure task completion rates
- Find most effective prompts
- Persist best configurations

---

## 7. Key Takeaways for Arcana

### 7.1 Agent as Variation Operator

The fundamental shift: the agent IS the search algorithm, not just a component called by it.

### 7.2 Executable Ground Truth

Real evaluation (correctness + performance) provides objective feedback, reducing reliance on LLM "belief".

### 7.3 Persistent Evolutionary State

Git commits serve as durable evolutionary state, enabling:
- Recoverable optimization
- Chronological lineage
- Explicit version-score mapping

### 7.4 Supervisor for Long-Running Search

A separate supervisor mechanism prevents:
- Stalling (exhausted current investigation)
- Unproductive cycles (repeated edits without improvement)

### 7.5 Non-Regressing Lineage

Only commit improvements, maintaining monotonic progress under the optimization criterion.

---

## 8. Integration with Arcana's Governance Model

### 8.1 Authorization as Correctness Gate

Arcana's authorization model maps to GVO's correctness constraint:
- Unauthorized action → score = 0 (analogous to incorrect → score = 0)
- Authorized action → proceed to optimization

### 8.2 RunProof as Optimization Evidence

RunProof captures:
- Each optimization attempt
- Authorization decisions
- Execution results
- Performance measurements

### 8.3 Approval Lifecycle as Commit Gate

The approval lifecycle ensures:
- Only authorized optimizations are committed
- Operator oversight for high-risk changes
- Audit trail for all decisions

---

## 9. Research Questions

1. **Search efficiency:** How many LLM calls/dollars/joules vs human experts?
2. **Model dependence:** Does GVO work with weaker models?
3. **Supervisor ablation:** How much does the supervisor contribute?
4. **Memory ablation:** How much does persistent memory help?
5. **Knowledge-base ablation:** What happens without domain docs?
6. **Population-level GVO:** Would branching/island versions outperform single lineage?
7. **Cross-domain transfer:** Can GVO transfer to non-GPU domains?

---

## 10. References

- **Original AVO Paper:** https://arxiv.org/abs/2603.24517
- **PDF:** https://arxiv.org/pdf/2603.24517
- **FlashAttention-4:** https://arxiv.org/abs/2603.05451
- **AlphaEvolve:** https://arxiv.org/abs/2506.13131
- **TTT-Discover:** https://arxiv.org/abs/2601.16175
- **Arcana Goal System:** `packages/core/src/session/goal.ts`
- **RunProof System:** `packages/arcana/src/proof/`
