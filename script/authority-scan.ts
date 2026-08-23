// script/authority-scan.ts
// K0 Authority Surface static scanner (Authority Kernel plan, M0).
//
// Proves the STRUCTURE claim of the Authority Surface gate:
//   ActualAuthoritySources == DeclaredAuthoritySources ∪ GrandfatheredBaseline
//
// - Walks manifest.scan.roots for non-test TypeScript sources.
// - Extracts raw-authority usage: module specifiers listed in
//   manifest.rawModules (static or dynamic import), plus direct Bun.* API calls.
// - Classifies every hit with the manifest's effect classes.
// - Audit mode: exits 0 when every actual source is declared OR grandfathered in
//   surface.baseline.json; exits 1 listing NEW undeclared sources. Stale baseline
//   entries (source removed) are reported as info — pruning is encouraged, never forced.
//
// Usage:
//   bun run script/authority-scan.ts                    # audit diff vs baseline
//   bun run script/authority-scan.ts --update-baseline  # regenerate baseline from tree
//   bun run script/authority-scan.ts --json             # machine-readable report on stdout
//
// Zero dependencies. This file intentionally lives OUTSIDE the scan roots.

import { readdirSync, readFileSync, existsSync } from "node:fs"
import { join, relative, sep } from "node:path"

const REPO = resolveRepoRoot()
const MANIFEST_PATH = join(REPO, "docs", "architecture", "authority", "surface.manifest.json")
const BASELINE_PATH = join(REPO, "docs", "architecture", "authority", "surface.baseline.json")

interface Manifest {
  version: number
  enforcement: string
  scan: { roots: string[]; excludeFilePatterns: string[] }
  rawModules: Record<string, string>
}
type Baseline = { generatedAt: string; entries: Record<string, { classes: string[]; modules: string[] }> }
type Actual = Record<string, { classes: Set<string>; modules: Set<string> }>

function resolveRepoRoot(): string {
  let dir = import.meta.dir
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "package.json")) && existsSync(join(dir, "packages"))) return dir
    dir = join(dir, "..")
  }
  throw new Error("repo root not found")
}

function toPosix(p: string): string {
  return p.split(sep).join("/")
}

const args = new Set(process.argv.slice(2))
const updateBaseline = args.has("--update-baseline")
const jsonOut = args.has("--json")

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest

// ── walk ────────────────────────────────────────────────────────────────
function* walkTs(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".arcana") continue
      yield* walkTs(full)
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      if (manifest.scan.excludeFilePatterns.some((pat) => entry.name.endsWith(pat.replace("*", "")))) continue
      yield full
    }
  }
}

// ── extraction ──────────────────────────────────────────────────────────
// Module specifiers (static + dynamic import + require) and Bun raw API calls.
const IMPORT_RE = /(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/g
const BUN_API_RE = /\bBun\.(spawn|spawnSync|write|writeAll)\b/g
const BUN_SHELL_RE = /\$\s*`/ // Bun $ shell template tag

function extractModules(specifier: string, rawModules: Record<string, string>): string[] {
  const hits: string[] = []
  if (rawModules[specifier] !== undefined) hits.push(specifier)
  return hits
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
}

function scanFile(path: string, rawModules: Record<string, string>): { classes: Set<string>; modules: Set<string> } | null {
  const src = stripComments(readFileSync(path, "utf8"))
  const modules = new Set<string>()
  const classes = new Set<string>()

  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3]
    if (!spec) continue
    for (const hit of extractModules(spec, rawModules)) {
      modules.add(hit)
      classes.add(rawModules[hit]!)
    }
  }

  for (const m of src.matchAll(BUN_API_RE)) {
    const key = `Bun.${m[1]}`
    if (rawModules[key] !== undefined) {
      modules.add(key)
      classes.add(rawModules[key]!)
    }
  }

  if (/\bBun\$|from\s+["']bun["']/.test(src) && BUN_SHELL_RE.test(src)) {
    modules.add("Bun.$shell")
    classes.add(rawModules["Bun.$shell"]!)
  }

  return modules.size > 0 ? { classes, modules } : null
}

// ── main ────────────────────────────────────────────────────────────────
const actual: Actual = {}
for (const root of manifest.scan.roots) {
  const rootDir = join(REPO, root)
  if (!existsSync(rootDir)) continue
  for (const pkg of readdirSync(rootDir, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue
    const srcDir = join(rootDir, pkg.name, "src")
    if (!existsSync(srcDir)) continue
    for (const file of walkTs(srcDir)) {
      const found = scanFile(file, manifest.rawModules)
      if (found) actual[toPosix(relative(REPO, file))] = found
    }
  }
}

if (updateBaseline) {
  const entries: Baseline["entries"] = {}
  for (const key of Object.keys(actual).sort()) {
    entries[key] = { classes: [...actual[key]!.classes].sort(), modules: [...actual[key]!.modules].sort() }
  }
  const baseline: Baseline = { generatedAt: new Date().toISOString(), entries }
  await Bun.write(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n")
  console.log(`baseline updated: ${Object.keys(entries).length} files → ${toPosix(relative(REPO, BASELINE_PATH))}`)
  process.exit(0)
}

const baseline: Baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
  : { generatedAt: "", entries: {} }

const declared = new Set<string>()
const known = new Set<string>([...declared, ...Object.keys(baseline.entries)])

const undeclared: string[] = []
for (const key of Object.keys(actual).sort()) {
  if (!known.has(key)) undeclared.push(key)
}
const stale = Object.keys(baseline.entries).filter((k) => !actual[k]).sort()
// Declared paths that currently carry no raw authority — drift toward honesty.
const emptyDeclared = [...declared].filter((k) => !actual[k])

// packageRules: forbidden modules under a path prefix fail REGARDLESS of
// baseline. Grandfathering records history; it never rescues a banned class.
interface PackageRule { pathPrefix: string; forbiddenModules: string[] }
const rules = (manifest as unknown as { packageRules?: PackageRule[] }).packageRules ?? []
const forbiddenHits: Array<{ path: string; modules: string[] }> = []
if (rules.length > 0) {
  for (const [path, info] of Object.entries(actual)) {
    for (const rule of rules) {
      if (!path.startsWith(rule.pathPrefix)) continue
      const hit = [...info.modules].filter((m) => rule.forbiddenModules.includes(m))
      if (hit.length > 0 && !declared.has(path)) forbiddenHits.push({ path, modules: hit })
    }
  }
}

if (jsonOut) {
  console.log(JSON.stringify({ ok: undeclared.length === 0 && forbiddenHits.length === 0, totals: { actual: Object.keys(actual).length, baseline: Object.keys(baseline.entries).length }, undeclared, forbidden: forbiddenHits, stale, emptyDeclared }, null, 2))
} else {
  console.log(`authority-surface: ${Object.keys(actual).length} actual · ${Object.keys(baseline.entries).length} grandfathered · ${declared.size} kernel-declared`)
  for (const f of undeclared) {
    console.log(`  NEW UNDECLARED  ${f}  [${[...actual[f]!.classes].join(",")}] via ${[...actual[f]!.modules].join(", ")}`)
  }
  for (const f of forbiddenHits) {
    console.log(`  FORBIDDEN       ${f.path}  via ${f.modules.join(", ")}`)
  }
  for (const f of stale) console.log(`  stale-baseline  ${f} (source cleaned — prune with --update-baseline)`)
  for (const f of emptyDeclared) console.log(`  declared-idle   ${f}`)
}
const failures = undeclared.length + forbiddenHits.length
if (failures > 0) {
    console.error(`\nauthority-surface: FAIL — ${failures} violation(s).`)
    console.error(`Declare kernel-owned paths in the manifest; forbidden classes are never grandfathered.`)
} else {
    console.log("authority-surface: OK")
}
process.exit(failures === 0 ? 0 : 1)
