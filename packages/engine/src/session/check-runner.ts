/**
 * Deterministic check runner — replaces the adversarial model verifier
 * with pass/fail signals from actual commands (test, typecheck, build, lint).
 *
 * The agent runs checks, reads the output, and fixes errors iteratively.
 * No model judgment. No evidence packets. Just a signal.
 *
 * Performance contract (2026-08-23 audit): checks run in PARALLEL, scoped to
 * the touched workspace packages when the project is a bun/monorepo layout,
 * and are hard-bounded by per-check timeouts with Windows-safe tree kills.
 * Operator abort (ctx.abort) propagates into the child processes instead of
 * orphaning them.
 */

import { existsSync } from "node:fs"
import { join } from "node:path"

export type CheckName = "test" | "typecheck" | "build" | "lint"

export type CheckError = {
  file?: string
  line?: number
  column?: number
  message: string
  severity: "error" | "warning"
}

export type SingleCheckResult = {
  name: CheckName
  command: string
  passed: boolean
  exitCode: number
  output: string
  errors: CheckError[]
  duration: number
}

export type CheckResult = {
  passed: boolean
  checks: SingleCheckResult[]
  summary: string
}

const CHECK_TIMEOUT_MS = 120_000 // 2 minutes per check
const OUTPUT_CAP = 10_000

/**
 * Parse common error patterns from command output — ADVISORY ONLY.
 * Used exclusively to structure the failure report for the agent; a passing
 * exit code is never flipped by output content (the old generic-matcher
 * false-failure loop cost whole extra multi-minute verification rounds).
 */
function parseErrors(name: CheckName, output: string): CheckError[] {
  const errors: CheckError[] = []
  const lines = output.split("\n")

  for (const line of lines) {
    // TypeScript errors: "file.ts:10:5: error TS2345: ..."
    const tsMatch = line.match(/^(\S+\.\w+):(\d+):(\d+):\s+error\s+(TS\d+):\s+(.+)$/)
    if (tsMatch) {
      errors.push({
        file: tsMatch[1],
        line: Number.parseInt(tsMatch[2], 10),
        column: Number.parseInt(tsMatch[3], 10),
        message: `${tsMatch[4]}: ${tsMatch[5]}`,
        severity: "error",
      })
      continue
    }

    // ESLint errors: "file.js:10:5: error - message"
    const eslintMatch = line.match(/^(\S+\.\w+):(\d+):(\d+):\s+error\s+-\s+(.+)$/)
    if (eslintMatch) {
      errors.push({
        file: eslintMatch[1],
        line: Number.parseInt(eslintMatch[2], 10),
        column: Number.parseInt(eslintMatch[3], 10),
        message: eslintMatch[4],
        severity: "error",
      })
      continue
    }

    // Test failures: "FAIL packages/foo/bar.test.ts"
    const testFailMatch = line.match(/^FAIL\s+(\S+)$/)
    if (testFailMatch) {
      errors.push({
        file: testFailMatch[1],
        message: "Test suite failed",
        severity: "error",
      })
      continue
    }

    // Build errors: "Error: ..." or "error: ..." (build checks only)
    const buildErrorMatch = line.match(/^(?:Error|error):\s+(.+)$/)
    if (buildErrorMatch && name === "build") {
      errors.push({
        message: buildErrorMatch[1],
        severity: "error",
      })
    }
  }

  return errors
}

/**
 * Kill a spawned process AND its child tree. Bare proc.kill() only terminates
 * `bash -c`, orphaning grandchildren (bun test workers) that keep the stdio
 * pipes open — which previously let "timed out" checks run for minutes past
 * their cap.
 */
async function killTree(proc: Bun.Subprocess<"ignore", "pipe", "pipe">): Promise<void> {
  try {
    if (process.platform === "win32" && proc.pid) {
      Bun.spawnSync(["taskkill", "/PID", String(proc.pid), "/T", "/F"], {
        stdout: "ignore",
        stderr: "ignore",
      })
      return
    }
    proc.kill(9)
  } catch {
    /* already exited */
  }
}

async function runSingleCheck(
  input: {
    name: CheckName
    command: string
    cwd: string
    signal?: AbortSignal
    timeoutMs?: number
  },
): Promise<SingleCheckResult> {
  const timeoutMs = input.timeoutMs ?? CHECK_TIMEOUT_MS
  const start = Date.now()
  let output = ""
  let exitCode = 0
  let timedOut = false
  let aborted = false

  try {
    // Security: only pass safe env vars — never leak secrets to child processes.
    const safeEnv: Record<string, string | undefined> = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TERM: "dumb",
      NODE_ENV: process.env.NODE_ENV,
      BUN_INSTALL: process.env.BUN_INSTALL,
    }
    const proc = Bun.spawn(["bash", "-c", input.command], {
      cwd: input.cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: safeEnv,
    })

    const kill = () => void killTree(proc)
    const onAbort = () => {
      aborted = true
      kill()
    }
    if (input.signal?.aborted) onAbort()
    else input.signal?.addEventListener("abort", onAbort, { once: true })

    // Hard deadline race: even if pipes stay open (a grandchild that escaped
    // the tree kill), resolve on time instead of hanging the tool call.
    let deadlineResolve: (() => void) | undefined
    const deadline = new Promise<void>((resolve) => {
      deadlineResolve = resolve
    })
    const timer = setTimeout(() => {
      timedOut = true
      kill()
      deadlineResolve?.()
    }, timeoutMs)

    try {
      await Promise.race([
        (async () => {
          const stdout = await new Response(proc.stdout).text()
          const stderr = await new Response(proc.stderr).text()
          output = stdout + (stderr ? "\n" + stderr : "")
          exitCode = await proc.exited
        })(),
        deadline,
      ])
    } finally {
      clearTimeout(timer)
      input.signal?.removeEventListener("abort", onAbort)
      if (input.signal?.aborted || aborted) kill()
    }

    if (timedOut && exitCode === 0) exitCode = 124
    if (aborted && exitCode === 0) exitCode = 130
    if (timedOut) output += `\n[check exceeded ${Math.round(timeoutMs / 1000)}s timeout]`
    if (aborted) output += "\n[aborted by operator]"
  } catch (error) {
    output = error instanceof Error ? error.message : String(error)
    exitCode = 1
  }

  const duration = Date.now() - start

  return {
    name: input.name,
    command: input.command,
    // Exit code is the ONLY pass criterion. Parsed errors are advisory and
    // appear in the failure report below.
    passed: exitCode === 0,
    exitCode,
    output: output.slice(0, OUTPUT_CAP),
    errors: parseErrors(input.name, output),
    duration,
  }
}

/** Best-effort git repo root for cwd; null outside a repo or on failure. */
async function gitToplevel(cwd: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
      cwd,
      stdout: "pipe",
      stderr: "ignore",
    })
    const out = (await new Response(proc.stdout).text()).trim()
    await proc.exited
    return proc.exitCode === 0 && out ? out : null
  } catch {
    return null
  }
}

/** Changed files (staged + unstaged + untracked) relative to repo root. */
async function gitChangedFiles(gitRoot: string): Promise<string[]> {
  try {
    const proc = Bun.spawn(["git", "status", "--porcelain", "-z"], {
      cwd: gitRoot,
      stdout: "pipe",
      stderr: "ignore",
    })
    const raw = await new Response(proc.stdout).text()
    await proc.exited
    if (proc.exitCode !== 0) return []
    // -z NUL-separated entries: XY <path> (rename entries carry "to\0from").
    return raw
      .split("\0")
      .filter((entry, index, all) => {
        if (!entry) return false
        const prev = all[index - 1]
        // Skip rename "from" halves: they follow the "to" path entry.
        if (prev !== undefined && prev.length >= 3 && prev.slice(3).includes(" -> ")) return false
        return entry.length > 3
      })
      .map((entry) => (entry.includes(" -> ") ? entry.split(" -> ")[1]! : entry.slice(3)))
      .map((p) => p.replaceAll("\\", "/"))
  } catch {
    return []
  }
}

/**
 * Scoped command for a check, derived from the touched workspace packages.
 * Returns undefined when no scoped form applies (caller uses the plain
 * default). Pure with respect to `changedFiles`; filesystem reads only
 * confirm workspace layout. Exported for unit tests.
 */
export async function scopedCommand(input: {
  name: CheckName
  gitRoot: string
  changedFiles: string[]
}): Promise<{ command: string; cwd: string } | undefined> {
  const names: string[] = []
  const testDirs: string[] = []
  const seen = new Set<string>()
  for (const file of input.changedFiles) {
    const match = file.match(/^packages\/([^/]+)\//)
    if (!match) continue
    const dirName = match[1]!
    if (seen.has(dirName)) continue
    seen.add(dirName)
    const pkgJson = join(input.gitRoot, "packages", dirName, "package.json")
    if (!existsSync(pkgJson)) continue
    try {
      const parsed = JSON.parse(await Bun.file(pkgJson).text()) as { name?: string }
      if (typeof parsed.name === "string" && parsed.name) {
        names.push(parsed.name)
        const testDir = join("packages", dirName, "test")
        if (existsSync(join(input.gitRoot, testDir))) testDirs.push(testDir.replaceAll("\\", "/"))
      }
    } catch {
      /* unreadable package.json — skip this package */
    }
  }

  if (input.name === "typecheck" && names.length === 1) {
    // Touched a single workspace package → typecheck just that one.
    return { command: `bun run --filter ${names[0]} typecheck`, cwd: input.gitRoot }
  }
  if (input.name === "test" && testDirs.length > 0) {
    // Touched workspace packages with test dirs → run only those suites.
    return { command: `bun test ${testDirs.join(" ")}`, cwd: input.gitRoot }
  }
  return undefined
}

async function resolveCommand(
  name: CheckName,
  context: { cwd: string; gitRoot: string | null; changed: string[] },
  override?: (name: CheckName) => string | undefined,
): Promise<{ command: string; cwd: string } | undefined> {
  if (override) {
    const custom = override(name)
    if (custom) return { command: custom, cwd: context.cwd }
  }
  const defaults: Record<CheckName, string> = {
    test: "bun test",
    typecheck: "bun run typecheck",
    build: "bun run build",
    lint: "bun run lint",
  }
  const base = defaults[name]
  if (!base) return undefined
  if (!context.gitRoot) return { command: base, cwd: context.cwd }
  const scoped = await scopedCommand({ name, gitRoot: context.gitRoot, changedFiles: context.changed })
  return scoped ?? { command: base, cwd: context.cwd }
}

/**
 * Run checks in PARALLEL and aggregate results. Wall time is the slowest
 * single check, not the sum. Operator abort (signal) kills every child tree
 * immediately.
 */
export async function runChecks(input: {
  checks: CheckName[]
  cwd: string
  signal?: AbortSignal
  onCheckStart?: (name: CheckName, index: number, total: number) => void
  /** Test hook: override command resolution. Not exposed to models. */
  resolveCommandOverride?: (name: CheckName) => string | undefined
  /** Test hook: shrink the per-check timeout (default 120s). */
  perCheckTimeoutMs?: number
}): Promise<CheckResult> {
  const gitRoot = await gitToplevel(input.cwd)
  const changed = gitRoot ? await gitChangedFiles(gitRoot) : []

  const planned = await Promise.all(
    input.checks.map(async (name, index) => {
      const resolved = await resolveCommand(name, { cwd: input.cwd, gitRoot, changed }, input.resolveCommandOverride)
      if (!resolved) return undefined
      input.onCheckStart?.(name, index, input.checks.length)
      return runSingleCheck({
        name,
        command: resolved.command,
        cwd: resolved.cwd,
        signal: input.signal,
        timeoutMs: input.perCheckTimeoutMs,
      }).then((result) => ({ index, result }))
    }),
  )

  const results = planned
    .filter((entry): entry is { index: number; result: SingleCheckResult } => entry !== undefined)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.result)

  if (results.length === 0) {
    return { passed: false, checks: [], summary: "No runnable checks resolved" }
  }

  if (input.signal?.aborted) {
    return { passed: false, checks: results, summary: "Aborted by operator" }
  }

  const passed = results.every((r) => r.passed)
  const failedChecks = results.filter((r) => !r.passed)
  const passedChecks = results.filter((r) => r.passed)

  const summary = passed
    ? `All ${results.length} check(s) passed`
    : `${passedChecks.length}/${results.length} checks passed. Failed: ${failedChecks.map((r) => r.name).join(", ")}`

  return { passed, checks: results, summary }
}

/**
 * Format check results for agent consumption.
 * Shows specific errors the agent can read and fix.
 */
export function formatCheckResult(result: CheckResult): string {
  if (result.passed) {
    return [
      "All checks passed.",
      "",
      ...result.checks.map((r) => `${r.name}: passed (${r.duration}ms)`),
    ].join("\n")
  }

  const lines: string[] = ["Some checks failed. Fix the specific errors below.", ""]

  for (const check of result.checks) {
    if (check.passed) {
      lines.push(`${check.name}: passed (${check.duration}ms)`)
      continue
    }

    lines.push(`${check.name}: FAILED (${check.duration}ms, exit code ${check.exitCode})`)

    if (check.errors.length > 0) {
      lines.push("Errors:")
      for (const error of check.errors.slice(0, 20)) {
        const location = error.file ? `${error.file}${error.line ? `:${error.line}` : ""}` : ""
        lines.push(`  ${location ? `${location}: ` : ""}${error.message}`)
      }
      if (check.errors.length > 20) {
        lines.push(`  ... and ${check.errors.length - 20} more errors`)
      }
    } else {
      // Show raw output if no structured errors were parsed
      const tail = check.output.split("\n").slice(-20).join("\n")
      lines.push("Raw output (last 20 lines):")
      lines.push(tail)
    }

    lines.push("")
  }

  return lines.join("\n")
}
