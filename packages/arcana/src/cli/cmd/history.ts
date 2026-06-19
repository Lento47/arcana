import type { CommandModule } from "yargs"
import { openMemoryDB, MemoryStore } from "@arcana/memory"
import { loadConfig, getDataDir } from "../../config.js"

export const HistoryCommand: CommandModule = {
  command: "history [action]",
  describe: "browse and resume past sessions",
  builder: (yargs) =>
    yargs
      .positional("action", { choices: ["list", "show", "resume"] as const, default: "list" as const })
      .option("id", { alias: "i", type: "string", describe: "session ID" })
      .option("limit", { alias: "n", type: "number", default: 20, describe: "max results" }),
  async handler(args) {
    const config = await loadConfig()
    const db = openMemoryDB(getDataDir(config))
    const memory = new MemoryStore(db)
    const action = String(args.action ?? "list")

    if (action === "show" || action === "resume") {
      if (!args.id) { console.error("--id required"); process.exit(1) }
      const session = memory.getSession(String(args.id))
      if (!session) { console.error(`Session not found: ${args.id}`); process.exit(1) }

      if (action === "resume") {
        console.log(`arcana run --resume ${session.id}`)
        return
      }

      // show
      console.log(`ID:       ${session.id}`)
      console.log(`Title:    ${session.title ?? "(untitled)"}`)
      console.log(`Model:    ${session.model ?? "?"} @ ${session.provider ?? "?"}`)
      console.log(`Messages: ${session.message_count}`)
      console.log(`Created:  ${session.created_at}`)
      console.log(`Updated:  ${session.updated_at}`)
      if (session.summary) console.log(`Summary:  ${session.summary}`)
      const msgs = memory.getMessages(session.id)
      console.log(`\n--- Last 10 messages ---`)
      for (const m of msgs.slice(-10)) {
        console.log(`[${m.role}] ${m.content.slice(0, 120)}${m.content.length > 120 ? "…" : ""}`)
      }
      return
    }

    // list
    const sessions = memory.listSessions(Number(args.limit ?? 20))
    if (!sessions.length) { console.log("No sessions found."); return }
    console.log(`${sessions.length} sessions:\n`)
    for (const s of sessions) {
      const id = s.id.slice(0, 8)
      const title = (s.title ?? "(untitled)").slice(0, 40)
      const date = s.updated_at.slice(0, 16).replace("T", " ")
      const count = `${s.message_count} msgs`
      console.log(`  ${id}  ${date}  ${count.padEnd(8)} ${title}`)
    }
    console.log(`\n  arcana history show --id <id>   for details`)
    console.log(`  arcana history resume --id <id> for resume command`)
  },
}
