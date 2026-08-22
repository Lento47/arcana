# GVO Key Takeaways for Arcana

**Source:** arXiv:2603.24517v1 (NVIDIA, March 2026) — adapted as GVO for Arcana
**Status:** Key insights for Arcana architecture

---

## 1. The Fundamental Shift

**Traditional approach:**
```
LLM = component called by the search algorithm
```

**GVO approach:**
```
agent = the variation algorithm (governed by Arcana)
```

This is the most important insight: the agent IS the search algorithm, not just a component called by it.

---

## 2. What Makes GVO Work

### 2.1 Executable Ground Truth

Real evaluation (correctness + performance) provides objective feedback, reducing reliance on LLM "belief".

**For Arcana:**
- Use real tests as correctness gates
- Use benchmarks as performance metrics
- Don't rely on LLM self-assessment

### 2.2 Persistent Evolutionary State

Git commits serve as durable evolutionary state:
- Recoverable optimization
- Chronological lineage
- Explicit version-score mapping

**For Arcana:**
- Use git commits for optimization history
- Track scores alongside commits
- Enable rollback to previous versions

### 2.3 Non-Regressing Lineage

Only commit improvements, maintaining monotonic progress.

**For Arcana:**
- Gate commits on performance improvement
- Never regress below best known score
- Use approval lifecycle for commit gating

### 2.4 Supervisor for Long-Running Search

A separate supervisor mechanism prevents:
- Stalling (exhausted current investigation)
- Unproductive cycles (repeated edits without improvement)

**For Arcana:**
- Add stagnation detection to goal system
- Implement supervisor intervention
- Propose fresh directions when plateaued

### 2.5 Knowledge Base Integration

Domain documentation available on demand:
- Technical specifications
- Reference implementations
- API documentation

**For Arcana:**
- Connect documentation to agent context
- Enable on-demand knowledge retrieval
- Use skill system for domain expertise

---

## 3. GVO Architecture for Arcana

### 3.1 Inputs

```text
Lineage (previous attempts + scores)
Knowledge Base (domain documentation)
Evaluator (authorization + correctness + performance)
```

### 3.2 Agent Loop

```text
Plan → Edit → Test → Debug → Revise → Commit (governed)
```

### 3.3 Supervisor

```text
Monitor stagnation → Review trajectory → Propose new directions
```

### 3.4 Output

```text
Accepted candidate (git commit + score + RunProof)
```

---

## 4. Integration Points

### 4.1 Goal System

Extend goals to support:
- Lineage tracking
- Non-regressing commits
- Supervisor detection
- Knowledge base integration

### 4.2 Session System

Use sessions as evolutionary lineages:
- Messages = lineage entries
- Git commits = accepted versions
- RunProof = optimization evidence

### 4.3 Tool System

Tools as variation operator capabilities:
- `read` — inspect prior solutions
- `edit` — implement changes
- `bash` — compile/test/benchmark
- `grep` — search documentation

### 4.4 Proof System

RunProof as optimization evidence:
- Each optimization attempt
- Authorization decisions
- Correctness verification
- Performance measurements

### 4.5 Governance Model

Authorization as correctness gate:
- Unauthorized → score = 0
- Authorized → proceed to optimization

---

## 5. Key Metrics from AVO Paper (Adapted for GVO)

### 5.1 Scale

- 7 days continuous evolution
- 40 committed versions
- 500+ internal optimization directions
- ~30 minutes for adaptation

### 5.2 Optimization Pattern

- Large structural gains early
- Refinement in middle
- Cycle-level tuning late
- Supervisor intervenes on plateau

---

## 6. Implementation Priority

### Phase 1: Foundation (1-2 weeks)

1. Extend goal schema with lineage tracking
2. Add non-regressing commit logic
3. Add stagnation detection

### Phase 2: Integration (2-3 weeks)

1. Connect knowledge base to goals
2. Add evaluator integration
3. Implement supervisor mechanism

### Phase 3: Optimization (3-4 weeks)

1. Add performance benchmarks
2. Implement long-running sessions
3. Add transfer learning

### Phase 4: Production (4-6 weeks)

1. Add human-in-the-loop integration
2. Implement approval lifecycle
3. Add comprehensive testing

---

## 7. Research Questions for Arcana

1. **Goal system integration:** How to best integrate GVO with Arcana's goal system?
2. **Governance alignment:** How to map GVO's correctness gate to Arcana's authorization model?
3. **Session as lineage:** How to use sessions as evolutionary lineages?
4. **Proof integration:** How to capture optimization trajectory in RunProof?
5. **Supervisor design:** What triggers supervisor intervention?
6. **Knowledge base:** What documentation should be included?
7. **Evaluator design:** How to measure correctness and performance?
8. **Non-regressing commits:** How to gate commits on improvement?

---

## 8. Concrete Next Steps

1. **Read the original paper:** https://arxiv.org/abs/2603.24517
2. **Review Arcana's goal system:** `packages/core/src/session/goal.ts`
3. **Review RunProof system:** `packages/arcana/src/proof/`
4. **Design GVO goal schema:** Extend existing goal schema
5. **Implement lineage tracking:** Add to goal runner
6. **Add stagnation detection:** Monitor goal progress
7. **Connect knowledge base:** Link documentation to goals
8. **Test with simple optimization:** Code optimization example
9. **Add supervisor mechanism:** Detect and intervene on stagnation
10. **Integrate with governance:** Map to authorization model

---

## 9. Why This Matters for Arcana

### 9.1 Alignment with Core Mission

Arcana's mission: "The model proposes. The engine decides. The proof records."

GVO's approach: "The agent proposes. The evaluator decides. The lineage records."

These are perfectly aligned.

### 9.2 Governed Autonomy

GVO's non-regressing commits align with Arcana's governance:
- Only commit authorized improvements
- Maintain audit trail
- Preserve correctness guarantees

### 9.3 Long-Running Optimization

GVO enables multi-day optimization sessions:
- Persistent state across restarts
- Continuous evaluation
- Progressive refinement
- Automatic commit of improvements

### 9.4 Measurable Progress

GVO provides objective metrics:
- Authorization verification
- Correctness verification
- Performance measurement
- Optimization trajectory
- Stagnation detection

---

## 10. Bottom Line

GVO turns an autonomous coding agent into the evolutionary variation operator itself, governed by Arcana's authorization model.

The agent receives:
```
lineage + domain knowledge + tools + persistent memory + objective evaluation
```

and autonomously performs:
```
plan → edit → test → profile → debug → revise → commit (governed)
```

over long time horizons.

This is exactly what Arcana's governed autonomy architecture is designed to support.

---

## References

- **Original AVO Paper:** https://arxiv.org/abs/2603.24517
- **Arcana Goal System:** `packages/core/src/session/goal.ts`
- **RunProof System:** `packages/arcana/src/proof/`
- **Approval Lifecycle:** `packages/core/src/crypto/approval-lifecycle.ts`
