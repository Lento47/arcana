import { appendFile, mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

/**
 * In-TUI feedback writer. The TUI runs under `--conditions=browser` and does not
 * depend on @arcana/memory, so instead of touching SQLite directly it appends a
 * JSON line to a queue file. `arcana feedback list|stats` drains this queue into
 * the `feedback` table in memory.db, keeping a single source of truth.
 */
export function feedbackQueuePath(): string {
  return join(homedir(), ".arcana", "feedback-queue.jsonl")
}

export async function recordTuiFeedback(entry: {
  sessionID?: string
  messageID?: string
  rating: "up" | "down"
  note?: string
}): Promise<void> {
  await mkdir(join(homedir(), ".arcana"), { recursive: true })
  const line = JSON.stringify({
    session_id: entry.sessionID ?? null,
    message_id: entry.messageID ?? null,
    rating: entry.rating,
    note: entry.note ?? null,
    source: "tui",
    created_at: new Date().toISOString(),
  })
  await appendFile(feedbackQueuePath(), line + "\n", "utf8")
}
