import type { Argv } from "yargs"
import { join } from "node:path"
import { mkdirSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { Effect } from "effect"
import { LAUNCH_RUNTIMES, resolveRuntimeConfig, launchDeclaration, type LaunchRuntime, type LaunchDeclaration } from "@/node/launch-declaration"
import { cmd } from "./cmd"
import { CliError, effectCmd, fail } from "../effect-cmd"

// ── Helpers ───────────────────────────────────────────────────────────

/** Print the certification declaration to stdout. */
function printDeclaration(runtime: string, declaration: LaunchDeclaration): void {
  console.log(`[arcana launch] ${runtime}`)
  console.log(`  certification level: ${declaration.certificationLevel}`)
  console.log(`  protocol:             ${declaration.protocolVersion}`)
  console.log(`  test version:         ${declaration.testVersion}`)
  console.log(`  boundaries:           ${declaration.boundariesCovered.join("; ")}`)
  console.log(`  known bypasses:       ${declaration.knownBypasses.join("; ")}`)
  console.log(`  evidence:             ${declaration.evidence.join("; ")}`)
  console.log(`  nonclaims:            ${declaration.nonclaims.join("; ")}`)
}

/** Parse CLI --env KEY=VALUE pairs into a record. */
function parseCliEnv(pairs: string[] | undefined): Record<string, string> {
  const env: Record<string, string> = {}
  for (const pair of pairs ?? []) {
    const idx = pair.indexOf("=")
    if (idx > 0) env[pair.slice(0, idx)] = pair.slice(idx + 1)
  }
  return env
}

/** Write the durable JSON evidence record and log the outcome. */
function writeEvidenceRecord(input: {
  runtime: LaunchRuntime
  binary: string
  args: string[]
  declaration: LaunchDeclaration
  directory: string
  startedAt: string
  exitCode: number | undefined
}): void {
  const runId = `launch_${randomUUID()}`
  const record = {
    runId,
    runtime: input.runtime,
    binary: input.binary,
    args: input.args,
    certificationLevel: input.declaration.certificationLevel,
    protocolVersion: input.declaration.protocolVersion,
    directory: input.directory,
    startedAt: input.startedAt,
    endedAt: new Date().toISOString(),
    exitCode: input.exitCode,
    declaration: input.declaration,
  }
  const stateDir = join(input.directory, ".arcana", "launch")
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(
    join(stateDir, `${runId}.json`),
    JSON.stringify(record, null, 2),
  )
  console.log(`[arcana launch] ${input.runtime} exited ${input.exitCode} — evidence ${runId}.json`)
}

export const LaunchCommand = cmd({
  command: "launch",
  describe: "launch an external agent runtime under a declared governance level",
  builder: (yargs: Argv) =>
    yargs
      .command(LaunchRuntimeCommand)
      .demandCommand(),
  async handler() {},
})

export const LaunchRuntimeCommand = effectCmd({
  command: "$0 <runtime>",
  describe: `launch a specific runtime (${LAUNCH_RUNTIMES.join(" | ")})`,
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("runtime", {
        describe: "external agent runtime",
        type: "string",
        choices: [...LAUNCH_RUNTIMES],
        demandOption: true,
      })
      .option("dry-run", {
        describe: "print the governance declaration without launching",
        type: "boolean",
        default: false,
      })
      .option("directory", {
        describe: "workspace directory",
        type: "string",
      })
      .option("args", {
        describe: "arguments passed to the runtime",
        type: "string",
        array: true,
      })
      .option("binary", {
        describe: "override the binary name or path for this runtime",
        type: "string",
      })
      .option("env", {
        describe: "environment variable in KEY=VALUE format (repeatable)",
        type: "string",
        array: true,
      }),
  handler: Effect.fn("Cli.launch")(function* (args) {
    const runtime = args.runtime as LaunchRuntime
    const declaration = launchDeclaration(runtime)
    printDeclaration(runtime, declaration)

    if (args.dryRun) {
      console.log("  [dry-run] no process launched")
      return
    }

    // Resolve per-runtime config: defaults ← env vars ← CLI flags
    const config = resolveRuntimeConfig(runtime, {
      binary: args.binary as string | undefined,
      args: (args.args as string[] | undefined) ?? [],
      env: parseCliEnv(args.env as string[] | undefined),
    })

    // Merge: defaultArgs ← CLI --args (precedence)
    const allArgs = [...config.defaultArgs, ...(args.args ?? [])]
    const directory = args.directory ? join(process.cwd(), args.directory) : process.cwd()
    const launched = yield* Effect.tryPromise({
      try: async () => {
        const startedAt = new Date().toISOString()
        const proc = Bun.spawn({
          cmd: [config.binary, ...allArgs],
          cwd: directory,
          env: { ...process.env, ...config.env },
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        })
        const exitCode = await proc.exited
        writeEvidenceRecord({
          runtime, binary: config.binary, args: allArgs,
          declaration, directory, startedAt, exitCode,
        })
      },
      catch: (error) =>
        new CliError({
          message:
            `launch failed: ${String(error)}. ` +
            `Ensure the '${runtime}' executable is installed and on PATH. ` +
            `This adapter is ${declaration.certificationLevel} (${declaration.boundariesCovered[0] ?? "no enforcement claim"}); ` +
            "see the declaration for exact boundaries. It is not a sandbox.",
        }),
    })
    return launched
  }),
})
