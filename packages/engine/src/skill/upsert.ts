/**
 * Create or update a skill on disk. Same name/id overwrites; never a second directory.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export function skillIdFromName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "skill"
}

export type SkillCatalogEntry = {
  id: string
  name: string
  description?: string
  location: string
}

export type SkillUpsertInput = {
  name: string
  description: string
  body: string
  tags?: string[]
  catalog?: readonly SkillCatalogEntry[]
  skillsRoot?: string
}

export type SkillUpsertResult = {
  id: string
  path: string
  created: boolean
  matchedExistingId?: string
}

function bumpVersion(raw: string | undefined): string {
  if (!raw) return "1.0.1"
  const m = raw.trim().match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!m) return "1.0.1"
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`
}

function parseFrontmatterVersion(text: string): string | undefined {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return undefined
  const line = match[1]!.split("\n").find((row) => row.startsWith("version:"))
  if (!line) return undefined
  return line.slice("version:".length).trim().replace(/^["']|["']$/g, "")
}

function similar(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  const nb = b.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  if (!na || !nb) return false
  if (na === nb) return true
  return na.includes(nb) || nb.includes(na)
}

export function resolveSkillTarget(input: SkillUpsertInput): { id: string; dir: string; existingPath?: string } {
  const root = input.skillsRoot ?? join(process.env.ARCANA_HOME?.trim() || join(homedir(), ".arcana"), "skills")
  const wanted = skillIdFromName(input.name)
  const catalog = input.catalog ?? []
  const byId = catalog.find((entry) => entry.id === wanted || skillIdFromName(entry.name) === wanted)
  if (byId) {
    return { id: skillIdFromName(byId.name) || wanted, dir: join(root, skillIdFromName(byId.name) || wanted), existingPath: byId.location }
  }
  const byText = catalog.find(
    (entry) => similar(entry.name, input.name) || similar(entry.description ?? "", input.description),
  )
  if (byText) {
    const id = skillIdFromName(byText.name) || wanted
    return { id, dir: join(root, id), existingPath: byText.location, }
  }
  return { id: wanted, dir: join(root, wanted) }
}

export function upsertSkill(input: SkillUpsertInput): SkillUpsertResult {
  const target = resolveSkillTarget(input)
  mkdirSync(target.dir, { recursive: true })
  const path = join(target.dir, "SKILL.md")
  const existed = existsSync(path)
  let version = "1.0.0"
  if (existed) {
    try {
      version = bumpVersion(parseFrontmatterVersion(readFileSync(path, "utf8")))
    } catch {
      version = "1.0.1"
    }
  }
  const tags = (input.tags ?? []).filter((tag) => tag.trim())
  const frontmatter = [
    "---",
    `name: "${input.name.replace(/"/g, '\\"')}"`,
    `description: "${input.description.replace(/"/g, '\\"')}"`,
    `version: "${version}"`,
    tags.length ? `tags: [${tags.join(", ")}]` : "",
    `source: "self-evolved"`,
    `date: ${new Date().toISOString().split("T")[0]}`,
    "---",
  ]
    .filter(Boolean)
    .join("\n")
  writeFileSync(path, `${frontmatter}\n\n${input.body.trim()}\n`, "utf8")
  return {
    id: target.id,
    path,
    created: !existed,
    matchedExistingId: target.existingPath ? target.id : undefined,
  }
}
