import { describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir as osTmpdir } from "node:os"
import path from "node:path"
import { runChecks, scopedCommand } from "./check-runner"

/**
 * These tests execute real (tiny) bash commands through the same spawn path
 * as production checks, so timeout/abort/tree-kill semantics are exercised
 * for real. Sleeps are kept short (~300-600ms).
 */

async function fakeRepo(): Promise<string> {
  const root = await mkdtemp(path.join(osTmpdir(), "check-runner-"))
  await mkdir(path.join(root, "packages", "engine", "test"), { recursive: true })
  await mkdir(path.join(root, "packages", "tui"), { recursive: true })
  await writeFile(
    path.join(root, "packages", "engine", "package.json"),
    JSON.stringify({ name: "@arcana/engine" }),
  )
  await writeFile(
    path.join(root, "packages", "tui", "package.json"),
    JSON.stringify({ name: "@arcana/tui" }),
  )
  return root
}

describe("scoped commands", () => {
  test("single touched package → filtered typecheck at git root", async () => {
    const root = await fakeRepo()
    try {
      const scoped = await scopedCommand({
        name: "typecheck",
        gitRoot: root,
        changedFiles: ["packages/engine/src/thing.ts", "README.md"],
      })
      expect(scoped?.command).toBe("bun run --filter @arcana/engine typecheck")
      expect(scoped?.cwd).toBe(root)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("test scope targets only touched packages' test dirs", async () => {
    const root = await fakeRepo()
    try {
      const scoped = await scopedCommand({
        name: "test",
        gitRoot: root,
        changedFiles: ["packages/engine/test/foo.test.ts"],
      })
      expect(scoped?.command).toBe("bun test packages/engine/test")
      expect(scoped?.cwd).toBe(root)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("multi-package typecheck has no scoped form (falls back to root)", async () => {
    const root = await fakeRepo()
    try {
      const scoped = await scopedCommand({
        name: "typecheck",
        gitRoot: root,
        changedFiles: ["packages/engine/src/a.ts", "packages/tui/src/b.tsx"],
      })
      expect(scoped).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("changes outside packages/ never scope", async () => {
    const root = await fakeRepo()
    try {
      const scoped = await scopedCommand({
        name: "typecheck",
        gitRoot: root,
        changedFiles: ["docs/notes.md"],
      })
      expect(scoped).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe("check runner execution", () => {
  test("exit code is the only pass criterion — noisy output cannot flip a pass", async () => {
    const result = await runChecks({
      checks: ["lint"],
      cwd: process.cwd(),
      resolveCommandOverride: () => `echo "warning: error: something" && echo "FAIL-ish line" && exit 0`,
    })
    expect(result.passed).toBe(true)
    expect(result.checks[0]!.exitCode).toBe(0)
  })

  test("checks run in parallel — wall time is the slowest check, not the sum", async () => {
    const t0 = Date.now()
    const result = await runChecks({
      checks: ["typecheck", "test"],
      cwd: process.cwd(),
      perCheckTimeoutMs: 5000,
      resolveCommandOverride: () => `sleep 0.4 && echo done`,
    })
    const elapsed = Date.now() - t0
    expect(result.passed).toBe(true)
    // Sequential would be >= 800ms; parallel should land near 400ms.
    expect(elapsed).toBeLessThan(750)
  })

  test("per-check timeout force-resolves even when pipes stay open", async () => {
    const t0 = Date.now()
    const result = await runChecks({
      checks: ["test"],
      cwd: process.cwd(),
      perCheckTimeoutMs: 400,
      resolveCommandOverride: () => `sleep 30 & sleep 30`,
    })
    const elapsed = Date.now() - t0
    // A hung pipe must not hold the tool call: bounded well under 5s.
    expect(elapsed).toBeLessThan(4000)
    expect(result.passed).toBe(false)
    expect(result.checks[0]!.output).toContain("timeout")
  })

  test("operator abort kills children immediately and reports aborted", async () => {
    const controller = new AbortController()
    const t0 = Date.now()
    setTimeout(() => controller.abort(), 250)
    const result = await runChecks({
      checks: ["test"],
      cwd: process.cwd(),
      signal: controller.signal,
      resolveCommandOverride: () => `sleep 20`,
    })
    const elapsed = Date.now() - t0
    expect(elapsed).toBeLessThan(2000)
    expect(result.summary).toContain("Aborted")
    expect(result.passed).toBe(false)
  })
})
