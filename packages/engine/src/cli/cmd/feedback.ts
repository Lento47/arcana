import type { CommandModule } from "yargs"
import { openMemoryDB, MemoryStore } from "@arcana/memory"
import { getDataDir } from "./arcana-home.js"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

function drainQueue(store: MemoryStore): number {
  const queuePath = join(homedir(), ".arcana", "feedback-queue.jsonl")
  if (!existsSync(queuePath)) return 0
  let drained = 0
  try {
    const lines = readFileSync(queuePath, "utf8").split("\n").filter((l) => l.trim())
    for (const line of lines) {
      try {
        const e = JSON.parse(line)
        store.recordFeedback({
          rating: e.rating === "up" || e.rating === "down" ? e.rating : undefined,
          note: e.note ?? undefined,
          category: e.category ?? undefined,
          sessionId: e.session_id ?? undefined,
          messageId: e.message_id ?? undefined,
          source: e.source ?? "tui",
        })
        drained++
      } catch {}
    }
    writeFileSync(queuePath, "", "utf8")
  } catch {}
  return drained
}

export const FeedbackCommand: CommandModule = {
  command: "feedback [message..]",
  describe: "send feedback about arcana, or review past feedback",
  builder: (yargs) =>
    yargs
      .positional("message", { type: "string", array: true, describe: 'feedback text, or "list" / "stats"' })
      .option("bug", { type: "boolean", describe: "tag as a bug report" })
      .option("idea", { type: "boolean", describe: "tag as a feature idea" })
      .option("praise", { type: "boolean", describe: "tag as praise" })
      .option("limit", { alias: "n", type: "number", default: 20, describe: "max rows" }),
  async handler(args) {
    const dataDir = getDataDir()
    try { mkdirSync(dataDir, { recursive: true }) } catch {}
    const db = openMemoryDB(dataDir)
    const store = new MemoryStore(db)

    const parts = ((args.message as string[] | undefined) ?? []).map(String)
    const first = (parts[0] ?? "").toLowerCase()

    if (first === "list" && parts.length === 1) {
      drainQueue(store)
      const rows = store.listFeedback(Number(args.limit))
      if (!rows.length) { console.log('No feedback yet. Send some: arcana feedback "..."'); return }
      for (const f of rows) {
        const tag = f.rating ? (f.rating === "up" ? "\uD83D\uDC4D" : "\uD83D\uDC4E") : f.category ?? "note"
        console.log(`${f.id.slice(0, 4)}  ${f.created_at.slice(0, 10)}  ${String(tag).padEnd(6)} ${f.note ?? ""}  [${f.source}]`)
      }
      return
    }

    if (first === "stats" && parts.length === 1) {
      drainQueue(store)
      const s = store.feedbackStats()
      console.log(`Feedback: ${s.total} total \u00B7 \uD83D\uDC4D ${s.up} \u00B7 \uD83D\uDC4E ${s.down}`)
      return
    }

    const note = parts.join(" ").trim()
    if (!note) {
      console.error(
        'Usage: arcana feedback "your feedback" [--bug|--idea|--praise]\n' +
          "       arcana feedback list\n" +
          "       arcana feedback stats",
      )
      process.exit(1)
    }

    const category = args.bug ? "bug" : args.idea ? "idea" : args.praise ? "praise" : undefined
    const fb = store.recordFeedback({ note, category, source: "cli" })
    console.log(`\u2713 Feedback logged (${fb.id.slice(0, 4)}${category ? `, ${category}` : ""}). Thank you!`)
  },
}
