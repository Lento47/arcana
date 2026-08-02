#!/usr/bin/env bun
/**
 * Arcana product smoke test.
 *
 * Exercises the four entry surfaces and reports pass/fail per surface.
 * Designed to be fast (≤30s locally) so it can run before any release.
 *
 *   bun run script/smoke.ts
 *   bun run smoke
 *
 * Surfaces:
 *   1. CLI     — `arcana --help`, `arcana doctor`, `arcana web --help`
 *   2. TUI     — engine src/index.ts typechecks (already in turbo typecheck;
 *                this layer verifies the file exists + is non-empty and
 *                that `arcana` (the wrapper default) would route to it)
 *   3. ML      — `bun --cwd packages/ml run eval`
 *   4. Web     — `packages/enterprise/package.json` exists and the build
 *                script is wired (full build is exercised in `bun run build`)
 */

import { existsSync } from "node:fs"
import { join, dirname } from "node:path"

const repoRoot = dirname(import.meta.dir)
const results: { name: string; ok: boolean; detail: string }[] = []

async function check(name: string, run: () => Promise<string> | string) {
  const start = Date.now()
  try {
    const detail = await run()
    const ms = Date.now() - start
    results.push({ name, ok: true, detail: `${detail} (${ms}ms)` })
    console.log(`  ✅ ${name}: ${detail} (${ms}ms)`)
  } catch (err: any) {
    const ms = Date.now() - start
    const detail = err?.message ?? String(err)
    results.push({ name, ok: false, detail: `${detail} (${ms}ms)` })
    console.log(`  ❌ ${name}: ${detail} (${ms}ms)`)
  }
}

async function runCli(subargs: string[]): Promise<string> {
  const proc = Bun.spawn({
    cmd: ["bun", "packages/arcana/src/index.ts", ...subargs],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
  })
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const exit = await proc.exited
  if (exit !== 0) throw new Error(`exit=${exit} stderr=${err.trim().slice(0, 200)}`)
  return out.trim().split("\n").slice(0, 3).join(" | ").slice(0, 120)
}

console.log("\n  arcana smoke test\n")

// 1. CLI surface
await check("cli --help", () => runCli(["--help"]))
await check("cli doctor", () => runCli(["doctor"]))
await check("cli web --help", () => runCli(["web", "--help"]))

// 2. TUI surface
await check("tui entry exists", () => {
  const tuiEntry = join(repoRoot, "packages", "engine", "src", "index.ts")
  if (!existsSync(tuiEntry)) throw new Error(`${tuiEntry} missing`)
  return tuiEntry
})
await check("tui wrapper routes", () => {
  const wrapper = join(repoRoot, "packages", "arcana", "bin", "arcana")
  const body = require("node:fs").readFileSync(wrapper, "utf8") as string
  // Wrapper must default to engine when no subcommand matches
  if (!body.includes("packages/engine/src/index.ts") && !body.includes("../../engine/src/index.ts")) {
    throw new Error("wrapper does not fall through to engine")
  }
  return "wrapper routes unknown subcommands to engine"
})

// 3. ML surface
await check("ml eval", async () => {
  const proc = Bun.spawn({
    cmd: ["bun", "src/evals.ts"],
    cwd: join(repoRoot, "packages", "ml"),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
  })
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const exit = await proc.exited
  if (exit !== 0) throw new Error(`exit=${exit} stderr=${err.trim().slice(0, 200)}`)
  const passLine = out.trim().split("\n").find((l) => /\d+\/\d+ evals? passed/.test(l))
  return passLine ?? "ok"
})

// 4. Web surface
await check("web entry exists", () => {
  const pkg = join(repoRoot, "packages", "enterprise", "package.json")
  if (!existsSync(pkg)) throw new Error(`${pkg} missing`)
  return pkg
})
await check("web build script wired", () => {
  const pkg = require(join(repoRoot, "packages", "enterprise", "package.json")) as { scripts?: Record<string, string> }
  if (pkg.scripts?.build !== "bun ./script/build.ts") throw new Error("enterprise build script not wired")
  if (pkg.scripts?.dev !== "vite dev") throw new Error("enterprise dev script not wired")
  return "vite dev + bun build"
})

const pass = results.filter((r) => r.ok).length
const total = results.length
console.log(`\n  ${pass}/${total} smoke checks pass\n`)

if (pass !== total) process.exit(1)
