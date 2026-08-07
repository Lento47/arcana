#!/usr/bin/env bun
// scripts/bench-startup.ts — Audit-sprint benchmark harness.
//
// Spawns `bun run packages/arcana/src/index.ts <args>` N times sequentially
// with ARCANA_PROFILE_STARTUP=1, captures stderr (which contains one JSON
// marker per phase per process), aggregates by phase, and reports p50/p90
// plus min/max/median per phase.
//
// Why sequential: parallel cold-cache would skew OS file cache state across
// runs. The user explicitly asked for reproducible numbers.
//
// Schema (each stderr line, JSON.parse-able):
//   {"phase":"<name>","ts_ms":<perf.now()>,"pid":<int>}
//
// Usage:
//   bun run scripts/bench-startup.ts --runs=5 --args="--help"
//   bun run scripts/bench-startup.ts --runs=10 --args="--version"

import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, "..")
const ENTRY = resolve(REPO_ROOT, "packages/arcana/src/index.ts")

// --------------- args ---------------

function parseFlags(argv: string[]): { runs: number; args: string[]; json: boolean } {
  let runs = 5
  // Default args: `serve --help` exercises the bare-arcana fast path
  // (arcana wrapper → Bun.spawn(engine) → engine yargs → serve help → exit).
  // It's a non-interactive exit that runs both processes end-to-end without
  // needing a TTY. Override with --args="...".
  const args: string[] = ["serve", "--help"]
  let json = false
  for (const a of argv) {
    if (a.startsWith("--runs=")) {
      runs = Math.max(1, parseInt(a.slice("--runs=".length), 10) || 5)
      continue
    }
    if (a === "--json") {
      json = true
      continue
    }
    if (a.startsWith("--args=")) {
      args.length = 0
      // Naive shell-style split on whitespace. Quoted args aren't supported.
      for (const tok of a.slice("--args=".length).split(/\s+/)) {
        if (tok) args.push(tok)
      }
      continue
    }
    args.push(a)
  }
  return { runs, args, json }
}

const { runs, args, json } = parseFlags(process.argv.slice(2))

// --------------- types ---------------

type Marker = {
  phase: string
  ts_ms: number
  pid: number
  /** Process-relative time (ms since this process started). Filled from t0. */
  proc_ms?: number
  /** Original wall-clock ts_ms from the spawned process. */
  ts_raw: number
}

type RunResult = {
  runIndex: number
  exitCode: number
  /** Per-pid t0 map: pid → first marker ts_ms (process relative origin). */
  t0ByPid: Map<number, number>
  markers: Marker[]
  /** Engine cli/profile.ts emit samples. */
  engineProfile: Map<string, number[]>
  durationMs: number
  /** Raw stderr (debug only). */
  rawStderr: string
}

// --------------- runner ---------------

async function runOnce(runIndex: number, childArgs: string[]): Promise<RunResult> {
  const t0 = performance.now()
  const proc = Bun.spawn({
    cmd: ["bun", "run", "--conditions=browser", ENTRY, ...childArgs],
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ARCANA_PROFILE_STARTUP: "1",
    },
    stdio: ["ignore", "inherit", "pipe"],
  })

  const stderrChunks: string[] = []
  const reader = proc.stderr.getReader()
  const decoder = new TextDecoder()
  // Read stderr concurrently while waiting for the child.
  const readTask = (async () => {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      stderrChunks.push(decoder.decode(value, { stream: true }))
    }
    stderrChunks.push(decoder.decode())
  })()

  const exitCode = await proc.exited
  await readTask

  const stderr = stderrChunks.join("")
  const lines = stderr.split(/\r?\n/)
  const markers: Marker[] = []
  const t0ByPid = new Map<number, number>()
  const engineProfile = new Map<string, number[]>() // phase name → samples (ms)
  for (const line of lines) {
    if (!line) continue
    if (line[0] === "{") {
      // JSON marker.
      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        continue
      }
      if (
        !parsed ||
        typeof parsed !== "object" ||
        typeof (parsed as Marker).phase !== "string" ||
        typeof (parsed as Marker).ts_ms !== "number" ||
        typeof (parsed as Marker).pid !== "number"
      ) {
        continue
      }
      const m = parsed as Marker
      m.ts_raw = m.ts_ms
      if (!t0ByPid.has(m.pid)) {
        t0ByPid.set(m.pid, m.ts_ms)
      }
      m.proc_ms = m.ts_ms - (t0ByPid.get(m.pid) ?? 0)
      markers.push(m)
      continue
    }
    if (line.startsWith("[profile]")) {
      // Existing engine cli/profile.ts emit format:
      //   [profile] <name>                                          <ms>ms
      //   [profile] <a> → <b>                                        <ms>ms
      //   [profile] TOTAL                                            <ms>ms
      const body = line.slice("[profile]".length).trim()
      const m = body.match(/^(\S.*?)\s{2,}(\d+)ms\s*$/)
      if (!m) continue
      const name = m[1].trim()
      const dur = parseInt(m[2], 10)
      const arr = engineProfile.get(name) ?? []
      arr.push(dur)
      engineProfile.set(name, arr)
      continue
    }
  }

  return {
    runIndex,
    exitCode,
    t0ByPid,
    markers,
    engineProfile,
    durationMs: performance.now() - t0,
    rawStderr: stderr,
  }
}

// --------------- stats ---------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

function median(sorted: number[]): number {
  return percentile(sorted, 50)
}

function summarize(samples: number[]): { min: number; p50: number; p90: number; max: number; median: number; n: number } {
  if (samples.length === 0) return { min: NaN, p50: NaN, p90: NaN, max: NaN, median: NaN, n: 0 }
  const sorted = [...samples].sort((a, b) => a - b)
  return {
    min: sorted[0],
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    max: sorted[sorted.length - 1],
    median: median(sorted),
    n: sorted.length,
  }
}

// --------------- main ---------------

async function main() {
  const results: RunResult[] = []
  for (let i = 0; i < runs; i++) {
    const r = await runOnce(i + 1, args)
    results.push(r)
    if (!json) {
      process.stderr.write(
        `[bench] run ${i + 1}/${runs} done exit=${r.exitCode} duration=${Math.round(r.durationMs)}ms markers=${r.markers.length} profile=${r.engineProfile.size}\n`,
      )
    }
  }

  const failedRuns = results.filter((r) => r.exitCode !== 0)
  if (failedRuns.length > 0) {
    for (const r of failedRuns) {
      process.stderr.write(`[bench] run ${r.runIndex}/${runs} failed with exit=${r.exitCode}\n`)
      if (r.rawStderr) process.stderr.write(r.rawStderr)
    }
    process.exitCode = 1
    return
  }

  // Group markers by phase. For start/end pairs (e.g. resolveModelInfo_start/_end),
  // compute derived duration. For absolute-phase markers, use ts_raw (wall-clock
  // within the spawned process).
  type Sample = { phase: string; kind: "absolute" | "duration"; value: number; runIndex: number }

  const samples: Sample[] = []
  // Track pending start phases per run per phase-name-with-_start suffix.
  const pendingByRun = new Map<number, Map<string, number>>()

  for (const r of results) {
    const pending = new Map<string, number>()
    pendingByRun.set(r.runIndex, pending)
    for (const m of r.markers) {
      if (m.phase.endsWith("_start")) {
        pending.set(m.phase, m.ts_ms)
        continue
      }
      if (m.phase.endsWith("_end")) {
        const baseName = m.phase.slice(0, -"_end".length)
        const startName = baseName + "_start"
        const startTs = pending.get(startName)
        if (startTs !== undefined) {
          samples.push({ phase: baseName, kind: "duration", value: m.ts_ms - startTs, runIndex: r.runIndex })
          pending.delete(startName)
        }
        continue
      }
      if (m.phase.endsWith("_ms")) {
        // Pre-computed duration marker (e.g. bridge_config_ms).
        const baseName = m.phase.slice(0, -"_ms".length)
        samples.push({ phase: baseName + "_duration", kind: "duration", value: m.ts_ms, runIndex: r.runIndex })
        continue
      }
      // Absolute marker.
      samples.push({ phase: m.phase, kind: "absolute", value: m.ts_ms, runIndex: r.runIndex })
    }
  }

  // Aggregate by phase.
  const byPhase = new Map<string, number[]>()
  for (const s of samples) {
    const arr = byPhase.get(s.phase) ?? []
    arr.push(s.value)
    byPhase.set(s.phase, arr)
  }
  // Merge in engine [profile] samples (existing cli/profile.ts emit).
  for (const r of results) {
    for (const [name, vals] of r.engineProfile) {
      const arr = byPhase.get(name) ?? []
      arr.push(...vals)
      byPhase.set(name, arr)
    }
  }

  // Sort phases in logical order: arcana_entry first, then fast path, engine
  // spawn, then engine phases.
  const order = [
    "arcana_entry",
    "fast_path_enter",
    "bridge_config",
    "bridge_config_done",
    "engine_spawn",
    "engine_spawn_done",
    "cli-import",
    "yargs-parse",
    "global-mkdir",
    "footer_module_load",
    "footer_constructed",
    "footer_first_patch",
    "stream_transport_module_load",
    "first_stream_commit",
    "first_footer_patch",
    "resolveModelInfo",
    "resolveSessionInfo",
    "resolveRunTuiConfig",
    "resolveDiffStyle",
  ]
  const sorted = [...byPhase.keys()].sort((a, b) => {
    const ai = order.indexOf(a)
    const bi = order.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.localeCompare(b)
  })

  const rows: Array<{
    phase: string
    kind: "absolute" | "duration"
    n: number
    min: number
    p50: number
    p90: number
    max: number
    median: number
  }> = []
  for (const phase of sorted) {
    const samples = byPhase.get(phase) ?? []
    const stats = summarize(samples)
    // Engine profile entries are durations (ms); JSON duration markers have
    // _duration suffix; absolute markers are everything else.
    let kind: "absolute" | "duration" = "absolute"
    if (phase.endsWith("_duration")) kind = "duration"
    else if (phase === "TOTAL" || phase.includes("→") || results.some((r) => r.engineProfile.has(phase))) {
      kind = "duration"
    }
    rows.push({
      phase,
      kind,
      n: stats.n,
      min: Math.round(stats.min),
      p50: Math.round(stats.p50),
      p90: Math.round(stats.p90),
      max: Math.round(stats.max),
      median: Math.round(stats.median),
    })
  }

  if (json) {
    console.log(JSON.stringify({ runs, args, rows }, null, 2))
    return
  }

  // Pretty print markdown table.
  process.stderr.write("\n")
  process.stderr.write(`# Arcana startup bench — runs=${runs} args=${JSON.stringify(args)}\n\n`)
  process.stderr.write(`| Phase | Kind | n | min (ms) | p50 (ms) | p90 (ms) | max (ms) |\n`)
  process.stderr.write(`|-------|------|---|---------:|---------:|---------:|---------:|\n`)
  for (const r of rows) {
    process.stderr.write(
      `| ${r.phase} | ${r.kind} | ${r.n} | ${r.min} | ${r.p50} | ${r.p90} | ${r.max} |\n`,
    )
  }
  process.stderr.write(`\nTotal wall-clock per run (parent process measured):\n`)
  const wallTimes = results.map((r) => Math.round(r.durationMs))
  const wallStats = summarize(wallTimes)
  process.stderr.write(
    `  min=${Math.round(wallStats.min)} p50=${Math.round(wallStats.p50)} p90=${Math.round(wallStats.p90)} max=${Math.round(wallStats.max)} ms\n`,
  )
}

await main()