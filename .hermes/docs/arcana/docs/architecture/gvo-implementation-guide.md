# GVO Implementation Guide for Arcana

**Status:** Implementation guide
**Priority:** High — aligns with Arcana's governed autonomy architecture

---

## 1. Quick Start: GVO-Enhanced Goal

The simplest way to use GVO concepts in Arcana is to enhance the goal system:

### Current Goal System

```typescript
// packages/core/src/session/goal.ts
interface Goal {
  id: string
  objective: string
  maxGoalRounds: number
  status: "active" | "completed" | "blocked"
  completedContinuationRounds: number
}
```

### GVO-Enhanced Goal

```typescript
interface GVOGoal extends Goal {
  // Lineage tracking
  lineage: Array<{
    attempt: number
    code: string
    score: { authorized: boolean; correct: boolean; performance: number }
    timestamp: number
    commitHash?: string
  }>
  
  // Knowledge base
  knowledgeBase: string[]  // Paths to documentation
  
  // Evaluator
  evaluator: (candidate: string) => Promise<{ authorized: boolean; correct: boolean; performance: number }>
  
  // Non-regressing commits
  nonRegressing: boolean
  
  // Supervisor
  supervisor?: {
    stagnationThreshold: number  // Rounds without improvement
    intervention: (lineage: LineageEntry[]) => string[]  // New directions to try
  }
}
```

---

## 2. Implementation Steps

### Step 1: Extend Goal Schema

```typescript
// packages/core/src/session/goal.ts
export const GVOGoalSchema = Schema.Struct({
  ...GoalSchema.fields,
  lineage: Schema.optional(Schema.Array(Schema.Struct({
    attempt: Schema.Number,
    code: Schema.String,
    score: Schema.Struct({
      authorized: Schema.Boolean,
      correct: Schema.Boolean,
      performance: Schema.Number,
    }),
    timestamp: Schema.Number,
    commitHash: Schema.optional(Schema.String),
  }))),
  knowledgeBase: Schema.optional(Schema.Array(Schema.String)),
  nonRegressing: Schema.optional(Schema.Boolean),
  stagnationThreshold: Schema.optional(Schema.Number),
})
```

### Step 2: Add Lineage Tracking

```typescript
// In the goal runner
const addToLineage = (goal: GVOGoal, attempt: LineageEntry) => {
  goal.lineage = [...(goal.lineage ?? []), attempt]
  
  // Non-regressing: only commit if authorized + correct + improvement
  if (goal.nonRegressing) {
    const bestScore = Math.max(...goal.lineage
      .filter(e => e.score.authorized && e.score.correct)
      .map(e => e.score.performance))
    if (attempt.score.authorized && attempt.score.correct && attempt.score.performance >= bestScore) {
      // Commit to git
      const commitHash = commitToGit(attempt.code)
      attempt.commitHash = commitHash
    }
  }
}
```

### Step 3: Add Supervisor Detection

```typescript
// Detect stagnation
const isStagnant = (goal: GVOGoal): boolean => {
  const threshold = goal.stagnationThreshold ?? 5
  const recentAttempts = goal.lineage.slice(-threshold)
  
  if (recentAttempts.length < threshold) return false
  
  // No improvement in last N attempts
  const bestRecent = Math.max(...recentAttempts.map(e => e.score.performance))
  const bestOverall = Math.max(...goal.lineage
    .filter(e => e.score.authorized && e.score.correct)
    .map(e => e.score.performance))
  
  return bestRecent <= bestOverall
}

// Supervisor intervention
const supervisorIntervene = (goal: GVOGoal): string[] => {
  const recentAttempts = goal.lineage.slice(-10)
  
  // Analyze recent attempts
  const strategies = recentAttempts.map(a => extractStrategy(a.code))
  const uniqueStrategies = [...new Set(strategies)]
  
  // Suggest new directions
  return [
    "Try a completely different approach",
    "Look for inspiration in the knowledge base",
    "Revisit an earlier successful attempt",
    "Focus on a different aspect of the problem",
  ]
}
```

### Step 4: Add Knowledge Base Integration

```typescript
// Load domain documentation
const loadKnowledgeBase = async (paths: string[]): Promise<string> => {
  const docs = []
  for (const path of paths) {
    const content = await readFile(path)
    docs.push(content)
  }
  return docs.join("\n\n---\n\n")
}

// Use in goal runner
const knowledgeBase = await loadKnowledgeBase(goal.knowledgeBase ?? [])
```

### Step 5: Add Evaluator Integration

```typescript
// Define evaluator with governance check
const createEvaluator = (testCommand: string, benchmarkCommand: string) => {
  return async (candidate: string): Promise<{ authorized: boolean; correct: boolean; performance: number }> => {
    // Check authorization first (Arcana governance)
    const authorized = await checkAuthorization(candidate)
    if (!authorized) {
      return { authorized: false, correct: false, performance: 0 }
    }
    
    // Write candidate to file
    await writeFile("candidate.ts", candidate)
    
    // Run tests
    const testResult = await exec(testCommand)
    if (testResult.exitCode !== 0) {
      return { authorized: true, correct: false, performance: 0 }
    }
    
    // Run benchmark
    const benchResult = await exec(benchmarkCommand)
    const performance = parseBenchmark(benchResult.stdout)
    
    return { authorized: true, correct: true, performance }
  }
}
```

---

## 3. Complete AVO Goal Runner

```typescript
// packages/engine/src/session/avo-goal-runner.ts
export async function runAVOGoal(goal: AVOGoal): Promise<GoalResult> {
  const evaluator = createEvaluator(goal.testCommand, goal.benchmarkCommand)
  const knowledgeBase = await loadKnowledgeBase(goal.knowledgeBase ?? [])
  
  let currentCode = goal.initialCode
  let round = 0
  
  while (round < goal.maxGoalRounds) {
    // Check for stagnation
    if (isStagnant(goal)) {
      const newDirections = supervisorIntervene(goal)
      // Inject new directions into agent context
      injectContext(newDirections)
    }
    
    // Agent variation step
    const result = await agent.run({
      objective: goal.objective,
      currentCode,
      lineage: goal.lineage,
      knowledgeBase,
      tools: ["read", "edit", "bash", "grep"],
    })
    
    // Evaluate candidate
    const score = await evaluator(result.code)
    
    // Add to lineage
    addToLineage(goal, {
      attempt: round,
      code: result.code,
      score,
      timestamp: Date.now(),
    })
    
    // Update current code if improvement
    if (score.correct && score.performance > getCurrentBest(goal)) {
      currentCode = result.code
    }
    
    round++
  }
  
  return {
    status: "completed",
    bestCode: getBestCode(goal),
    bestScore: getBestScore(goal),
    lineage: goal.lineage,
  }
}
```

---

## 4. Usage Examples

### 4.1 Code Optimization

```typescript
const goal = createGoal({
  objective: "Optimize the spine-mapper.ts performance",
  knowledgeBase: [
    "docs/performance-guide.md",
    "packages/tui/src/shell/command-spine/README.md",
  ],
  testCommand: "bun test packages/tui",
  benchmarkCommand: "bun run benchmark:spine",
  nonRegressing: true,
  stagnationThreshold: 5,
  maxGoalRounds: 50,
})
```

### 4.2 Configuration Tuning

```typescript
const goal = createGoal({
  objective: "Find optimal KV store cache size",
  knowledgeBase: [
    "docs/configuration.md",
    "packages/tui/src/context/kv.tsx",
  ],
  testCommand: "bun test packages/tui",
  benchmarkCommand: "bun run benchmark:kv",
  nonRegressing: true,
  maxGoalRounds: 20,
})
```

### 4.3 Skill Development

```typescript
const goal = createGoal({
  objective: "Develop an optimized code review skill",
  knowledgeBase: [
    "skills/code-review/SKILL.md",
    "docs/skill-development.md",
  ],
  testCommand: "bun test skills/code-review",
  benchmarkCommand: "bun run benchmark:skill",
  nonRegressing: true,
  maxGoalRounds: 30,
})
```

---

## 5. Integration with Arcana's Governance

### 5.1 Authorization as Correctness Gate

```typescript
// In the evaluator
const evaluate = async (candidate: string): Promise<EvaluationResult> => {
  // Check authorization first
  const authorized = await checkAuthorization(candidate)
  if (!authorized) {
    return { correct: false, performance: 0, reason: "unauthorized" }
  }
  
  // Then check correctness
  const correct = await runTests(candidate)
  if (!correct) {
    return { correct: false, performance: 0, reason: "tests failed" }
  }
  
  // Finally measure performance
  const performance = await benchmark(candidate)
  return { correct: true, performance }
}
```

### 5.2 RunProof for Optimization Trajectory

```typescript
// Record each optimization attempt in RunProof
const recordAttempt = async (goal: AVOGoal, attempt: LineageEntry) => {
  await runProof.append({
    sessionId: goal.sessionId,
    actor: { kind: "policy", id: "avo-goal" },
    type: "optimization.attempt",
    payload: {
      goalId: goal.id,
      attempt: attempt.attempt,
      score: attempt.score,
      commitHash: attempt.commitHash,
    },
  })
}
```

### 5.3 Approval Lifecycle for Commits

```typescript
// Use approval lifecycle for non-regressing commits
const commitWithApproval = async (candidate: string, score: Score) => {
  // Create approval request
  const approval = await approvalLifecycle.create({
    sessionId,
    request: {
      action: "git.commit",
      resource: "optimization",
      metadata: { candidate, score },
    },
  })
  
  // Wait for approval (or auto-approve if configured)
  const approved = await approvalLifecycle.wait(approval.id)
  
  if (approved) {
    const commitHash = await git.commit(candidate)
    await approvalLifecycle.consume(approval.id)
    return commitHash
  }
  
  return null
}
```

---

## 6. Testing the Implementation

### 6.1 Unit Tests

```typescript
// packages/core/src/session/avo-goal.test.ts
describe("AVO Goal System", () => {
  it("should track lineage", () => {
    const goal = createAVOGoal({ nonRegressing: true })
    addToLineage(goal, { attempt: 0, code: "...", score: { correct: true, performance: 100 } })
    expect(goal.lineage.length).toBe(1)
  })
  
  it("should detect stagnation", () => {
    const goal = createAVOGoal({ stagnationThreshold: 3 })
    // Add 3 attempts with same score
    expect(isStagnant(goal)).toBe(true)
  })
  
  it("should enforce non-regressing commits", () => {
    const goal = createAVOGoal({ nonRegressing: true })
    addToLineage(goal, { attempt: 0, code: "...", score: { correct: true, performance: 100 } })
    addToLineage(goal, { attempt: 1, code: "...", score: { correct: true, performance: 90 } })
    // Second attempt should not be committed
    expect(goal.lineage[1].commitHash).toBeUndefined()
  })
})
```

### 6.2 Integration Tests

```typescript
// packages/engine/src/session/avo-goal.integration.test.ts
describe("AVO Goal Integration", () => {
  it("should run a complete optimization cycle", async () => {
    const goal = createAVOGoal({
      objective: "Optimize a simple function",
      testCommand: "bun test",
      benchmarkCommand: "bun run benchmark",
      maxGoalRounds: 5,
    })
    
    const result = await runAVOGoal(goal)
    
    expect(result.status).toBe("completed")
    expect(result.lineage.length).toBeGreaterThan(0)
    expect(result.bestScore.performance).toBeGreaterThan(0)
  })
})
```

---

## 7. Performance Considerations

### 7.1 Lineage Size

- Keep lineage bounded (e.g., last 100 attempts)
- Archive older entries to disk
- Use git history as durable storage

### 7.2 Evaluator Efficiency

- Cache test results for identical candidates
- Run benchmarks asynchronously
- Use incremental evaluation when possible

### 7.3 Supervisor Overhead

- Run supervisor check every N rounds (not every round)
- Cache stagnation analysis
- Limit supervisor intervention frequency

---

## 8. Future Extensions

### 8.1 Population-Based AVO

Extend to multiple parallel lineages:
- Island model (independent populations)
- MAP-Elites (feature-based diversity)
- Migration between islands

### 8.2 Multi-Objective Optimization

Support multiple optimization criteria:
- Performance
- Memory usage
- Code complexity
- Test coverage

### 8.3 Transfer Learning

Transfer optimizations across similar problems:
- Cache successful strategies
- Reuse optimization patterns
- Adapt solutions to new contexts

### 8.4 Human-in-the-Loop

Integrate human feedback:
- Review proposed changes
- Provide domain expertise
- Override automated decisions

---

## 9. References

- **AVO Paper:** https://arxiv.org/abs/2603.24517
- **Arcana Goal System:** `packages/core/src/session/goal.ts`
- **RunProof System:** `packages/arcana/src/proof/`
- **Approval Lifecycle:** `packages/core/src/crypto/approval-lifecycle.ts`
