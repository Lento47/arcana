#!/usr/bin/env bun
/**
 * scripts/generate-current-state.ts
 *
 * Generates docs/CURRENT-STATE.json from the actual repository state. The
 * generated file is the single machine-readable status snapshot consumed by
 * the status-authority CI guard (.github/workflows/status-authority.yml):
 *
 *   status.implementationCheckpoint == git rev-parse HEAD
 *
 * Everything in the output is read from the repo at run time:
 *
 *   - exact commit and branch ancestry: `git rev-parse HEAD` / `git log --oneline -20`;
 *   - contract revisions: headers of contracts/approval-api.v1.yaml and contracts/events.v1.json;
 *   - open release gates: docs/BLOCKERS.md summary rows that are open (blockers > 0);
 *   - mounted product surfaces: repo layout + PRODUCT.md / ADR-004 semantics;
 *   - CI workflow names: .github/workflows/ (run IDs are NOT fabricated);
 *   - test totals: from a fresh `bun test` summary when the
 *     CURRENT_STATE_TEST_SUMMARY env var points at a runner log (each suite
 *     bracketed by `===SUITE:<name>===` / `===SUITE_END:<name>===` markers),
 *     otherwise from the documented totals in docs/STATUS.md with
 *     source: "documented". No numbers are invented.
 *
 * Usage:
 *   bun run scripts/generate-current-state.ts
 *   CURRENT_STATE_TEST_SUMMARY=/path/to/summary.log bun run scripts/generate-current-state.ts
 */

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, "..")
const OUT_FILE = resolve(REPO_ROOT, "docs", "CURRENT-STATE.json")
const STATUS_FILE = resolve(REPO_ROOT, "docs", "STATUS.md")
const BLOCKERS_FILE = resolve(REPO_ROOT, "docs", "BLOCKERS.md")
const APPROVAL_CONTRACT = resolve(REPO_ROOT, "contracts", "approval-api.v1.yaml")
const EVENTS_CONTRACT = resolve(REPO_ROOT, "contracts", "events.v1.json")
const WORKFLOWS_DIR = resolve(REPO_ROOT, ".github", "workflows")
const VERIFICATION_DATE = new Date().toISOString().slice(0, 10)

// ---------- git ----------

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim()
}

const commit = git(["rev-parse", "HEAD"])
const branchAncestry = git(["log", "--oneline", "-20"])
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)

// ---------- contracts ----------

function readContractRevisions() {
  const yaml = readFileSync(APPROVAL_CONTRACT, "utf8").split(/\r?\n/)

  let infoVersion = "unknown"
  let infoTitle = "unknown"
  const arcanaContract: Record<string, string> = {}

  let inInfo = false
  let inArcanaContract = false
  for (const raw of yaml) {
    const line = raw.replace(/\s+$/, "")
    if (inArcanaContract) {
      if (/^\S/.test(line)) {
        inArcanaContract = false
      } else {
        const m = line.match(/^\s{2}([\w-]+):\s*"?([^"#]+?)"?\s*$/)
        if (m) arcanaContract[m[1]] = m[2].trim()
        continue
      }
    }
    if (inInfo) {
      if (/^\S/.test(line)) {
        inInfo = false
      } else {
        const m = line.match(/^\s{2}(title|version):\s*(.+)$/)
        if (m) {
          if (m[1] === "title") infoTitle = m[2].trim()
          else infoVersion = m[2].trim()
        }
        continue
      }
    }
    if (/^info:\s*$/.test(line)) inInfo = true
    if (/^x-arcana-contract:\s*$/.test(line)) inArcanaContract = true
  }

  const events = JSON.parse(readFileSync(EVENTS_CONTRACT, "utf8")) as {
    title?: string
    version?: string
  }

  return {
    approvalApi: {
      file: "contracts/approval-api.v1.yaml",
      title: infoTitle,
      version: infoVersion,
      contractStatus: arcanaContract["status"] ?? "unknown",
      correctedAt: arcanaContract["corrected_at"] ?? undefined,
      runtimeSurface: arcanaContract["runtime_surface"] ?? undefined,
    },
    events: {
      file: "contracts/events.v1.json",
      title: events.title ?? "unknown",
      version: events.version ?? "unknown",
    },
  }
}

// ---------- open release gates (docs/BLOCKERS.md) ----------

function readOpenReleaseGates() {
  const lines = readFileSync(BLOCKERS_FILE, "utf8").split(/\r?\n/)
  const gates: Array<{ area: string; status: string; openBlockers: number }> = []

  let inSummary = false
  for (const line of lines) {
    if (/^## Summary\s*$/.test(line)) {
      inSummary = true
      continue
    }
    if (inSummary && /^## /.test(line)) inSummary = false
    if (!inSummary) continue

    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|/)
    if (!m) continue
    const openBlockers = Number(m[3])
    if (openBlockers > 0) {
      gates.push({ area: m[1].trim(), status: m[2].trim(), openBlockers })
    }
  }

  return {
    source: "docs/BLOCKERS.md summary rows (open blockers > 0)",
    gates,
    note: "Acceptance evidence and closing rules for each gate live in docs/BLOCKERS.md.",
  }
}

// ---------- test totals ----------

type Totals = { pass?: number; fail?: number; skip?: number; todo?: number }

function parseBunBlock(lines: string[]): Totals | null {
  const totals: Totals = {}

  // Combined one-line summary: "4302 pass, 74 skip, 1 todo, 0 fail"
  const combined = lines.join(" ").match(/(\d+)\s+pass[^\d]*(\d+)\s+skip[^\d]*(\d+)\s+todo[^\d]*(\d+)\s+fail/)
  if (combined) {
    return { pass: Number(combined[1]), skip: Number(combined[2]), todo: Number(combined[3]), fail: Number(combined[4]) }
  }

  // Line-per-status summary: " 4302 pass" / " 74 skip" / " 1 todo" / " 0 fail"
  for (const line of lines) {
    const m = line.match(/^\s*(\d+)\s+(pass|fail|skip|todo)\s*$/)
    if (m) totals[m[2] as keyof Totals] = Number(m[1])
  }
  return totals.pass !== undefined || totals.fail !== undefined || totals.skip !== undefined || totals.todo !== undefined
    ? totals
    : null
}

function readFreshTestTotals(logPath: string) {
  const text = readFileSync(logPath, "utf8")
  const suites: Record<string, { ok: boolean; totals: Totals | null; exitCode: number | null }> = {}
  const summaryFile = logPath.startsWith(REPO_ROOT + "\\") || logPath.startsWith(REPO_ROOT + "/")
    ? logPath.slice(REPO_ROOT.length + 1)
    : logPath

  const re = /===SUITE:([^=\r\n]+?)===\r?\n([\s\S]*?)\r?\n===SUITE_END:\1===/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const name = match[1]
    const block = match[2].split(/\r?\n/)
    const exitLine = block.find((line) => /^exit=/.test(line))
    const parsedExit = exitLine ? Number(exitLine.replace(/^exit=/, "")) : NaN
    const exitCode = Number.isFinite(parsedExit) ? parsedExit : null
    suites[name] = { ok: true, totals: parseBunBlock(block), exitCode }
  }

  const overall: Totals = {}
  const failures: string[] = []
  for (const [name, suite] of Object.entries(suites)) {
    const t = suite.totals ?? {}
    for (const key of ["pass", "fail", "skip", "todo"] as const) {
      if (t[key] !== undefined) overall[key] = (overall[key] ?? 0) + t[key]
    }
    if (suite.exitCode !== 0) failures.push(`${name} (exit=${suite.exitCode})`)
  }

  return {
    source: "fresh_run",
    summaryFile,
    suites,
    overall,
    failures,
    note: "Parsed from a fresh `bun test` run (see summaryFile for the raw log).",
  }
}

function readDocumentedTestTotals() {
  const text = readFileSync(STATUS_FILE, "utf8")
  const section = text.split(/\r?\n/)
  const start = section.findIndex((line) => /^## Test checkpoint/.test(line))
  const end = section.findIndex((line, i) => i > start && /^## /.test(line))
  const rows = (end === -1 ? section.slice(start + 1) : section.slice(start + 1, end)).filter((line) =>
    /^\|/.test(line)
  )

  const suites: Record<string, string> = {}
  for (const row of rows) {
    const cells = row.split("|").map((c) => c.trim())
    if (cells.length < 3) continue
    const name = cells[1].replace(/^\*+|\*+$/g, "").trim()
    if (!name || name === "Gate") continue
    suites[name] = cells[2]
  }

  function parseCell(cell: string): { pass: number; skip: number; fail: number; todo?: number; tests?: number } | null {
    const canonical = cell.match(
      /canonical full-suite rerun 2026-08-03:\s*(\d+)\s+pass\s*\/\s*(\d+)\s+skip\s*\/\s*(\d+)\s+todo\s*\/\s*(\d+)\s+fail\s*\((\d+)\s+tests/i
    )
    if (canonical) {
      return {
        pass: Number(canonical[1]),
        skip: Number(canonical[2]),
        todo: Number(canonical[3]),
        fail: Number(canonical[4]),
        tests: Number(canonical[5]),
      }
    }
    const simple = cell.match(/(\d+)\s+pass(?:\s*\/\s*(\d+)\s+skip)?\s*\/\s*(\d+)\s+fail/)
    if (simple) {
      const tests = cell.match(/\((\d+)\s+tests?\)/)
      return {
        pass: Number(simple[1]),
        skip: simple[2] === undefined ? 0 : Number(simple[2]),
        fail: Number(simple[3]),
        ...(tests ? { tests: Number(tests[1]) } : {}),
      }
    }
    return null
  }

  const parsed: Record<string, unknown> = {}
  for (const [name, cell] of Object.entries(suites)) {
    if (name === "---" || name === "Gate" || name === "") continue
    const totals = parseCell(cell)
    if (totals) parsed[name] = { ...totals, evidence: cell.slice(0, 220) }
    else parsed[name] = { note: "non-numeric row in the STATUS.md test table", evidence: cell.slice(0, 220) }
  }

  return {
    source: "documented",
    documentedAt: `${VERIFICATION_DATE} (docs/STATUS.md current test checkpoint table)`,
    suites: parsed,
    note: "No fresh run was parsed; totals are the documented figures from docs/STATUS.md. Nothing was invented.",
  }
}

function readTestTotals(): unknown {
  const envPath = process.env.CURRENT_STATE_TEST_SUMMARY
  if (!envPath || !existsSync(envPath) || !statSync(envPath).isFile()) return readDocumentedTestTotals()

  const documented = readDocumentedTestTotals()
  const fresh = readFreshTestTotals(envPath)

  // Per-suite truth: use the fresh `bun test` numbers when the suite parsed
  // cleanly (exit 0) from the fresh run. For suites whose fresh run was not
  // clean — or that were not part of the fresh run at all — keep the
  // documented figure (source: "documented") and, when a fresh block exists,
  // attach the raw fresh attempt as freshAttempt so nothing is hidden.
  const merged: Record<string, unknown> = {}
  for (const [name, docEntry] of Object.entries(documented.suites)) {
    const freshEntry = fresh.suites[name]
    if (freshEntry?.ok && freshEntry.totals && freshEntry.exitCode === 0) {
      merged[name] = {
        ...freshEntry.totals,
        source: "fresh_run",
      }
    } else if (freshEntry?.totals) {
      merged[name] = {
        ...(docEntry as object),
        source: "documented",
        freshAttempt: { ...freshEntry.totals, exitCode: freshEntry.exitCode },
      }
    } else {
      merged[name] = { ...(docEntry as object), source: "documented" }
    }
  }

  // Fresh logs can contain suites that have not yet been added to STATUS.md.
  // Keep those suites in the generated snapshot instead of silently dropping
  // them just because the documented checkpoint table predates the fresh run.
  for (const [name, freshEntry] of Object.entries(fresh.suites)) {
    if (name in merged) continue
    merged[name] = {
      ...(freshEntry.totals ?? {}),
      source: "fresh_run",
      exitCode: freshEntry.exitCode,
      ...(freshEntry.totals ? {} : { note: "Fresh suite did not expose parseable Bun totals." }),
    }
  }

  return {
    source: "mixed",
    summaryFile: fresh.summaryFile,
    documentedAt: documented.documentedAt,
    suites: merged,
    failures: fresh.failures,
    note:
      "Suites with a clean fresh run (exit 0) use source: fresh_run; suites whose fresh run was not clean or that were not part of the fresh run retain source: documented with a freshAttempt record where one exists. Fresh-only suites are retained directly from the fresh run. " +
      (fresh.failures.length > 0
        ? `Non-zero exit suites: ${fresh.failures.join(", ")} — see summaryFile for the failing test details. `
        : "") +
      "No numbers were invented.",
  }
}

// ---------- mounted product surfaces (repo layout + PRODUCT.md / ADR-004) ----------

function dirExists(relative: string): boolean {
  const p = resolve(REPO_ROOT, relative)
  return existsSync(p) && statSync(p).isDirectory()
}

function readMountedProductSurfaces() {
  return [
    {
      name: "CLI",
      mounted: dirExists("packages/arcana") && dirExists("packages/engine/src/cli"),
      basis:
        "packages/arcana + packages/engine CLI (repo layout). CLI/TUI is the M1 primary AI work surface (ADR-004).",
    },
    {
      name: "TUI",
      mounted: dirExists("packages/tui"),
      basis: "packages/tui (repo layout). CLI/TUI is the M1 primary AI work surface (ADR-004).",
    },
    {
      name: "SDK",
      mounted: dirExists("packages/sdk/js"),
      basis: "packages/sdk/js (repo layout). SDK consumers use the runtime contract (ADR-004).",
    },
    {
      name: "Desktop",
      mounted: dirExists("packages/desktop") || dirExists("apps/desktop"),
      basis:
        "M1 local approval and forensic companion per ADR-004 (runtime lifecycle, reconnect/resync, pending-approval notification, exact-request inspection, approve/deny through the authoritative runtime, proof inspection, restart recovery). No standalone desktop package exists in the repo layout; the runtime API + /desktop/heartbeat endpoints it consumes are mounted (contracts/approval-api.v1.yaml).",
    },
    {
      name: "Control",
      mounted: dirExists("packages/enterprise"),
      basis:
        "packages/enterprise + /api/enterprise/* (repo layout). Enterprise consoles are preserved implementation tracks, NOT M1 release surfaces (ADR-004).",
    },
  ].map((s) => ({
    ...s,
    source: "docs/PRODUCT.md M1 scope + ADR-004 + repo layout",
  }))
}

// ---------- CI workflow names ----------

function readCiWorkflows() {
  const files = readdirSync(WORKFLOWS_DIR).filter((f) => /\.ya?ml$/.test(f)).sort()
  const workflows = files.map((file) => {
    const text = readFileSync(resolve(WORKFLOWS_DIR, file), "utf8")
    const name = text.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? file
    return { file, name }
  })
  return {
    workflows,
    note: "Run IDs are not fabricated. See workflow runs in GitHub Actions for concrete run IDs.",
  }
}

// ---------- assemble ----------

const testTotals = readTestTotals()

const state = {
  status: {
    documentClass: "current_state",
    authority: "generated_from_repo",
    generatedBy: "scripts/generate-current-state.ts",
    generatedAt: new Date().toISOString(),
    implementationCheckpoint: commit,
    verificationDate: VERIFICATION_DATE,
    currentMilestone: "M1",
  },
  commit,
  verificationDate: VERIFICATION_DATE,
  currentMilestone: "M1",
  branchAncestry,
  testTotals,
  contractRevisions: readContractRevisions(),
  openReleaseGates: readOpenReleaseGates(),
  mountedProductSurfaces: readMountedProductSurfaces(),
  ciWorkflows: readCiWorkflows(),
}

writeFileSync(OUT_FILE, JSON.stringify(state, null, 2) + "\n")

console.log(`Wrote ${OUT_FILE}`)
console.log(`  implementationCheckpoint: ${commit}`)
console.log(`  verificationDate:         ${VERIFICATION_DATE}`)
console.log(`  testTotals.source:        ${(testTotals as { source?: string }).source ?? "unknown"}`)
console.log(`  branchAncestry entries:   ${branchAncestry.length}`)
