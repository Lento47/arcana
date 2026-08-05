import type { Argv } from "yargs"
import { join } from "node:path"
import { mkdirSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { Effect } from "effect"
import { LAUNCH_RUNTIMES, launchDeclaration, type LaunchRuntime } from "@/node/launch-declaration"
import { cmd } from "./cmd"
import { CliError, effectCmd, fail } from "../effect-cmd"

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
  describe: "launch a specific runtime (codex | claude | gemini)",
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
      }),
  handler: Effect.fn("Cli.launch")(function* (args) {
    const runtime = args.runtime as LaunchRuntime
    const declaration = launchDeclaration(runtime)

    console.log(`[arcana launch] ${runtime}`)
    console.log(`  certification level: ${declaration.certificationLevel}`)
    console.log(`  protocol:             ${declaration.protocolVersion}`)
    console.log(`  test version:         ${declaration.testVersion}`)
    console.log(`  boundaries:           ${declaration.boundariesCovered.join("; ")}`)
    console.log(`  known bypasses:       ${declaration.knownBypasses.join("; ")}`)
    console.log(`  evidence:             ${declaration.evidence.join("; ")}`)
    console.log(`  nonclaims:            ${declaration.nonclaims.join("; ")}`)

    if (args.dryRun) {
      console.log("  [dry-run] no process launched")
      return
    }

    const directory = args.directory ? join(process.cwd(), args.directory) : process.cwd()
    const launched = yield* Effect.tryPromise({
      try: async () => {
        const startedAt = new Date().toISOString()
        const proc = Bun.spawn({
          cmd: [runtime, ...(args.args ?? [])],
          cwd: directory,
          stdout: "inherit",
          stderr: "inherit",
        })
        const exitCode = await proc.exited
        const record = {
          runId: `launch_${randomUUID()}`,
          runtime,
          certificationLevel: declaration.certificationLevel,
          protocolVersion: declaration.protocolVersion,
          directory,
          startedAt,
          endedAt: new Date().toISOString(),
          exitCode,
          declaration,
        }
        const stateDir = join(directory, ".arcana", "launch")
        mkdirSync(stateDir, { recursive: true })
        writeFileSync(
          join(stateDir, `${record.runId}.json`),
          JSON.stringify(record, null, 2),
        )
        console.log(`[arcana launch] ${runtime} exited ${exitCode} — evidence ${record.runId}.json`)
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
