/**
 * Self-learning extraction — called after REPL sessions.
 * Mirrors packages/engine/src/session/learning.ts for use in the standalone arcana CLI.
 *
 * Memory gate (failure mode #12): only verified runs update LEARNED.md.
 * Confidence decay pipeline (failure mode #14): tracks model overconfidence.
 */
import path from "path"
import fs from "fs"
import { atomicWriteSync } from "./util/atomic-write"

export interface LearningExtraction {
  facts: LearningEntry[]
  patterns: LearningEntry[]
  mistakes: LearningEntry[]
  /** Confidence decay entries — cases where the model was overconfident (Feature #14) */
  confidence_decay?: ConfidenceDecayEntry[]
}

export interface LearningEntry {
  slug: string
  summary: string
  body: string
  tags: string[]
}

export interface ConfidenceDecayEntry {
  modelId: string
  providerId: string
  claim: string
  actual: string
}

export interface MergeResult {
  wikiFilesCreated: string[]
  quarantinedFiles: string[]
  learnedMdUpdated: boolean
  crossReferencesAdded: number
  modelTrustUpdated: boolean
}

export const EXTRACTION_PROMPT = `Extract learnings from this conversation. Output ONLY valid JSON:
{
  "facts": [{"slug":"kebab-case","summary":"one line","body":"**Why:** ...\\n**How to apply:** ...\\n","tags":["tag1"]}],
  "patterns": [],
  "mistakes": [],
  "confidence_decay": [
    {"modelId":"model-id","providerId":"provider","claim":"what model claimed","actual":"what actually happened"}
  ]
}
Rules: slug lowercase hyphens. Only genuinely NEW learnings. Skip obvious. Empty arrays if nothing new.
confidence_decay: identify where the model was overconfident — claimed HIGH confidence but FAILED.`

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function slugToFile(slug: string): string {
  return `${slug.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")}.md`
}

export function createWikiFile(root: string, entry: LearningEntry, sourceSession?: string, quarantine?: boolean): string {
  const baseDir = path.join(root, ".arcana", "learned")
  const dir = quarantine ? path.join(baseDir, ".quarantine") : baseDir
  ensureDir(dir)
  const fp = path.join(dir, slugToFile(entry.slug))
  const fm = [
    "---",
    `tags: [${entry.tags.join(", ")}]`,
    `date: ${new Date().toISOString().split("T")[0]}`,
    sourceSession ? `source: ${sourceSession}` : "",
    quarantine ? "quarantined: true" : "",
  ].filter(Boolean).join("\n")
  atomicWriteSync(fp, `${fm}\n# ${entry.slug.replace(/-/g, " ")}\n\n${entry.summary}\n\n${entry.body}\n`)
  return fp
}

function appendToMoc(mocPath: string, entries: LearningEntry[], category: "facts" | "patterns" | "mistakes"): void {
  const heading = category === "facts" ? "## Project" : category === "patterns" ? "## Patterns" : "## Mistakes"
  let content = ""
  try { content = fs.readFileSync(mocPath, "utf-8") } catch {
    content = `# LEARNED — Accumulated Knowledge Index\n\n> Auto-updated by self-learning loop.\n\n## Project\n\n## Patterns\n\n## Mistakes\n`
  }
  for (const e of entries) {
    const link = `[[${e.slug}]]`
    if (content.includes(link)) continue
    const idx = content.indexOf(heading)
    if (idx === -1) { content += `\n${heading}\n- ${link} — ${e.summary}\n` }
    else { const ins = content.indexOf("\n", idx) + 1; content = content.slice(0, ins) + `- ${link} — ${e.summary}\n` + content.slice(ins) }
  }
  ensureDir(path.dirname(mocPath))
  atomicWriteSync(mocPath, content)
}

export function updateLearnedMd(root: string, entries: LearningEntry[], category: "facts" | "patterns" | "mistakes"): void {
  appendToMoc(path.join(root, ".arcana", "LEARNED.md"), entries, category)
}

export function updateLearnedMdQuarantine(root: string, entries: LearningEntry[], category: "facts" | "patterns" | "mistakes"): void {
  appendToMoc(path.join(root, ".arcana", "LEARNED.md.quarantine"), entries, category)
}

export function promoteLearnings(root: string, slugs?: string[]): { promoted: string[]; count: number } {
  const baseDir = path.join(root, ".arcana", "learned")
  const quarantineDir = path.join(baseDir, ".quarantine")
  const promoted: string[] = []
  if (!fs.existsSync(quarantineDir)) return { promoted, count: 0 }
  const files = fs.readdirSync(quarantineDir).filter((f) => f.endsWith(".md"))
  const targetSet = slugs ? new Set(slugs) : undefined
  for (const file of files) {
    const slug = file.replace(/\.md$/, "")
    if (targetSet && !targetSet.has(slug)) continue
    const src = path.join(quarantineDir, file)
    const dst = path.join(baseDir, file)
    try {
      let content = fs.readFileSync(src, "utf-8")
      content = content.replace(/^quarantined:\s*true\s*\n/m, "")
      fs.writeFileSync(dst, content, "utf-8")
      fs.unlinkSync(src)
      promoted.push(slug)
    } catch { /* skip unreadable */ }
  }
  try { const rem = fs.readdirSync(quarantineDir); if (rem.length === 0) fs.rmdirSync(quarantineDir) } catch { /* fine */ }
  return { promoted, count: promoted.length }
}

export function updateModelTrust(root: string, entries: ConfidenceDecayEntry[]): boolean {
  if (entries.length === 0) return false
  const tp = path.join(root, ".arcana", "learned", "model-trust.md")
  const existing = new Map<string, number>()
  if (fs.existsSync(tp)) {
    try {
      const c = fs.readFileSync(tp, "utf-8")
      const re = /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*(\d+)\s*\|/gm
      let m: RegExpExecArray | null
      while ((m = re.exec(c)) !== null) existing.set(`${m[2]}/${m[1]}`, parseInt(m[3], 10))
    } catch { /* start fresh */ }
  }
  for (const e of entries) {
    const key = `${e.providerId}/${e.modelId}`
    existing.set(key, (existing.get(key) ?? 0) + 1)
  }
  const lines = [
    "# Model Trust Index",
    "",
    "> Models with >3 confidence mismatches get `[CONF:LOW]*` on future plans.",
    "",
    "| Model | Provider | Mismatches | Confidence Default |",
    "|-------|----------|------------|-------------------|",
  ]
  for (const [key, count] of existing) {
    const [provider, model] = key.split("/")
    const conf = count > 3 ? "LOW*" : "normal"
    lines.push(`| \`${model}\` | \`${provider}\` | ${count} | ${conf} |`)
  }
  lines.push("")
  ensureDir(path.dirname(tp))
  atomicWriteSync(tp, lines.join("\n"))
  return true
}

export function extractAndMerge(root: string, ex: LearningExtraction, sourceSession?: string, verified?: boolean): MergeResult {
  const isVerified = verified !== false
  const result: MergeResult = { wikiFilesCreated: [], quarantinedFiles: [], learnedMdUpdated: false, crossReferencesAdded: 0, modelTrustUpdated: false }
  for (const cat of ["facts", "patterns", "mistakes"] as const) {
    const entries = ex[cat]
    if (!entries.length) continue
    for (const e of entries) {
      if (isVerified) {
        result.wikiFilesCreated.push(createWikiFile(root, e, sourceSession))
      } else {
        result.quarantinedFiles.push(createWikiFile(root, e, sourceSession, true))
      }
    }
    if (isVerified) { updateLearnedMd(root, entries, cat); result.learnedMdUpdated = true }
    else { updateLearnedMdQuarantine(root, entries, cat) }
  }
  if (ex.confidence_decay?.length) result.modelTrustUpdated = updateModelTrust(root, ex.confidence_decay)
  if (isVerified) result.crossReferencesAdded = [...ex.facts, ...ex.patterns, ...ex.mistakes].length
  return result
}
