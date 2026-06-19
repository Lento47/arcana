#!/usr/bin/env bun
/**
 * Phase 3 — consolidate skills into arcana's canonical `skills/` dir.
 *
 * Copies:
 *   - hermes-agent/optional-skills/**       (100 skills) — sibling repo ../hermes-agent
 *   - openwording/.opencode/skills/effect   (1 skill)    — sibling repo ../openwording
 *
 * Dedup by frontmatter `name` (the key both arcana SkillRegistry and opencode
 * SkillV2 use): if a skill with that name already exists under arcana skills/,
 * skip it (arcana wins). Preserves the source `<category>/<skill>` structure.
 *
 * Idempotent: re-running copies nothing.
 *   bun packages/arcana/scripts/sync-skills.ts
 *
 * After this, ALL arcana skills live under arcana/skills/ — nothing is read from
 * hermes-agent/ or openwording/ at runtime. The TUI bridge (src/skills/bridge.ts)
 * points opencode's native skill discovery at this dir only.
 *
 * (hermes-agent/skills/ — the 73 core skills — is already byte-identical to
 * arcana's existing 73, so it's intentionally not re-copied.)
 */
import { readdir, readFile, mkdir, cp } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, dirname, relative } from "node:path"
import matter from "gray-matter"

const REPO = join(import.meta.dir, "..", "..", "..") // packages/arcana/scripts -> repo root
const ARCANA_SKILLS = join(REPO, "skills")
const HERMES_OPTIONAL = join(REPO, "..", "hermes-agent", "optional-skills")
const OPENCODE_EFFECT = join(REPO, "..", "openwording", ".opencode", "skills", "effect")

async function* walkSkillMd(dir: string): AsyncGenerator<string> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) yield* walkSkillMd(full)
    else if (e.name === "SKILL.md") yield full
  }
}

async function skillName(skillFile: string): Promise<string | null> {
  try {
    const parsed = matter(await readFile(skillFile, "utf8"))
    const name = parsed.data?.name
    return typeof name === "string" && name.trim() ? name.trim() : null
  } catch {
    return null
  }
}

async function collectNames(dir: string): Promise<Set<string>> {
  const names = new Set<string>()
  for await (const file of walkSkillMd(dir)) {
    const n = await skillName(file)
    if (n) names.add(n)
  }
  return names
}

type Result = "copied" | "skipped" | "dup" | "noname"

/** Copy a skill directory (containing SKILL.md) to destSkillDir, dedup by name. */
async function copySkillDir(
  srcSkillDir: string,
  destSkillDir: string,
  existing: Set<string>,
  seen: Set<string>,
): Promise<{ result: Result; name: string | null }> {
  const skillFile = join(srcSkillDir, "SKILL.md")
  const name = await skillName(skillFile)
  if (!name) return { result: "noname", name: null }
  if (existing.has(name)) return { result: "skipped", name }
  if (seen.has(name)) return { result: "dup", name }
  seen.add(name)
  await mkdir(destSkillDir, { recursive: true })
  await cp(srcSkillDir, destSkillDir, { recursive: true })
  existing.add(name)
  return { result: "copied", name }
}

async function main() {
  if (!existsSync(ARCANA_SKILLS)) {
    console.error(`arcana skills dir not found: ${ARCANA_SKILLS}`)
    process.exit(1)
  }

  const existing = await collectNames(ARCANA_SKILLS)
  console.log(`arcana skills/ existing: ${existing.size}`)

  const seen = new Set<string>()
  const counts: Record<Result, number> = { copied: 0, skipped: 0, dup: 0, noname: 0 }

  // 1. hermes optional-skills — preserve <category>/<skill> structure
  let hermesFiles = 0
  if (existsSync(HERMES_OPTIONAL)) {
    for await (const file of walkSkillMd(HERMES_OPTIONAL)) {
      hermesFiles++
      const srcDir = dirname(file)
      const rel = relative(HERMES_OPTIONAL, srcDir) // <category>/<skill>
      const destDir = join(ARCANA_SKILLS, rel)
      const { result, name } = await copySkillDir(srcDir, destDir, existing, seen)
      counts[result]++
      if (result === "copied") console.log(`  + ${name}  (hermes/${rel})`)
      else if (result === "dup") console.warn(`  ! duplicate name skipped: ${name}  (hermes/${rel})`)
    }
  } else {
    console.warn(`hermes optional-skills not found: ${HERMES_OPTIONAL}`)
  }
  console.log(`hermes optional-skills scanned: ${hermesFiles}`)

  // 2. opencode effect — place under software-development/effect
  if (existsSync(OPENCODE_EFFECT) && existsSync(join(OPENCODE_EFFECT, "SKILL.md"))) {
    const destDir = join(ARCANA_SKILLS, "software-development", "effect")
    const { result, name } = await copySkillDir(OPENCODE_EFFECT, destDir, existing, seen)
    counts[result]++
    if (result === "copied") console.log(`  + ${name}  (opencode/software-development/effect)`)
    else if (result !== "noname") console.log(`  = ${name} already present (opencode/effect ${result})`)
  } else {
    console.warn(`opencode effect skill not found: ${OPENCODE_EFFECT}`)
  }

  console.log(
    `\ndone: copied=${counts.copied} skipped=${counts.skipped} dup=${counts.dup} noname=${counts.noname}`,
  )
  const total = await collectNames(ARCANA_SKILLS)
  console.log(`arcana skills/ total now: ${total.size}`)
}

await main()
