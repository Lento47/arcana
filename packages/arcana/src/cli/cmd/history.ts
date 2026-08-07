import type { CommandModule } from "yargs"
import { openMemoryDB, MemoryStore } from "@arcana/memory"
import { loadConfig, getDataDir } from "../../config.js"
import { outputJson, isJsonMode, jsonOption } from "../json-output.js"

export const HistoryCommand: CommandModule = {
  command: "history [action]",
  describe: "browse and resume past sessions",
  builder: (yargs) =>
    yargs
      .positional("action", { choices: ["list", "show", "resume"] as const, default: "list" as const })
      .option("id", { alias: "i", type: "string", describe: "session ID" })
      .option("limit", { alias: "n", type: "number", default: 20, describe: "max results" })
      .option("json", { type: "boolean", default: false, describe: "output machine-readable JSON to stdout" }),
  async handler(args) {
    const config = await loadConfig()
    const db = openMemoryDB(getDataDir(config))
    const memory = new MemoryStore(db)
    const action = String(args.action ?? "list")
    const json = isJsonMode(args)

    if (action === "show" || action === "resume") {
      if (!args.id) {
        console.error("--id required")
        process.exitCode = 1
        return
      }
      const wanted = String(args.id)
      // `history list` displays 8-char IDs — resolve a prefix to the full session
      // (getSession is exact-match), so the IDs users see actually work here.
      let session = memory.getSession(wanted)
      if (!session) session = memory.listSessions(1000).find((s) => s.id.startsWith(wanted)) ?? null
      if (!session) {
        console.error(`Session not found: ${args.id}`)
        process.exitCode = 1
        return
      }

      if (action === "resume") {
        if (json) {
          outputJson({ command: `arcana run --resume ${session.id}`, sessionId: session.id })
        } else {
          console.log(`arcana run --resume ${session.id}`)
        }
        return
      }

      const msgs = memory.getMessages(session.id)
      if (json) {
        outputJson({
          id: session.id,
          title: session.title ?? "(untitled)",
          model: session.model ?? null,
          provider: session.provider ?? null,
          messageCount: session.message_count,
          createdAt: session.created_at,
          updatedAt: session.updated_at,
          summary: session.summary ?? null,
          messages: msgs.slice(-10).map((m) => ({
            role: m.role,
            content: m.content.slice(0, 120),
          })),
        })
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
      console.log(`\n--- Last 10 messages ---`)
      for (const m of msgs.slice(-10)) {
        console.log(`[${m.role}] ${m.content.slice(0, 120)}${m.content.length > 120 ? "…" : ""}`)
      }
      return
    }

    // list
    const sessions = memory.listSessions(Number(args.limit ?? 20))
    if (json) {
      outputJson(
        sessions.map((s) => ({
          id: s.id,
          title: s.title ?? "(untitled)",
          model: s.model ?? null,
          provider: s.provider ?? null,
          messageCount: s.message_count,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
          summary: s.summary ?? null,
        })),
      )
      return
    }
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
