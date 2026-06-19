import { cmd } from "./cmd"
import { UI } from "../ui"

async function fetchAudit(path: string): Promise<any> {
  const res = await fetch(`https://api.arcana.otnelhq.com${path}`, {
    signal: AbortSignal.timeout(10000),
  })
  return res.json()
}

export const AuditCommand = cmd({
  command: "audit",
  describe: "query audit logs (Team/Enterprise feature)",
  builder: (yargs) =>
    yargs
      .command({
        command: "events",
        describe: "list recent audit events",
        builder: (y) =>
          y
            .option("limit", { alias: "l", type: "number", default: 20, describe: "max events" })
            .option("action", { alias: "a", type: "string", describe: "filter by action type" })
            .option("actor", { type: "string", describe: "filter by actor" }),
        async handler(args: any) {
          const orgId = process.env.ARCANA_ORG_ID ?? "default"
          const params = new URLSearchParams({ limit: String(args.limit ?? 20) })
          if (args.action) params.set("action", args.action)
          if (args.actor) params.set("actor", args.actor)
          try {
            const data = await fetchAudit(`/api/team/${orgId}/audit/events?${params}`)
            if (!data.events?.length) {
              UI.println("No audit events found.")
              return
            }
            UI.println(`⛧ Audit Events (${data.total} total)`)
            for (const evt of data.events) {
              const date = new Date(evt.time_created).toLocaleTimeString()
              UI.println(`  ${date} ${evt.action} by ${evt.actor}${evt.tool ? " [" + evt.tool + "]" : ""}`)
            }
          } catch (e) {
            UI.println(`Audit log requires a Team or Enterprise license.`)
            UI.println(`Error: ${e instanceof Error ? e.message : String(e)}`)
          }
        },
      })
      .command({
        command: "status",
        describe: "show audit log status",
        async handler() {
          UI.println("⛧ Audit Log")
          UI.println("   Status: Team/Enterprise feature")
          UI.println("   Run: arcana license status to check your plan")
          try {
            const { readFileSync, existsSync } = await import("node:fs")
            const { join } = await import("node:path")
            const { homedir } = await import("node:os")
            const auditPath = join(homedir(), ".arcana", "audit.jsonl")
            if (existsSync(auditPath)) {
              const size = readFileSync(auditPath, "utf8").split("\n").length
              UI.println(`   Local events: ~${size} recorded`)
            }
          } catch {}
        },
      })
      .demandCommand(),
  async handler() {},
})
