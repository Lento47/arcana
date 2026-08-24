/**
 * Prompt evolution engine — auto-improves the system prompt over sessions.
 * After N sessions, reviews performance data and proposes improvements.
 * Higher-scored variants are promoted to active.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { createHash } from "node:crypto"
import type { AgentRunner } from "./runner.js"
import {
  evaluatePromotion,
  certificateIntegrityHash,
} from "./evolution-certificate.js"

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
      const candidateHash = createHash("sha256").update(proposed).digest("hex")
      writeFileSync(join(EVOLVE_DIR, `${id}.txt`), proposed, "utf8")
      writeFileSync(
        join(EVOLVE_DIR, `${id}.json`),
        JSON.stringify({ score: 0.5, ts: new Date().toISOString(), reason: "auto-evolved", proposedBy: "arcana-evolver", candidateHash }),
        "utf8",
      )
      pruneProposals() // bound `.arcana/prompts/` growth — proposals accumulated forever

      // ── K9 promotion gate: paired judge evaluation → certificate ─────
      // The proposer never grades its own candidate. A judge call scores
      // INCUMBENT vs CANDIDATE on a shared rubric; only a certificate with
      // paired superiority beyond margin promotes.
      const incumbent = getActivePrompt(currentPrompt) || currentPrompt
      const judgePrompt = `You are an impartial prompt evaluator. Compare two system prompts for an autonomous coding agent on this rubric (0-10 each): clarity, guardrail quality, tool-coverage preservation, concision.

DATA BASIS:
${data.slice(0, 1200)}

=== PROMPT INCUMBENT ===
${incumbent}

=== PROMPT CANDIDATE ===
${proposed}

Output ONLY JSON: {"incumbentScore": <0-10>, "candidateScore": <0-10>}`

      let incumbentScore = NaN
      let candidateScore = NaN
      try {
        const judged = await runner.run([{ role: "user", content: judgePrompt }])
        const parsed = JSON.parse(judged.content.trim().replace(/^```json\s*|```$/g, "")) as {
          incumbentScore?: number
          candidateScore?: number
        }
        incumbentScore = Number(parsed.incumbentScore)
        candidateScore = Number(parsed.candidateScore)
      } catch { /* judge failure ⇒ no promotion this cycle */ }

      if (Number.isFinite(incumbentScore) && Number.isFinite(candidateScore)) {
        const decision = evaluatePromotion({
          candidateId: id,
          candidateHash,
          proposedBy: "arcana-evolver",
          evaluatedBy: "arcana-judge",
          evidence: {
            metric: "llm_judge_paired_10",
            candidateValue: candidateScore,
            baselineValue: incumbentScore,
            sampleCount: 1,
          },
          minMargin: 0.5,
          minSamples: 1,
        })

        if (decision.verdict === "promote") {
          const cert = {
            ...decision.certificate,
            integrityHash: certificateIntegrityHash(decision.certificate),
          }
          writeFileSync(join(EVOLVE_DIR, `${id}.cert.json`), JSON.stringify(cert, null, 2), "utf8")
          writeFileSync(ACTIVE_PROMPT, readFileSync(join(EVOLVE_DIR, `${id}.txt`), "utf8"), "utf8")
          return readFileSync(ACTIVE_PROMPT, "utf8").trim()
        }
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

/** Keep only the newest `keep` proposal pairs (vN.txt/vN.json); delete older. */
function pruneProposals(keep = 10): void {
  try {
    const versions = readdirSync(EVOLVE_DIR)
      .filter((f) => /^v\d+\.json$/.test(f))
      .map((f) => f.replace(".json", ""))
      .sort() // v + fixed-width ms timestamp → lexicographic == chronological
    for (const id of versions.slice(0, Math.max(0, versions.length - keep))) {
      try { unlinkSync(join(EVOLVE_DIR, `${id}.txt`)) } catch {}
      try { unlinkSync(join(EVOLVE_DIR, `${id}.json`)) } catch {}
    }
  } catch { /* best-effort */ }
}

