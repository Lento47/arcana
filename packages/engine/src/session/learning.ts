/**
 * Self-learning loop — post-session knowledge extraction.
 *
 * After a session completes (or compaction runs), this module extracts:
 * - New facts → .arcana/learned/{slug}.md wiki files
 * - New patterns → same
 * - Mistakes → same
 * - Preference updates → .arcana/SOUL.md
 *
 * LEARNED.md acts as a MOC (Map of Content) with [[wikilinks]] to individual wiki files.
 *
 * Integration point: call `extractAndMerge()` after session summary/compaction completes.
 *
 * ## Memory gate — only VERIFIED runs update LEARNED.md (failure mode #12)
 * When `verified === false`, wiki files are written to `.arcana/learned/.quarantine/`
 * with a `quarantined: true` frontmatter field. Quarantined entries go to
 * `LEARNED.md.quarantine` instead of `LEARNED.md`. Use `promoteLearnings()` to
 * move quarantined entries to the main learned directory.
 *
 * ## Confidence decay pipeline (failure mode #14)
 * Tracks model confidence vs actual outcomes via `model_trust` entries.
 * The extraction prompt asks the model to identify overconfidence cases.
 * `.arcana/learned/model-trust.md` records per-model reliability scores.
 * When a model has >3 confidence mismatches, future plans default to `[CONF:LOW]*`.
 */

import path from "path"
import fs from "fs"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LearningExtraction {
  facts: LearningEntry[]
  patterns: LearningEntry[]
  mistakes: LearningEntry[]
  /** Confidence decay entries — cases where the model was overconfident (Feature #14) */
  confidence_decay?: ConfidenceDecayEntry[]
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

/**
 * Confidence decay entry — records when a model tagged an action HIGH
 * confidence but the outcome was a failure (failure mode #14).
 */
export interface ConfidenceDecayEntry {
  /** Model identifier, e.g. "claude-sonnet-4-20250514" */
  modelId: string
  /** Provider identifier, e.g. "anthropic" */
  providerId: string
  /** What the model was overconfident about */
  claim: string
  /** The actual outcome that contradicted the claim */
  actual: string
  /** The session slug where this mismatch occurred */
  sourceSession?: string
}

export interface PreferenceUpdate {
  /** Section heading in SOUL.md to update */
  section: string
  /** New content for that section */
  content: string
}

/**
 * Model trust scores derived from confidence_decay entries.
 * Written to `.arcana/learned/model-trust.md`.
 */
export interface ModelTrustScore {
  modelId: string
  providerId: string
  /** Total confidence mismatches recorded */
  mismatches: number
  /** Whether future plans from this model should default to [CONF:LOW]* */
  lowConfidenceDefault: boolean
}

// ---------------------------------------------------------------------------
// Extraction prompt
// ---------------------------------------------------------------------------

/**
 * Prompt for extracting learnings from a session summary.
 * Designed for a small/cheap model (Haiku-class). ~250 tokens.
 *
 * Includes confidence_decay anti-pattern detection (failure mode #14).
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
  "confidence_decay": [
    {
      "modelId": "model-id-used",
      "providerId": "provider-name",
      "claim": "What the model claimed with high confidence",
      "actual": "What actually happened (the failure/error)"
    }
  ],
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
- confidence_decay: identify cases where the model expressed HIGH confidence
  but the action FAILED or produced incorrect results. Include the model id,
  provider, the overconfident claim, and the actual outcome. This helps track
  model reliability over time — models with repeated confidence mismatches
  should be treated with lower trust.
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

/**
 * Create a wiki file in the learned directory or quarantine directory.
 *
 * @param quarantine If true, file goes to `.arcana/learned/.quarantine/`
 *   with `quarantined: true` frontmatter (failure mode #12).
 */
export function createWikiFile(
  projectRoot: string,
  entry: LearningEntry,
  sourceSession?: string,
  quarantine?: boolean,
): string {
  const baseDir = path.join(projectRoot, ".arcana", "learned")
  const dir = quarantine ? path.join(baseDir, ".quarantine") : baseDir
  ensureDir(dir)

  const filename = slugToFilename(entry.slug)
  const filepath = path.join(dir, filename)

  const frontmatter = [
    "---",
    `tags: [${entry.tags.join(", ")}]`,
    `date: ${new Date().toISOString().split("T")[0]}`,
    sourceSession ? `source: ${sourceSession}` : "",
    quarantine ? "quarantined: true" : "",
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

function defaultLearnedContent(): string {
  return `# LEARNED — Accumulated Knowledge Index\n\n> Auto-updated by self-learning loop.\n\n## Project\n\n## Patterns\n\n## Mistakes\n`
}

export function updateLearnedMd(
  projectRoot: string,
  entries: LearningEntry[],
  category: "facts" | "patterns" | "mistakes",
): void {
  const learnedPath = path.join(projectRoot, ".arcana", "LEARNED.md")
  appendLearningsToMoc(learnedPath, entries, category)
}

/**
 * Append quarantine learnings to LEARNED.md.quarantine instead of LEARNED.md.
 * Used when verified === false (failure mode #12).
 */
export function updateLearnedMdQuarantine(
  projectRoot: string,
  entries: LearningEntry[],
  category: "facts" | "patterns" | "mistakes",
): void {
  const quarantinePath = path.join(projectRoot, ".arcana", "LEARNED.md.quarantine")
  appendLearningsToMoc(quarantinePath, entries, category)
}

function appendLearningsToMoc(
  mocPath: string,
  entries: LearningEntry[],
  category: "facts" | "patterns" | "mistakes",
): void {
  const categoryHeading =
    category === "facts"
      ? "## Project"
      : category === "patterns"
        ? "## Patterns"
        : "## Mistakes"

  let content: string
  try {
    content = fs.readFileSync(mocPath, "utf-8")
  } catch {
    content = defaultLearnedContent()
  }

  for (const entry of entries) {
    const link = `[[${entry.slug}]]`
    const line = `- ${link} — ${entry.summary}`

    // Deduplicate: skip if slug already referenced
    if (content.includes(`[[${entry.slug}]]`)) continue

    // Insert after the category heading
    const headingIndex = content.indexOf(categoryHeading)
    if (headingIndex === -1) {
      content += `\n${categoryHeading}\n${line}\n`
    } else {
      const insertAt = content.indexOf("\n", headingIndex) + 1
      content = content.slice(0, insertAt) + line + "\n" + content.slice(insertAt)
    }
  }

  ensureDir(path.dirname(mocPath))
  fs.writeFileSync(mocPath, content, "utf-8")
}

// ---------------------------------------------------------------------------
// Promote: move quarantined learnings to main (failure mode #12)
// ---------------------------------------------------------------------------

export interface PromoteResult {
  /** Files that were successfully promoted */
  promoted: string[]
  /** Slugs that weren't found in quarantine */
  notFound: string[]
  /** Count of files promoted */
  count: number
}

/**
 * Promote quarantined learnings to the main learned directory.
 * Removes `quarantined: true` from frontmatter, moves files from
 * `.quarantine/` to parent directory, and merges LEARNED.md.quarantine
 * entries into LEARNED.md.
 *
 * This is the user-facing `/promote` concept: after reviewing quarantined
 * learnings, the user can move them to the main index.
 *
 * @param projectRoot Project root directory
 * @param slugs Specific slugs to promote. If empty, promotes ALL quarantined files.
 */
export function promoteLearnings(projectRoot: string, slugs?: string[]): PromoteResult {
  const baseDir = path.join(projectRoot, ".arcana", "learned")
  const quarantineDir = path.join(baseDir, ".quarantine")
  const result: PromoteResult = { promoted: [], notFound: [], count: 0 }

  if (!fs.existsSync(quarantineDir)) return result

  const files = fs.readdirSync(quarantineDir).filter((f) => f.endsWith(".md"))
  const targetSet = slugs ? new Set(slugs) : undefined

  for (const file of files) {
    const slug = file.replace(/\.md$/, "")
    if (targetSet && !targetSet.has(slug)) continue

    const srcPath = path.join(quarantineDir, file)
    const dstPath = path.join(baseDir, file)

    try {
      let content = fs.readFileSync(srcPath, "utf-8")
      // Remove quarantined: true from frontmatter
      content = content.replace(/^quarantined:\s*true\s*\n/m, "")
      fs.writeFileSync(dstPath, content, "utf-8")
      fs.unlinkSync(srcPath)
      result.promoted.push(slug)
      result.count++
    } catch {
      result.notFound.push(slug)
    }
  }

  // Merge LEARNED.md.quarantine into LEARNED.md for promoted slugs
  const quarantineMocPath = path.join(projectRoot, ".arcana", "LEARNED.md.quarantine")
  if (fs.existsSync(quarantineMocPath)) {
    const quarantineMoc = fs.readFileSync(quarantineMocPath, "utf-8")
    const learnedPath = path.join(projectRoot, ".arcana", "LEARNED.md")
    let learnedContent: string
    try {
      learnedContent = fs.readFileSync(learnedPath, "utf-8")
    } catch {
      learnedContent = defaultLearnedContent()
    }

    for (const slug of result.promoted) {
      // Extract the line from quarantine MOC
      const lineRegex = new RegExp(`^- \\[\\[${slug}\\]\\].*$`, "m")
      const match = quarantineMoc.match(lineRegex)
      if (!match) continue

      const line = match[0]
      if (learnedContent.includes(`[[${slug}]]`)) continue

      // Determine which category this entry belongs to
      let categoryHeading = ""
      const lines = quarantineMoc.split("\n")
      const lineIdx = lines.findIndex((l) => l === line)
      for (let i = lineIdx; i >= 0; i--) {
        if (lines[i].startsWith("## ")) {
          categoryHeading = lines[i]
          break
        }
      }

      if (categoryHeading) {
        const headingIndex = learnedContent.indexOf(categoryHeading)
        if (headingIndex === -1) {
          learnedContent += `\n${categoryHeading}\n${line}\n`
        } else {
          const insertAt = learnedContent.indexOf("\n", headingIndex) + 1
          learnedContent =
            learnedContent.slice(0, insertAt) + line + "\n" + learnedContent.slice(insertAt)
        }
      }
    }

    // Remove promoted lines from quarantine MOC
    let updatedQuarantine = quarantineMoc
    for (const slug of result.promoted) {
      const lineRegex = new RegExp(`^- \\[\\[${slug}\\]\\].*\n?`, "m")
      updatedQuarantine = updatedQuarantine.replace(lineRegex, "")
    }

    if (targetSet) {
      fs.writeFileSync(quarantineMocPath, updatedQuarantine, "utf-8")
      fs.writeFileSync(learnedPath, learnedContent, "utf-8")
    } else {
      // All promoted — remove quarantine MOC entirely
      if (result.promoted.length === files.length) {
        try {
          fs.unlinkSync(quarantineMocPath)
        } catch {
          // Fine if it doesn't exist
        }
      } else {
        fs.writeFileSync(quarantineMocPath, updatedQuarantine, "utf-8")
      }
      fs.writeFileSync(learnedPath, learnedContent, "utf-8")
    }
  }

  // Clean up empty quarantine directory
  try {
    const remaining = fs.readdirSync(quarantineDir)
    if (remaining.length === 0) fs.rmdirSync(quarantineDir)
  } catch {
    // Directory may not exist, that's fine
  }

  return result
}

// ---------------------------------------------------------------------------
// Model trust tracking (failure mode #14)
// ---------------------------------------------------------------------------

/**
 * Update `.arcana/learned/model-trust.md` with confidence decay entries.
 * When a model has >3 confidence mismatches, it defaults to `[CONF:LOW]*`.
 */
export function updateModelTrust(
  projectRoot: string,
  entries: ConfidenceDecayEntry[],
): ModelTrustScore[] {
  if (entries.length === 0) return []

  const trustPath = path.join(projectRoot, ".arcana", "learned", "model-trust.md")

  // Load existing trust data
  const existing = new Map<string, ModelTrustScore>()
  if (fs.existsSync(trustPath)) {
    try {
      const content = fs.readFileSync(trustPath, "utf-8")
      // Parse markdown table rows
      const rowRegex = /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*(\d+)\s*\|/gm
      let match: RegExpExecArray | null
      while ((match = rowRegex.exec(content)) !== null) {
        const key = `${match[2]}/${match[1]}`
        const mismatches = parseInt(match[3], 10)
        existing.set(key, {
          modelId: match[1],
          providerId: match[2],
          mismatches,
          lowConfidenceDefault: mismatches > 3,
        })
      }
    } catch {
      // Corrupted file — start fresh
    }
  }

  // Merge new entries
  for (const entry of entries) {
    const key = `${entry.providerId}/${entry.modelId}`
    const current = existing.get(key)
    if (current) {
      current.mismatches++
    } else {
      existing.set(key, {
        modelId: entry.modelId,
        providerId: entry.providerId,
        mismatches: 1,
        lowConfidenceDefault: false,
      })
    }
  }

  // Update lowConfidenceDefault for models exceeding threshold
  const scores: ModelTrustScore[] = []
  for (const score of existing.values()) {
    if (score.mismatches > 3) {
      score.lowConfidenceDefault = true
    }
    scores.push(score)
  }

  // Write model-trust.md
  const lines = [
    "# Model Trust Index",
    "",
    "> Auto-updated by confidence decay pipeline (failure mode #14).",
    "> Models with >3 confidence mismatches get `[CONF:LOW]*` on future plans.",
    "",
    "| Model | Provider | Mismatches | Confidence Default |",
    "|-------|----------|------------|-------------------|",
  ]
  for (const score of scores) {
    const conf = score.lowConfidenceDefault ? "LOW*" : "normal"
    lines.push(`| \`${score.modelId}\` | \`${score.providerId}\` | ${score.mismatches} | ${conf} |`)
  }
  lines.push("")

  ensureDir(path.dirname(trustPath))
  fs.writeFileSync(trustPath, lines.join("\n"), "utf-8")

  return scores
}

/**
 * Check whether a given model should default to low confidence.
 * Returns true if the model has >3 confidence mismatches on record.
 */
export function isModelLowConfidence(
  projectRoot: string,
  modelId: string,
  providerId: string,
): boolean {
  const trustPath = path.join(projectRoot, ".arcana", "learned", "model-trust.md")
  if (!fs.existsSync(trustPath)) return false

  try {
    const content = fs.readFileSync(trustPath, "utf-8")
    const pattern = new RegExp(
      `\\|\\s*\`${modelId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\`\\s*\\|\\s*\`${providerId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\`\\s*\\|\\s*\\d+\\s*\\|\\s*(LOW\\*|normal)\\s*\\|`,
      "m",
    )
    const match = content.match(pattern)
    return match ? match[1] === "LOW*" : false
  } catch {
    return false
  }
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
  /** Files written to .quarantine/ (when verified === false) */
  quarantinedFiles: string[]
  learnedMdUpdated: boolean
  soulMdUpdated: boolean
  crossReferencesAdded: number
  /** Model trust scores that were updated */
  modelTrustScores: ModelTrustScore[]
}

/**
 * Extract learnings from a session summary JSON, create wiki files,
 * update LEARNED.md MOC, and cross-reference.
 *
 * Call this after session compaction or completion.
 *
 * @param projectRoot Project root directory
 * @param extraction Parsed learning extraction from LLM
 * @param sourceSession Optional session identifier for frontmatter
 * @param verified Whether this run is verified. When false, wiki files
 *   go to `.arcana/learned/.quarantine/` with `quarantined: true`.
 *   Only verified runs update LEARNED.md; quarantined entries go to
 *   LEARNED.md.quarantine. (failure mode #12)
 */
export function extractAndMerge(
  projectRoot: string,
  extraction: LearningExtraction,
  sourceSession?: string,
  verified?: boolean,
): MergeResult {
  const isVerified = verified !== false // default to true for backward compat
  const result: MergeResult = {
    wikiFilesCreated: [],
    quarantinedFiles: [],
    learnedMdUpdated: false,
    soulMdUpdated: false,
    crossReferencesAdded: 0,
    modelTrustScores: [],
  }

  const categories: Array<{
    key: "facts" | "patterns" | "mistakes"
    entries: LearningEntry[]
  }> = [
    { key: "facts", entries: extraction.facts },
    { key: "patterns", entries: extraction.patterns },
    { key: "mistakes", entries: extraction.mistakes },
  ]

  for (const { key, entries } of categories) {
    if (entries.length === 0) continue

    for (const entry of entries) {
      if (isVerified) {
        const filepath = createWikiFile(projectRoot, entry, sourceSession)
        result.wikiFilesCreated.push(filepath)
      } else {
        const filepath = createWikiFile(projectRoot, entry, sourceSession, true)
        result.quarantinedFiles.push(filepath)
      }
    }

    if (isVerified) {
      updateLearnedMd(projectRoot, entries, key)
      result.learnedMdUpdated = true
    } else {
      updateLearnedMdQuarantine(projectRoot, entries, key)
    }
  }

  // SOUL.md preference updates
  result.soulMdUpdated = updateSoulMd(projectRoot, extraction.preferenceUpdates)

  // Confidence decay — always tracked regardless of verification status
  if (extraction.confidence_decay && extraction.confidence_decay.length > 0) {
    result.modelTrustScores = updateModelTrust(projectRoot, extraction.confidence_decay)
  }

  // Cross-reference (only for verified files — quarantine is isolated)
  if (isVerified) {
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

  return result
}
