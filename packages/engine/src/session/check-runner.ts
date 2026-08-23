/**
 * Deterministic check runner — replaces the adversarial model verifier
 * with pass/fail signals from actual commands (test, typecheck, build, lint).
 *
 * The agent runs checks, reads the output, and fixes errors iteratively.
 * No model judgment. No evidence packets. Just a signal.
 */

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

/**
 * Parse common error patterns from command output.
 * Returns structured errors the agent can read and fix.
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

    // Build errors: "Error: ..." or "error: ..."
    const buildErrorMatch = line.match(/^(?:Error|error):\s+(.+)$/)
    if (buildErrorMatch && name === "build") {
      errors.push({
        message: buildErrorMatch[1],
        severity: "error",
      })
      continue
    }

    // Generic error lines
    const genericErrorMatch = line.match(/^\s*(?:Error|ERROR|FAIL|error|fail):\s+(.+)$/)
    if (genericErrorMatch) {
      errors.push({
        message: genericErrorMatch[1],
        severity: "error",
      })
      continue
    }
  }

  return errors
}

/**
 * Run a single check command via Bun.spawn.
 */
async function runSingleCheck(
  name: CheckName,
  command: string,
  cwd: string,
): Promise<SingleCheckResult> {
  const start = Date.now()
  let output = ""
  let exitCode = 0

  try {
    // Security: only pass safe env vars — never leak secrets to child processes.
    const safeEnv: Record<string, string | undefined> = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TERM: "dumb",
      NODE_ENV: process.env.NODE_ENV,
      BUN_INSTALL: process.env.BUN_INSTALL,
    }
    const CHECK_TIMEOUT_MS = 120_000 // 2 minutes per check
    const proc = Bun.spawn(["bash", "-c", command], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: safeEnv,
    })

    // Kill process if it exceeds the timeout
    const timeout = setTimeout(() => {
      try { proc.kill() } catch { /* already exited */ }
    }, CHECK_TIMEOUT_MS)

    try {
      // Collect stdout and stderr
      const stdout = await new Response(proc.stdout).text()
      const stderr = await new Response(proc.stderr).text()
      output = stdout + (stderr ? "\n" + stderr : "")
      exitCode = await proc.exited
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    output = error instanceof Error ? error.message : String(error)
    exitCode = 1
  }

  const duration = Date.now() - start
  const errors = parseErrors(name, output)
  const passed = exitCode === 0 && errors.length === 0

  return {
    name,
    command,
    passed,
    exitCode,
    output: output.slice(0, 10_000), // Cap output to avoid context inflation
    errors,
    duration,
  }
}

/**
 * Run multiple checks and aggregate results.
 */
export async function runChecks(input: {
  checks: CheckName[]
  cwd: string
}): Promise<CheckResult> {
  const defaultCommands: Record<CheckName, string> = {
    test: "bun test",
    typecheck: "bun run typecheck",
    build: "bun run build",
    lint: "bun run lint",
  }

  const results: SingleCheckResult[] = []

  for (const check of input.checks) {
    // Security: only allow hardcoded commands — never use caller-provided commands.
    const command = defaultCommands[check]
    if (!command) continue

    const result = await runSingleCheck(check, command, input.cwd)
    results.push(result)
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
