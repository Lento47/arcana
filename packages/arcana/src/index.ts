#!/usr/bin/env bun
// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors
// Bare `arcana` → fast-path: spawn opencode TUI directly. Imports yargs + commands
// ONLY for subcommands, saving ~9s of bun JIT on the 90% TUI case.
import path from "node:path"
import { existsSync } from "node:fs"

const args = process.argv.slice(2)
const HELP_FLAGS = new Set(["--help", "-h", "--version", "-v"])
const SUBCOMMANDS = ["run", "skills", "cron", "memory", "gateway", "completion", "config", "learn", "doctor", "history", "theme"]
const firstArg = args[0]
const isArcanaSubcommand = firstArg && (SUBCOMMANDS.includes(firstArg) || HELP_FLAGS.has(firstArg))

if (!isArcanaSubcommand) {
  // === TUI fast path ===
  // Generate bridge config (providers + skills paths) for opencode
  const { generateBridgeConfig } = await import("./skills/bridge.js")
  const arcanaConfig = process.env.ARCANA_CONFIG
    ? undefined
    : await generateBridgeConfig()

  const opencodeDir = path.join(import.meta.dir, "../../opencode")
  const opencodeEntry = path.join(opencodeDir, "src/index.ts")

  const child = Bun.spawn({
    cmd: ["bun", "run", "--conditions=browser", opencodeEntry, ...args],
    stdio: ["inherit", "inherit", "inherit"],
    cwd: opencodeDir,
    env: {
      ...process.env,
      PWD: process.cwd(),
      ...(arcanaConfig ? { ARCANA_CONFIG: arcanaConfig } : {}),
    },
  })
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(sig, () => {
      try { child.kill(sig) } catch { /* already exited */ }
    })
  }
  process.exitCode = await child.exited
  process.exit()
}

// === Subcommand path (lazy — only loaded when needed) ===
const [{ default: yargs }, { hideBin }] = await Promise.all([
  import("yargs"),
  import("yargs/helpers"),
])

const LOGO = `
  ╔═══════════════════════════════╗
  ║          ◆ ARCANA ◆           ║
  ║  self-improving AI agent CLI  ║
  ╚═══════════════════════════════╝
`.trimStart()

function show(out: string) {
  const text = out.trimStart()
  if (!text.startsWith("arcana")) process.stderr.write(LOGO + "\n")
  process.stderr.write(text + "\n")
}

const VERSION = "0.2.24"

// Lazy-load commands — each is only needed for its own subcommand
async function loadCommands() {
  const [
    { RunCommand },
    { SkillsCommand },
    { CronCommand },
    { MemoryCommand },
    { GatewayCommand },
    { ConfigCommand },
    { LearnCommand },
    { DoctorCommand },
    { HistoryCommand },
    { ThemeCommand },
  ] = await Promise.all([
    import("./cli/cmd/run.js"),
    import("./cli/cmd/skills.js"),
    import("./cli/cmd/cron.js"),
    import("./cli/cmd/memory.js"),
    import("./cli/cmd/gateway.js"),
    import("./cli/cmd/config.js"),
    import("./cli/cmd/learn.js"),
    import("./cli/cmd/doctor.js"),
    import("./cli/cmd/history.js"),
    import("./cli/cmd/theme.js"),
  ])
  return { RunCommand, SkillsCommand, CronCommand, MemoryCommand, GatewayCommand, ConfigCommand, LearnCommand, DoctorCommand, HistoryCommand, ThemeCommand }
}

const cmds = await loadCommands()

const cli = yargs(args)
  .parserConfiguration({ "populate--": true })
  .scriptName("arcana")
  .wrap(100)
  .help("help", "show help")
  .alias("help", "h")
  .version("version", "show version", VERSION)
  .alias("version", "v")
  .option("log-level", {
    describe: "log level",
    type: "string",
    choices: ["DEBUG", "INFO", "WARN", "ERROR"] as const,
  })
  .middleware(async (opts) => {
    if (opts.logLevel) process.env.ARCANA_LOG_LEVEL = opts.logLevel as string
    process.env.ARCANA = "1"
    process.env.ARCANA_PID = String(process.pid)
  })
  .command(cmds.RunCommand)
  .command(cmds.SkillsCommand)
  .command(cmds.CronCommand)
  .command(cmds.MemoryCommand)
  .command(cmds.GatewayCommand)
  .command(cmds.ConfigCommand)
  .command(cmds.LearnCommand)
  .command(cmds.DoctorCommand)
  .command(cmds.HistoryCommand)
  .command(cmds.ThemeCommand)
  .usage("")
  .completion("completion", "generate shell completion script")
  .fail((msg, err) => {
    if (
      msg?.startsWith("Unknown argument") ||
      msg?.startsWith("Not enough non-option arguments") ||
      msg?.startsWith("Invalid values:")
    ) {
      if (err) throw err
      cli.showHelp(show)
    }
    if (err) throw err
    process.exit(1)
  })
  .demandCommand(1, "")
  .strict(false)

try {
  if (args.includes("-h") || args.includes("--help")) {
    await cli.parse(args, (err: Error | undefined, _argv: unknown, out: string) => {
      if (err) throw err
      if (!out) return
      show(out)
    })
  } else {
    await cli.parse()
  }
} catch (e) {
  process.stderr.write(`\nError: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exitCode = 1
} finally {
  process.exit()
}
