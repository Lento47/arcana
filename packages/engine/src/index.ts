import { mark, measure, flushSync } from "./cli/profile"
mark("cli-import-start")
import type { CommandModule } from "yargs"
import { UI } from "./cli/ui"
import { InstallationVersion } from "@arcana/core/installation/version"
import { FormatError } from "./cli/error"
import { TuiThreadCommand } from "./cli/cmd/tui"
import { EOL } from "os"
import { errorMessage } from "./util/error"
import { Heap } from "./cli/heap"
import { createKernelContract } from "./kernel/kernel"
mark("cli-import-end")

// Catch unhandled rejections and exceptions so the process doesn't silently
// continue in an indeterminate state. These fire for promise rejections and
// synchronous throws outside the Effect runtime scope (e.g. fire-and-forget
// async callbacks, timer handlers, MCP subprocess stderr).
// Catch .startsWith(undefined) before it becomes a TypeError.
// Bun-compiled OpenTUI 0.4.x minifies variable names to single letters;
// "undefined is not an object (evaluating '$.startsWith')" is undebuggable
// without this shim. It wraps the native method to dump the caller stack
// when `this` is null/undefined, then throws a clear error.
{
  const origStartsWith = String.prototype.startsWith
  String.prototype.startsWith = function (this: string, ...args: any[]) {
    if (this == null) {
      const e = new Error(`.startsWith() called on ${String(this)}`)
      process.stderr.write(`[arcana] startsWith guard:\n${e.stack}\n`)
      // Throw a clear error so the TUI bootstrap catch can surface the stack
      throw new TypeError(`.startsWith() called on ${String(this)} — see stderr for caller stack`)
    }
    return origStartsWith.apply(this, args as [string, number?])
  } as typeof String.prototype.startsWith
}

process.on("unhandledRejection", (reason) => {
  const stack = reason instanceof Error ? reason.stack : String(reason)
  process.stderr.write(`[arcana] Unhandled rejection:\n${stack}\n`)
  process.exit(1)
})
process.on("uncaughtException", (err) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err)
  process.stderr.write(`[arcana] Uncaught exception:\n${msg}\n`)
  if (err instanceof TypeError) {
    process.stderr.write(`[arcana] TypeError: ${err.message}\n`)
  }
  process.exit(1)
})
process.on("SIGTERM", () => {
  process.stderr.write("[arcana] Received SIGTERM, shutting down\n")
  process.exit(0)
})

const args = process.argv.slice(2)
const exitsBeforeRuntime = args.some((arg) => arg === "--help" || arg === "-h" || arg === "--version" || arg === "-v")

async function prepareRuntime(opts: {
  printLogs?: boolean
  logLevel?: string
  pure?: boolean
  compatOpencodeEnv?: boolean
  tui?: boolean
}) {
  if (opts.printLogs) process.env.ARCANA_PRINT_LOGS = "1"
  if (opts.logLevel) process.env.ARCANA_LOG_LEVEL = opts.logLevel
  if (opts.pure) {
    process.env.ARCANA_PURE = "1"
  }

  Heap.start()

  process.env.ARCANA_ENGINE = "1"
  process.env.ARCANA_RUNTIME = "engine"
  process.env.ARCANA_PID = String(process.pid)

  // Arcana should not identify as its fork lineage by default. Keep the old
  // env flag available only as an explicit compatibility shim for legacy
  // plugins or scripts that still check OPENCODE.
  if (opts.compatOpencodeEnv || process.env.ARCANA_COMPAT_OPENCODE === "1") {
    process.env.OPENCODE = "1"
  }

  // Create and expose the Arcana kernel contract. Telemetry, RunProof, and
  // the TUI cockpit read this contract at runtime to know which authorities
  // own which decisions.
  const kernelSurface = opts.tui ? "tui" as const : "cli" as const
  const kernelContract = createKernelContract(kernelSurface)
  process.env.ARCANA_KERNEL_CONTRACT = JSON.stringify(kernelContract)
  if (process.env.ARCANA_PRINT_LOGS === "1") {
    process.stderr.write(
      `[arcana] kernel contract: identity=${kernelContract.identity.surface} authorities=${kernelContract.authorities.length}\n`,
    )
  }
}

function defaultTuiArgs() {
  return {
    project: undefined,
    model: undefined,
    continue: false,
    session: undefined,
    fork: false,
    prompt: undefined,
    agent: undefined,
    port: 0,
    hostname: "127.0.0.1",
    mdns: false,
    "mdns-domain": "arcana.local",
    cors: [] as string[],
  }
}

// Auto-configure proxy auth from stored license key
if (!exitsBeforeRuntime && !process.env.ARCANA_PROXY_KEY) {
  try {
    const { readFileSync, existsSync } = require("node:fs") as typeof import("node:fs")
    const { join } = require("node:path") as typeof import("node:path")
    const home = process.env.ARCANA_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? ".", ".arcana")
    const keyFile = join(home, "proxy_key")
    if (existsSync(keyFile)) {
      process.env.ARCANA_PROXY_KEY = readFileSync(keyFile, "utf8").trim()
      // Silent by default - this fired on every command (incl. --help and piped
      // usage), leaking the local key path. Only surface it under --print-logs.
      if (process.argv.includes("--print-logs") || process.env.ARCANA_PRINT_LOGS === "1") {
        process.stderr.write(`[arcana] proxy key loaded from ${keyFile}\n`)
      }
    }
  } catch {}
}
// The proxy is reached through the dedicated `arcana-proxy` provider, which uses
// ARCANA_PROXY_KEY directly. We deliberately do NOT mirror it into OPENAI_API_KEY:
// that would point the real `openai` provider (api.openai.com) at the proxy key
// and 401. Native providers stay key-driven; the proxy serves everything else.

function show(out: string) {
  const text = out.trimStart()
  // CLI was rebranded to `arcana` (scriptName above), so subcommand help now
  // starts with "arcana ..."; the stale "opencode " check never matched and the
  // logo banner was being prepended to every subcommand's --help output.
  if (!text.startsWith("arcana ")) {
    process.stderr.write(UI.logo() + EOL + EOL)
    process.stderr.write(text + EOL)
    return
  }
  process.stderr.write(out)
}

async function runDirectTui() {
  mark("zero-arg-tui-dispatch-start")
  await prepareRuntime({ tui: true })
  mark("zero-arg-tui-dispatch-end")
  measure("cli-import-start", "zero-arg-tui-dispatch-end", "zero-arg-tui-dispatch")
  await TuiThreadCommand.handler(defaultTuiArgs() as never)
}

// Daemon mode: skip TUI bootstrap, enter daemon lifecycle
if (process.env.ARCANA_DAEMON === "1") {
  await import("./daemon/entry")
  // Block forever — daemon runs until SIGTERM/idle timeout kills the process
  await new Promise(() => {})
}

if (args.length === 0) {
  try {
    await runDirectTui()
  } catch (e) {
    const formatted = FormatError(e)
    if (formatted) UI.error(formatted)
    if (formatted === undefined) {
      // Dump full error before the minified "Unexpected error" swallows context.
      process.stderr.write(`[arcana] TUI bootstrap crashed:\n`)
      if (e instanceof Error) {
        process.stderr.write(`  message: ${e.message}\n  stack:\n${e.stack ?? "  (none)"}\n`)
      } else {
        process.stderr.write(`  ${String(e)}\n`)
      }
      UI.error("Unexpected error" + EOL)
      process.stderr.write(errorMessage(e) + EOL)
    }
    process.exitCode = 1
  } finally {
    flushSync()
    process.exit()
  }
}

mark("yargs-import-start")
const { default: yargs } = await import("yargs")
mark("yargs-import-end")
measure("yargs-import-start", "yargs-import-end", "yargs-import")

const commandLoaders = {
  acp: () => import("./cli/cmd/acp").then((m) => m.AcpCommand),
  mcp: () => import("./cli/cmd/mcp").then((m) => m.McpCommand),
  attach: () => import("./cli/cmd/attach").then((m) => m.AttachCommand),
  run: () => import("./cli/cmd/run").then((m) => m.RunCommand),
  generate: () => import("./cli/cmd/generate").then((m) => m.GenerateCommand),
  debug: () => import("./cli/cmd/debug").then((m) => m.DebugCommand),
  console: () => import("./cli/cmd/account").then((m) => m.ConsoleCommand),
  providers: () => import("./cli/cmd/providers").then((m) => m.ProvidersCommand),
  agent: () => import("./cli/cmd/agent").then((m) => m.AgentCommand),
  upgrade: () => import("./cli/cmd/upgrade").then((m) => m.UpgradeCommand),
  uninstall: () => import("./cli/cmd/uninstall").then((m) => m.UninstallCommand),
  serve: () => import("./cli/cmd/serve").then((m) => m.ServeCommand),
  web: () => import("./cli/cmd/web").then((m) => m.WebCommand),
  models: () => import("./cli/cmd/models").then((m) => m.ModelsCommand),
  stats: () => import("./cli/cmd/stats").then((m) => m.StatsCommand),
  export: () => import("./cli/cmd/export").then((m) => m.ExportCommand),
  import: () => import("./cli/cmd/import").then((m) => m.ImportCommand),
  github: () => import("./cli/cmd/github").then((m) => m.GithubCommand),
  pr: () => import("./cli/cmd/pr").then((m) => m.PrCommand),
  session: () => import("./cli/cmd/session").then((m) => m.SessionCommand),
  plugin: () => import("./cli/cmd/plug").then((m) => m.PluginCommand),
  workflow: () => import("./cli/cmd/workflow").then((m) => m.WorkflowCommand),
  "plugin-store": () => import("./cli/cmd/plugin-store").then((m) => m.PluginStoreCommand),
  db: () => import("./cli/cmd/db").then((m) => m.DbCommand),
  license: () => import("./cli/cmd/license").then((m) => m.LicenseCommand),
  proxy: () => import("./cli/cmd/proxy").then((m) => m.ProxyCommand),
  doctor: () => import("./cli/cmd/doctor").then((m) => m.DoctorCommand),
  team: () => import("./cli/cmd/team").then((m) => m.TeamCommand),
  audit: () => import("./cli/cmd/audit").then((m) => m.AuditCommand),
  trust: () => import("./cli/cmd/trust").then((m) => m.TrustCommand),
  loop: () => import("./cli/cmd/loop").then((m) => m.LoopCommand),
}

async function loadCommandsFor(firstArg: string | undefined): Promise<CommandModule[]> {
  const loader = firstArg && !firstArg.startsWith("-")
    ? commandLoaders[firstArg as keyof typeof commandLoaders]
    : undefined
  if (loader) return [(await loader()) as CommandModule]
  if (args.includes("--help") || args.includes("-h")) {
    return Promise.all(Object.values(commandLoaders).map(async (load) => (await load()) as CommandModule))
  }
  if (firstArg && !firstArg.startsWith("-")) return Promise.all(Object.values(commandLoaders).map(async (load) => (await load()) as CommandModule))
  return []
}

mark("command-load-start")
const cmds = await loadCommandsFor(args[0])
mark("command-load-end")
measure("command-load-start", "command-load-end", "command-load")

mark("yargs-parse-start")
const cli = yargs(args)
  .parserConfiguration({ "populate--": true })
  .scriptName("arcana")
  .wrap(100)
  .help("help", "show help")
  .alias("help", "h")
  .version("version", "show version number", InstallationVersion)
  .alias("version", "v")
  .option("print-logs", {
    describe: "print logs to stderr",
    type: "boolean",
  })
  .option("log-level", {
    describe: "log level",
    type: "string",
    choices: ["DEBUG", "INFO", "WARN", "ERROR"],
  })
  .option("pure", {
    describe: "run without external plugins",
    type: "boolean",
  })
  .option("compat-opencode-env", {
    describe: "also expose legacy OPENCODE=1 for compatibility with old plugins",
    type: "boolean",
  })
  .middleware(async (opts) => {
    await prepareRuntime({
      printLogs: !!opts.printLogs,
      logLevel: opts.logLevel as string | undefined,
      pure: !!opts.pure,
      compatOpencodeEnv: !!opts.compatOpencodeEnv,
      tui: !!opts.tui,
    })
  })
  .usage("")
  .completion("completion", "generate shell completion script")
  .command(TuiThreadCommand)
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
  .strict()

for (const cmd of cmds) cli.command(cmd)

try {
  mark("yargs-parse-end")
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
  const formatted = FormatError(e)
  if (formatted) UI.error(formatted)
  if (formatted === undefined) {
    UI.error("Unexpected error" + EOL)
    process.stderr.write(errorMessage(e) + EOL)
  }
  process.exitCode = 1
} finally {
  flushSync()
  // Some subprocesses don't react properly to SIGTERM and similar signals.
  // Most notably, some docker-container-based MCP servers don't handle such signals unless
  // run using `docker run --init`.
  // Explicitly exit to avoid any hanging subprocesses.
  process.exit()
}
