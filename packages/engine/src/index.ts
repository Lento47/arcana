import { mark, flush, flushSync } from "./cli/profile"
mark("cli-import-start")
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { RunCommand } from "./cli/cmd/run"
import { GenerateCommand } from "./cli/cmd/generate"
import { ConsoleCommand } from "./cli/cmd/account"
import { ProvidersCommand } from "./cli/cmd/providers"
import { AgentCommand } from "./cli/cmd/agent"
import { UpgradeCommand } from "./cli/cmd/upgrade"
import { UninstallCommand } from "./cli/cmd/uninstall"
import { ModelsCommand } from "./cli/cmd/models"
import { UI } from "./cli/ui"
import { InstallationVersion } from "@arcana/core/installation/version"
import { FormatError } from "./cli/error"
import { ServeCommand } from "./cli/cmd/serve"
import { DebugCommand } from "./cli/cmd/debug"
import { StatsCommand } from "./cli/cmd/stats"
import { McpCommand } from "./cli/cmd/mcp"
import { GithubCommand } from "./cli/cmd/github"
import { ExportCommand } from "./cli/cmd/export"
import { ImportCommand } from "./cli/cmd/import"
import { AttachCommand } from "./cli/cmd/attach"
import { TuiThreadCommand } from "./cli/cmd/tui"
import { AcpCommand } from "./cli/cmd/acp"
import { EOL } from "os"
import { WebCommand } from "./cli/cmd/web"
import { PrCommand } from "./cli/cmd/pr"
import { SessionCommand } from "./cli/cmd/session"
import { DbCommand } from "./cli/cmd/db"
import { errorMessage } from "./util/error"
import { PluginCommand } from "./cli/cmd/plug"
import { PluginStoreCommand } from "./cli/cmd/plugin-store"
import { ProxyCommand } from "./cli/cmd/proxy"
import { Heap } from "./cli/heap"
import { DoctorCommand } from "@arcana/arcana/cli/cmd/doctor"
import { MemoryCommand } from "@arcana/arcana/cli/cmd/memory"
import { HistoryCommand } from "@arcana/arcana/cli/cmd/history"
import { LearnCommand } from "@arcana/arcana/cli/cmd/learn"
import { LicenseCommand } from "./cli/cmd/license"
import { CronCommand } from "@arcana/arcana/cli/cmd/cron"
import { GatewayCommand } from "@arcana/arcana/cli/cmd/gateway"
import { SkillsCommand } from "@arcana/arcana/cli/cmd/skills"
import { ConfigCommand } from "@arcana/arcana/cli/cmd/config"
import { ThemeCommand } from "@arcana/arcana/cli/cmd/theme"
import { AuditCommand } from "./cli/cmd/audit"
import { TeamCommand } from "./cli/cmd/team"
mark("cli-import-end")

// Auto-configure proxy auth from stored license key
if (!process.env.ARCANA_PROXY_KEY) {
  try {
    const { readFileSync, existsSync } = require("node:fs") as typeof import("node:fs")
    const { join } = require("node:path") as typeof import("node:path")
    const home = process.env.ARCANA_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? ".", ".arcana")
    const keyFile = join(home, "proxy_key")
    if (existsSync(keyFile)) {
      process.env.ARCANA_PROXY_KEY = readFileSync(keyFile, "utf8").trim()
      process.stderr.write(`[arcana] proxy key loaded from ${keyFile}\n`)
    }
  } catch {}
}

const args = hideBin(process.argv)

function show(out: string) {
  const text = out.trimStart()
  if (!text.startsWith("opencode ")) {
    process.stderr.write(UI.logo() + EOL + EOL)
    process.stderr.write(text + EOL)
    return
  }
  process.stderr.write(out)
}

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
  .middleware(async (opts) => {
    if (opts.printLogs) process.env.ARCANA_PRINT_LOGS = "1"
    if (opts.logLevel) process.env.ARCANA_LOG_LEVEL = opts.logLevel
    if (opts.pure) {
      process.env.ARCANA_PURE = "1"
    }

    Heap.start()

    process.env.AGENT = "1"
    process.env.OPENCODE = "1"
    process.env.ARCANA_PID = String(process.pid)
  })
  .usage("")
  .completion("completion", "generate shell completion script")
  .command(AcpCommand)
  .command(McpCommand)
  .command(TuiThreadCommand)
  .command(AttachCommand)
  .command(RunCommand)
  .command(GenerateCommand)
  .command(DebugCommand)
  .command(ConsoleCommand)
  .command(ProvidersCommand)
  .command(AgentCommand)
  .command(UpgradeCommand)
  .command(UninstallCommand)
  .command(ServeCommand)
  .command(WebCommand)
  .command(ModelsCommand)
  .command(StatsCommand)
  .command(ExportCommand)
  .command(ImportCommand)
  .command(GithubCommand)
  .command(PrCommand)
  .command(SessionCommand)
  .command(PluginCommand)
  .command(PluginStoreCommand)
  .command(DbCommand)
  .command(DoctorCommand)
  .command(MemoryCommand)
  .command(HistoryCommand)
  .command(LearnCommand)
  .command(LicenseCommand)
  .command(CronCommand)
  .command(GatewayCommand)
  .command(ProxyCommand)
  .command(SkillsCommand)
  .command(ConfigCommand)
  .command(TeamCommand)
  .command(AuditCommand)
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
