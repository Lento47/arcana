import { cmd } from "./cmd"
import { UI } from "../ui"

export const TeamCommand = cmd({
  command: "team",
  describe: "manage team vault and shared resources",
  builder: (yargs) =>
    yargs
      .command({
        command: "status",
        describe: "show team vault status",
        async handler() {
          UI.println("⛧ Team Vault")
          UI.println("   Status: enterprise feature")
          UI.println("   Run: arcana license status to check your plan")
        },
      })
      .command({
        command: "sessions [org]",
        describe: "list shared team sessions",
        builder: (y) => y.positional("org", { describe: "org ID (defaults to active)", type: "string" }),
        async handler(_args: any) {
          try {
            const { readFileSync: _readFileSync, existsSync } = await import("node:fs")
            const { join } = await import("node:path")
            const { homedir } = await import("node:os")
            const dbPath = join(homedir(), ".arcana", "data", "arcana.db")
            if (!existsSync(dbPath)) {
              UI.println("No team vault found. Start a session first.")
              return
            }
            const { execSync } = await import("node:child_process")
            const sessions = execSync(`sqlite3 "${dbPath}" "SELECT id, title, time_created FROM session ORDER BY time_created DESC LIMIT 20" 2>nul || echo no session table`, { encoding: "utf8" }).trim()
            if (!sessions || sessions === "no session table") {
              UI.println("No team sessions yet.")
              return
            }
            UI.println("⛧ Team Sessions")
            for (const line of sessions.split("\n")) {
              const parts = line.split("|")
              if (parts.length >= 2) {
                const title = parts[1]?.slice(0, 60) ?? "untitled"
                UI.println(`  ${title}`)
              }
            }
          } catch (e) {
            UI.println(`Error: ${e instanceof Error ? e.message : String(e)}`)
          }
        },
      })
      .command({
        command: "skills",
        describe: "list team-wide skills",
        async handler() {
          UI.println("Team skill registry requires a Team or Enterprise license.")
          UI.println("Upgrade at https://arcana.otnelhq.com")
        },
      })
      .demandCommand(),
  async handler() {},
})
