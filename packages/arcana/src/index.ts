#!/usr/bin/env bun
// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors
// Bare `arcana` → fast-path: spawn opencode TUI directly. Imports yargs + commands
// ONLY for subcommands, saving ~9s of bun JIT on the 90% TUI case.
import path from "node:path"
import { createRequire } from "node:module"
import { currentDir } from "./util/path.js"
import { getCompletionScript } from "./cli/completion.js"
const PROFILE = !!process.env["ARCANA_PROFILE_STARTUP"]
const PROFILE_PID = process.pid
function profileEmit(phase: string, ts_ms: number) {
  if (!PROFILE) return
  // JSON-per-line markers on stderr. Schema: {"phase","ts_ms","pid"}.
  // Consumed by scripts/bench-startup.ts to compute per-phase p50/p90.
  process.stderr.write(JSON.stringify({ phase, ts_ms, pid: PROFILE_PID }) + "\n")
}
profileEmit("arcana_entry", performance.now())
const args = process.argv.slice(2)
const HELP_FLAGS = new Set(["--help", "-h", "--version", "-v"])
const SUBCOMMANDS = ["run", "skills", "cron", "memory", "gateway", "completion", "config", "learn", "doctor", "history", "theme", "feedback", "web", "daemon"]
const firstArg = args[0]
const DAEMON_FLAG = args.includes("--daemon")
const isArcanaSubcommand = firstArg && (SUBCOMMANDS.includes(firstArg) || HELP_FLAGS.has(firstArg))
if (DAEMON_FLAG) {
  // Spawn daemon detached — CLI exits immediately, daemon persists
  const engineDir = path.join(currentDir(import.meta), "../../engine")
  const engineEntry = path.join(engineDir, "src/index.ts")
  Bun.spawn({
    cmd: ["bun", "--conditions=browser", engineEntry, ...args.filter(a => a !== "--daemon")],
    stdio: ["ignore", "inherit", "inherit"],
    cwd: engineDir,
    env: {
      ...process.env,
      ARCANA_DAEMON: "1",
      ARCANA_DAEMON_CWD: process.cwd(),
      PWD: process.cwd(),
    },
  }).unref()
  process.exit(0)
}
if (!isArcanaSubcommand) {
  // === TUI fast path ===
  profileEmit("fast_path_enter", performance.now())
  // Generate bridge config (providers + skills paths) for arcana engine
  const { generateBridgeConfig } = await import("./skills/bridge.js")
  const t0 = performance.now()
  const arcanaConfig = process.env.ARCANA_CONFIG
    ? undefined
    : await generateBridgeConfig()
  profileEmit("bridge_config_done", performance.now())
  profileEmit("bridge_config_ms", Math.round(performance.now() - t0))
  const engineDir = path.join(currentDir(import.meta), "../../engine")
  const engineEntry = path.join(engineDir, "src/index.ts")
  const tSpawn = performance.now()
  const child = Bun.spawn({
    cmd: ["bun", "--conditions=browser", engineEntry, ...args],
    stdio: ["inherit", "inherit", "inherit"],
    cwd: engineDir,
    env: {
      ...process.env,
      PWD: process.cwd(),
      ...(arcanaConfig ? { ARCANA_CONFIG: arcanaConfig } : {}),
    },
  })
  profileEmit("engine_spawn_done", performance.now())
  profileEmit("engine_spawn_ms", Math.round(performance.now() - tSpawn))
  const signals: NodeJS.Signals[] = process.platform === "win32" ? ["SIGINT", "SIGTERM"] : ["SIGINT", "SIGTERM", "SIGHUP"]
  for (const sig of signals) {
    process.on(sig, () => {
      try { child.kill(sig) } catch { /* already exited */ }
    })
  }
  process.exitCode = await child.exited
  process.exit()
}
// === Subcommand path (lazy — only loaded when needed) ===
profileEmit("subcommand_path_enter", performance.now())
const yargsImportStart = performance.now()
const { default: yargs } = await import("yargs")
profileEmit("subcommand_yargs_import_done", performance.now())
profileEmit("subcommand_yargs_import_ms", Math.round(performance.now() - yargsImportStart))
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
const _require = createRequire(import.meta.url)
const VERSION: string = _require("../../../package.json").version
const commandLoaders = {
  run: () => import("./cli/cmd/run.js").then((m) => m.RunCommand),
  skills: () => import("./cli/cmd/skills.js").then((m) => m.SkillsCommand),
  cron: () => import("./cli/cmd/cron.js").then((m) => m.CronCommand),
  memory: () => import("./cli/cmd/memory.js").then((m) => m.MemoryCommand),
  gateway: () => import("./cli/cmd/gateway.js").then((m) => m.GatewayCommand),
  config: () => import("./cli/cmd/config.js").then((m) => m.ConfigCommand),
  learn: () => import("./cli/cmd/learn.js").then((m) => m.LearnCommand),
  doctor: () => import("./cli/cmd/doctor.js").then((m) => m.DoctorCommand),
  history: () => import("./cli/cmd/history.js").then((m) => m.HistoryCommand),
  theme: () => import("./cli/cmd/theme.js").then((m) => m.ThemeCommand),
  daemon: () => import("./cli/cmd/daemon.js").then((m) => m.DaemonCommand),
  feedback: () => import("./cli/cmd/feedback.js").then((m) => m.FeedbackCommand),
  web: () => import("./cli/cmd/web.js").then((m) => m.WebCommand),
}
async function loadCommandsFor(arg: string | undefined) {
  if (arg === "completion") return []
  if (arg && HELP_FLAGS.has(arg)) return Promise.all(Object.values(commandLoaders).map((load) => load()))
  const loader = arg ? commandLoaders[arg as keyof typeof commandLoaders] : undefined
  return loader ? [await loader()] : []
}
const commandLoadStart = performance.now()
const cmds = await loadCommandsFor(firstArg)
profileEmit("subcommand_commands_loaded", performance.now())
profileEmit("subcommand_command_load_ms", Math.round(performance.now() - commandLoadStart))
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
for (const cmd of cmds) cli.command(cmd)
// Intercept zsh and fish completion before yargs handles them
// (yargs built-in .completion() only generates bash scripts)
if (firstArg === "completion" && args.length >= 2) {
  const shell = args[1]
  if (shell === "zsh" || shell === "fish") {
    const script = getCompletionScript(shell)
    if (script) {
      process.stdout.write(script + "\n")
      process.exit(0)
    }
  }
}
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
