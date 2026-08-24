// script/authority-bench.ts
//
// Authority Kernel K5 — kernel performance SLOs, FAIL-CLOSED.
//
// Bench A (mediation-only): full PEP pipeline with a no-op executor —
//   this is the pure "governance overhead" number.
// Bench B (end-to-end spawn): authorizeProcess with a real child process —
//   the number an `arcana run` user experiences per mediated command.
//
// Fail-closed: ANY error during warmup/measurement (including budget-file
// parse errors and database unavailability) exits 1. A security SLO that
// silently skips itself is not an invariant.
//
// Usage: bun run script/authority-bench.ts [--json]

import { Effect } from "effect"
import { mkdirSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { authorizeProcess } from "../src/capability/process-gate"
import { SqliteGrantStore } from "../src/capability/grant-store-sqlite"
import { SessionPolicyProvider } from "../src/capability/grant-store"
import { ensureSessionAgentGrants } from "../src/capability/session-grants"
import { authorizeAndExecuteEffect } from "../src/capability/pep"
import { buildAuthorizationRequest } from "../src/capability/pep-integration"
import { Database } from "../src/database/database"

const REPO = resolveRepoRoot()
const BUDGETS = JSON.parse(
  readFileSync(join(REPO, "docs", "architecture", "authority", "bench-budgets.json"), "utf8"),
) as Budgets
const jsonOut = process.argv.includes("--json")

interface Budgets {
  mediationOnly: { iterations: number; warmup: number; p95Ms: number; p99Ms: number }
  endToEndSpawn: { iterations: number; warmup: number; p95Ms: number }
}

function resolveRepoRoot(): string {
  let dir = import.meta.dir
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "package.json")) && existsSync(join(dir, "packages"))) return dir
    dir = join(dir, "..")
  }
  throw new Error("repo root not found")
}

function percentile(sortedAsc: number[], p: number): number {
  if (!sortedAsc.length) return NaN
  const idx = Math.min(sortedAsc.length - 1, Math.ceil((p / 100) * sortedAsc.length) - 1)
  return sortedAsc[Math.max(0, idx)]
}

function summarize(samples: number[]): { p50: number; p95: number; p99: number } {
  const s = [...samples].sort((a, b) => a - b)
  return { p50: percentile(s, 50), p95: percentile(s, 95), p99: percentile(s, 99) }
}

// ── Bench A: mediation-only (no-op executor through the real PEP) ─────

async function benchMediation(): Promise<{ samples: number[] }> {
  const dbPath = join(REPO, ".tmp-bench-authority.db")
  const samples: number[] = []
  await Effect.runPromise(
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })
      yield* ensureSessionAgentGrants(store, { agentName: "bench-agent", sessionId: "bench" })
      const provider = new SessionPolicyProvider(
        store,
        { principalId: "bench-agent", sessionId: "bench", workspaceTrust: "TRUSTED" },
        undefined,
        "LEGACY_COMPAT",
      )
      const run = () =>
        Effect.gen(function* () {
          const authReq = buildAuthorizationRequest({
            toolName: "shell",
            principalId: "bench-agent",
            sessionId: "bench",
            args: { command: "bun -e 0", argv: ["bun", "-e", "0"] },
            executable: "bun",
            provenance: ["USER_INSTRUCTION"],
          })
          return yield* authorizeAndExecuteEffect(
            { request: authReq, executeExact: () => Effect.sync(() => "noop") },
            provider,
            { emit: () => undefined },
          )
        })
      // Warmup
      for (let i = 0; i < BUDGETS.mediationOnly.warmup; i++) yield* run()
      // Measure
      for (let i = 0; i < BUDGETS.mediationOnly.iterations; i++) {
        const t0 = performance.now()
        yield* run()
        samples.push(performance.now() - t0)
      }
    }).pipe(Effect.provide(Database.layerFromPath(":memory:"))),
  )
  return { samples }
}

// ── Bench B: end-to-end mediated spawn ─────────────────────────────────

async function benchSpawn(): Promise<{ samples: number[] }> {
  const { authorizeProcess } = await import("../src/capability/process-gate")
  const samples: number[] = []
  const opts = {
    dbPath: join(REPO, ".tmp-bench-spawn.db"),
    principalId: "bench-agent",
    sessionId: "bench-spawn",
  }
  // Warmup
  for (let i = 0; i < BUDGETS.endToEndSpawn.warmup; i++) {
    await authorizeProcess(opts, { toolName: "shell", argv: [process.execPath, "-e", "process.exit(0)"] })
  }
  for (let i = 0; i < BUDGETS.endToEndSpawn.iterations; i++) {
    const t0 = performance.now()
    const r = await authorizeProcess(opts, { toolName: "shell", argv: [process.execPath, "-e", "process.exit(0)"] })
    if (r.status !== "EXECUTED") throw new Error(`spawn bench failed: ${r.status}`)
    samples.push(performance.now() - t0)
  }
  rmRf(opts.dbPath)
  return { samples }
}

function rmRf(p: string): void {
  try {
    require("node:fs").rmSync(p, { force: true })
  } catch {}
}

// ── Main ────────────────────────────────────────────────────────────────

try {
  const med = await benchMediation()
  const medS = summarize(med.samples)
  const spawn = await benchSpawn()
  const spawnS = summarize(spawn.samples)

  const failures: string[] = []
  if (!(medS.p95 <= BUDGETS.mediationOnly.p95Ms)) failures.push(`mediation p95 ${medS.p95.toFixed(2)}ms > ${BUDGETS.mediationOnly.p95Ms}ms`)
  if (!(medS.p99 <= BUDGETS.mediationOnly.p99Ms)) failures.push(`mediation p99 ${medS.p99.toFixed(2)}ms > ${BUDGETS.mediationOnly.p99Ms}ms`)
  if (!(spawnS.p95 <= BUDGETS.endToEndSpawn.p95Ms)) failures.push(`spawn p95 ${spawnS.p95.toFixed(2)}ms > ${BUDGETS.endToEndSpawn.p95Ms}ms`)

  const report = {
    ok: failures.length === 0,
    mediationOnly: { ...medS, budgetP95: BUDGETS.mediationOnly.p95Ms, budgetP99: BUDGETS.mediationOnly.p99Ms },
    endToEndSpawn: { ...spawnS, budgetP95: BUDGETS.endToEndSpawn.p95Ms },
    failures,
  }

  if (jsonOut) console.log(JSON.stringify(report, null, 2))
  else {
    console.log(`authority-bench:`)
    console.log(`  mediation-only  p50 ${medS.p50.toFixed(2)}ms · p95 ${medS.p95.toFixed(2)}ms · p99 ${medS.p99.toFixed(2)}ms  (budget p95 ≤ ${BUDGETS.mediationOnly.p95Ms}, p99 ≤ ${BUDGETS.mediationOnly.p99Ms})`)
    console.log(`  end-to-end spawn p95 ${spawnS.p95.toFixed(2)}ms  (budget ≤ ${BUDGETS.endToEndSpawn.p95Ms})`)
    console.log(failures.length ? `FAIL: ${failures.join("; ")}` : "OK — all kernel SLO budgets met")
  }
  rmRf(join(REPO, ".tmp-bench-authority.db"))
  process.exit(failures.length === 0 ? 0 : 1)
} catch (error) {
  console.error("authority-bench: FAILED to run benchmarks (fail-closed):", error)
  process.exit(1)
}
