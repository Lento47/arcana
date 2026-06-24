import type { CommandModule } from "yargs"
import { existsSync } from "node:fs"
import { join } from "node:path"

function enterpriseDir(): string {
  return join(import.meta.dir, "..", "..", "..", "..", "enterprise")
}

function buildArgs(args: { host?: unknown; port?: unknown; open?: unknown; build?: unknown }): string[] {
  if (args.build) return ["run", "build"]

  const cmd = ["run", "dev", "--"]
  if (args.host) cmd.push("--host", String(args.host))
  if (args.port) cmd.push("--port", String(args.port))
  if (args.open) cmd.push("--open")
  return cmd
}

export const WebCommand: CommandModule = {
  command: "web",
  describe: "start the optional Arcana web app",
  builder: (yargs) =>
    yargs
      .option("host", { type: "string", describe: "host interface for the web app" })
      .option("port", { type: "number", describe: "port for the web app" })
      .option("open", { type: "boolean", default: false, describe: "open the browser after startup" })
      .option("build", { type: "boolean", default: false, describe: "build the web app instead of starting dev mode" }),
  async handler(args) {
    const cwd = enterpriseDir()
    const packageJson = join(cwd, "package.json")
    if (!existsSync(packageJson)) {
      console.error("Arcana web app is not available in this checkout. Expected packages/enterprise/package.json.")
      process.exit(1)
    }

    const cmd = ["bun", ...buildArgs(args)]
    console.log(args.build ? "Building Arcana web app…" : "Starting Arcana web app…")
    console.log(`  cwd: ${cwd}`)
    console.log(`  cmd: ${cmd.join(" ")}`)

    const child = Bun.spawn({
      cmd,
      cwd,
      stdio: ["inherit", "inherit", "inherit"],
      env: {
        ...process.env,
        ARCANA_WEB: "1",
      },
    })

    process.exitCode = await child.exited
  },
}
