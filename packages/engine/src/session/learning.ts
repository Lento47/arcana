/**
 * Self-learning loop — post-session knowledge extraction.
 *
 * After a session completes (or compaction runs), this module extracts:
 * - New facts → .arcana/learned/{slug}.md wiki files (verified runs only)
 * - New patterns → same
 * - Mistakes → same
 * - Preference updates → .arcana/SOUL.md
 *
 * LEARNED.md acts as a MOC (Map of Content) with [[wikilinks]] to individual wiki files.
 *
 * Plan-to-history gating: only VERIFIED runs promote to permanent history.
 * Unproven/partial/failed runs go to .arcana/learned/.quarantine/{run-id}/
 * and are held separate from LEARNED.md until explicitly promoted.
 *
 * Integration point: call `extractAndMerge()` after session summary/compaction completes.
 */

import path from "path"
import fs from "fs"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Run verification status for plan-to-history gating. */
export type RunStatus = "verified" | "unproven" | "partial" | "failed"

export interface LearningExtraction {
  facts: LearningEntry[]
  patterns: LearningEntry[]
  mistakes: LearningEntry[]
  preferenceUpdates: PreferenceUpdate[]
}

export interface LearningEntry {
  /** Short slug for the wiki filename (kebab-case, no extension) */
  slug: string
  /** One-line summary for LEARNED.md index */
  summary: string
  /** Full markdown body for the wiki file */
  body: string
  /** Tags for frontmatter */
  tags: string[]
}

export interface PreferenceUpdate {
  /** Section heading in SOUL.md to update */
  section: string
  /** New content for that section */
  content: string
}

// ---------------------------------------------------------------------------
// Extraction prompt
// ---------------------------------------------------------------------------

/**
 * Prompt for extracting learnings from a session summary.
 * Designed for a small/cheap model (Haiku-class). ~250 tokens.
 */
export const EXTRACTION_PROMPT = `Extract learnings from this session summary. Output ONLY valid JSON, no markdown.

{
  "facts": [
    {
      "slug": "kebab-case-slug",
      "summary": "One-line summary for index",
      "body": "Full markdown body with **Why:** and **How to apply:** sections",
      "tags": ["tag1", "tag2"]
    }
  ],
  "patterns": [ /* same structure — reusable techniques discovered */ ],
  "mistakes": [ /* same structure — errors made + corrections */ ],
  "preferenceUpdates": [
    {
      "section": "Section heading in SOUL.md",
      "content": "New content for that section"
    }
  ]
}

Rules:
- slug: lowercase, hyphens, no extension. Unique per fact.
- summary: one line, fits in LEARNED.md index.
- body: markdown. Include **Why:** and **How to apply:** lines.
- tags: 1-4 lowercase tags. Use project name, technology, category.
- Only include genuinely NEW learnings. Skip obvious/trivial.
- If nothing new, return empty arrays.
- preferenceUpdates: only if user explicitly expressed a preference or corrected behavior. Rare.`

// ---------------------------------------------------------------------------
// File operations
// ---------------------------------------------------------------------------

function slugToFilename(slug: string): string {
  return `${slug.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")}.md`
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

/**
 * Read frontmatter tags from a markdown file. Returns empty array if no frontmatter.
 */
function readTags(filepath: string): string[] {
  try {
    const content = fs.readFileSync(filepath, "utf-8")
    const match = content.match(/^---\n([\s\S]*?)\n---/)
    if (!match) return []
    const yaml = match[1]
    const tagMatch = yaml.match(/tags:\s*\[(.*?)\]/)
    if (!tagMatch) return []
    return tagMatch[1].split(",").map((t) => t.trim().replace(/"/g, "").replace(/'/g, ""))
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Wiki file creation
// ---------------------------------------------------------------------------

export function createWikiFile(
  projectRoot: string,
  entry: LearningEntry,
  sourceSession?: string,
): string {
  const dir = path.join(projectRoot, ".arcana", "learned")
  ensureDir(dir)

  const filename = slugToFilename(entry.slug)
  const filepath = path.join(dir, filename)

  const frontmatter = [
    "---",
    `tags: [${entry.tags.join(", ")}]`,
    `date: ${new Date().toISOString().split("T")[0]}`,
    sourceSession ? `source: ${sourceSession}` : "",
    "---",
  ]
    .filter(Boolean)
    .join("\n")

  const content = `${frontmatter}\n# ${entry.slug.replace(/-/g, " ")}\n\n${entry.summary}\n\n${entry.body}\n`

  fs.writeFileSync(filepath, content, "utf-8")
  return filepath
}

// ---------------------------------------------------------------------------
// LEARNED.md MOC update
// ---------------------------------------------------------------------------

export function updateLearnedMd(
  projectRoot: string,
  entries: LearningEntry[],
  category: "facts" | "patterns" | "mistakes",
): void {
  const learnedPath = path.join(projectRoot, ".arcana", "LEARNED.md")

  const categoryHeading =
    category === "facts"
      ? "## Project"
      : category === "patterns"
        ? "## Patterns"
        : "## Mistakes"

  let content: string
  try {
    content = fs.readFileSync(learnedPath, "utf-8")
  } catch {
    // Create new LEARNED.md if it doesn't exist
    content = `# LEARNED — Accumulated Knowledge Index\n\n> Auto-updated by self-learning loop.\n\n## Project\n\n## Patterns\n\n## Mistakes\n`
  }

  for (const entry of entries) {
    const link = `[[${entry.slug}]]`
    const line = `- ${link} — ${entry.summary}`

    // Deduplicate: skip if slug already referenced
    if (content.includes(`[[${entry.slug}]]`)) continue

    // Insert after the category heading
    const headingIndex = content.indexOf(categoryHeading)
    if (headingIndex === -1) {
      // Category heading doesn't exist — append at end
      content += `\n${categoryHeading}\n${line}\n`
    } else {
      // Find end of heading line, insert after it
      const insertAt = content.indexOf("\n", headingIndex) + 1
      content = content.slice(0, insertAt) + line + "\n" + content.slice(insertAt)
    }
  }

  ensureDir(path.dirname(learnedPath))
  fs.writeFileSync(learnedPath, content, "utf-8")
}

// ---------------------------------------------------------------------------
// SOUL.md preference update
// ---------------------------------------------------------------------------

export function updateSoulMd(
  projectRoot: string,
  updates: PreferenceUpdate[],
): boolean {
  if (updates.length === 0) return false

  const soulPath = path.join(projectRoot, ".arcana", "SOUL.md")
  let content: string
  try {
    content = fs.readFileSync(soulPath, "utf-8")
  } catch {
    return false // No SOUL.md to update
  }

  let changed = false
  for (const update of updates) {
    const sectionHeader = `## ${update.section}`
    const sectionIndex = content.indexOf(sectionHeader)
    if (sectionIndex === -1) continue

    // Find the next ## heading after this section
    const afterSection = content.indexOf("\n## ", sectionIndex + sectionHeader.length)
    const sectionEnd = afterSection === -1 ? content.length : afterSection

    // Replace everything between section header and next section
    const before = content.slice(0, sectionIndex + sectionHeader.length)
    const after = content.slice(sectionEnd)
    content = `${before}\n${update.content}\n${after}`
    changed = true
  }

  if (changed) {
    fs.writeFileSync(soulPath, content, "utf-8")
  }
  return changed
}

// ---------------------------------------------------------------------------
// Quarantine constants
// ---------------------------------------------------------------------------

const QUARANTINE_DIR = ".quarantine"
const QUARANTINE_MD = "QUARANTINE.md"

function quarantineDir(projectRoot: string): string {
  return path.join(projectRoot, ".arcana", "learned", QUARANTINE_DIR)
}

function quarantineRunDir(projectRoot: string, runId: string): string {
  return path.join(quarantineDir(projectRoot), runId)
}

// ---------------------------------------------------------------------------
// Cross-referencing
// ---------------------------------------------------------------------------

/**
 * Add backlinks from existing wiki files to newly created ones.
 * Scans all wiki files for [[wikilinks]] and adds reciprocal links.
 */
export function crossReference(projectRoot: string, newSlugs: string[]): void {
  const learnedDir = path.join(projectRoot, ".arcana", "learned")
  if (!fs.existsSync(learnedDir)) return

  const files = fs.readdirSync(learnedDir).filter((f) => f.endsWith(".md"))
  const newSlugSet = new Set(newSlugs)

  for (const file of files) {
    const filepath = path.join(learnedDir, file)
    const slug = file.replace(/\.md$/, "")
    if (newSlugSet.has(slug)) continue // Don't self-reference

    let content = fs.readFileSync(filepath, "utf-8")

    // Check if this file links to any new slugs
    for (const newSlug of newSlugs) {
      if (content.includes(`[[${newSlug}]]`)) continue // Already linked

      // Check if the file content references the new slug's topic
      const tagMatch = content.match(/tags:\s*\[(.*?)\]/)
      if (!tagMatch) continue
      const tags = tagMatch[1].split(",").map((t) => t.trim().replace(/"/g, "").replace(/'/g, ""))

      // Read new file's tags
      const newFilepath = path.join(learnedDir, `${newSlug}.md`)
      const newTags = readTags(newFilepath)

      // If they share any tags, add a backlink
      const sharedTags = tags.filter((t) => newTags.includes(t))
      if (sharedTags.length > 0) {
        // Add "Related:" line before end of file
        const relatedLine = `Related: [[${newSlug}]]`
        if (!content.includes("Related:")) {
          content = content.trimEnd() + `\n\n${relatedLine}\n`
        } else {
          content = content.replace(/Related:(.*)/, (match) => {
            if (match.includes(`[[${newSlug}]]`)) return match
            return `${match} [[${newSlug}]]`
          })
        }
        fs.writeFileSync(filepath, content, "utf-8")
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export interface MergeResult {
  wikiFilesCreated: string[]
  learnedMdUpdated: boolean
  soulMdUpdated: boolean
  crossReferencesAdded: number
  /** Run status used for this extraction. */
  runStatus: RunStatus
  /** If quarantined, the run-id the entries were stored under. */
  quarantinedRunId?: string
}

/**
 * Extract learnings from a session summary JSON, create wiki files,
 * update LEARNED.md MOC, and cross-reference.
 *
 * Plan-to-history gating: only VERIFIED runs promote to permanent history.
 * Unproven, partial, or failed runs go to .arcana/learned/.quarantine/{run-id}/
 * where they stay until explicitly promoted or discarded.
 *
 * Call this after session compaction or completion.
 */
export function extractAndMerge(
  projectRoot: string,
  extraction: LearningExtraction,
  options?: {
    sourceSession?: string
    /** Run verification status. Defaults to "verified" for backward compatibility. */
    runStatus?: RunStatus
    /** Run identifier for quarantine. Required when runStatus !== "verified". */
    runId?: string
  },
): MergeResult {
  const runStatus = options?.runStatus ?? "verified"
  const sourceSession = options?.sourceSession
  const runId = options?.runId ?? sourceSession ?? `run-${Date.now()}`

  const result: MergeResult = {
    wikiFilesCreated: [],
    learnedMdUpdated: false,
    soulMdUpdated: false,
    crossReferencesAdded: 0,
    runStatus,
  }

  const isQuarantined = runStatus !== "verified"

  const allEntries: Array<{ entry: LearningEntry; category: "facts" | "patterns" | "mistakes" }> = [
    ...extraction.facts.map((e) => ({ entry: e, category: "facts" as const })),
    ...extraction.patterns.map((e) => ({ entry: e, category: "patterns" as const })),
    ...extraction.mistakes.map((e) => ({ entry: e, category: "mistakes" as const })),
  ]

  if (isQuarantined) {
    result.quarantinedRunId = runId

    // Write wiki files to quarantine directory
    const qDir = quarantineRunDir(projectRoot, runId)
    ensureDir(qDir)

    for (const { entry, category } of allEntries) {
      const filepath = createWikiFileInDir(qDir, entry, sourceSession)
      result.wikiFilesCreated.push(filepath)
    }

    // Update QUARANTINE.md with the quarantined entries
    updateQuarantineMd(projectRoot, runId, allEntries)
  } else {
    // Verified run — write to main learned/ directory
    // Facts
    for (const entry of extraction.facts) {
      const filepath = createWikiFile(projectRoot, entry, sourceSession)
      result.wikiFilesCreated.push(filepath)
    }
    if (extraction.facts.length > 0) {
      updateLearnedMd(projectRoot, extraction.facts, "facts")
      result.learnedMdUpdated = true
    }

    // Patterns
    for (const entry of extraction.patterns) {
      const filepath = createWikiFile(projectRoot, entry, sourceSession)
      result.wikiFilesCreated.push(filepath)
    }
    if (extraction.patterns.length > 0) {
      updateLearnedMd(projectRoot, extraction.patterns, "patterns")
      result.learnedMdUpdated = true
    }

    // Mistakes
    for (const entry of extraction.mistakes) {
      const filepath = createWikiFile(projectRoot, entry, sourceSession)
      result.wikiFilesCreated.push(filepath)
    }
    if (extraction.mistakes.length > 0) {
      updateLearnedMd(projectRoot, extraction.mistakes, "mistakes")
      result.learnedMdUpdated = true
    }

    // Cross-reference
    const allSlugs = [
      ...extraction.facts,
      ...extraction.patterns,
      ...extraction.mistakes,
    ].map((e) => e.slug)
    if (allSlugs.length > 0) {
      crossReference(projectRoot, allSlugs)
      result.crossReferencesAdded = allSlugs.length
    }
  }

  // SOUL.md preference updates (always apply, regardless of run status)
  result.soulMdUpdated = updateSoulMd(projectRoot, extraction.preferenceUpdates)

  return result
}

// ---------------------------------------------------------------------------
// Quarantine operations
// ---------------------------------------------------------------------------

/**
 * Create a wiki file in a specific directory (used for quarantine).
 */
function createWikiFileInDir(
  dir: string,
  entry: LearningEntry,
  sourceSession?: string,
): string {
  ensureDir(dir)

  const filename = slugToFilename(entry.slug)
  const filepath = path.join(dir, filename)

  const frontmatter = [
    "---",
    `tags: [${entry.tags.join(", ")}]`,
    `date: ${new Date().toISOString().split("T")[0]}`,
    sourceSession ? `source: ${sourceSession}` : "",
    "---",
  ]
    .filter(Boolean)
    .join("\n")

  const content = `${frontmatter}\n# ${entry.slug.replace(/-/g, " ")}\n\n${entry.summary}\n\n${entry.body}\n`

  fs.writeFileSync(filepath, content, "utf-8")
  return filepath
}

/**
 * Update or create QUARANTINE.md listing all quarantined entries.
 */
function updateQuarantineMd(
  projectRoot: string,
  runId: string,
  entries: Array<{ entry: LearningEntry; category: "facts" | "patterns" | "mistakes" }>,
): void {
  const qDir = quarantineDir(projectRoot)
  ensureDir(qDir)
  const quarantinePath = path.join(qDir, QUARANTINE_MD)

  let content: string
  try {
    content = fs.readFileSync(quarantinePath, "utf-8")
  } catch {
    content = `# QUARANTINE — Unverified Learnings\n\n> Entries held pending verification.\n> Use \`promote(runId)\` to promote or \`discard(runId)\` to delete.\n\n`
  }

  // Add section for this run if not already present
  const runHeading = `## ${runId}`
  if (!content.includes(runHeading)) {
    const runSection = [
      runHeading,
      `date: ${new Date().toISOString().split("T")[0]}`,
      "",
      ...entries.map(({ entry, category }) => {
        const catLabel = category === "facts" ? "Project" : category === "patterns" ? "Patterns" : "Mistakes"
        return `- [[${entry.slug}]] (${catLabel}) — ${entry.summary}`
      }),
      "",
    ].join("\n")
    content += runSection
  }

  fs.writeFileSync(quarantinePath, content, "utf-8")
}

/**
 * Promote quarantined entries from a run to the main learned/ directory.
 * Moves wiki files and adds entries to LEARNED.md.
 *
 * @returns Number of files promoted.
 */
export function promote(projectRoot: string, runId: string): number {
  const qDir = quarantineRunDir(projectRoot, runId)
  if (!fs.existsSync(qDir)) return 0

  const learnedDir = path.join(projectRoot, ".arcana", "learned")
  ensureDir(learnedDir)

  const files = fs.readdirSync(qDir).filter((f) => f.endsWith(".md"))
  let promoted = 0

  for (const file of files) {
    const src = path.join(qDir, file)
    const dest = path.join(learnedDir, file)

    // If destination already exists, skip (don't overwrite)
    if (fs.existsSync(dest)) {
      continue
    }

    fs.copyFileSync(src, dest)
    promoted++
  }

  // Add to LEARNED.md
  if (promoted > 0) {
    updateLearnedMdFromQuarantine(projectRoot, qDir, files)
    // Cross-reference with existing wiki files
    const slugs = files.map((f) => f.replace(/\.md$/, ""))
    crossReference(projectRoot, slugs)
  }

  // Remove the quarantine directory
  fs.rmSync(qDir, { recursive: true, force: true })

  // Update QUARANTINE.md to remove this run's section
  removeQuarantineSection(projectRoot, runId)

  return promoted
}

/**
 * Discard quarantined entries for a run. Permanently deletes the files.
 *
 * @returns Number of files discarded.
 */
export function discard(projectRoot: string, runId: string): number {
  const qDir = quarantineRunDir(projectRoot, runId)
  if (!fs.existsSync(qDir)) return 0

  const files = fs.readdirSync(qDir).filter((f) => f.endsWith(".md"))
  const count = files.length

  fs.rmSync(qDir, { recursive: true, force: true })

  // Update QUARANTINE.md
  removeQuarantineSection(projectRoot, runId)

  return count
}

/**
 * List all quarantined run IDs.
 */
export function listQuarantined(projectRoot: string): string[] {
  const qDir = quarantineDir(projectRoot)
  if (!fs.existsSync(qDir)) return []

  return fs
    .readdirSync(qDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
}

// ---------------------------------------------------------------------------
// Internal quarantine helpers
// ---------------------------------------------------------------------------

function updateLearnedMdFromQuarantine(
  projectRoot: string,
  qDir: string,
  files: string[],
): void {
  for (const file of files) {
    const filepath = path.join(qDir, file)
    try {
      const content = fs.readFileSync(filepath, "utf-8")
      const summaryMatch = content.match(/\n\n([^\n]+)\n\n/)
      const summary = summaryMatch ? summaryMatch[1] : ""
      const slug = file.replace(/\.md$/, "")

      // Infer category from tags
      const tagMatch = content.match(/tags:\s*\[(.*?)\]/)
      const tags = tagMatch
        ? tagMatch[1].split(",").map((t) => t.trim().replace(/"/g, "").replace(/'/g, ""))
        : []

      const category: "facts" | "patterns" | "mistakes" = tags.includes("mistake") ? "mistakes" : tags.includes("pattern") ? "patterns" : "facts"

      updateLearnedMd(projectRoot, [{ slug, summary, body: "", tags }], category)
    } catch {
      // Skip files we can't read
    }
  }
}

function removeQuarantineSection(projectRoot: string, runId: string): void {
  const quarantinePath = path.join(quarantineDir(projectRoot), QUARANTINE_MD)
  if (!fs.existsSync(quarantinePath)) return

  let content = fs.readFileSync(quarantinePath, "utf-8")
  const runHeading = `## ${runId}`

  const startIdx = content.indexOf(runHeading)
  if (startIdx === -1) return

  // Find the next ## heading after this run's section
  const afterStart = content.indexOf("\n## ", startIdx + runHeading.length)
  const endIdx = afterStart === -1 ? content.length : afterStart

  // Remove the section
  content = content.slice(0, startIdx) + content.slice(endIdx).replace(/^\n+/, "\n")

  // If only the header remains, remove the file
  const trimmed = content.trim()
  if (
    trimmed === "# QUARANTINE — Unverified Learnings" ||
    trimmed === "# QUARANTINE — Unverified Learnings\n\n> Entries held pending verification.\n> Use `promote(runId)` to promote or `discard(runId)` to delete."
  ) {
    try {
      fs.unlinkSync(quarantinePath)
    } catch {
      // ok to fail
    }
    return
  }

  fs.writeFileSync(quarantinePath, content, "utf-8")
}
