/**
 * Self-learning extraction — called after REPL sessions.
 * Mirrors packages/opencode/src/session/learning.ts for use in the standalone arcana CLI.
 */
import path from "path"
import fs from "fs"

export interface LearningExtraction {
  facts: LearningEntry[]
  patterns: LearningEntry[]
  mistakes: LearningEntry[]
}

export interface LearningEntry {
  slug: string
  summary: string
  body: string
  tags: string[]
}

export const EXTRACTION_PROMPT = `Extract learnings from this conversation. Output ONLY valid JSON:
{
  "facts": [{"slug":"kebab-case","summary":"one line","body":"**Why:** ...\\n**How to apply:** ...\\n","tags":["tag1"]}],
  "patterns": [],
  "mistakes": []
}
Rules: slug lowercase hyphens. Only genuinely NEW learnings. Skip obvious. Empty arrays if nothing new.`

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function slugToFile(slug: string): string {
  return `${slug.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")}.md`
}

export function createWikiFile(root: string, entry: LearningEntry, sourceSession?: string): string {
  const dir = path.join(root, ".arcana", "learned")
  ensureDir(dir)
  const fp = path.join(dir, slugToFile(entry.slug))
  const fm = [
    "---",
    `tags: [${entry.tags.join(", ")}]`,
    `date: ${new Date().toISOString().split("T")[0]}`,
    sourceSession ? `source: ${sourceSession}` : "",
  ].filter(Boolean).join("\n")
  fs.writeFileSync(fp, `${fm}\n# ${entry.slug.replace(/-/g, " ")}\n\n${entry.summary}\n\n${entry.body}\n`, "utf-8")
  return fp
}

export function updateLearnedMd(root: string, entries: LearningEntry[], category: "facts" | "patterns" | "mistakes"): void {
  const lp = path.join(root, ".arcana", "LEARNED.md")
  const heading = category === "facts" ? "## Project" : category === "patterns" ? "## Patterns" : "## Mistakes"
  let content = ""
  try { content = fs.readFileSync(lp, "utf-8") } catch {
    content = `# LEARNED — Accumulated Knowledge Index\n\n> Auto-updated by self-learning loop.\n\n## Project\n\n## Patterns\n\n## Mistakes\n`
  }
  for (const e of entries) {
    const link = `[[${e.slug}]]`
    if (content.includes(link)) continue
    const idx = content.indexOf(heading)
    if (idx === -1) { content += `\n${heading}\n- ${link} — ${e.summary}\n` }
    else { const ins = content.indexOf("\n", idx) + 1; content = content.slice(0, ins) + `- ${link} — ${e.summary}\n` + content.slice(ins) }
  }
  ensureDir(path.dirname(lp))
  fs.writeFileSync(lp, content, "utf-8")
}

export function extractAndMerge(root: string, ex: LearningExtraction, sourceSession?: string): string[] {
  const created: string[] = []
  for (const cat of ["facts", "patterns", "mistakes"] as const) {
    const entries = ex[cat]
    if (!entries.length) continue
    for (const e of entries) created.push(createWikiFile(root, e, sourceSession))
    updateLearnedMd(root, entries, cat)
  }
  return created
}
