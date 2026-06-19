import { homedir } from "node:os"
import { join } from "node:path"
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"

export type KanbanCard = {
  id: string
  title: string
  description: string
  status: "backlog" | "in_progress" | "done" | "blocked"
  priority: "high" | "medium" | "low"
  created: string
  updated: string
}

export type KanbanBoard = {
  goal: string
  goalScope: string
  sessionId: string
  created: string
  cards: KanbanCard[]
}

const KANBAN_DIR = join(homedir(), ".arcana", "kanban")

function boardPath(sessionId: string): string {
  return join(KANBAN_DIR, `${sessionId}.json`)
}

export function loadBoard(sessionId: string): KanbanBoard | null {
  const path = boardPath(sessionId)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf8")) as KanbanBoard
  } catch { return null }
}

export function saveBoard(sessionId: string, board: KanbanBoard): void {
  mkdirSync(KANBAN_DIR, { recursive: true })
  writeFileSync(boardPath(sessionId), JSON.stringify(board, null, 2), "utf8")
}

export function initBoard(sessionId: string, goal: string, scope: string): KanbanBoard {
  const board: KanbanBoard = {
    goal,
    goalScope: scope,
    sessionId,
    created: new Date().toISOString(),
    cards: [],
  }
  saveBoard(sessionId, board)
  return board
}

export function addCard(
  board: KanbanBoard,
  title: string,
  description: string,
  priority: KanbanCard["priority"],
): KanbanCard {
  const card: KanbanCard = {
    id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    description,
    status: "backlog",
    priority,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  }
  board.cards.push(card)
  saveBoard(board.sessionId, board)
  return card
}

export function moveCard(
  board: KanbanBoard,
  cardId: string,
  status: KanbanCard["status"],
): KanbanCard | null {
  const card = board.cards.find((c) => c.id === cardId)
  if (!card) return null
  card.status = status
  card.updated = new Date().toISOString()
  saveBoard(board.sessionId, board)
  return card
}

export function archiveDone(board: KanbanBoard): number {
  const before = board.cards.length
  board.cards = board.cards.filter((c) => c.status !== "done")
  saveBoard(board.sessionId, board)
  return before - board.cards.length
}

export function formatBoard(board: KanbanBoard): string {
  const cols = ["backlog", "in_progress", "done", "blocked"] as const
  const labels: Record<string, string> = {
    backlog: "📋 Backlog",
    in_progress: "🔄 In Progress",
    done: "✅ Done",
    blocked: "⛔ Blocked",
  }
  const lines: string[] = []
  lines.push(`# Kanban Board\n`)
  lines.push(`**Goal:** ${board.goal}`)
  lines.push(`**Scope:** ${board.goalScope}`)
  lines.push(`**Cards:** ${board.cards.length} total\n`)

  for (const col of cols) {
    const cards = board.cards.filter((c) => c.status === col)
    if (!cards.length) continue
    lines.push(`## ${labels[col]}`)
    for (const c of cards) {
      const tag = { high: "🔴", medium: "🟡", low: "🟢" }[c.priority] ?? ""
      lines.push(`- [${c.id.slice(0, 8)}] **${c.title}** ${tag}`)
      if (c.description) lines.push(`  ${c.description.slice(0, 120)}`)
    }
    lines.push("")
  }

  // Write wiki summary to vault if available
  const vaultPath = join(process.cwd(), ".vault", "kanban.md")
  try {
    const wiki = [
      "---",
      `aliases: [kanban, board, goal-tracker]`,
      `tags: [arcana, kanban, goal, auto-generated]`,
      `date: ${new Date().toISOString().split("T")[0]}`,
      "---",
      "",
      `# Kanban — ${board.goal}`,
      "",
      `> Auto-generated from active goal board.`,
      "",
      ...lines.slice(1),
    ].join("\n")
    mkdirSync(join(process.cwd(), ".vault"), { recursive: true })
    writeFileSync(vaultPath, wiki, "utf8")
  } catch {}

  return lines.join("\n")
}
