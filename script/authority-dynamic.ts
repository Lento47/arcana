// script/authority-dynamic.ts
// K0 dynamic authority audit runner (Authority Kernel plan, M0).
//
// Runs the exercise suite (or --suite "pkg a b") under the wrapping preload,
// then compares EXERCISED authority origins against declared ∪ baseline —
// same acceptance rule as the static scan, different claim:
//   static  proves structure
//   dynamic proves exercised paths   (never dormant-path absence)
//
// Usage:
//   bun run script/authority-dynamic.ts                 # offline exercise suite
//   bun run script/authority-dynamic.ts --suite core    # bun test packages/core … under preload
//   bun run script/authority-dynamic.ts --json

import { readFileSync, existsSync, rmSync } from "node:fs"
import { join, relative, sep, isAbsolute } from "node:path"

const REPO = resolveRepoRoot()
const REPORT = join(REPO, ".authority-dynamic.json")
const MANIFEST_PATH = join(REPO, "docs", "architecture", "authority", "surface.manifest.json")
const BASELINE_PATH = join(REPO, "docs", "architecture", "authority", "surface.baseline.json")

function resolveRepoRoot(): string {
  let dir = import.meta.dir
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "package.json")) && existsSync(join(dir, "packages"))) return dir
    dir = join(dir, "..")
  }
  throw new Error("repo root not found")
}

const toPosix = (p: string) => p.split(sep).join("/")

const args = process.argv.slice(2)
const jsonOut = args.includes("--json")
const suiteIdx = args.indexOf("--suite")
const suitePkgs = suiteIdx >= 0 ? args[suiteIdx + 1]!.split(",") : null

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as { rawModules: Record<string, string> }
const baseline = existsSync(BASELINE_PATH)
  ? (JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as { entries: Record<string, unknown> })
  : { entries: {} as Record<string, unknown> }
const known = new Set<string>(Object.keys(baseline.entries))

// ── run tests under preload ─────────────────────────────────────────────
process.env.ARCANA_AUTHORITY_REPORT = REPORT
const testTargets = suitePkgs ? suitePkgs.map((p) => `packages/${p.trim()}`) : ["script/authority-dynamic.exercise.test.ts"]
const proc = Bun.spawnSync({
  cmd: [process.execPath, "test", ...testTargets],
  cwd: REPO,
  stdout: "pipe",
  stderr: "pipe",
  env: process.env,
})
const testOk = proc.exitCode === 0
if (!jsonOut && !testOk) {
  console.error(new TextDecoder().decode(proc.stderr).slice(0, 4000))
}

// ── compare exercised origins ───────────────────────────────────────────
type Entry = { api: string; file: string }
let log: Entry[] = []
try {
  if (existsSync(REPORT)) {
    // Report is JSONL (one record per append) — never whole-file JSON.
    log = readFileSync(REPORT, "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as Entry)
  }
} catch {
  /* treated as empty below */
}
try { rmSync(REPORT, { force: true }) } catch {}

const exercised = new Map<string, Set<string>>()
for (const e of log) {
  let file = e.file ?? "(unknown)"
  if (!isAbsolute(file)) file = join(REPO, file)
  const rel = toPosix(relative(REPO, file))
  if (rel.startsWith("..")) continue // outside repo (bun internals etc.)
  if (!exercised.has(rel)) exercised.set(rel, new Set())
  exercised.get(rel)!.add(e.api)
}

const undeclared: Array<{ file: string; apis: string[] }> = []
for (const [file, apis] of [...exercised.entries()].sort()) {
  if (file.startsWith("script/")) continue // harness itself
  if (!known.has(file)) undeclared.push({ file, apis: [...apis].sort() })
}

// Harness self-check: the exercise suite must have recorded both classes.
const sawFetch = log.some((e) => e.api === "fetch")
const sawSpawn = log.some((e) => e.api === "Bun.spawnSync")

if (jsonOut) {
  console.log(JSON.stringify({ testOk, recorded: log.length, exercisedFiles: exercised.size, undeclared, harness: { sawFetch, sawSpawn } }, null, 2))
} else {
  console.log(`authority-dynamic: ${log.length} recorded · ${exercised.size} files exercised`)
  for (const u of undeclared) console.log(`  NEW UNDECLARED  ${u.file}  via ${u.apis.join(", ")}`)
  if (undeclared.length > 0) console.error(`authority-dynamic: FAIL — ${undeclared.length} exercised-but-undeclared source(s).`)
}
// Harness self-check: exercise mode MUST record both classes, else the audit
// is vacuously green and proves nothing.
const harnessOk = suitePkgs ? true : sawFetch && sawSpawn
const ok = testOk && undeclared.length === 0 && harnessOk
if (!jsonOut && !ok && harnessOk === false) {
  console.error("authority-dynamic: FAIL — harness recorded nothing (preload not applied?).")
}
if (!jsonOut && ok) console.log("authority-dynamic: OK")
process.exit(ok ? 0 : 1)
