/**
 * FACTS.md — single compiled fact sheet for cloud sync / human review.
 *
 * Sources (read-only merge):
 *   1. ~/.arcana/data/memory.db  → user_facts
 *   2. <project>/.arcana/LEARNED.md  → MOC index lines
 *   3. <project>/.arcana/learned/*.md  → wiki bodies (excerpts)
 *
 * Default write path: <project>/.arcana/FACTS.md  (cwd project)
 * Fallback when no project .arcana: ~/.arcana/FACTS.md
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { homedir } from "node:os"
import type { MemoryStore, UserFact } from "@arcana/memory"
import { atomicWriteSync } from "./util/atomic-write"

export type FactOrigin = "user_facts" | "learned_md" | "learned_wiki"

export type CompiledFact = {
  key: string
  value: string
  source?: string
  confidence: number
  origin: FactOrigin
  updatedAt?: string
}

const VALUE_MAX = 1800 // leave headroom under proxy MEMORY_VALUE_MAX (2000)
const BODY_EXCERPT = 800

export function resolveFactsMdPath(opts?: { projectRoot?: string; global?: boolean }): string {
  if (opts?.global) {
    const home = process.env.ARCANA_HOME ?? join(homedir(), ".arcana")
    return join(home, "FACTS.md")
  }
  const root = opts?.projectRoot ?? process.cwd()
  const projectArcana = join(root, ".arcana")
  if (existsSync(projectArcana) || existsSync(join(root, ".git"))) {
    return join(projectArcana, "FACTS.md")
  }
  const home = process.env.ARCANA_HOME ?? join(homedir(), ".arcana")
  return join(home, "FACTS.md")
}

function projectArcanaDir(projectRoot: string): string {
  return join(projectRoot, ".arcana")
}

function stripFrontmatter(body: string): string {
  if (!body.startsWith("---")) return body
  const end = body.indexOf("\n---", 3)
  if (end === -1) return body
  return body.slice(end + 4).replace(/^\s+/, "")
}

function excerpt(text: string, max = BODY_EXCERPT): string {
  const t = text.replace(/\r\n/g, "\n").trim()
  if (t.length <= max) return t
  return t.slice(0, max).trimEnd() + "…"
}

function sanitizeKey(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ".")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/\.+/g, ".")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120)
}

/** Parse LEARNED.md index lines: `- [[slug]] — summary` or `- [[slug]] - summary` */
export function parseLearnedIndex(content: string): Array<{ slug: string; summary: string }> {
  const out: Array<{ slug: string; summary: string }> = []
  for (const line of content.split("\n")) {
    const m = line.match(/^\s*-\s*\[\[([^\]]+)\]\]\s*[—–\-]\s*(.+)\s*$/)
    if (!m) continue
    const slug = m[1]!.trim()
    const summary = m[2]!.trim()
    if (slug) out.push({ slug, summary })
  }
  return out
}

export function gatherFromUserFacts(store: MemoryStore, minConfidence = 0): CompiledFact[] {
  return store.getUserFacts(minConfidence).map((f: UserFact) => ({
    key: f.key,
    value: f.value,
    source: f.source,
    confidence: f.confidence,
    origin: "user_facts" as const,
    updatedAt: f.updated_at,
  }))
}

export function gatherFromLearned(projectRoot: string): CompiledFact[] {
  const dir = projectArcanaDir(projectRoot)
  const learnedMd = join(dir, "LEARNED.md")
  const learnedDir = join(dir, "learned")
  const byKey = new Map<string, CompiledFact>()

  // Index lines from LEARNED.md
  if (existsSync(learnedMd)) {
    try {
      const index = parseLearnedIndex(readFileSync(learnedMd, "utf8"))
      for (const { slug, summary } of index) {
        const key = sanitizeKey(`learned.${slug}`)
        if (!key) continue
        byKey.set(key, {
          key,
          value: summary,
          source: "LEARNED.md",
          confidence: 0.75,
          origin: "learned_md",
        })
      }
    } catch {
      /* skip unreadable */
    }
  }

  // Wiki files enrich / override with longer body
  if (existsSync(learnedDir)) {
    try {
      const files = readdirSync(learnedDir).filter((f) => f.endsWith(".md") && !f.startsWith("."))
      for (const file of files) {
        if (file === "model-trust.md") continue
        const slug = file.replace(/\.md$/i, "")
        const key = sanitizeKey(`learned.${slug}`)
        if (!key) continue
        try {
          const raw = readFileSync(join(learnedDir, file), "utf8")
          const body = excerpt(stripFrontmatter(raw))
          if (!body.trim()) continue
          const existing = byKey.get(key)
          // Prefer wiki body; keep index summary as prefix when useful
          const value =
            existing && existing.origin === "learned_md" && existing.value && !body.startsWith(existing.value)
              ? excerpt(`${existing.value}\n\n${body}`)
              : body
          let mtime: string | undefined
          try {
            mtime = new Date(statSync(join(learnedDir, file)).mtimeMs).toISOString()
          } catch {}
          byKey.set(key, {
            key,
            value,
            source: `learned/${file}`,
            confidence: 0.8,
            origin: "learned_wiki",
            updatedAt: mtime,
          })
        } catch {
          /* skip file */
        }
      }
    } catch {
      /* skip dir */
    }
  }

  return Array.from(byKey.values())
}

/**
 * Merge sources. Precedence for the same key:
 *   user_facts > learned_wiki > learned_md
 */
export function compileFacts(opts: {
  store: MemoryStore
  projectRoot?: string
  minConfidence?: number
}): CompiledFact[] {
  const projectRoot = opts.projectRoot ?? process.cwd()
  const min = opts.minConfidence ?? 0
  const map = new Map<string, CompiledFact>()

  const rank = (o: FactOrigin) => (o === "user_facts" ? 3 : o === "learned_wiki" ? 2 : 1)

  for (const f of gatherFromLearned(projectRoot)) {
    map.set(f.key, f)
  }
  for (const f of gatherFromUserFacts(opts.store, min)) {
    const prev = map.get(f.key)
    if (!prev || rank(f.origin) >= rank(prev.origin)) map.set(f.key, f)
  }

  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key))
}

/** Render FACTS.md markdown. */
export function renderFactsMd(facts: CompiledFact[], meta?: { projectRoot?: string }): string {
  const now = new Date().toISOString()
  const lines: string[] = [
    "# FACTS",
    "",
    "> Compiled fact sheet for Arcana cloud sync and human review.",
    "> Sources: `memory.db` user_facts | `.arcana/LEARNED.md` | `.arcana/learned/*.md`",
    `> Generated: ${now}`,
    meta?.projectRoot ? `> Project: ${meta.projectRoot}` : "",
    "> Regenerate with: `arcana memory compile`",
    "> Push to cloud with: `arcana memory push` (reads this file)",
    "",
  ].filter((l) => l !== "")

  if (!facts.length) {
    lines.push("_No facts gathered._", "")
    return lines.join("\n")
  }

  // Group for readability
  const structured = facts.filter((f) => f.origin === "user_facts")
  const learned = facts.filter((f) => f.origin !== "user_facts")

  const writeSection = (title: string, items: CompiledFact[]) => {
    if (!items.length) return
    lines.push(`## ${title}`, "")
    for (const f of items) {
      lines.push(`### \`${f.key}\``)
      lines.push(`- origin: ${f.origin}`)
      if (f.source) lines.push(`- source: ${f.source}`)
      lines.push(`- confidence: ${f.confidence}`)
      if (f.updatedAt) lines.push(`- updated: ${f.updatedAt}`)
      lines.push("")
      lines.push(f.value.trim())
      lines.push("")
    }
  }

  writeSection("Structured (user_facts)", structured)
  writeSection("Project knowledge (LEARNED + learned/)", learned)

  lines.push("---", "")
  lines.push(`_Total: ${facts.length} fact(s)_`, "")
  return lines.join("\n")
}

/**
 * Parse FACTS.md back into facts for upload.
 * Accepts the format produced by renderFactsMd.
 */
export function parseFactsMd(content: string): CompiledFact[] {
  const facts: CompiledFact[] = []
  const blocks = content.split(/^### `/m).slice(1)
  for (const block of blocks) {
    const keyEnd = block.indexOf("`")
    if (keyEnd <= 0) continue
    const key = block.slice(0, keyEnd).trim()
    const rest = block.slice(keyEnd + 1)
    const meta: Record<string, string> = {}
    const bodyLines: string[] = []
    let inBody = false
    for (const line of rest.split("\n")) {
      if (!inBody) {
        const m = line.match(/^- (origin|source|confidence|updated):\s*(.+)\s*$/)
        if (m) {
          meta[m[1]!] = m[2]!.trim()
          continue
        }
        if (line.trim() === "") {
          // blank after meta → body starts
          if (Object.keys(meta).length) {
            inBody = true
            continue
          }
          continue
        }
        // no meta style — treat rest as body
        inBody = true
      }
      if (inBody) {
        // Next top-level section (not a fact heading) ends this body
        if (/^##\s/.test(line) && !/^###\s/.test(line)) break
        if (/^---\s*$/.test(line)) break
        bodyLines.push(line)
      }
    }
    // trim trailing blanks
    while (bodyLines.length && !bodyLines[bodyLines.length - 1]!.trim()) bodyLines.pop()
    const value = bodyLines.join("\n").trim()
    if (!key || !value) continue
    const conf = meta.confidence != null ? Number(meta.confidence) : 1
    const origin = (meta.origin as FactOrigin) || "user_facts"
    facts.push({
      key,
      value: value.slice(0, VALUE_MAX),
      source: meta.source,
      confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 1,
      origin: origin === "learned_wiki" || origin === "learned_md" || origin === "user_facts" ? origin : "user_facts",
      updatedAt: meta.updated,
    })
  }
  return facts
}

export function writeFactsMd(filePath: string, facts: CompiledFact[], meta?: { projectRoot?: string }): void {
  mkdirSync(dirname(filePath), { recursive: true })
  atomicWriteSync(filePath, renderFactsMd(facts, meta))
}

export function readFactsMdFile(path: string): CompiledFact[] {
  if (!existsSync(path)) return []
  return parseFactsMd(readFileSync(path, "utf8"))
}

/** Cap for proxy batch. */
export function factsForCloud(facts: CompiledFact[], max = 200): Array<{
  key: string
  value: string
  source?: string
  confidence: number
  updatedAt?: string
}> {
  return facts.slice(0, max).map((f) => ({
    key: f.key,
    value: f.value.slice(0, VALUE_MAX),
    source: f.source ?? f.origin,
    confidence: f.confidence,
    updatedAt: f.updatedAt ?? new Date().toISOString(),
  }))
}
