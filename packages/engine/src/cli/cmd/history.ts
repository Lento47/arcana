import type { CommandModule } from "yargs"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { openMemoryDB, MemoryStore } from "@arcana/memory"
import * as Locale from "@/util/locale"
import { getDataDir, getArcanaHome } from "./arcana-home.js"

function resolveDataDir(): string {
  const cp = join(getArcanaHome(), "config.json")
  if (existsSync(cp)) {
    try {
      const cfg = JSON.parse(readFileSync(cp, "utf8"))
      if (typeof cfg.dataDir === "string") return cfg.dataDir
    } catch {}
  }
  return getDataDir()
}

export const HistoryCommand: CommandModule = {
  command: "history [action]",
  describe: "browse and resume past sessions",
  builder: (yargs) =>
    yargs
      .positional("action", { choices: ["list", "show", "resume"] as const, default: "list" as const })
      .option("id", { alias: "i", type: "string", describe: "session ID" })
      .option("limit", { alias: "n", type: "number", default: 20, describe: "max results" }),
  async handler(args) {
    const db = openMemoryDB(resolveDataDir())
    const memory = new MemoryStore(db)
    const action = String(args.action ?? "list")

    if (action === "show" || action === "resume") {
      if (!args.id) { console.error("--id required"); process.exit(1) }
      const wanted = String(args.id)
      let session = memory.getSession(wanted)
      if (!session) session = memory.listSessions(1000).find((s) => s.id.startsWith(wanted)) ?? null
      if (!session) { console.error(`Session not found: ${args.id}`); process.exit(1) }

      if (action === "resume") {
        console.log(`arcana run --resume ${session.id}`)
        return
      }

      console.log(`ID:       ${session.id}`)
      console.log(`Title:    ${session.title ?? "(untitled)"}`)
      console.log(`Model:    ${session.model ?? "?"} @ ${session.provider ?? "?"}`)
      console.log(`Messages: ${session.message_count}`)
      console.log(`Created:  ${session.created_at}`)
      if (session.summary) console.log(`Summary:  ${session.summary}`)
      const msgs = memory.getMessages(session.id)
      console.log("\n--- Last 10 messages ---")
      for (const m of msgs.slice(-10)) {
        console.log(`[${m.role}] ${Locale.truncate(m.content, 120)}`)
      }
      return
    }

    const sessions = memory.listSessions(Number(args.limit ?? 20))
    if (!sessions.length) { console.log("No sessions found."); return }
    console.log(`${sessions.length} sessions:\n`)
    for (const s of sessions) {
      const id = s.id.slice(0, 8)
      const title = Locale.truncate(s.title ?? "(untitled)", 40)
      const date = s.updated_at.slice(0, 16).replace("T", " ")
      console.log(`  ${id}  ${date}  ${String(s.message_count).padEnd(8)} ${title}`)
    }
    console.log("\n  arcana history show --id <id>   for details")
  },
}
