#!/usr/bin/env bun
/**
 * Arcana protocol conformance runner.
 *
 * Runs every in-repository conformance surface and can emit a portable,
 * machine-readable evidence report. A passing report establishes reproducible
 * internal/cross-runtime evidence. It does not claim external reproduction or
 * an independent security assessment.
 */

import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, relative } from "node:path"
import { spawnSync } from "node:child_process"

export const CONFORMANCE_SCHEMA_VERSION = "arcana.conformance.v1" as const
export const CONFORMANCE_PROTOCOL = "ACEP-1" as const

const repoRoot = dirname(import.meta.dir)
const vectorPath = "tools/acep-conformance-rust/vectors/conformance-vectors.json"
const adapterVectorPath = "packages/sdk/js/src/v2/adapters/certified-vectors.ts"

type SuiteDefinition = {
  readonly id: string
  readonly name: string
  readonly command: readonly string[]
  readonly cwd: string
}

export const CONFORMANCE_SUITES: readonly SuiteDefinition[] = [
  {
    id: "ts-golden-crypto",
    name: "TypeScript golden crypto vectors",
    command: ["bun", "test", "src/crypto/crypto.test.ts", "--timeout", "60000"],
    cwd: "packages/core",
  },
  {
    id: "ts-hostile-node",
    name: "TypeScript D-10 hostile-node matrix",
    command: ["bun", "test", "src/crypto/hostile-node-evaluation.test.ts", "--timeout", "60000"],
    cwd: "packages/core",
  },
  {
    id: "rust-verifier",
    name: "Rust independent implementation",
    command: ["cargo", "test", "--locked"],
    cwd: "tools/acep-conformance-rust",
  },
  {
    id: "sdk-governance-proof-errors",
    name: "SDK governance, proof, and error contract",
    command: [
      "bun",
      "test",
      "src/v2/governance.test.ts",
      "src/v2/proof.test.ts",
      "src/v2/errors.test.ts",
      "--timeout",
      "60000",
    ],
    cwd: "packages/sdk/js",
  },
  {
    id: "sdk-adapter-vectors",
    name: "SDK certified adapter request-hash vectors",
    command: ["bun", "test", "src/v2/adapters/vectors.test.ts", "--timeout", "60000"],
    cwd: "packages/sdk/js",
  },
]

export type ConformanceSuiteResult = {
  readonly id: string
  readonly name: string
  readonly status: "passed" | "failed"
  readonly exitCode: number | null
  readonly signal: string | null
  readonly durationMs: number
  readonly command: readonly string[]
  readonly cwd: string
  readonly summary: readonly string[]
  readonly error?: string
}

export type ConformanceReport = {
  readonly schemaVersion: typeof CONFORMANCE_SCHEMA_VERSION
  readonly protocol: typeof CONFORMANCE_PROTOCOL
  readonly generatedAt: string
  readonly status: "passed" | "failed"
  readonly assurance: {
    readonly internalReproduction: "passed" | "failed"
    readonly crossRuntimeImplementation: "passed" | "failed"
    readonly externalReproduction: "not_assessed"
    readonly independentAudit: "not_assessed"
  }
  readonly source: {
    readonly commit: string | null
    readonly dirty: boolean | null
  }
  readonly environment: {
    readonly platform: NodeJS.Platform
    readonly architecture: string
    readonly bun: string
    readonly rust: string | null
  }
  readonly corpus: {
    readonly cryptoVectors: number
    readonly positiveCryptoVectors: number
    readonly negativeCryptoVectors: number
    readonly adapterVectors: number
    readonly sha256: Readonly<Record<string, string>>
  }
  readonly totals: {
    readonly suites: number
    readonly passed: number
    readonly failed: number
  }
  readonly suites: readonly ConformanceSuiteResult[]
}

export type ConformanceOptions = {
  readonly json: boolean
  readonly output?: string
}

export function parseConformanceArgs(args: readonly string[]): ConformanceOptions & { help: boolean } {
  let json = false
  let output: string | undefined
  let help = false

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!
    if (arg === "--json") json = true
    else if (arg === "--help" || arg === "-h") help = true
    else if (arg === "--output") {
      output = args[++index]
      if (!output) throw new Error("--output requires a file path")
    } else if (arg.startsWith("--output=")) {
      output = arg.slice("--output=".length)
      if (!output) throw new Error("--output requires a file path")
    } else {
      throw new Error(`unknown argument: ${arg}`)
    }
  }

  return { json, output, help }
}

function commandOutput(command: readonly string[], cwd = repoRoot): string | null {
  const proc = spawnSync(command[0]!, command.slice(1), {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, NO_COLOR: "1" },
  })
  if (proc.status !== 0) return null
  return proc.stdout.trim() || proc.stderr.trim()
}

function summarizeOutput(stdout: string, stderr: string): string[] {
  const lines = `${stdout}\n${stderr}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const relevant = lines.filter((line) => /(?:^Ran \d+ tests|\bpass\b|\bfail\b|test result:|fixtures?)/i.test(line))
  return (relevant.length > 0 ? relevant : lines).slice(-5)
}

export function runConformanceSuite(definition: SuiteDefinition): ConformanceSuiteResult {
  const startedAt = performance.now()
  const proc = spawnSync(definition.command[0]!, definition.command.slice(1), {
    cwd: join(repoRoot, definition.cwd),
    encoding: "utf8",
    timeout: 600_000,
    env: { ...process.env, NO_COLOR: "1" },
  })
  const durationMs = Math.round(performance.now() - startedAt)
  const passed = proc.status === 0

  return {
    id: definition.id,
    name: definition.name,
    status: passed ? "passed" : "failed",
    exitCode: proc.status,
    signal: proc.signal,
    durationMs,
    command: definition.command,
    cwd: definition.cwd,
    summary: summarizeOutput(proc.stdout ?? "", proc.stderr ?? ""),
    ...(proc.error ? { error: proc.error.message } : {}),
  }
}

function sha256(path: string): string {
  return createHash("sha256")
    .update(readFileSync(join(repoRoot, path)))
    .digest("hex")
}

function corpusMetadata() {
  const vectors = JSON.parse(readFileSync(join(repoRoot, vectorPath), "utf8")) as Array<{
    envelopeType?: string
  }>
  const adapterSource = readFileSync(join(repoRoot, adapterVectorPath), "utf8")
  const adapterVectors = [...adapterSource.matchAll(/requestHash:\s*"[0-9a-f]{64}"/g)].length

  return {
    cryptoVectors: vectors.length,
    positiveCryptoVectors: vectors.filter((vector) => vector.envelopeType === "positive").length,
    negativeCryptoVectors: vectors.filter((vector) => vector.envelopeType === "negative").length,
    adapterVectors,
    sha256: {
      [vectorPath]: sha256(vectorPath),
      [adapterVectorPath]: sha256(adapterVectorPath),
    },
  }
}

export function createConformanceReport(suites: readonly ConformanceSuiteResult[]): ConformanceReport {
  const failed = suites.filter((suite) => suite.status === "failed").length
  const commit = commandOutput(["git", "rev-parse", "HEAD"])
  const gitStatus = commandOutput(["git", "status", "--porcelain", "--untracked-files=no"])
  const rustVersion = commandOutput(["rustc", "--version"])
  const status = failed === 0 ? "passed" : "failed"

  return {
    schemaVersion: CONFORMANCE_SCHEMA_VERSION,
    protocol: CONFORMANCE_PROTOCOL,
    generatedAt: new Date().toISOString(),
    status,
    assurance: {
      internalReproduction: status,
      crossRuntimeImplementation: suites.find((suite) => suite.id === "rust-verifier")?.status ?? "failed",
      externalReproduction: "not_assessed",
      independentAudit: "not_assessed",
    },
    source: {
      commit,
      dirty: gitStatus === null ? null : gitStatus.length > 0,
    },
    environment: {
      platform: process.platform,
      architecture: process.arch,
      bun: Bun.version,
      rust: rustVersion,
    },
    corpus: corpusMetadata(),
    totals: {
      suites: suites.length,
      passed: suites.length - failed,
      failed,
    },
    suites,
  }
}

function writeReport(path: string, report: ConformanceReport): string {
  const resolved = isAbsolute(path) ? path : join(process.cwd(), path)
  mkdirSync(dirname(resolved), { recursive: true })
  writeFileSync(resolved, `${JSON.stringify(report, null, 2)}\n`)
  return relative(process.cwd(), resolved) || resolved
}

function printHumanReport(report: ConformanceReport, output?: string): void {
  for (const suite of report.suites) {
    const summary = suite.summary.join(" | ") || suite.error || "no summary"
    console.log(`${suite.status === "passed" ? "PASS" : "FAIL"} ${suite.name}: ${summary} (${suite.durationMs}ms)`)
  }
  console.log(`\nconformance: ${report.totals.passed}/${report.totals.suites} suites passed`)
  console.log(
    `corpus: ${report.corpus.cryptoVectors} crypto vectors (${report.corpus.negativeCryptoVectors} negative) + ${report.corpus.adapterVectors} adapter vectors`,
  )
  console.log(
    "assurance: internal cross-runtime reproduction only; external reproduction and independent audit not assessed",
  )
  if (output) console.log(`evidence: ${output}`)
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  let options: ReturnType<typeof parseConformanceArgs>
  try {
    options = parseConformanceArgs(args)
  } catch (error) {
    process.stderr.write(`conformance: ${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }

  if (options.help) {
    process.stdout.write("Usage: bun run conformance [--json] [--output <report.json>]\n")
    return 0
  }

  const suites = CONFORMANCE_SUITES.map(runConformanceSuite)
  const report = createConformanceReport(suites)
  const output = options.output ? writeReport(options.output, report) : undefined

  if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  else printHumanReport(report, output)

  return report.status === "passed" ? 0 : 1
}

if (import.meta.main) process.exitCode = await main()
