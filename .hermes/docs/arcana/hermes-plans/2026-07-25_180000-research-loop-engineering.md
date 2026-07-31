# Arcana Research Loop — Phase 1 Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Demonstrate that Arcana autonomously generates, executes, evaluates, and improves real candidates, using at least two genuinely concurrent search strategies, while producing exact token records for completed proposals (provider-reported, with cost when available; aborted partial proposals use best-effort accounting), live TUI events, and a machine-checkable success certificate on a reproducible benchmark.

**Architecture:** A `packages/loop/` module with a real `CandidateProposer` adapter around Arcana's existing agent runner, hardened verifier with structured metric output, metric-aware portfolio scheduler with genuine bounded concurrency, live `LoopEvent` stream via existing session sync, and a reproducible Python benchmark testbed.

**Tech Stack:** TypeScript (Bun), Arcana monorepo, `@arcana/agent` runner, `@arcana/memory`, `@arcana/engine` proxy client. Benchmark in Python 3.

---

## Regression Analysis

**REG-1: Legacy single-trajectory consumers.** Arcana's CLI `run` command and cron/script callers expect `runner.ts` to accept a conversation and return a final answer. Adding multi-trajectory search changes return type and timing semantics.
**Fix (addressed):** Loop is an independent module (`packages/loop/`). No modification to `runner.ts`. The `loop` CLI command is a separate entry point. Legacy callers are untouched.

**REG-2: Tool budget counters assume single serial trajectory.** `maxToolRounds`, `maxToolsPerSession`, `maxWebFetchesPerSession`, `maxTokensPerSession` are counted against one conversation. A portfolio with N concurrent lanes would multiply tool usage.
**Fix (addressed):** Each lane receives a `CandidateBudget` derived from `contract.budget / portfolioActiveLanes`. The scheduler enforces aggregate budget across all lanes. Lane budgets are pre-allocated, not dynamically shared. See Milestone C tasks C1-C6.

**REG-3: Stream consumers expect sequential turn ordering.** The TUI's session stream expects messages in order. Parallel lanes produce interleaved output.
**Fix (addressed):** Loop output is multiplexed through a `LoopEvent` stream. The TUI renders events per-lane (not as a single chat stream). See Task 10A.

**REG-4: Rate limits are per-API-key.** Parallel lanes hitting the same proxy key may trigger rate limits. Existing `RateLimiter` in guard.ts is in-process only.
**Fix (addressed):** `SchedulerLimits` enforces `requestsPerMinute` and `tokensPerMinute` caps. `maxConcurrentAgents` defaults to 2 (safe for typical rate limits). All values are configurable. See Task C2.

**REG-5: Skill payload duplication.** Each lane loads skills independently. Without deduplication, skill text appears N times.
**Fix (deferred to Milestone C):** Skill payload consolidation requires a shared prefix construction across lanes. Phase 1 (B1) runs single-lane; Milestone C portfolio adds explicit `stablePrefix` field to `ProposalRequest` and constructs it once per generation round.

**REG-6: Contract references unknown verifier IDs.** A contract may reference a verifier that doesn't exist on the user's machine.
**Fix (addressed):** Contract compilation validates metrics against the metric registry. Verifier IDs are validated at execution time by `verifierRegistry.resolve()`, which returns a `missing` list. Missing verifiers produce a `kind: "blocked"` terminal certificate with evidence listing the missing IDs.

**REG-7: Candidate workspace collision.** Concurrent processes may create the same timestamp-based ID.
**Fix (addressed):** Workspace creation uses `randomUUID()` for unique IDs. `mkdirSync` with empty directory is atomic. A collision requires ~2^122 attempts; no retry loop is implemented — if collision occurs, the process fails with an unambiguous error.

---

## Architecture

```
Arcana CLI: loop <contract.json>
   │
   ▼
Loop Controller (state machine)
   │
   ├──► Contract Compiler ────► Metric Registry
   │       validates + registers metrics
   │
   ├──► Portfolio Scheduler
   │       semaphore-gated concurrency
   │       rate-limit-aware
   │       ├── Exploit lane: improve incumbent using failure evidence
   │       ├── Explore lane: generate structurally different candidates
   │       └── Repair lane: fix smoke/unit/safety failures
   │            │
   │            ▼
   │       Arcana Runner (real LLM + tools)
   │            │
   │            ▼
   │       Isolated Candidate Workspace
   │            │
   │            ▼
   │       Hardened Verifier ───► Trusted Benchmark ───► Metric Parser
   │            │
   │            ▼
   │       Frontier + Event Log
   │            │
   │            ├──► TUI (LoopEvent stream via session sync)
   │            ├──► Checkpoint (disk persistence)
   ├──► Completion Certificate (hash-bound evidence, optionally signed)
```

---

## Milestone A — Executable Proof Path (Tasks 1-6)

**Goal:** A manually constructed candidate can go through the full verification pipeline and produce a valid certificate. No AI yet. This validates the contract system, verifier, and metric evaluation are correct.

### Task 1: Create benchmark testbed and metric registry

**Objective:** Create a reproducible Python benchmark. The evaluator runs candidates in subprocess isolation (NOT in-process `exec_module`). Full sandboxing (namespaces, cgroups, CAP_DROP) is deferred to Phase 2 — Phase 1 uses process-level isolation with empty environment. The evaluator root is NEVER present in the candidate workspace. Note: `env={}` does not disable filesystem or network access; this is "process-isolated," not "sandboxed."

**Files:**
- Create: `benchmarks/python-hotloop/` directory tree with evaluator root separated from candidate seed
- Create: `packages/loop/src/metrics/registry.ts`
- Create: `packages/loop/src/metrics/registry.test.ts`

**Step 1: Create benchmark directory structure with seed/ and evaluator/**

```
benchmarks/python-hotloop/
├── seed/                        # copied into candidate workspaces
│   ├── solution.py              # baseline (slow) implementation
│   └── visible/
│       └── test_correctness.py
├── evaluator/                   # trusted — NEVER in candidate workspace
│   ├── holdout/
│   │   └── test_hidden_cases.py
│   ├── runner/
│   │   └── runner.py
│   └── metric.schema.json
├── optimized/
│   └── solution.py              # known-good O(n) solution (for manual testing)
└── contract.json
```

The seed directory is created by Task A1. Candidate workspaces receive only `seed/` contents. The evaluator directory contains holdout tests and the benchmark runner — never copied to candidate workspaces.

The baseline `solution.py` should implement a deliberately inefficient algorithm, e.g.:

```python
# baseline/solution.py — O(n²) deliberate inefficiency
def deduplicate_and_sort(items: list[int]) -> list[int]:
    result = []
    for item in items:
        if item not in result:  # O(n) scan per item
            result.append(item)
    return sorted(result)
```

The optimized `solution.py` should implement the same semantics correctly:

```python
# optimized/solution.py — O(n log n) correct version
def deduplicate_and_sort(items: list[int]) -> list[int]:
    return sorted(set(items))
```

The hidden test cases exercise edge cases the candidate can't see: empty list, single element, all duplicates, negative numbers, large input, etc.

**Step 2: Create metric schema**

```json
// benchmarks/python-hotloop/metric.schema.json
{
  "schema": "arcana.metric.v1",
  "description": "Python hotloop benchmark metrics",
  "metrics": {
    "correctness": {
      "direction": "maximize",
      "unit": "ratio",
      "range": [0, 1],
      "parser": "json"
    },
    "runtime_ms_p50": {
      "direction": "minimize",
      "unit": "ms",
      "parser": "json"
    },
    "runtime_ms_p95": {
      "direction": "minimize",
      "unit": "ms",
      "parser": "json"
    }
  },
  "required_metrics": ["correctness", "runtime_ms_p95"]
}
```

**Step 3: Create benchmark runner**

```python
# benchmarks/python-hotloop/runner/runner.py
"""
Trusted evaluator — runs candidates in process-isolated subprocesses.
The evaluator NEVER imports candidate code. All communication is
via subprocess stdin/stdout with resource limits.
"""
import sys, json, subprocess, os
from pathlib import Path

EVALUATOR_ROOT = Path(__file__).resolve().parents[1]  # benchmarks/python-hotloop/evaluator/
VISIBLE_TESTS = EVALUATOR_ROOT.parent / "seed" / "visible" / "test_correctness.py"  # seed tests
HOLDOUT_TESTS = EVALUATOR_ROOT / "holdout" / "test_hidden_cases.py"  # holdout tests

# Hardcoded binary paths resolved at evaluator install time (Task 1 setup)
PYTHON_BINARY = "python"  # or absolute path from discovery

def run_benchmark(candidate_dir: str) -> dict:
    """Run correctness and performance tests in process-isolated subprocesses."""
    # Correctness: visible + holdout — each in isolated subprocess
    visible_ok = run_pytest(str(VISIBLE_TESTS), candidate_dir)
    holdout_ok = run_pytest(str(HOLDOUT_TESTS), candidate_dir)
    correctness = 1.0 if (visible_ok and holdout_ok) else 0.0

    # Performance: measure in process-isolated subprocess
    samples = 30
    warmups = 5
    times = []
    for _ in range(samples + warmups):
        result = subprocess.run(
            [PYTHON_BINARY, "-c", PERF_SCRIPT],
            capture_output=True, text=True, timeout=10,
            cwd=candidate_dir,
            env={},  # no inherited env
        )
        if result.returncode == 0:
            times.append(float(result.stdout.strip()))

    if len(times) < samples:
        return {"schema": "arcana.metric.v1", "metrics": {"correctness": 0, "runtime_ms_p50": -1, "runtime_ms_p95": -1}, "samples": 0, "warmups": 0, "error": "perf_script_failed"}

    times = times[warmups:]
    times.sort()
    return {
        "schema": "arcana.metric.v1",
        "metrics": {
            "correctness": correctness,
            "runtime_ms_p50": times[len(times) // 2],
            "runtime_ms_p95": times[int(len(times) * 0.95)],
        },
        "samples": samples,
        "warmups": warmups,
    }

PERF_SCRIPT = """
import timeit
import os
os.environ.clear()  # no inherited env in perf subprocess
def fn(x): return sorted(set(x))  # placeholder — actual fn loaded from candidate
# The candidate provides solution.py; we measure import + call overhead
t = timeit.Timer(
    "from solution import deduplicate_and_sort; deduplicate_and_sort(list(range(1000,0,-1)))"
)
print(t.timeit(number=100) * 1000 / 100)
"""

def run_pytest(test_path: str, candidate_dir: str) -> bool:
    """Run pytest in a process-isolated subprocess. Candidate code is imported
    via PYTHONPATH, not via exec_module in the evaluator process."""
    env = {}  # sanitized — no inherited env
    env["PYTHONPATH"] = str(candidate_dir)
    result = subprocess.run(
        [PYTHON_BINARY, "-m", "pytest", test_path, "-q", "--tb=short"],
        cwd=str(EVALUATOR_ROOT),
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
    )
    return result.returncode == 0

if __name__ == "__main__":
    candidate_dir = sys.argv[1]
    print(json.dumps(run_benchmark(candidate_dir)))
```

**Step 4: Create contract.json**

```json
{
  "goal": "Optimize deduplicate_and_sort to reduce p95 runtime while preserving correctness",
  "success": {
    "all": [
      { "metric": "correctness", "operator": "eq", "target": 1 },
      { "metric": "runtime_ms_p95", "operator": "lte", "target": 25 }
    ]
  },
  "budget": {
    "maxTrials": 50,
    "maxTokens": 500000,
    "maxWallTimeSec": 600
  },
  "verifier": {
    "benchmark": "python-hotloop-v1"
  }
}
```

**Step 5: Create metric registry**

```typescript
// packages/loop/src/metrics/registry.ts

export type MetricDirection = "minimize" | "maximize"

export interface MetricDefinition {
  id: string
  direction: MetricDirection
  unit: string
  parser: "json" | "number" | "regex"
  /** If set, values outside this range are invalid */
  range?: [number, number]
}

export interface MetricRegistry {
  register(def: MetricDefinition): void
  get(id: string): MetricDefinition | undefined
  list(): MetricDefinition[]
  validateMetrics(metricIds: string[]): { valid: string[]; missing: string[] }
}

export function createMetricRegistry(): MetricRegistry {
  const metrics = new Map<string, MetricDefinition>()

  return {
    register(def) {
      if (metrics.has(def.id)) throw new Error(`Metric "${def.id}" already registered`)
      metrics.set(def.id, def)
    },
    get(id) { return metrics.get(id) },
    list() { return [...metrics.values()] },
    validateMetrics(metricIds) {
      const valid: string[] = []
      const missing: string[] = []
      for (const id of metricIds) {
        if (metrics.has(id)) valid.push(id)
        else missing.push(id)
      }
      return { valid, missing }
    },
  }
}
```

**Step 6: Verify manually**

Run the benchmark against the baseline and optimized candidates:

```bash
cd benchmarks/python-hotloop
python evaluator/runner/runner.py seed/
# Expected: correctness=1, runtime_ms_p95 ~high number (>40)
python evaluator/runner/runner.py optimized/
# Expected: correctness=1, runtime_ms_p95 ~low number (<8)
```

**Step 7: Commit**

```bash
git add benchmarks/python-hotloop/ packages/loop/src/metrics/registry.ts
git commit -m "feat(loop): benchmark testbed with metric registry"
```

---

### Task 2: Create isolated candidate workspaces from candidate seed

**Objective:** Build an immutable workspace system. Each candidate is created from a minimal seed (solution.py + visible/ tests only). The parent workspace is NEVER modified in place — every proposal gets a fresh child. Holdout tests and the evaluator runner are NEVER present in the candidate workspace.

**Files:**
- Create: `packages/loop/src/workspace.ts`
- Create: `packages/loop/src/workspace.test.ts`

**Step 1: Write workspace.ts**

```typescript
import { mkdirSync, cpSync, rmSync, existsSync } from "node:fs"
import { resolve, join, basename } from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { tmpdir } from "node:os"
import { execFileSync } from "node:child_process"

export interface CandidateWorkspace {
  candidateId: string
  root: string
  parentId: string | null  // null for baseline
  seedRevision: string
  artifactHash: string  // hash of all candidate files after proposal
  patchHash: string     // git diff from parent or seed
}

export interface WorkspaceManager {
  /** Create baseline from seed directory (solution.py + visible/ only) */
  createBaseline(seedDir: string, seedRevision: string): Promise<CandidateWorkspace>
  /** Fork a child from an immutable parent */
  fork(params: { parent: CandidateWorkspace; candidateId: string }): Promise<CandidateWorkspace>
  /** Compute artifact hash from workspace files and patch hash from git diff */
  finalize(ws: CandidateWorkspace): Promise<CandidateWorkspace>
  destroy(ws: CandidateWorkspace): Promise<void>
  getAll(): CandidateWorkspace[]
  exists(candidateId: string): boolean
}

export function createWorkspaceManager(
  options: { sharedRoot?: string; seedDir: string },
): WorkspaceManager {
  const root = options.sharedRoot ?? join(tmpdir(), "arcana-candidates")
  const seedDir = options.seedDir
  if (!existsSync(seedDir)) throw new Error(`Seed directory does not exist: ${seedDir}`)
  mkdirSync(root, { recursive: true })
  const active = new Map<string, CandidateWorkspace>()

  function computeDirHash(dir: string): string {
    return createHash("sha256").update(
      execFileSync("git", ["-C", dir, "diff", "--binary", "HEAD"], {
        encoding: "utf-8",
        shell: false,
        timeout: 5000,
      })
    ).digest("hex").slice(0, 16)
  }

  async function createBaseline(seedDirOverride: string, seedRevision: string): Promise<CandidateWorkspace> {
    const candidateId = `candidate-baseline-${randomUUID()}`
    const wsRoot = join(root, candidateId)

    // Atomic creation
    mkdirSync(wsRoot, { recursive: false })

    // Copy seed: solution.py + visible/ only
    // Holdout/ and runner/ are NEVER present
    const files = ["solution.py"]
    const dirs = ["visible"]
    for (const f of files) {
      const src = join(seedDir, f)
      if (existsSync(src)) cpSync(src, join(wsRoot, f))
    }
    for (const d of dirs) {
      const src = join(seedDir, d)
      if (existsSync(src)) cpSync(src, join(wsRoot, d), { recursive: true })
    }

    // Init git for tracking changes
    execFileSync("git", ["init"], { cwd: wsRoot, stdio: "pipe", shell: false })
    execFileSync("git", ["-C", wsRoot, "add", "."], { stdio: "pipe", shell: false })
    execFileSync("git", ["-C", wsRoot, "commit", "-m", `seed:${seedRevision}`], { stdio: "pipe", shell: false })

    const ws: CandidateWorkspace = {
      candidateId,
      root: wsRoot,
      parentId: null,
      seedRevision,
      artifactHash: "",
      patchHash: "",
    }
    active.set(candidateId, ws)
    return ws
  }

  async function fork(params: {
    parent: CandidateWorkspace
    candidateId: string
  }): Promise<CandidateWorkspace> {
    const wsRoot = join(root, params.candidateId)
    mkdirSync(wsRoot, { recursive: false })

    // Copy parent files — every child descends from a parent (baseline is root)
    cpSync(params.parent.root, wsRoot, { recursive: true })

    // Init or re-init git
    if (existsSync(join(wsRoot, ".git"))) {
      rmSync(join(wsRoot, ".git"), { recursive: true, force: true })
    }
    execFileSync("git", ["init"], { cwd: wsRoot, stdio: "pipe", shell: false })
    execFileSync("git", ["-C", wsRoot, "add", "."], { stdio: "pipe", shell: false })
    execFileSync("git", ["-C", wsRoot, "commit", "-m", `fork:${params.parent?.candidateId ?? "seed"}`], {
      stdio: "pipe", shell: false,
    })

    const ws: CandidateWorkspace = {
      candidateId: params.candidateId,
      root: wsRoot,
      parentId: params.parent?.candidateId ?? null,
      seedRevision: params.parent?.seedRevision ?? "",
      artifactHash: "",
      patchHash: "",
    }
    active.set(params.candidateId, ws)
    return ws
  }

  async function finalize(ws: CandidateWorkspace): Promise<CandidateWorkspace> {
    // Stage ALL files including newly created ones, then hash
    execFileSync("git", ["-C", ws.root, "add", "-A"], {
      stdio: "pipe", shell: false, timeout: 5000,
    })
    const patch = execFileSync("git", ["-C", ws.root, "diff", "--cached", "--binary", "HEAD"], {
      encoding: "utf-8", shell: false, timeout: 5000,
    })
    ws.patchHash = createHash("sha256").update(patch).digest("hex").slice(0, 16)

    // Single hash object — build everything before final digest
    const artifactHasher = createHash("sha256")
    artifactHasher.update(patch)

    const listing = execFileSync("git", ["-C", ws.root, "ls-files"], {
      encoding: "utf-8", shell: false, timeout: 5000,
    })
    for (const file of listing.trim().split("\n").filter(Boolean).sort()) {
      artifactHasher.update(file)
      artifactHasher.update(require("node:fs").readFileSync(join(ws.root, file)))
    }

    const parent = ws.parentId ? active.get(ws.parentId) : undefined
    if (parent?.artifactHash) {
      artifactHasher.update(`parent:${parent.artifactHash}`)
    }

    ws.artifactHash = artifactHasher.digest("hex").slice(0, 16)
    return ws
  }

  async function destroy(ws: CandidateWorkspace): Promise<void> {
    rmSync(ws.root, { recursive: true, force: true })
    active.delete(ws.candidateId)
  }

  return {
    createBaseline,
    fork,
    finalize,
    destroy,
    getAll: () => [...active.values()],
    exists: (id) => active.has(id),
  }
}
```

**Step 2: Write workspace.test.ts (updated for new API)**

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { createWorkspaceManager } from "./workspace.js"
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("WorkspaceManager", () => {
  let seedDir: string
  let wm: ReturnType<typeof createWorkspaceManager>

  beforeEach(() => {
    seedDir = mkdtempSync(join(tmpdir(), "arcana-test-seed-"))
    // Create minimal seed: solution.py + visible/
    writeFileSync(join(seedDir, "solution.py"), "def fn(): pass\n")
    mkdirSync(join(seedDir, "visible"))
    writeFileSync(join(seedDir, "visible", "test_correctness.py"), "def test(): pass\n")
    wm = createWorkspaceManager({ seedDir })
  })

  afterEach(() => {
    for (const ws of wm.getAll()) wm.destroy(ws)
    rmSync(seedDir, { recursive: true, force: true })
  })

  test("creates baseline from seed dir", async () => {
    const ws = await wm.createBaseline(seedDir, "v1")
    expect(ws.candidateId).toContain("baseline")
    expect(ws.parentId).toBeNull()
    expect(ws.seedRevision).toBe("v1")
  })

  test("fork creates child from parent", async () => {
    const parent = await wm.createBaseline(seedDir, "v1")
    const child = await wm.fork({ parent, candidateId: "c1" })
    expect(child.candidateId).toBe("c1")
    expect(child.parentId).toBe(parent.candidateId)
    // Child has same files as parent
    const { readFileSync } = await import("node:fs")
    expect(readFileSync(join(child.root, "solution.py"), "utf-8")).toContain("def fn()")
  })

  test("fork always requires a parent", async () => {
    const parent = await wm.createBaseline(seedDir, "v1")
    const child = await wm.fork({ parent, candidateId: "c-required" })
    expect(child.parentId).toBe(parent.candidateId)
  })

  test("finalize computes hashes including newly created files", async () => {
    const ws = await wm.createBaseline(seedDir, "v1")
    // Simulate agent creating a new file
    writeFileSync(join(ws.root, "utils.py"), "def helper(): pass\n")
    const finalized = await wm.finalize(ws)
    expect(finalized.artifactHash).toBeTruthy()
    expect(finalized.patchHash).toBeTruthy()
    // artifactHash should differ from an unmodified baseline
    const ws2 = await wm.createBaseline(seedDir, "v1")
    const finalized2 = await wm.finalize(ws2)
    expect(finalized.artifactHash).not.toBe(finalized2.artifactHash)
  })

  test("destroy removes workspace", async () => {
    const ws = await wm.createBaseline(seedDir, "v1")
    await wm.destroy(ws)
    expect(wm.exists(ws.candidateId)).toBe(false)
  })

  test("exists returns false for unknown IDs", () => {
    expect(wm.exists("nonexistent")).toBe(false)
  })
})
```

Note: The commit message should say "via copy-and-init" not "via git worktrees." Removed references to `wm.applyPatch()`, `wm.computePatchHash()`, and `ws.baseRevision`. All tests target the current API: `createBaseline`, `fork`, `finalize`, `destroy`, `exists`.

**Step 3: Commit**

```bash
git add packages/loop/src/workspace.ts packages/loop/src/workspace.test.ts
git commit -m "feat(loop): isolated candidate workspaces via copy-and-init from seed directory"
```

---

### Task 3: Create hardened verifier and metric evaluator

**Objective:** Build the verifier that runs candidates through benchmark stages, parses structured JSON output, and evaluates predicates against the contract.

**Files:**
- Create: `packages/loop/src/verifier/executor.ts`
- Create: `packages/loop/src/verifier/predicate.ts`
- Create: `packages/loop/src/verifier/index.ts`
- Create: `packages/loop/src/verifier/executor.test.ts`
- Create: `packages/loop/src/verifier/predicate.test.ts`

**Step 1: Write predicate evaluator**

```typescript
// packages/loop/src/verifier/predicate.ts

import type { MetricRegistry } from "../metrics/registry.js"

export type ComparisonOp = "lt" | "lte" | "gt" | "gte" | "eq"

export interface MetricPredicate {
  metric: string
  operator: ComparisonOp
  target: number
}

export interface CompoundPredicate {
  all?: MetricPredicate[]
  any?: MetricPredicate[]
}

export type Predicate = MetricPredicate | CompoundPredicate

export function isCompoundPredicate(p: Predicate): p is CompoundPredicate {
  return "all" in p || "any" in p
}

export function evaluatePredicate(
  predicate: Predicate,
  metrics: Record<string, number>,
  registry: MetricRegistry,
): { satisfied: boolean; failures: string[] } {
  if (isCompoundPredicate(predicate)) {
    return evaluateCompound(predicate, metrics, registry)
  }
  return evaluateSingle(predicate, metrics, registry)
}

function evaluateSingle(
  p: MetricPredicate,
  metrics: Record<string, number>,
  registry: MetricRegistry,
): { satisfied: boolean; failures: string[] } {
  const value = metrics[p.metric]
  if (value === undefined) return { satisfied: false, failures: [`missing metric: ${p.metric}`] }

  const def = registry.get(p.metric)
  if (def?.range && (value < def.range[0] || value > def.range[1])) {
    return { satisfied: false, failures: [`${p.metric}=${value} out of range [${def.range[0]}, ${def.range[1]}]`] }
  }

  let satisfied = false
  switch (p.operator) {
    case "lt":  satisfied = value < p.target; break
    case "lte": satisfied = value <= p.target; break
    case "gt":  satisfied = value > p.target; break
    case "gte": satisfied = value >= p.target; break
    case "eq":  satisfied = value === p.target; break
  }

  return satisfied
    ? { satisfied: true, failures: [] }
    : { satisfied: false, failures: [`${p.metric}=${value} ${p.operator} ${p.target} → false`] }
}

function evaluateCompound(
  p: CompoundPredicate,
  metrics: Record<string, number>,
  registry: MetricRegistry,
): { satisfied: boolean; failures: string[] } {
  const failures: string[] = []

  if (p.all) {
    let allSatisfied = true
    for (const sub of p.all) {
      const r = evaluateSingle(sub, metrics, registry)
      if (!r.satisfied) {
        allSatisfied = false
        failures.push(...r.failures)
      }
    }
    if (!allSatisfied) return { satisfied: false, failures }
  }

  if (p.any) {
    let anySatisfied = false
    const anyFailures: string[] = []
    for (const sub of p.any) {
      const r = evaluateSingle(sub, metrics, registry)
      if (r.satisfied) anySatisfied = true
      else anyFailures.push(...r.failures)
    }
    if (!anySatisfied) {
      failures.push(...anyFailures)
      return { satisfied: false, failures }
    }
  }

  return { satisfied: true, failures: [] }
}

export function validatePredicate(
  predicate: Predicate,
  registry: MetricRegistry,
): { valid: boolean; missing: string[] } {
  const metricIds: string[] = []
  collectMetricIds(predicate, metricIds)
  const { missing } = registry.validateMetrics(metricIds)
  return { valid: missing.length === 0, missing }
}

function collectMetricIds(p: Predicate, out: string[]): void {
  if (isCompoundPredicate(p)) {
    if (p.all) for (const sub of p.all) out.push(sub.metric)
    if (p.any) for (const sub of p.any) out.push(sub.metric)
  } else {
    out.push(p.metric)
  }
}
```

**Step 2: Write hardened verifier executor**

```typescript
// packages/loop/src/verifier/executor.ts

import { execFileSync } from "node:child_process"
import type { CandidateWorkspace } from "../workspace.js"

export type VerificationFailure =
  | "execution_failed"
  | "timeout"
  | "invalid_metric_output"
  | "missing_metric"
  | "correctness_failed"
  | "objective_not_satisfied"
  | "safety_failed"

export interface StageResult {
  stageId: string
  executionStatus: "completed" | "timeout" | "crashed"
  outputStatus: "valid" | "invalid"
  metrics: Record<string, number>
  rawOutput?: string
  error?: string
}

export interface ExecutableSpec {
  binary: string
  args: string[]
  timeoutMs: number
  outputParser: "json" | "number" | "regex"
  requiredMetrics: string[]
}

export interface VerifierConfig {
  stages: Record<string, ExecutableSpec>
}

export function createVerifierExecutor(config: VerifierConfig) {
  async function execute(stageId: string, workspace: CandidateWorkspace, abortSignal?: AbortSignal): Promise<StageResult> {
    const spec = config.stages[stageId]
    if (!spec) throw new Error(`Unknown verifier stage: ${stageId}`)

    try {
      const { execFile } = await import("node:child_process")
      const args = [...spec.args, workspace.root]

      const stdout = await new Promise<string>((resolve, reject) => {
        const child = execFile(spec.binary, args, {
          encoding: "utf-8",
          timeout: spec.timeoutMs,
          cwd: workspace.root,
          env: {},
          shell: false,
          maxBuffer: 1024 * 1024,
          killSignal: "SIGKILL",
          signal: abortSignal,  // wired: abort kills the child
        })
        let out = ""
        child.stdout?.on("data", (chunk: string) => { out += chunk })
        child.on("error", reject)
        child.on("close", (code: number | null) => {
          if (code === 0) resolve(out.trim())
          else reject(new Error(`exit ${code}`))
        })
      })

      const metrics = parseMetrics(stdout, spec)
      if (!metrics) {
        return { stageId, executionStatus: "completed", outputStatus: "invalid", metrics: {}, rawOutput: stdout, error: "invalid_metric_output" }
      }

      const missing = spec.requiredMetrics.filter((m) => !(m in metrics))
      if (missing.length > 0) {
        return { stageId, executionStatus: "completed", outputStatus: "invalid", metrics, error: `missing_metric: ${missing.join(", ")}` }
      }

      return { stageId, executionStatus: "completed", outputStatus: "valid", metrics }
    } catch (err: any) {
      if (err.killed || (err.signal && err.signal === "SIGKILL")) {
        return { stageId, executionStatus: "timeout", outputStatus: "invalid", metrics: {}, error: "timeout" }
      }
      return { stageId, executionStatus: "crashed", outputStatus: "invalid", metrics: {}, error: err.stderr?.toString() ?? err.message ?? "execution_failed" }
    }
  }

  return { execute }
}

function parseMetrics(raw: string, spec: ExecutableSpec): Record<string, number> | null {
  try {
    if (spec.outputParser === "json") {
      const obj = JSON.parse(raw)
      if (!obj.metrics || typeof obj.metrics !== "object") return null
      const result: Record<string, number> = {}
      for (const [key, val] of Object.entries(obj.metrics)) {
        if (typeof val !== "number" || !isFinite(val)) return null
        result[key] = val
      }
      return result
    }
    if (spec.outputParser === "number") {
      const n = parseFloat(raw)
      if (isNaN(n) || !isFinite(n)) return null
      return { value: n }
    }
    return null
  } catch {
    return null
  }
}
```

**Step 3: Write tests**

```typescript
// packages/loop/src/verifier/predicate.test.ts
import { describe, test, expect } from "bun:test"
import { evaluatePredicate, validatePredicate, type Predicate } from "./predicate.js"
import { createMetricRegistry } from "../metrics/registry.js"

const registry = createMetricRegistry()
registry.register({ id: "correctness", direction: "maximize", unit: "ratio", parser: "json", range: [0, 1] })
registry.register({ id: "runtime_ms_p95", direction: "minimize", unit: "ms", parser: "json" })

describe("evaluatePredicate", () => {
  test("passes when metric satisfies predicate", () => {
    const p: Predicate = { metric: "correctness", operator: "eq", target: 1 }
    const r = evaluatePredicate(p, { correctness: 1 }, registry)
    expect(r.satisfied).toBe(true)
  })

  test("fails when metric doesn't satisfy predicate", () => {
    const p: Predicate = { metric: "runtime_ms_p95", operator: "lte", target: 25 }
    const r = evaluatePredicate(p, { runtime_ms_p95: 40 }, registry)
    expect(r.satisfied).toBe(false)
  })

  test("all: requires all sub-predicates", () => {
    const p: Predicate = {
      all: [
        { metric: "correctness", operator: "eq", target: 1 },
        { metric: "runtime_ms_p95", operator: "lte", target: 25 },
      ],
    }
    const r = evaluatePredicate(p, { correctness: 0.5, runtime_ms_p95: 20 }, registry)
    expect(r.satisfied).toBe(false)
    expect(r.failures).toHaveLength(1)
  })

  test("any: passes if one sub-predicate passes", () => {
    const p: Predicate = {
      any: [
        { metric: "correctness", operator: "eq", target: 1 },
        { metric: "runtime_ms_p95", operator: "lte", target: 25 },
      ],
    }
    const r = evaluatePredicate(p, { correctness: 0, runtime_ms_p95: 20 }, registry)
    expect(r.satisfied).toBe(true)
  })
})

describe("validatePredicate", () => {
  test("detects missing metrics", () => {
    const p: Predicate = { metric: "nonexistent", operator: "gt", target: 0 }
    const r = validatePredicate(p, registry)
    expect(r.valid).toBe(false)
    expect(r.missing).toContain("nonexistent")
  })
})
```

**Step 4: Commit**

```bash
git add packages/loop/src/verifier/ packages/loop/src/metrics/
git commit -m "feat(loop): hardened verifier executor and metric predicate evaluator"
```

---

### Task 4: Create contract compiler and validation

**Objective:** Build the contract pipeline: parse raw JSON → validate against registry → produce validated `ObjectiveContract`.

**Files:**
- Create: `packages/loop/src/contract.ts`
- Create: `packages/loop/src/contract.test.ts`

```typescript
// packages/loop/src/contract.ts

import type { Predicate } from "./verifier/predicate.js"
import { validatePredicate } from "./verifier/predicate.js"
import type { MetricRegistry } from "./metrics/registry.js"

export interface BudgetConfig {
  maxTrials: number
  maxTokens: number
  maxWallTimeSec: number
}

export interface ObjectiveContract {
  goal: string
  success: Predicate
  budget: BudgetConfig
  verifier: Record<string, string> // stage-id → verifier-name
}

export type ContractError =
  | { kind: "missing_field"; field: string }
  | { kind: "invalid_predicate"; missing: string[] }
  | { kind: "invalid_budget"; field: string; value: unknown }
  | { kind: "missing_verifier"; verifierId: string }

export function compileContract(
  raw: Record<string, unknown>,
  registry: MetricRegistry,
): { contract: ObjectiveContract } | { error: ContractError } {
  const goal = String(raw.goal ?? "").trim()
  if (!goal) return { error: { kind: "missing_field", field: "goal" } }

  const success = raw.success as Predicate | undefined
  if (!success) return { error: { kind: "missing_field", field: "success" } }

  const predCheck = validatePredicate(success, registry)
  if (!predCheck.valid) return { error: { kind: "invalid_predicate", missing: predCheck.missing } }

  const budget = raw.budget as Record<string, unknown> | undefined
  if (!budget) return { error: { kind: "missing_field", field: "budget" } }
  const maxTrials = Number(budget.maxTrials)
  const maxTokens = Number(budget.maxTokens)
  const maxWallTimeSec = Number(budget.maxWallTimeSec)
  if (!isFinite(maxTrials) || maxTrials <= 0) return { error: { kind: "invalid_budget", field: "maxTrials", value: budget.maxTrials } }
  if (!isFinite(maxTokens) || maxTokens <= 0) return { error: { kind: "invalid_budget", field: "maxTokens", value: budget.maxTokens } }
  if (!isFinite(maxWallTimeSec) || maxWallTimeSec <= 0) return { error: { kind: "invalid_budget", field: "maxWallTimeSec", value: budget.maxWallTimeSec } }

  const verifier = raw.verifier as Record<string, string> | undefined
  if (!verifier || Object.keys(verifier).length === 0) {
    return { error: { kind: "missing_verifier", verifierId: "(none)" } }
  }

  return {
    contract: {
      goal,
      success,
      budget: { maxTrials, maxTokens, maxWallTimeSec },
      verifier,
    },
  }
}
```

**Step 2: Write tests, then commit**

```bash
git add packages/loop/src/contract.ts packages/loop/src/contract.test.ts
git commit -m "feat(loop): contract compiler with metric validation"
```

---

### Task 5: Wire verifier registry and connect to benchmark

**Objective:** Register `python-hotloop-v1` as a verifier in the system and validate a manually constructed candidate earns a success certificate.

**Files:**
- Create: `packages/loop/src/verifier/registry.ts`
- Create: `packages/loop/src/index.ts` (updated exports)

**Step 1: Create verifier registry**

```typescript
// packages/loop/src/verifier/registry.ts

import type { ExecutableSpec } from "./executor.js"

export interface VerifierEntry {
  name: string
  spec: ExecutableSpec
}

export function createVerifierRegistry() {
  const verifiers = new Map<string, VerifierEntry>()

  function register(name: string, spec: ExecutableSpec): void {
    verifiers.set(name, { name, spec })
  }

  function resolve(stageConfig: Record<string, string>): { resolved: Record<string, ExecutableSpec>; missing: string[] } {
    const resolved: Record<string, ExecutableSpec> = {}
    const missing: string[] = []
    for (const [stage, name] of Object.entries(stageConfig)) {
      const entry = verifiers.get(name)
      if (entry) resolved[stage] = entry.spec
      else missing.push(name)
    }
    return { resolved, missing }
  }

  function list(): string[] { return [...verifiers.keys()] }

  return { register, resolve, list }
}
```

**Step 2: Register the hotloop benchmark**

In `index.ts` or a separate `builtins.ts`:

```typescript
import { createVerifierRegistry } from "./verifier/registry.js"

export const builtinVerifiers = createVerifierRegistry()

builtinVerifiers.register("python-hotloop-v1", {
  binary: "python",
  args: [resolve(import.meta.dirname, "../../../benchmarks/python-hotloop/evaluator/runner/runner.py")],
  timeoutMs: 60_000,
  outputParser: "json",
  requiredMetrics: ["correctness", "runtime_ms_p95"],
})
```

**Step 3: Verify manually**

Create a test that:
1. Compiles the contract from `benchmarks/python-hotloop/contract.json`
2. Creates an isolated workspace from the optimized candidate
3. Runs the verifier
4. Evaluates the success predicate
5. Asserts `satisfied === true`

**Step 4: Commit**

```bash
git add packages/loop/src/verifier/registry.ts packages/loop/src/index.ts
git commit -m "feat(loop): verifier registry with python-hotloop benchmark"
```

---

### Task 6: Create completion certificate system

**Objective:** Issue signed, evidence-bearing certificates — NOT the broken impossibility claims from the original plan.

**Files:**
- Create: `packages/loop/src/certificate.ts`
- Create: `packages/loop/src/certificate.test.ts`

```typescript
// packages/loop/src/certificate.ts

import { createHash, createHmac } from "node:crypto"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import type { StageResult } from "./verifier/executor.js"
import type { ObjectiveContract } from "./contract.js"

export type CertificateKind =
  | "success"
  | "budget_exhausted_unresolved"
  | "interrupted"
  | "blocked"
Certificates are always hash-bound (eventLogHash) and optionally signed (signatureStatus). The certificate's `eventLogHash` covers the in-memory event log up to but NOT including the `certificate.issued` event itself. D4 verifies the hash against this prefix.

export interface CompletionCertificate {
  schema: "arcana.completion.v1"
  kind: CertificateKind
  contractHash: string
  candidateId?: string
  candidateArtifactHash?: string
  parentArtifactHash?: string
  baseRevision: string

  /** Terminal-state evidence (e.g. missing verifiers, deployment failure) */
  evidence?: {
    code: string
    message: string
    details?: Record<string, unknown>
  }

  verification: {
    verifierVersion: string
    stages: StageResult[]
    metrics: Record<string, number>
    holdoutDigest?: string
    evaluatorArtifactHash?: string
  }

  usage: {
    trials: number
    modelCalls: number
    uncachedInputTokens: number
    cachedInputTokens: number
    outputTokens: number
    verifierWallTimeSeconds: number
    wallTimeSeconds: number
    providerCostUsd?: number
    costSource?: "provider_reported" | "calculated" | "unavailable"
  }
  eventLogHash: string
  issuedAt: string
  /** HMAC-SHA256 signature over JSON, using ~/.arcana/loop/signing-key */
  signature?: string
  /** Whether a signature is present: "signed" | "unsigned" (no key file) */
  signatureStatus: "signed" | "unsigned"
}

export function issueSuccessCertificate(params: {
  contract: ObjectiveContract
  candidateId: string
  artifactHash: string
  baseRevision: string
  stages: StageResult[]
  metrics: Record<string, number>
  usage: CompletionCertificate["usage"]
  eventLogHash: string
}): CompletionCertificate {
  return signCertificate({
    schema: "arcana.completion.v1",
    kind: "success",
    contractHash: hashContract(params.contract),
    candidateId: params.candidateId,
    candidateArtifactHash: params.artifactHash,
    baseRevision: params.baseRevision,
    verification: {
      verifierVersion: "1.0.0",
      stages: params.stages,
      metrics: params.metrics,
    },
    usage: params.usage,
    eventLogHash: params.eventLogHash,
    issuedAt: new Date().toISOString(),
  }
}

export function issueTerminalCertificate(params: {
  kind: "budget_exhausted_unresolved" | "interrupted" | "blocked"
  contract: ObjectiveContract
  baseRevision: string
  usage: CompletionCertificate["usage"]
  eventLogHash: string
  evidence?: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
  stages?: StageResult[]
  metrics?: Record<string, number>
}): CompletionCertificate {
  return signCertificate({
    schema: "arcana.completion.v1",
    kind: params.kind,
    contractHash: hashContract(params.contract),
    baseRevision: params.baseRevision,
    evidence: params.evidence,
    verification: {
      verifierVersion: "1.0.0",
      stages: params.stages ?? [],
      metrics: params.metrics ?? {},
    },
    usage: params.usage,
    eventLogHash: params.eventLogHash,
    issuedAt: new Date().toISOString(),
  }
}

function signCertificate(cert: Omit<CompletionCertificate, "signature" | "signatureStatus">): CompletionCertificate {
  const keyPath = join(homedir(), ".arcana", "loop", "signing-key")
  if (!existsSync(keyPath)) return { ...cert, signatureStatus: "unsigned" }
  const key = readFileSync(keyPath, "utf-8").trim()
  if (!key) return { ...cert, signatureStatus: "unsigned" }
  const hmac = createHmac("sha256", key)
  hmac.update(JSON.stringify(cert))
  return { ...cert, signature: hmac.digest("hex"), signatureStatus: "signed" }
}

function hashContract(contract: ObjectiveContract): string {
  return createHash("sha256").update(JSON.stringify(contract)).digest("hex")
}
```

**Step 2: Write tests**

```bash
git add packages/loop/src/certificate.ts packages/loop/src/certificate.test.ts
git commit -m "feat(loop): evidence-bearing completion certificate issuer"
```

**Milestone A gate:** Run `bun test` — all tests pass. A manually constructed candidate (optimized `solution.py`) earns a `kind: "success"` certificate. Baseline candidate earns `kind: "budget_exhausted_unresolved"` (no impossibility claim without proof).

---

### Task 7: Discover and freeze the Arcana runner integration contract

**Objective:** Before writing the proposer adapter, discover the actual runner API surface. This task is a prerequisite for all autonomous work. Do NOT proceed to Task 8 until this task is complete.

**Files:**
- Create: `packages/loop/src/proposer/runner-api.md` (documentation)
- Create: `packages/loop/src/proposer/runner-adapter.ts` (typed wrapper)

**Step 1: Discover the runner's public API**

```bash
# Find exported symbols from the agent package
rg -n "export (async )?(function|const|class)|export \{" packages/arcana/src/agent/

# Find the key integration points
rg -n "runner|generateText|streamText|toolCall|usage|onEvent|cwd|workdir|onStepFinish" \
  packages/arcana/src/agent/ --include '*.ts'
```

Document the discovered API surface:

```typescript
// packages/loop/src/proposer/runner-api.md

/**
 * Arcana Runner Integration Contract (discovered from packages/arcana/src/agent/runner.ts)
 *
 * Integration point: <actual export name> from <actual module path>
 *
 * Input shape:
 *   - provider: string (e.g. "anthropic", "openai")
 *   - model: string
 *   - system: string
 *   - messages: ChatMessage[]
 *   - tools: ToolDef[]
 *   - maxSteps: number
 *   - onStepFinish?: (event: StepResult) => void
 *
 * Output shape:
 *   - text: string
 *   - steps: StepResult[]
 *     Each step has:
 *       - text: string
 *       - toolCalls: ToolCall[]
 *       - toolResults: ToolResult[]
 *       - usage: { promptTokens, completionTokens }
 *       - finishReason: string
 *       - providerMetadata?: { ... }
 */
```

**Step 2: Write the typed adapter wrapper**

```typescript
// packages/loop/src/proposer/runner-adapter.ts

import type { ToolDef, ChatMessage } from "@arcana/agent/types.js"
// The actual import path and symbol are discovered in Step 1
// import { <actualRunnerFunction> } from "@arcana/agent/runner.js"

export interface RunnerInput {
  provider: string
  model: string
  system: string
  messages: ChatMessage[]
  tools: ToolDef[]
  maxSteps: number
  workdir: string
  abortSignal?: AbortSignal
  onEvent?: (event: StepResult) => void
}

export interface StepResult {
  text: string
  toolCalls: { name: string; args: Record<string, unknown>; id: string }[]
  toolResults: { id: string; name: string; output: string }[]
  usage: {
    inputTokens: number
    cachedInputTokens?: number
    outputTokens: number
    reasoningTokens?: number
  }
  finishReason: string
}

export interface RunnerOutput {
  text: string
  steps: StepResult[]
  totalUsage: {
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
    reasoningTokens: number
    providerCostUsd?: number
  }
}
```

**Step 3: Write a fake-provider integration test**

```typescript
// packages/loop/src/proposer/runner-adapter.test.ts
import { describe, test, expect } from "bun:test"

describe("RunnerAdapter", () => {
  test("invokes real runner with fake provider", async () => {
    // Use a local-only provider or mock that doesn't require API keys
    // Verify the adapter can call, receive tool results, and capture usage
  })

  test("tool call modifies workspace directory", async () => {
    // Create temp workspace, run adapter, verify file was written
  })

  test("usage metadata is captured from response", async () => {
    // Verify inputTokens, cachedInputTokens, outputTokens are present
  })

  test("abortSignal cancels active tool loop", async () => {
    // Start a slow loop, abort mid-execution, verify clean exit
  })

  test("runner events are forwarded to event sink", async () => {
    // Register onEvent handler, verify events arrive during execution
  })
})
```

**Step 4: Validate all checks pass**

1. The imported runner symbol exists → confirmed by grep
2. Real TypeScript signature documented → in runner-api.md
3. Fake-provider integration test invokes it → passes
4. Tool call modifies temp workspace → passes
5. Usage metadata captured → passes
6. Cancellation reaches active loop → passes
7. Runner events forwarded to sink → passes

**Step 5: Commit**

```bash
git add packages/loop/src/proposer/
git commit -m "feat(loop): frozen runner integration contract with typed adapter"
```

**Milestone B0 gate:** All 7 checks pass. The runner API is documented and verified. The adapter is tested with a fake provider (no API keys required).

---

## Milestone B1 — Autonomous Single-Lane Loop (Tasks 8-11)

**Goal:** Arcana's agent runner proposes real code changes through workspace-scoped tools. A single-lane loop autonomously modifies code and improves the benchmark metric. Real token accounting and live TUI events are captured.

### Task 8: Build CandidateProposer with workspace tool scope

**Objective:** Build the REAL candidate proposer using the verified runner adapter from Task 7. Every file operation is scoped to the candidate workspace. No absolute paths, no escape, no symlink traversal. The proposer receives workspace-scoped tools and reports exact usage.

**Files:**
- Create: `packages/loop/src/proposer/index.ts`
- Create: `packages/loop/src/proposer/scope.ts` (WorkspaceToolScope)
- Create: `packages/loop/src/proposer/index.test.ts`

**Step 1: Implement WorkspaceToolScope**

```typescript
// packages/loop/src/proposer/scope.ts

import { resolve, relative, sep, isAbsolute } from "node:path"
import { realpathSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { execFileSync } from "node:child_process"
import type { CandidateWorkspace } from "../workspace.js"

export interface ScopedCommand {
  executableId: "python" | "pytest" | "git" | "bun"
  args: string[]
  timeoutMs: number
  abortSignal?: AbortSignal
}

export interface ScopedCommandResult {
  stdout: string
  stderr: string
  exitCode: number
  timedOut: boolean
}

export interface WorkspaceToolScope {
  root: string
  /** Signal set by proposer before each call */
  abortSignal?: AbortSignal
  read(relativePath: string): Promise<string>
  write(relativePath: string, content: string): Promise<void>
  edit(relativePath: string, patchLines: string[]): Promise<void>
  execute(command: ScopedCommand): Promise<ScopedCommandResult>
}

/** Allowed executables with their binary paths. pytest is resolved to python -m pytest. */
const ALLOWED_BINARIES: Record<string, string> = {
  python: "python",
  pytest: "python",
  git: "git",
  bun: "bun",
}

function resolveCommand(command: ScopedCommand): { binary: string; args: string[] } {
  if (command.executableId === "pytest") {
    return { binary: ALLOWED_BINARIES["python"], args: ["-m", "pytest", ...command.args] }
  }
  return { binary: ALLOWED_BINARIES[command.executableId], args: command.args }
}

export function createWorkspaceToolScope(workspace: CandidateWorkspace): WorkspaceToolScope {
  const root = resolve(workspace.root)

  function assertWorkspacePath(requestedPath: string): string {
    if (isAbsolute(requestedPath)) {
      throw new Error("Absolute paths are not permitted in workspace")
    }
    const normalized = requestedPath.replace(/\\/g, "/")
    if (normalized.split("/").some((part) => part === "..")) {
      throw new Error("Path escapes candidate workspace")
    }
    const candidate = resolve(root, normalized)
    const rel = relative(root, candidate)
    if (rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new Error("Path escapes candidate workspace")
    }

    // BUGFIX: separate existing-file check from new-file check
    const { existsSync, realpathSync } = require("node:fs") as typeof import("node:fs")

    if (existsSync(candidate)) {
      // Existing file: verify canonical path is inside root
      const canonical = realpathSync(candidate)
      const realRoot = realpathSync(root)
      if (!canonical.startsWith(realRoot + sep) && canonical !== realRoot) {
        throw new Error(`Symlink escapes candidate workspace: ${requestedPath}`)
      }
    } else {
      // New file: verify nearest existing parent is inside root
      let parent = resolve(candidate, "..")
      while (!existsSync(parent) && parent !== resolve(parent, "..")) {
        parent = resolve(parent, "..")
      }
      const canonicalParent = realpathSync(parent)
      const realRoot = realpathSync(root)
      if (!canonicalParent.startsWith(realRoot + sep) && canonicalParent !== realRoot) {
        throw new Error(`Parent directory escapes candidate workspace: ${requestedPath}`)
      }
    }
    return candidate
  }

  return {
    root,
    async read(relativePath) {
      const abs = assertWorkspacePath(relativePath)
      return readFileSync(abs, "utf-8")
    },
    async write(relativePath, content) {
      const abs = assertWorkspacePath(relativePath)
      mkdirSync(resolve(abs, ".."), { recursive: true })
      writeFileSync(abs, content, "utf-8")
    },
    async edit(relativePath, patchLines) {
      const abs = assertWorkspacePath(relativePath)
      const existing = readFileSync(abs, "utf-8")
      const patched = applyPatch(existing, patchLines)
      writeFileSync(abs, patched, "utf-8")
    },
    async execute(command) {
      const { binary, args } = resolveCommand(command)
      const { execFile } = await import("node:child_process")
      return new Promise<ScopedCommandResult>((resolve) => {
        const child = execFile(binary, args, {
          encoding: "utf-8",
          timeout: command.timeoutMs,
          cwd: root,
          env: {},
          shell: false,
          maxBuffer: 1024 * 1024,
          killSignal: "SIGKILL",
          signal: command.abortSignal,  // wired: abort kills the tool process
        })
        let stdout = ""
        let stderr = ""
        child.stdout?.on("data", (chunk: string) => { stdout += chunk })
        child.stderr?.on("data", (chunk: string) => { stderr += chunk })
        child.on("error", (err) => resolve({ stdout, stderr: err.message, exitCode: 1, timedOut: false }))
        child.on("close", (code: number | null, signal: string | null) => {
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: code ?? (signal ? 1 : 0),
            timedOut: signal === "SIGKILL" || child.killed,
          })
        })
      })
    },
  }
}

function applyPatch(original: string, lines: string[]): string {
  // Simple line-based patch for tool calls — full git apply is in workspace.ts
  const result = original.split("\n")
  for (const line of lines) {
    const parts = line.match(/^(\d+)?\s*(.*)/)
    if (!parts) continue
    const idx = parseInt(parts[1]) - 1
    const content = parts[2]
    if (!isNaN(idx) && idx >= 0 && idx < result.length) {
      result[idx] = content
    }
  }
  return result.join("\n")
}
```

**Step 2: Implement the proposer using the workspace scope**

```typescript
// packages/loop/src/proposer/index.ts

import type { CandidateWorkspace } from "../workspace.js"
import type { ObjectiveContract } from "../contract.js"
import type { StageResult } from "../verifier/executor.js"
import type { LoopEventSink } from "../events.js"
import type { RunnerInput, RunnerOutput, StepResult } from "./runner-adapter.js"
import { createWorkspaceToolScope, type WorkspaceToolScope } from "./scope.js"

export interface UsageReceipt {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningTokens?: number
  /** Provider-reported cost in USD. Source: provider_reported | calculated | unavailable */
  providerCostUsd?: number
  costSource?: "provider_reported" | "calculated" | "unavailable"
}

// Phase 1 promises provider-reported token usage. Cost is reported when the
// provider returns pricing metadata; otherwise tagged "unavailable."
// "Exact cost" is a Phase 2 feature requiring a pricing-table hash.

export interface ToolReceipt {
  toolName: string
  calls: number
  inputTokens: number
  outputTokens: number
}

export interface ProposalRequest {
  contract: ObjectiveContract
  strategy: "exploit" | "explore" | "repair"
  parent: CandidateWorkspace | null
  frontierMetrics: Record<string, number> | null
  failureEvidence: StageResult[] | null
  budget: CandidateBudget
  workspace: CandidateWorkspace
  abortSignal?: AbortSignal
}

export interface CandidateBudget {
  maxToolRounds: number
  maxTokens: number
  maxWallTimeSec: number
}

export interface ProposalResult {
  candidate: CandidateWorkspace
  rationaleDigest: string
  changedFiles: string[]
  usage: UsageReceipt
  toolReceipts: ToolReceipt[]
  /** Number of distinct model invocations (LLM turns, not tool calls) */
  modelCalls: number
}

export interface CandidateProposer {
  propose(request: ProposalRequest, onStepTokens?: (tokens: number) => void): Promise<ProposalResult>
}

export function createArcanaProposer(config: {
  provider: string
  model: string
  runAgent: (input: RunnerInput) => Promise<RunnerOutput>
  events?: LoopEventSink
}): CandidateProposer {
  async function propose(
    request: ProposalRequest,
    onStepTokens?: (tokens: number) => void,
  ): Promise<ProposalResult> {
    const scope = createWorkspaceToolScope(request.workspace)
    scope.abortSignal = request.abortSignal  // propagate cancellation
    const systemPrompt = buildSystemPrompt(request, scope)
    const userPrompt = buildUserPrompt(request)

    const toolDefs = buildWorkspaceToolDefs(scope)

    const result = await config.runAgent({
      provider: config.provider,
      model: config.model,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      tools: toolDefs,
      maxSteps: request.budget.maxToolRounds,
      workdir: request.workspace.root,
      abortSignal: request.abortSignal,
      onEvent: (step: StepResult) => {
        // Report tokens for budget enforcement
        onStepTokens?.(step.usage.inputTokens + step.usage.outputTokens)
        config.events?.emit({
          type: "proposal.step",
          candidateId: request.workspace.candidateId,
          toolCalls: step.toolCalls.map((t) => t.name),
        })
      },
    })

    const changedFiles = extractChangedFiles(scope, request.workspace)
    const toolReceipts = buildToolReceipts(result.steps)

    return {
      candidate: request.workspace,
      rationaleDigest: result.text.slice(0, 500),
      changedFiles,
      usage: {
        inputTokens: result.totalUsage.inputTokens,
        cachedInputTokens: result.totalUsage.cachedInputTokens,
        outputTokens: result.totalUsage.outputTokens,
        reasoningTokens: result.totalUsage.reasoningTokens,
        providerCostUsd: result.totalUsage.providerCostUsd,
        costSource:
          result.totalUsage.providerCostUsd !== undefined
            ? "provider_reported"
            : "unavailable",
      },
      toolReceipts,
      modelCalls: result.steps.length,  // authoritative: actual LLM invocations
    }
  }

  return { propose }
}

function buildWorkspaceToolDefs(scope: WorkspaceToolScope): any[] {
  // Tool definitions with handlers bound directly to workspace scope.
  // The Arcana runner calls execute() with parsed arguments.
  // This structure MUST match whatever the B0 runner discovery finds.
  // If the runner uses separate schema+handler objects, use that format.
  return [
    {
      name: "read_file",
      description: "Read a file in the candidate workspace. Only relative paths starting from the workspace root are allowed.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path to file in workspace" },
        },
        required: ["path"],
      },
      execute: async (input: { path: string }) => scope.read(input.path),
    },
    {
      name: "write_file",
      description: "Write content to a file in the candidate workspace. Creates parent directories. Only relative paths allowed.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path to file in workspace" },
          content: { type: "string", description: "File content" },
        },
        required: ["path", "content"],
      },
      execute: async (input: { path: string; content: string }) => scope.write(input.path, input.content),
    },
    {
      name: "execute",
      description: "Execute a command inside the candidate workspace. Only python, pytest, git, and bun are allowed. Working directory is the workspace root.",
      parameters: {
        type: "object",
        properties: {
          executable: {
            type: "string",
            enum: ["python", "pytest", "git", "bun"],
          },
          args: {
            type: "array",
            items: { type: "string" },
            description: "Command arguments",
          },
        },
        required: ["executable", "args"],
      },
      execute: async (input: { executable: string; args: string[] }) =>
        scope.execute({ executableId: input.executable as any, args: input.args, timeoutMs: 30_000, abortSignal: scope.abortSignal }),
    },
  ]
}

function buildSystemPrompt(request: ProposalRequest, scope: WorkspaceToolScope): string {
  const blocks: string[] = [
    `You are a Python optimization engineer working in an isolated workspace at ${scope.root}.

## Objective
${request.contract.goal}

## Success Criteria
${JSON.stringify(request.contract.success, null, 2)}

## Constraints
- You can ONLY access files inside the workspace directory via the provided tools
- You can ONLY run python, pytest, git, and bun
- Do not use network access — network use is prohibited by policy
  (Phase 1 uses process isolation; executed programs are not technically restricted)
- You CANNOT access holdout tests or evaluation data
  (Phase 1 enforces this via workspace setup, not OS-level isolation)
- Write correct, performant code that passes visible tests

## Budget
- Max ${request.budget.maxToolRounds} tool calls
- Max ${request.budget.maxWallTimeSec} seconds wall time

## Strategy
You are running in ${request.strategy} mode.`,
  ]

  if (request.frontierMetrics) {
    blocks.push(`## Current Best Scores
${Object.entries(request.frontierMetrics).map(([k, v]) => `- ${k}: ${v}`).join("\n")}`)
  }

  if (request.failureEvidence?.length) {
    blocks.push(`## Previous Failures
${request.failureEvidence.map((s) => `- ${s.stageId}: ${s.error ?? "unknown"}`).join("\n")}`)
  }

  return blocks.join("\n\n")
}

function buildUserPrompt(request: ProposalRequest): string {
  if (request.strategy === "exploit" && request.frontierMetrics) {
    return `Improve the current best solution. The best p95 runtime is ${request.frontierMetrics.runtime_ms_p95 ?? "unknown"} ms. Read the current solution.py, identify the bottleneck, and implement a faster version while preserving correctness.`
  }
  if (request.strategy === "explore") {
    return "Generate a structurally different approach. Try a completely different algorithm, data structure, or optimization strategy. Do not iterate on the current solution — start fresh."
  }
  if (request.strategy === "repair" && request.failureEvidence) {
    return `Fix the failures from the previous attempt:\n${request.failureEvidence.map((s) => `- ${s.stageId}: ${s.error}`).join("\n")}\n\nRun the visible tests with: execute(pytest, ["visible/test_correctness.py", "-v"])`
  }
  return "Implement a correct solution that meets the success criteria. Start by reading the existing solution.py, then edit it to be faster while passing all visible tests."
}

function extractChangedFiles(scope: WorkspaceToolScope, workspace: CandidateWorkspace): string[] {
  try {
    const { execFileSync } = require("node:child_process")
    const output = execFileSync("git", ["-C", workspace.root, "diff", "--name-only", "HEAD"], {
      encoding: "utf-8",
      timeout: 5000,
      shell: false,
    })
    return output.trim().split("\n").filter(Boolean)
  } catch {
    return ["solution.py"] // fallback
  }
}

function buildToolReceipts(steps: StepResult[]): ToolReceipt[] {
  const byName = new Map<string, { calls: number; inputTokens: number; outputTokens: number }>()
  for (const step of steps) {
    for (const call of step.toolCalls) {
      const existing = byName.get(call.name) ?? { calls: 0, inputTokens: 0, outputTokens: 0 }
      existing.calls++
      byName.set(call.name, existing)
    }
  }
  return [...byName.entries()].map(([toolName, data]) => ({
    toolName,
    calls: data.calls,
    inputTokens: data.inputTokens,
    outputTokens: data.outputTokens,
  }))
}
```

**Step 3: Write proposer tests**

```typescript
// packages/loop/src/proposer/index.test.ts
// Test that the workspace scope prevents:
// - Absolute paths (should throw)
// - Path traversal (../../../ should throw)
// - Symlink escapes (canonical path mismatch should throw)
// - Executing unlisted binaries (should throw)
// - Network access (not applicable in execFile with empty env)
```

**Step 4: Commit**

```bash
git add packages/loop/src/proposer/
git commit -m "feat(loop): workspace-scoped proposer with path containment and executable allowlist"
```

---

### Task 8A: Create event sink infrastructure

**Objective:** Define the `LoopEventSink` interface and implement composite, log, and NDJSON sinks. Every loop component receives the sink and emits structured events before any execution.

**Files:**
- Create: `packages/loop/src/events.ts`
- Create: `packages/loop/src/events.test.ts`

**Step 1: Define event types and sink interface**

```typescript
// packages/loop/src/events.ts

import type { CompletionCertificate } from "./certificate.js"
import type { StageResult } from "./verifier/executor.js"
import type { UsageReceipt } from "./proposer/index.js"
import type { AggregateUsage } from "./controller.js"

export type LoopEvent =
  | { type: "loop.started"; contractHash: string }
  | { type: "lane.started"; laneId: string; strategy: string }
  | { type: "lane.completed"; laneId: string; result: "success" | "exhausted" | "cancelled" }
  | { type: "proposal.started"; laneId: string; candidateId: string; strategy: string }
  | { type: "proposal.completed"; laneId: string; candidateId: string; changedFiles: number; additions: number; deletions: number }
  | { type: "proposal.step"; candidateId: string; toolCalls: string[] }
  | { type: "verification.started"; laneId: string; candidateId: string; stage: string }
  | { type: "verification.completed"; laneId: string; candidateId: string; stage: string; status: "pass" | "fail" | "error"; metric?: number }
  | { type: "frontier.updated"; incumbentId: string; metrics: Record<string, number> }
  | { type: "budget.updated"; usage: AggregateUsage }
  | { type: "lane.stalled"; laneId: string; reason: string }
  | { type: "loop.checkpointed"; checkpointId: string }
  | { type: "certificate.issued"; certificate: CompletionCertificate }
  | { type: "loop.error"; error: string }

export interface LoopEventSink {
  emit(event: LoopEvent): void | Promise<void>
}

export function createEventLogSink(log: { events: LoopEvent[] }): LoopEventSink {
  return {
    emit(event) {
      log.events.push(event)
    },
  }
}

export function createNdjsonEventSink(stream: NodeJS.WritableStream): LoopEventSink {
  return {
    emit(event) {
      stream.write(JSON.stringify(event) + "\n")
    },
  }
}

export function createCompositeEventSink(sinks: LoopEventSink[]): LoopEventSink {
  return {
    async emit(event) {
      for (const sink of sinks) {
        await sink.emit(event)
      }
    },
  }
}

// NOTE: createSessionLoopEventSink lives in tui-bridge.ts — not here.
// Generic event sinks only. Session-specific adapters belong in tui-bridge.
```

**Step 2: Wire event sink into controller config**

```typescript
export interface ControllerConfig {
  contract: ObjectiveContract
  registry: MetricRegistry
  verifierConfig: VerifierConfigExec
  workspaceManager: WorkspaceManager
  proposer: CandidateProposer
  seedDir: string
  seedRevision: string
  maxLanes: number
  events: LoopEventSink  // <-- mandatory
}
```

The controller emits every significant state change through the sink. Events are recorded in memory before being forwarded. Durable disk persistence begins in D1.

**Step 3: Commit**

```bash
git add packages/loop/src/events.ts packages/loop/src/events.test.ts
git commit -m "feat(loop): event sink infrastructure with composite, log, NDJSON, and session sinks"
```

---

### Task 9: Create controller with event sink and immutable candidates

**Objective:** Build the loop controller that uses the event sink (not direct log pushes), forks immutable child workspaces (never mutates parent), and correctly tracks frontier state across iterations.

**Files:**
- Create: `packages/loop/src/controller.ts`

**Step 1: Write controller.ts**

```typescript
// packages/loop/src/controller.ts

import type { ObjectiveContract } from "./contract.js"
import type { CandidateProposer, ProposalRequest, CandidateBudget } from "./proposer/index.js"
import type { CandidateWorkspace, WorkspaceManager } from "./workspace.js"
import type { CompletionCertificate } from "./certificate.js"
import { issueSuccessCertificate, issueTerminalCertificate } from "./certificate.js"
import { createVerifierExecutor, type VerifierConfig as VerifierConfigExec, type StageResult } from "./verifier/executor.js"
import { evaluatePredicate } from "./verifier/predicate.js"
import type { MetricRegistry } from "./metrics/registry.js"
import type { LoopEventSink, LoopEvent } from "./events.js"
import { createHash, randomUUID } from "node:crypto"

export type { LoopEvent, LoopEventSink } from "./events.js"

export interface AggregateUsage {
  trials: number
  modelCalls: number
  uncachedInputTokens: number
  cachedInputTokens: number
  outputTokens: number
  verifierWallTimeSeconds: number  // wall-clock verifier duration; actual CPU deferred to Phase 2
  wallTimeSeconds: number
  providerCostUsd?: number
  costSource?: "provider_reported" | "calculated" | "unavailable"
}

export interface ControllerConfig {
  contract: ObjectiveContract
  registry: MetricRegistry
  verifierConfig: VerifierConfigExec
  workspaceManager: WorkspaceManager
  proposer: CandidateProposer
  seedDir: string
  seedRevision: string
  maxLanes: number
  events: LoopEventSink
}

export interface Frontier {
  incumbent: CandidateWorkspace | null
  incumbentMetrics: Record<string, number> | null
  rejectedHashes: Set<string>
}

/** Single event path — records in-memory before forwarding. Durable disk persistence begins in D1. */
async function emit(config: ControllerConfig, event: LoopEvent, log: { events: LoopEvent[] }): Promise<void> {
  log.events.push(event)  // in-memory log (not durable until D1)
  await config.events.emit(event)
}

export function createEventLog(): { events: LoopEvent[]; hash(): string } {
  const events: LoopEvent[] = []
  return {
    events,
    hash() {
      return createHash("sha256").update(events.map((e) => JSON.stringify(e)).join("\n")).digest("hex")
    },
  }
}

export async function runLoop(config: ControllerConfig): Promise<{
  certificate: CompletionCertificate
  events: LoopEvent[]
}> {
  const log = createEventLog()
  const verifier = createVerifierExecutor(config.verifierConfig)
  const startTime = Date.now()

  const usage: AggregateUsage = {
    trials: 0, modelCalls: 0,
    uncachedInputTokens: 0, cachedInputTokens: 0, outputTokens: 0,
    verifierWallTimeSeconds: 0, wallTimeSeconds: 0,
  }

  const frontier: Frontier = {
    incumbent: null,
    incumbentMetrics: null,
    rejectedHashes: new Set(),
  }

  const contractHash = createHash("sha256").update(JSON.stringify(config.contract)).digest("hex")
  await emit(config, { type: "loop.started", contractHash }, log)

  // Create baseline workspace from seed and finalize immediately
  const baselineDraft = await config.workspaceManager.createBaseline(config.seedDir, config.seedRevision)
  const baseline = await config.workspaceManager.finalize(baselineDraft)
  // baseline.artifactHash is now available for all subsequent forks

  let iteration = 0
  while (true) {
    iteration++
    const elapsed = (Date.now() - startTime) / 1000
    usage.wallTimeSeconds = elapsed

    // Check budget
    if (usage.trials >= config.contract.budget.maxTrials ||
        usage.uncachedInputTokens + usage.outputTokens >= config.contract.budget.maxTokens ||
        elapsed >= config.contract.budget.maxWallTimeSec) {
      const cert = issueTerminalCertificate({
        kind: "budget_exhausted_unresolved",
        contract: config.contract,
        baseRevision: config.seedRevision,
        usage,
        eventLogHash: log.hash(),
        metrics: frontier.incumbentMetrics ?? undefined,
      })
      await emit(config, { type: "certificate.issued", certificate: cert }, log)
      return { certificate: cert, events: log.events }
    }

    // Fork a fresh child — parent is IMMUTABLE, always forks from current incumbent or baseline
    const candidateId = `candidate-${randomUUID()}`
    const child = await config.workspaceManager.fork({
      parent: frontier.incumbent ?? baseline,
      candidateId,
    })

    // Create a log-aware wrapper so proposal.step events are included in the certificate hash
    const proposalEventSink: LoopEventSink = {
      emit: (event) => emit(config, event, log),
    }
    // Temporarily swap the proposer's event sink to route through controller logging
    const originalEvents = config.proposer["events"]
    ;(config.proposer as any)["events"] = proposalEventSink

    await emit(config, { type: "proposal.started", laneId: "main", candidateId, strategy: "exploit" }, log)

    const request: ProposalRequest = {
      contract: config.contract,
      strategy: "exploit",
      parent: frontier.incumbent,
      frontierMetrics: frontier.incumbentMetrics,
      failureEvidence: null,
      budget: {
        maxToolRounds: 10,
        maxTokens: Math.min(100_000, config.contract.budget.maxTokens - usage.uncachedInputTokens - usage.outputTokens),
        maxWallTimeSec: Math.min(120, config.contract.budget.maxWallTimeSec - usage.wallTimeSeconds),
      },
      workspace: child,
    }
    // Enforce candidate wall-time and token budgets
    const candidateTimer = AbortSignal.timeout(request.budget.maxWallTimeSec * 1000)
    const tokenController = new AbortController()
    let candidateTokens = 0
    const combinedSignal = AbortSignal.any([candidateTimer, tokenController.signal])
    request.abortSignal = combinedSignal

    let proposal
    try {
      proposal = await config.proposer.propose(request, (stepTokens: number) => {
        candidateTokens += stepTokens
        if (candidateTokens >= request.budget.maxTokens) {
          tokenController.abort("candidate_token_budget_exhausted")
        }
      })
    } catch (err: any) {
      // Token or wall-time budget abort — discard candidate, continue loop with remaining budget.
      // Only abortSignal-triggered rejections are budget exhaustion; genuine runner errors propagate.
      const isBudgetAbort =
        err?.message === "candidate_token_budget_exhausted" ||
        err?.name === "AbortError"
      const partialTokens = candidateTokens
      // Best-effort: record whatever tokens we know were consumed (already counted
      // via onStepTokens before the abort). Add a sentinel for the aborted partial step.
      usage.uncachedInputTokens += partialTokens
      await emit(config, {
        type: "lane.stalled",
        laneId: "main",
        reason: isBudgetAbort ? "per-candidate budget exhausted" : `proposer error: ${err?.message}`,
      }, log)
      // Continue the loop — do NOT issue a terminal certificate for candidate-level exhaustion
      continue
    }
    // Authoritative: model invocations from runner, not tool-call count
    usage.modelCalls += proposal.modelCalls
    usage.uncachedInputTokens += proposal.usage.inputTokens - proposal.usage.cachedInputTokens
    usage.cachedInputTokens += proposal.usage.cachedInputTokens
    usage.outputTokens += proposal.usage.outputTokens
    // Track cost provenance when available
    if (proposal.usage.providerCostUsd !== undefined) {
      usage.providerCostUsd = (usage.providerCostUsd ?? 0) + proposal.usage.providerCostUsd
      usage.costSource = proposal.usage.costSource ?? "provider_reported"
    }

    // Finalize hashes
    const finalized = await config.workspaceManager.finalize(proposal.candidate)

    await emit(config, {
      type: "proposal.completed",
      laneId: "main",
      candidateId,
      changedFiles: proposal.changedFiles.length,
      additions: 0,
      deletions: 0,
    }, log)

    // Verify
    const vStart = Date.now()
    const allStages: StageResult[] = []
    for (const stageId of Object.keys(config.verifierConfig.stages)) {
      await emit(config, { type: "verification.started", laneId: "main", candidateId, stage: stageId }, log)
      const result = await verifier.execute(stageId, finalized, request.abortSignal)
      allStages.push(result)
      const status = stageEventStatus(result)
      const metric = result.outputStatus === "valid" ?
        Object.values(result.metrics)[0] : undefined
      await emit(config, { type: "verification.completed", laneId: "main", candidateId, stage: stageId, status, metric }, log)
    }
    usage.verifierWallTimeSeconds += (Date.now() - vStart) / 1000  // wall-clock duration; CPU deferred to Phase 2
    usage.trials++

    // Evaluate
    const metrics = allStages
      .filter((s) => s.outputStatus === "valid")
      .reduce((acc, s) => ({ ...acc, ...s.metrics }), {} as Record<string, number>)

    if (Object.keys(metrics).length > 0) {
      const predResult = evaluatePredicate(config.contract.success, metrics, config.registry)
      if (predResult.satisfied) {
        frontier.incumbent = finalized
        frontier.incumbentMetrics = metrics
        await emit(config, { type: "frontier.updated", incumbentId: candidateId, metrics }, log)

        const cert = issueSuccessCertificate({
          contract: config.contract,
          candidateId,
          artifactHash: finalized.artifactHash,
          baseRevision: finalized.seedRevision,
          stages: allStages,
          metrics,
          usage,
          eventLogHash: log.hash(),
        })
        await emit(config, { type: "certificate.issued", certificate: cert }, log)
        return { certificate: cert, events: log.events }
      } else {
        // Track if new best (even if not meeting target)
        if (!frontier.incumbentMetrics ||
            isBetter(metrics, frontier.incumbentMetrics, config.registry)) {
          frontier.incumbent = finalized
          frontier.incumbentMetrics = metrics
          await emit(config, { type: "frontier.updated", incumbentId: candidateId, metrics }, log)
        }
      }
    }

    await emit(config, { type: "budget.updated", usage: { ...usage } }, log)
  }
}

function isBetter(a: Record<string, number>, b: Record<string, number>, registry: MetricRegistry): boolean {
  // Feasibility-first: correctness must be 1, performance must be finite
  function isEligible(m: Record<string, number>): boolean {
    const c = m["correctness"] ?? 0
    const r = m["runtime_ms_p95"] ?? Number.POSITIVE_INFINITY
    return c === 1 && Number.isFinite(r) && r >= 0
  }
  if (!isEligible(a)) return false
  if (!isEligible(b)) return true
  // Minimize p95 runtime (only metric that matters after correctness gate)
  return (a["runtime_ms_p95"] ?? Number.POSITIVE_INFINITY) <
         (b["runtime_ms_p95"] ?? Number.POSITIVE_INFINITY)
}

function stageEventStatus(result: StageResult): "pass" | "fail" | "error" {
  if (result.executionStatus !== "completed" || result.outputStatus !== "valid") {
    return "error"
  }
  if ("correctness" in result.metrics && result.metrics.correctness !== 1) {
    return "fail"
  }
  return "pass"
}

```

Key changes from the stale version:
- `config.events.emit()` instead of direct `log.events.push()` — single event path
- `workspaceManager.fork()` creates fresh child each iteration — parent never mutated
- `workspaceManager.finalize()` computes `artifactHash` and `patchHash` after proposal
- ControllerConfig uses `seedDir` + `seedRevision` instead of `baseRepo` + `baseRevision`
- No more `bestCandidate ?? baseline` reuse — each iteration gets a new fork
- No `bestResult` dangling reference — fixes the bug where it was always null

**Step 2: Commit**

```bash
git add packages/loop/src/controller.ts
git commit -m "feat(loop): controller with event-sink emissions and immutable candidate forking"
```

---

### Task 10: Create index exports and wire controller with event sink

**Objective:** Wire up the public API surface and ensure the package builds cleanly.

**Files:**
- Create: `packages/loop/src/index.ts` (full exports)
- Modify: `packages/loop/package.json` (add missing deps)

```typescript
// packages/loop/src/index.ts
export { compileContract, type ObjectiveContract, type BudgetConfig, type ContractError } from "./contract.js"
export { createMetricRegistry, type MetricRegistry, type MetricDefinition } from "./metrics/registry.js"
export { createVerifierExecutor, type VerifierConfig, type ExecutableSpec, type StageResult, type VerificationFailure } from "./verifier/executor.js"
export { createVerifierRegistry, type VerifierEntry } from "./verifier/registry.js"
export { evaluatePredicate, validatePredicate, type Predicate, type MetricPredicate, type CompoundPredicate } from "./verifier/predicate.js"
export { createWorkspaceManager, type WorkspaceManager, type CandidateWorkspace } from "./workspace.js"
export { createArcanaProposer, type CandidateProposer, type ProposalRequest, type ProposalResult, type UsageReceipt, type CandidateBudget } from "./proposer/index.js"
export { runLoop, createEventLog, type ControllerConfig, type AggregateUsage } from "./controller.js"
export { issueSuccessCertificate, issueTerminalCertificate, type CompletionCertificate, type CertificateKind } from "./certificate.js"
export {
  createEventLogSink,
  createNdjsonEventSink,
  createCompositeEventSink,
  type LoopEventSink,
  type LoopEvent,
} from "./events.js"
export { createSessionLoopEventSink } from "./tui-bridge.js"
```

**Step 2: Verify build and run all tests**

```bash
cd packages/loop
bun run typecheck  # or tsc --noEmit
bun test
```

**Step 3: Commit**

```bash
git add packages/loop/
git commit -m "feat(loop): public API surface with full export index and event sinks"
```

---

### Task 10A: Bridge LoopEvents into the Arcana TUI session

**Objective:** Live events are visible during loop execution in the TUI. The session sync protocol carries loop events. NDJSON remains as a secondary/debug transport.

**Files:**
- Modify: `packages/loop/src/tui-bridge.ts` (single owner of session sink)
- `packages/loop/src/events.ts` provides the generic sinks (`createNdjsonEventSink`, `createCompositeEventSink`); `tui-bridge.ts` provides `createSessionLoopEventSink`. No duplication.

**Step 1: Single implementation in tui-bridge.ts**

```typescript
// packages/loop/src/tui-bridge.ts
// ONLY location for session sync adapter. events.ts has generic sinks only.

import type { LoopEvent, LoopEventSink } from "./events.js"

export function createSessionLoopEventSink(params: {
  sessionId: string
  sync: {
    publishLoopEvent: (sessionId: string, event: LoopEvent) => Promise<void>
  }
}): LoopEventSink {
  return {
    async emit(event) {
      await params.sync.publishLoopEvent(params.sessionId, event)
    },
  }
}
```

**Step 2: Remove duplicate from events.ts**

`events.ts` provides: `createNdjsonEventSink`, `createCompositeEventSink`, `createEventLogSink`. It does NOT export `createSessionLoopEventSink`. Import session sink from `tui-bridge.ts`.

**Step 3: Wire into experiment — corrected**

```typescript
// Do NOT add createEventLogSink(log) — controller owns the durable log.
// The composite sink only contains external outputs:
import { createNdjsonEventSink, createCompositeEventSink } from "../../packages/loop/src/events.js"
import { createSessionLoopEventSink } from "../../packages/loop/src/tui-bridge.js"

const sinks = [createNdjsonEventSink(process.stdout)]
if (process.env.ARCANA_SESSION_ID) {
  sinks.push(createSessionLoopEventSink({ sessionId: process.env.ARCANA_SESSION_ID, sync }))
}
const eventSink = createCompositeEventSink(sinks)
```

**Step 4: Commit**

```bash
git add packages/loop/src/tui-bridge.ts
git commit -m "feat(loop): single TUI session bridge, deduplicated from events.ts"
```

---

### Task 11: End-to-end: run single-lane loop on real benchmark

**Objective:** Prove the system works end-to-end by running the loop against the Python benchmark with a real LLM. Live events stream through composite sink.

**Files:**
- Create: `benchmarks/python-hotloop/run-experiment.ts`

**Step 1: Create run script with correct APIs**

```typescript
// benchmarks/python-hotloop/run-experiment.ts

import { compileContract } from "../../packages/loop/src/contract.js"
import { createMetricRegistry } from "../../packages/loop/src/metrics/registry.js"
import { createVerifierRegistry } from "../../packages/loop/src/verifier/registry.js"
import { createWorkspaceManager } from "../../packages/loop/src/workspace.js"
import { createArcanaProposer } from "../../packages/loop/src/proposer/index.js"
import { runLoop } from "../../packages/loop/src/controller.js"
import { issueTerminalCertificate } from "../../packages/loop/src/certificate.js"
import { createHash } from "node:crypto"
import {
  createNdjsonEventSink,
  createCompositeEventSink,
} from "../../packages/loop/src/events.js"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve, join } from "node:path"

// 1. Load and validate contract
const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, "contract.json"), "utf-8"))
const registry = createMetricRegistry()
const metricSchema = JSON.parse(readFileSync(resolve(import.meta.dirname, "evaluator/metric.schema.json"), "utf-8"))
for (const [id, def] of Object.entries(metricSchema.metrics) as [string, any][]) {
  registry.register({ id, ...def })
}

const compiled = compileContract(raw, registry)
if ("error" in compiled) {
  console.error("Contract compilation failed:", compiled.error)
  process.exit(1)
}

// 2. Resolve verifier
const verifierRegistry = createVerifierRegistry()
verifierRegistry.register("python-hotloop-v1", {
  binary: "python",
  args: [resolve(import.meta.dirname, "evaluator/runner/runner.py")],
  timeoutMs: 60_000,
  outputParser: "json",
  requiredMetrics: ["correctness", "runtime_ms_p95"],
})

const { resolved, missing } = verifierRegistry.resolve(compiled.contract.verifier)
if (missing.length > 0) {
  const blockedCert = issueTerminalCertificate({
    kind: "blocked",
    contract: compiled.contract,
    baseRevision: "v1",
    usage: { trials: 0, modelCalls: 0, uncachedInputTokens: 0, cachedInputTokens: 0, outputTokens: 0, verifierWallTimeSeconds: 0, wallTimeSeconds: 0 },
    eventLogHash: createHash("sha256").update("arcana-loop-preflight").digest("hex"),
    evidence: {
      code: "MISSING_VERIFIER",
      message: `Missing verifiers: ${missing.join(", ")}`,
      details: { missing },
    },
  })
  writeFileSync("experiment-results.json", JSON.stringify(blockedCert, null, 2))
  process.exit(1)
}

// 3. Set up workspace manager (seed = candidate dir, not full repo)
const seedDir = resolve(import.meta.dirname, "seed")  // contains solution.py + visible/
import { mkdirSync, existsSync } from "node:fs"
if (!existsSync(join(seedDir, "solution.py"))) {
  console.error("Seed missing solution.py — run Task 1 setup first")
  process.exit(1)
}
if (!existsSync(join(seedDir, "visible", "test_correctness.py"))) {
  console.error("Seed missing visible/test_correctness.py — run Task 1 setup first")
  process.exit(1)
}
const workspaceManager = createWorkspaceManager({ seedDir })

// 4. Set up event sink (composite: NDJSON + optional TUI)
// NOTE: the controller already appends to the in-memory log via emit().
// Do NOT add createEventLogSink(log) to the composite — that duplicates every event.
const sinks = [
  createNdjsonEventSink(process.stdout),
]

// 5. B0 adapter: import actual runner from @arcana/agent/runner.js
import { runAgentWithTools } from "@arcana/agent/runner.js"  // discovered in B0

const eventSink = createCompositeEventSink(sinks)

const proposer = createArcanaProposer({
  provider: process.env.ARCANA_PROVIDER ?? "anthropic",
  model: process.env.ARCANA_MODEL ?? "claude-sonnet-4-20250514",
  runAgent: runAgentWithTools,
  events: eventSink,
})

// 6. Run
const result = await runLoop({
  contract: compiled.contract,
  registry,
  verifierConfig: { stages: resolved },
  workspaceManager,
  proposer,
  seedDir,
  seedRevision: "v1",
  maxLanes: 1,
  events: eventSink,
})

writeFileSync("experiment-results.json", JSON.stringify(result, null, 2))
console.error("Certificate:", JSON.stringify(result.certificate, null, 2))
```

**Step 2: Run and verify**

```bash
ARCANA_LOOP_BASE_REPO=$(pwd) bun run benchmarks/python-hotloop/run-experiment.ts
```

Expected: The loop runs, Claude (or configured model) edits `solution.py`, benchmark runs, and either a success or budget_exhausted certificate is issued.

**Step 3: Commit**

```bash
git add benchmarks/python-hotloop/run-experiment.ts
git commit -m "feat(loop): end-to-end experiment runner for single-lane loop"
```

---

### Task 12: Capture real token/cost accounting

**Objective:** Replace estimates with exact token counts from the runner's response metadata. The proposer already captures this — wiring is complete from Task 8.

**Files:**
- Modify: `packages/loop/src/controller.ts` (use real values from proposal.usage)

**Step 1: Update controller accounting**

The controller already receives `proposal.usage` from the proposer (Task 8). Replace any remaining estimates:

```typescript
// In controller.ts — after proposal completes:
usage.modelCalls += proposal.modelCalls  // authoritative count from runner steps
usage.uncachedInputTokens += proposal.usage.inputTokens - proposal.usage.cachedInputTokens
usage.cachedInputTokens += proposal.usage.cachedInputTokens
usage.outputTokens += proposal.usage.outputTokens
```

No more `10_000` estimates. Every value comes from the provider's actual response metadata.

**Step 2: Commit**

```bash
git add packages/loop/src/controller.ts
git commit -m "feat(loop): real token and cost accounting from runner metadata"
```

**Milestone B1 gate:** Run `bun test` — all pass. Run experiment — loop runs with real LLM, produces real code changes, reports exact token counts, streams live events through the event sink. Each iteration forks a fresh child workspace from the immutable parent frontier.

---

**Note:** The benchmark runner and workspace isolation fixes from the previous review are applied in Tasks 1-2 above. Candidate workspaces are created from a minimal seed (solution.py + visible/). The evaluator runs candidates in process-isolated subprocesses (no `exec_module`). See the corrected Task 1-2 code for full details.

---

## Milestone C — Actual Portfolio Research (Tasks C1-C6)

**Goal:** Multiple lanes run genuinely concurrently with bounded concurrency, the frontier persists across iterations, and duplicate candidates are rejected.

### Task C1: Implement lazy strategy tasks

**Objective:** Fix the eager-promise bug. Strategies are created as lazy functions, not pre-started promises.

**Files:**
- Modify: `packages/loop/src/controller.ts` (add portfolio scheduling)
- Create: `packages/loop/src/scheduler.ts`

```typescript
// packages/loop/src/scheduler.ts

import type { CandidateProposer, ProposalRequest, ProposalResult } from "./proposer/index.js"
import type { CandidateWorkspace } from "./workspace.js"
import type { StageResult } from "./verifier/executor.js"
import type { LoopEvent, AggregateUsage } from "./controller.js"

type PortfolioTask<T> = () => Promise<T>

export interface SchedulerConfig {
  maxConcurrentAgents: number
  maxConcurrentVerifierJobs: number
  requestsPerMinute: number
  tokensPerMinute: number
}

interface LaneTask {
  laneId: string
  strategy: "exploit" | "explore" | "repair"
  task: PortfolioTask<LaneResult>
}

interface LaneResult {
  laneId: string
  strategy: string
  result: ProposalResult
  stages: StageResult[]
  events: LoopEvent[]
}

export async function runWithConcurrency<T>(
  tasks: PortfolioTask<T>[],
  maxConcurrency: number,
): Promise<T[]> {
  const results: T[] = []
  const pending = new Set<Promise<void>>()

  for (const task of tasks) {
    // Wait if at capacity
    while (pending.size >= maxConcurrency) {
      await Promise.race(pending)
      // Clean up resolved promises
      for (const p of pending) {
        p.then(() => pending.delete(p), () => pending.delete(p))
      }
    }

    const p = task()
      .then((r) => { results.push(r); pending.delete(p) })
      .catch((err) => { pending.delete(p); throw err })
    pending.add(p)
  }

  // Wait for remaining
  await Promise.allSettled(pending)

  return results
}
```

### Task C2: Add bounded concurrency and per-lane budgets

**Objective:** Each lane gets a pre-allocated `CandidateBudget` derived from total budget / active lanes.

**Files:**
- Modify: `packages/loop/src/controller.ts`

```typescript
function allocateLaneBudget(contract: ObjectiveContract, laneCount: number): CandidateBudget {
  return {
    maxToolRounds: Math.max(1, Math.floor(contract.budget.maxTrials / laneCount)),
    maxTokens: Math.max(1000, Math.floor(contract.budget.maxTokens / laneCount)),
    maxWallTimeSec: Math.max(30, Math.floor(contract.budget.maxWallTimeSec / laneCount / 2)),
  }
}
```

The scheduler enforces `requestsPerMinute` and `tokensPerMinute` caps. Use a token bucket or sliding-window rate limiter.

### Task C3: Add exploit, explore, and repair strategies

**Objective:** Three strategies with different prompts and behaviors.

- **Exploit:** Improve the current incumbent. Uses `parent: bestCandidate`, `frontierMetrics`, and `failureEvidence` from previous attempts.
- **Explore:** Generate structurally different candidates. Uses `parent: baseline` (always starts fresh), ignores frontier metrics.
- **Repair:** Fix specific failures. Triggered when a candidate fails smoke or unit stages. Uses `parent: failedCandidate`, `failureEvidence: [smokeFailure, unitFailure]`.

Each strategy is a separate lazy task in `createLaneTasks()`.

### Task C4: Maintain persistent frontier

**Objective:** The frontier is NOT reset each iteration. It's an evolving state:

```typescript
interface Frontier {
  incumbent: CandidateWorkspace | null
  incumbentMetrics: Record<string, number> | null
  alternatives: CandidateWorkspace[]
  rejectedHashes: Set<string>
  metricHistory: MetricObservation[]
}

interface MetricObservation {
  candidateId: string
  metrics: Record<string, number>
  timestamp: number
}
```

The exploit lane always starts from `frontier.incumbent`. The explore lane starts from baseline (fresh). After each candidate, the frontier is updated if the candidate improves the incumbent (using `isBetter` with metric direction awareness).

### Task C5: Add deduplication by patch and artifact hash

**Objective:** Prevent wasted work on duplicate candidates.

Deduplication happens after `finalize()` (when patch and artifact hashes are known) but before expensive verification stages. Flow:

1. Proposer modifies workspace.
2. `finalize()` computes `patchHash` and `artifactHash`.
3. Check `frontier.rejectedHashes` — if seen before, skip verification.
4. If not seen, run verification.
5. After verification, add hashes to `rejectedHashes`.

This avoids verifying the same patch twice without requiring a hash before the workspace exists.

### Task C6: Add cancellation when success is proven

**Objective:** Stop all lanes immediately once any lane produces a verified success certificate.

Use `AbortController`:

```typescript
const abortController = new AbortController()
// Each lane task receives abortController.signal
// check signal.aborted at key yield points
// In controller, after success:
abortController.abort()
```

**Milestone C gate:** Run with `maxConcurrentAgents: 2`. Two lanes run simultaneously with async verifier. Both modify files and submit to verifier independently. First success aborts the other. Duplicate hashes are rejected.

---

## Milestone D — Governance and Observability (Tasks D1-D5)

**Goal:** Durable event journaling, checkpoint-resume, certificate verification, and richer TUI visualization. Does NOT recreate the event system from B1 — builds ON it.

### Task D1: Durable event journaling with sequence numbers

**Objective:** Append-only event log with sequence numbers, corruption detection, and replay support.

Events are already emitted through `config.events.emit()` and stored in-memory via `log.events` (from B1). D1 adds:
- Append to disk journal (`~/.arcana/loop/journals/<contractHash>.ndjson`)
- Sequence number on every event
- SHA-256 chain (each entry hashes the previous entry's hash)
- Replay: reconstruct full event history from journal on restart

### Task D2: Checkpoint loop state after every candidate (atomic)

**Objective:** Survive kill -9. Atomic write protocol: write to temp file, fsync, rename, fsync parent directory.

```typescript
import { writeFileSync, renameSync, openSync, fsyncSync } from "node:fs"
import { join, dirname } from "node:path"

async function writeCheckpoint(checkpoint: Checkpoint, checkpointDir: string): Promise<void> {
  const tmp = join(checkpointDir, `.tmp-${checkpoint.contractHash}`)
  const dest = join(checkpointDir, `${checkpoint.contractHash}.json`)

  // 1. Write to temp file
  writeFileSync(tmp, JSON.stringify(checkpoint))
  // 2. fsync the temp file
  fsyncSync(openSync(tmp, "r+"))
  // 3. Atomic rename
  renameSync(tmp, dest)
  // 4. fsync the parent directory (journaled metadata)
  fsyncSync(openSync(dirname(dest), "r"))
  // 5. Validate on resume: checksum match, schema valid
}

// Resume: replay journal from last checkpoint sequence number,
// skip completed candidates, resume frontier.
```

Event journal also needs explicit flush: each emit writes to disk with fsync or at minimum flush after every budget boundary event. The gate requires surviving `kill -9` without truncated or corrupted state.

### Task D3: Resume from checkpoint

**Objective:** On restart, detect existing checkpoint + journal, replay events to reconstruct state, skip completed candidates.

```typescript
function tryResume(contractHash: string): { checkpoint: Checkpoint; events: LoopEvent[] } | null
```

### Task D4: Certificate verification tooling

**Objective:** Verify that a certificate's claims match the event journal, hashes match artifacts, and signature is valid.

### Task D5: Richer TUI lane rendering

**Objective:** Group events by lane, show per-lane progress bars, render frontier updates with delta formatting. Builds on the Task 10A session bridge (B1), replacing the minimal text-line renderer.

**Milestone D gate:** Loop survives kill -9 and resumes from checkpoint without repeating completed trials. Events replay to reconstruct full history. Certificate passes verification.

---

## Milestone E — Comparative Evidence (Tasks E1-E4)

**Goal:** Run preregistered, unbiased, repeated-trial comparisons between one-shot, single-loop, and portfolio systems. The gate is protocol completion, not a specific outcome.

### Task E1: Implement one-shot baseline

**Objective:** Run a single LLM call with no loop: "write a solution.py that passes the benchmark." No verification feedback, no iteration.

```typescript
async function oneShotBaseline(proposer: CandidateProposer, contract: ObjectiveContract, seedDir: string): Promise<{
  metrics: Record<string, number>
  tokens: number
  candidateId: string
}> {
  // Single proposal with no verification feedback, no iteration
}
```

### Task E2: Implement single-trajectory baseline

**Objective:** Run Karpathy-style inner loop: propose, verify, get feedback, repeat. Single lane, no portfolio, no concurrent strategies.

### Task E3: Run controlled seeded experiments

**Objective:** Same model, same token budget, same wall time. Preregistered protocol:

- Fixed model identity and temperature
- Repeated paired runs (minimum 3 per system)
- Randomized execution order
- Immutable benchmark seeds
- Hidden tests inaccessible to all proposers
- Separate cost, token, CPU, and latency measurements per run
- Complete reporting of successes, failures, and errors regardless of outcome

Measure per run: `success_rate`, `best_verified_gain`, `time_to_target`, `uncached_input_tokens`, `cached_input_tokens`, `output_tokens`, `provider_cost_usd`, `verifier_wall_time_seconds`, `candidate_count`, `invalid_candidate_rate`, `regression_rate`.

Report the simple operational metric: `verified gain per 100,000 uncached tokens`.

### Task E4: Generate comparison report

**Objective:** A markdown report with per-system tables, confidence intervals, uncertainty estimates, and explicit claim boundaries.

**VALID gate:** All three systems complete the preregistered repeated-trial protocol and produce replayable results, uncertainty estimates, usage receipts, failures, and limitations, **regardless of comparative outcome.**

The gate is NOT "portfolio must outperform" — it is "all systems ran the same protocol, all data is reported, claims are bounded."

---

## Corrected Canonical Milestone Table

| Milestone | Task IDs | Deliverable |
|-----------|----------|-------------|
| **A — Proof Path** | A1-A6 | Process-isolated evaluator, candidate/evaluator separation, metric registry, replayable manual certificate |
| **B0 — Runner Contract** | B0 | Real runner API discovered, typed adapter implemented, tool execution and cancellation verified. **Gate: patch experiment to remove placeholder import, confirm real symbol.** |
| **B1 — Single-Lane** | B1-B7 | Immutable candidate forking, scoped tools, real LLM proposal, live TUI events, authoritative usage receipts |
| **C — Portfolio** | C1-C6 | Async concurrent exploit+explore lanes, global budgets, lazy scheduling, persistent frontier, cancellation |
| **D — Governance** | D1-D5 | Durable event journals, checkpoint-resume, certificate verification, rich TUI rendering |
| **E — Evidence** | E1-E4 | Preregistered repeated-trial comparison with unbiased completion gate |

Note: This table replaces the previous numeric-only task ranges. Tasks should be referenced by milestone-prefixed ID in commits and progress tracking. The internal document body uses descriptive headers rather than rigid numbering.

---

## Evidence-Status Confidence

Replace numeric "confidence %" with evidence status. Every risk is tracked by what has been verified against it:

| Regression | Evidence Status |
|------------|----------------|
| Legacy callers | Untouched — independent module, confirmed by design |
| Aggregate budgets | Pending concurrency and cancellation tests (C1-C6) |
| TUI ordering | Pending two-lane replay test (B7, D3) |
| Provider limits | External-risk — requires live smoke tests with real API keys |
| Cache reuse | Pending provider cache-receipt integration |
| Verifier availability | Pending dependency preflight (A1) |
| Workspace isolation | Pending process-isolation hardening (A1-A2) |

**No numeric probabilities are assigned.** Each status will be updated to `verified` when the corresponding task gate passes.

---

## Phase 1 Acceptance Criteria

Arcana's Phase 1 loop is accepted when all milestone gates pass:

1. **A:** Manual candidate earns valid certificate with process-isolated evaluator
2. **B0:** Runner adapter verified with fake provider (no API keys required)
3. **B1:** Real LLM autonomously modifies code, improves benchmark, live TUI, exact token receipts
4. **C:** Two concurrent exploit + explore lanes with cancellation and persistent frontier
5. **D:** Checkpoint-resume survives process kill, certificates include verifiable hashes
6. **E:** Preregistered repeated-trial comparison protocol completed with all three systems (one-shot, single-loop, portfolio), complete data reported regardless of outcome

**Note:** Criterion 8 from the original plan ("portfolio must outperform baselines") is removed. The evidence gate is protocol completion, not a specific comparative result.

---

## What's NOT in Phase 1

- Bilevel meta-controller (outer loop optimizing search mechanisms)
- Memory layout optimization (semantic digests)
- Queue separation (batch API for bulk scoring)
- Full OWASP/NIST sandbox hardening (network namespaces, CAP_DROP, cgroups). Phase 1 uses process-level isolation with empty environment and cwd separation; candidate code executes on the host and may access the filesystem and network.
- Multi-metric compound KPI
- Benchmark suite beyond a single task
- Config file support with schema validation (uses env vars)
