/**
 * Prompt evolution engine — auto-improves the system prompt over sessions.
 * After N sessions, reviews performance data and proposes improvements.
 * Higher-scored variants are promoted to active.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import type { AgentRunner } from "./runner.js"

const EVOLVE_DIR = join(homedir(), ".arcana", "prompts")
const ACTIVE_PROMPT = join(EVOLVE_DIR, "_active.txt")
const SESSION_COUNT = join(EVOLVE_DIR, "_sessions.txt")
const EVOLVE_LOCK = join(EVOLVE_DIR, "_evolving.lock")
const EVOLVE_INTERVAL = 5 // review every N sessions

export function getSessionCount(): number {
  if (!existsSync(SESSION_COUNT)) return 0
  return parseInt(readFileSync(SESSION_COUNT, "utf8").trim() || "0", 10)
}

export function incrementSessionCount(): number {
  mkdirSync(EVOLVE_DIR, { recursive: true })
  const next = getSessionCount() + 1
  writeFileSync(SESSION_COUNT, String(next), "utf8")
  return next
}

export function getActivePrompt(fallback: string): string {
  if (!existsSync(ACTIVE_PROMPT)) return fallback
  return readFileSync(ACTIVE_PROMPT, "utf8").trim() || fallback
}

export async function maybeEvolve(runner: AgentRunner, currentPrompt: string): Promise<string> {
  const count = getSessionCount()
  if (count > 0 && count % EVOLVE_INTERVAL !== 0) return currentPrompt

  // Guard: prevent recursive evolution (evolver calls runner, runner triggers evolve)
  if (existsSync(EVOLVE_LOCK)) return currentPrompt
  writeFileSync(EVOLVE_LOCK, String(count), "utf8")

  try {
    const reflections = readDirJson(join(homedir(), ".arcana", "reflections"))
    const strategies = readDirJson(join(homedir(), ".arcana", "strategies"))
    const proposals = readDirJson(EVOLVE_DIR)

    if (reflections.length + strategies.length < 3) return currentPrompt

    const successRate = strategies.filter((s: any) => s.outcome === "success").length / Math.max(1, strategies.length)
    const data = [
      `Session count: ${count}`,
      `Success rate: ${Math.round(successRate * 100)}%`,
      reflections.length ? `Recent reflections:\n${reflections.slice(-3).map((r: any) => `- [${r.outcome}] ${r.lesson}`).join("\n")}` : "",
      strategies.length ? `Recent strategies:\n${strategies.slice(-3).map((s: any) => `- [${s.outcome}] ${s.task}: ${s.approach}`).join("\n")}` : "",
      proposals.length ? `Past proposals:\n${proposals.slice(-3).map((p: any) => `- score=${p.score} ${p.reason?.slice(0, 80)}`).join("\n")}` : "",
    ].filter(Boolean).join("\n\n")

    const reviewPrompt = `You are an AI prompt engineer. Review this performance data and propose an improved system prompt.

PERFORMANCE DATA:
${data}

CURRENT SYSTEM PROMPT:
${currentPrompt}

Propose a new system prompt. Output ONLY the new prompt text (no JSON, no commentary).
Rules:
- Preserve the core identity and tool list
- Keep it concise — shorter is better if clarity is maintained
- Add guardrails or meta-cognition hints based on failures seen
- Remove anything that's consistently unused or causing loops

NEW SYSTEM PROMPT:`

    try {
      const result = await runner.run([{ role: "user", content: reviewPrompt }])
      const proposed = result.content.trim()
      if (!proposed || proposed.length < 50) return currentPrompt

      const id = `v${Date.now()}`
      writeFileSync(join(EVOLVE_DIR, `${id}.txt`), proposed, "utf8")
      writeFileSync(join(EVOLVE_DIR, `${id}.json`), JSON.stringify({ score: 0.5, ts: new Date().toISOString(), reason: "auto-evolved" }), "utf8")

      const best = findBest()
      if (best && best.score > 0.6) {
        writeFileSync(ACTIVE_PROMPT, readFileSync(join(EVOLVE_DIR, `${best.id}.txt`), "utf8"), "utf8")
        return readFileSync(ACTIVE_PROMPT, "utf8").trim()
      }
    } catch { /* evolution is best-effort */ }
  } finally {
    try { unlinkSync(EVOLVE_LOCK) } catch {}
  }

  return currentPrompt
}

function readDirJson(dir: string): any[] {
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => { try { return JSON.parse(readFileSync(join(dir, f), "utf8")) } catch { return null } })
      .filter(Boolean)
  } catch { return [] }
}

function findBest(): { id: string; score: number } | null {
  if (!existsSync(EVOLVE_DIR)) return null
  const proposals = readdirSync(EVOLVE_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => {
      try {
        const data = JSON.parse(readFileSync(join(EVOLVE_DIR, f), "utf8"))
        return { id: f.replace(".json", ""), score: data.score ?? 0 }
      } catch { return null }
    })
    .filter(Boolean)
    .sort((a, b) => b!.score - a!.score)
  return proposals[0] ?? null
}
