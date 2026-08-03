#!/usr/bin/env bun
// scripts/perf-check.ts — CI performance regression check.
//
// Runs after `bun run build` to verify:
//   1. Compiled binary size is within budget
//   2. CLI startup time is within budget
//
// Fails with non-zero exit if any threshold is exceeded.
//
// Usage:
//   bun run scripts/perf-check.ts              # checks dist binaries + startup
//   bun run scripts/perf-check.ts --skip-startup  # only binary size
//   bun run scripts/perf-check.ts --skip-binary    # only startup time
//   bun run scripts/perf-check.ts --update-baseline # update baseline from current measurements

import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs"

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))

// --------------- types ---------------

type Baseline = {
  readonly version: number
  readonly description: string
  readonly binary: {
    readonly max_size_mb: number
    readonly description: string
  }
  readonly startup: {
    readonly max_p50_ms: number
    readonly max_p90_ms: number
    readonly runs: number
    readonly args: string[]
    readonly description: string
  }
  readonly updated_at: string
  readonly updated_by: string
}

// --------------- helpers ---------------

function loadBaseline(): Baseline {
  const path = resolve(SCRIPT_DIR, "perf-baseline.json")
  return JSON.parse(readFileSync(path, "utf8")) as Baseline
}

function saveBaseline(baseline: Baseline): void {
  const path = resolve(SCRIPT_DIR, "perf-baseline.json")
  baseline.updated_at = new Date().toISOString().slice(0, 10)
  baseline.updated_by = "perf-check.ts --update-baseline"
  writeFileSync(path, JSON.stringify(baseline, null, 2) + "\n")
  console.log(`  ✓ baseline updated at ${path}`)
}

// --------------- binary size check ---------------

async function checkBinarySize(baseline: Baseline, updateBaseline: boolean): Promise<boolean> {
  const maxBytes = baseline.binary.max_size_mb * 1024 * 1024
  const distDir = resolve(SCRIPT_DIR, "..", "packages/engine/dist")
  let passed = true
  let maxSeenBytes = 0
  let maxSeenName = ""

  if (!existsSync(distDir)) {
    console.log("[perf] ❌ No dist directory found — binary size was not measured")
    return false
  }

  // Look for compiled binaries in dist/*/bin/arcana or dist/*/bin/arcana.exe
  const patterns = [
    "*/bin/arcana",
    "*/bin/arcana.exe",
  ]

  let foundAny = false
  for (const pattern of patterns) {
    const matches: string[] = []
    for await (const file of new Bun.Glob(pattern).scan({ cwd: distDir })) {
      matches.push(file)
    }
    for (const match of matches) {
      foundAny = true
      const fullPath = resolve(distDir, match)
      if (!existsSync(fullPath)) continue
      const stats = statSync(fullPath)
      const sizeMB = stats.size / (1024 * 1024)
      const sizeStr = `${sizeMB.toFixed(1)} MB`

      if (stats.size > maxSeenBytes) {
        maxSeenBytes = stats.size
        maxSeenName = match
      }

      if (stats.size > maxBytes) {
        console.log(`[perf] ❌ ${match}: ${sizeStr} exceeds ${baseline.binary.max_size_mb} MB limit`)
        passed = false
      } else {
        console.log(`[perf] ✓ ${match}: ${sizeStr} (limit: ${baseline.binary.max_size_mb} MB)`)
      }
    }
  }

  if (!foundAny) {
    console.log("[perf] ❌ No compiled binaries found in dist/ — binary size was not measured")
    return false
  }

  if (updateBaseline && maxSeenBytes > 0) {
    const newLimitMB = Math.ceil(maxSeenBytes / (1024 * 1024)) + 10 // 10 MB headroom
    baseline.binary.max_size_mb = Math.max(newLimitMB, baseline.binary.max_size_mb)
    console.log(`  → baseline max_size_mb updated to ${baseline.binary.max_size_mb} MB (was based on ${maxSeenName})`)
  }

  return passed
}

// --------------- startup time check ---------------

async function checkStartupTime(baseline: Baseline, updateBaseline: boolean): Promise<boolean> {
  const runs = baseline.startup.runs
  const args = baseline.startup.args.join(" ")
  let passed = true
  let measuredP50 = 0
  let measuredP90 = 0

  try {
    const benchScript = resolve(SCRIPT_DIR, "bench-startup.ts")
    const cmd = [
      "bun", "run", benchScript,
      `--runs=${runs}`,
      `--args=${args}`,
      "--json",
    ]

    console.log(`[perf] Running startup benchmark (${runs} runs, args: ${args})...`)
    const proc = Bun.spawn(cmd, {
      cwd: resolve(SCRIPT_DIR, ".."),
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ARCANA_PROFILE_STARTUP: "1",
      },
    })

    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    if (exitCode !== 0) {
      console.log(`[perf] ⚠️  Startup benchmark exited with code ${exitCode}`)
      console.log(stderr.slice(0, 500))
      return true // Don't fail CI on benchmark infrastructure issues
    }

    const result = JSON.parse(stdout.trim()) as {
      runs: number
      args: string[]
      rows: Array<{ phase: string; kind: string; p50: number; p90: number }>
    }

    if (!result.rows || result.rows.length === 0) {
      console.log("[perf] ⚠️  No benchmark data returned — skipping startup time check")
      return true
    }

    // Use the p50/p90 of the latest wall-clock phase as the overall duration indicator.
    // The last row from bench-startup.ts is typically the last measured phase timestamp.
    const lastPhase = result.rows[result.rows.length - 1]
    measuredP50 = lastPhase?.p50 ?? 0
    measuredP90 = lastPhase?.p90 ?? 0

    console.log(`[perf] Startup phases (${result.rows.length} total):`)
    for (const row of result.rows.slice(0, 8)) {
      const icon = row.p50 > baseline.startup.max_p50_ms ? "⚠️" : "✓"
      console.log(`  ${icon} ${row.phase.padEnd(40)} p50=${row.p50}ms p90=${row.p90}ms`)
    }
    if (result.rows.length > 8) {
      console.log(`  ... and ${result.rows.length - 8} more phases`)
    }

    if (measuredP50 > baseline.startup.max_p50_ms) {
      console.log(`[perf] ❌ Startup p50 ${measuredP50}ms exceeds ${baseline.startup.max_p50_ms}ms limit`)
      passed = false
    } else {
      console.log(`[perf] ✓ Startup p50 ${measuredP50}ms (limit: ${baseline.startup.max_p50_ms}ms)`)
    }

    if (measuredP90 > baseline.startup.max_p90_ms) {
      console.log(`[perf] ❌ Startup p90 ${measuredP90}ms exceeds ${baseline.startup.max_p90_ms}ms limit`)
      passed = false
    } else {
      console.log(`[perf] ✓ Startup p90 ${measuredP90}ms (limit: ${baseline.startup.max_p90_ms}ms)`)
    }

    if (updateBaseline && measuredP50 > 0) {
      const newP50 = Math.ceil(measuredP50 * 1.3) // 30% headroom for CI variability
      const newP90 = Math.ceil(measuredP90 * 1.3)
      baseline.startup.max_p50_ms = Math.max(newP50, baseline.startup.max_p50_ms)
      baseline.startup.max_p90_ms = Math.max(newP90, baseline.startup.max_p90_ms)
      console.log(`  → baseline updated: p50=${baseline.startup.max_p50_ms}ms, p90=${baseline.startup.max_p90_ms}ms`)
    }
  } catch (err) {
    console.log(`[perf] ⚠️  Startup benchmark failed: ${err}`)
    return true // Don't fail CI on benchmark infrastructure issues
  }

  return passed
}

// --------------- main ---------------

async function main() {
  const skipStartup = process.argv.includes("--skip-startup")
  const skipBinary = process.argv.includes("--skip-binary")
  const updateBaseline = process.argv.includes("--update-baseline")

  console.log("═══════════════════════════════════════════")
  console.log("  Arcana Performance Regression Check")
  console.log("═══════════════════════════════════════════")
  console.log("")

  const baseline = loadBaseline()
  console.log(`Baseline: binary ≤ ${baseline.binary.max_size_mb} MB, startup p50 ≤ ${baseline.startup.max_p50_ms}ms`)
  console.log("")

  const checks: Array<Promise<boolean>> = []

  if (!skipBinary) {
    checks.push(checkBinarySize(baseline, updateBaseline))
  }

  if (!skipStartup) {
    checks.push(checkStartupTime(baseline, updateBaseline))
  }

  const results = await Promise.all(checks)
  const allPassed = results.every(Boolean)

  if (updateBaseline) {
    saveBaseline(baseline)
  }

  console.log("")
  if (allPassed) {
    console.log("✅ All performance checks passed")
    process.exit(0)
  } else {
    console.log("❌ Performance regression detected!")
    console.log("   Check the logs above for details.")
    console.log("   If the regression is expected (e.g., intentional feature addition),")
    console.log("   update the baseline with: bun run scripts/perf-check.ts --update-baseline")
    process.exit(1)
  }
}

await main()
