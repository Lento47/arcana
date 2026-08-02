#!/usr/bin/env bun
/**
 * Arcana protocol conformance runner.
 *
 * Executes the three conformance surfaces and reports a unified result:
 *   1. TypeScript golden crypto suite (packages/core)
 *   2. TypeScript D-10 hostile-node matrix (packages/core)
 *   3. Rust independent verifier (tools/acep-conformance-rust)
 *   4. SDK 1.0 governance/proof/error suite (packages/sdk/js)
 *
 * Exit code 0 only when every surface passes.
 */

import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"

const repoRoot = dirname(import.meta.dir)
const results: Array<{ name: string; ok: boolean; detail: string }> = []

function run(name: string, cmd: string, args: string[], cwd: string): void {
  const start = Date.now()
  const proc = spawnSync(cmd, args, {
    cwd: join(repoRoot, cwd),
    encoding: "utf8",
    timeout: 600_000,
    env: { ...process.env, NO_COLOR: "1" },
  })
  const ms = Date.now() - start
  const ok = proc.status === 0
  const tail = proc.stdout
    ?.toString()
    .trim()
    .split("\n")
    .filter((line) => /test result|pass|fail|fixtures/.test(line))
    .slice(-3)
    .join(" | ")
  results.push({ name, ok, detail: `${tail ?? ""} (${ms}ms)` })
  console.log(`${ok ? "✅" : "❌"} ${name}: ${tail ?? "no output"} (${ms}ms)`)
}

run(
  "TS golden crypto vectors",
  "bun",
  ["test", "src/crypto/crypto.test.ts", "--timeout", "60000"],
  "packages/core",
)
run(
  "TS D-10 hostile-node matrix",
  "bun",
  ["test", "src/crypto/hostile-node-evaluation.test.ts", "--timeout", "60000"],
  "packages/core",
)
run("Rust independent verifier", "cargo", ["test"], "tools/acep-conformance-rust")
run(
  "SDK 1.0 governance/proof/error suite",
  "bun",
  ["test", "src/v2/governance.test.ts", "src/v2/proof.test.ts", "src/v2/errors.test.ts", "--timeout", "60000"],
  "packages/sdk/js",
)

const failed = results.filter((r) => !r.ok)
console.log(`\nconformance: ${results.length - failed.length}/${results.length} suites passed`)
if (failed.length > 0) {
  for (const f of failed) console.log(`  ✗ ${f.name}: ${f.detail}`)
  process.exit(1)
}
console.log("✓ conformance suites passed (46 vectors + 15 hostile fixtures + SDK surface)")
