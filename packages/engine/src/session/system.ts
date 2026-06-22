import { LayerNode } from "@arcana/core/effect/layer-node"
import { Context, Effect, Layer } from "effect"
import { homedir } from "node:os"
import { join } from "node:path"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { Database } from "bun:sqlite"

import { InstanceState } from "@/effect/instance-state"

import PROMPT_ANTHROPIC from "./prompt/anthropic.txt"
import PROMPT_DEFAULT from "./prompt/default.txt"
import PROMPT_BEAST from "./prompt/beast.txt"
import PROMPT_GEMINI from "./prompt/gemini.txt"
import PROMPT_GPT from "./prompt/gpt.txt"
import PROMPT_KIMI from "./prompt/kimi.txt"

import PROMPT_CODEX from "./prompt/codex.txt"
import PROMPT_TRINITY from "./prompt/trinity.txt"
import type { Provider } from "@/provider/provider"
import type { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { Skill } from "@/skill"
import { AbsolutePath } from "@arcana/core/schema"
import { Location } from "@arcana/core/location"
import { LocationServiceMap } from "@arcana/core/location-layer"
import { PluginBoot } from "@arcana/core/plugin/boot"
import { Reference } from "@arcana/core/reference"

export function provider(model: Provider.Model) {
  if (model.api.id.includes("gpt-4") || model.api.id.includes("o1") || model.api.id.includes("o3"))
    return [PROMPT_BEAST]
  if (model.api.id.includes("gpt")) {
    if (model.api.id.includes("codex")) {
      return [PROMPT_CODEX]
    }
    return [PROMPT_GPT]
  }
  if (model.api.id.includes("gemini-")) return [PROMPT_GEMINI]
  if (model.api.id.includes("claude")) return [PROMPT_ANTHROPIC]
  if (model.api.id.toLowerCase().includes("trinity")) return [PROMPT_TRINITY]
  if (model.api.id.toLowerCase().includes("kimi")) return [PROMPT_KIMI]
  return [PROMPT_DEFAULT]
}

// ---------------------------------------------------------------------------
// Cached resources for SystemPrompt.memory — avoid per-turn fs + db churn.
// memory() runs on every system-prompt build (i.e. every LLM request).
// ---------------------------------------------------------------------------

let _memoryDb: Database | null = null
let _memoryStmt: ReturnType<Database["prepare"]> | null = null

/** Lazily open one shared readonly handle + prepared statement; reuse across turns. */
function getMemoryStmt() {
  if (_memoryStmt) return _memoryStmt
  try {
    const dbPath = join(homedir(), ".arcana", "data", "memory.db")
    _memoryDb = new Database(dbPath, { readonly: true })
    _memoryStmt = _memoryDb.prepare(
      "SELECT key, value, confidence FROM user_facts WHERE confidence >= 0.5 ORDER BY confidence DESC, updated_at DESC LIMIT 5",
    )
  } catch {
    _memoryDb = null
    _memoryStmt = null
  }
  return _memoryStmt
}

/** Drop the cached handle so the next turn re-opens (e.g. db replaced/corrupted). */
function resetMemoryDb() {
  try { _memoryDb?.close() } catch { /* already closed */ }
  _memoryDb = null
  _memoryStmt = null
}

interface LearnedEntry { slug: string; excerpt: string }
let _learnedCache: { mtimeMs: number; entries: LearnedEntry[] } | null = null

/**
 * Read + parse learned-wiki excerpts, cached and invalidated on the learned
 * dir's mtime (changes when files are added/removed). Avoids re-reading every
 * .md on every turn; content-only edits to an existing file are rare.
 */
function getLearnedEntries(): LearnedEntry[] {
  try {
    const learnedDir = join(homedir(), ".arcana", "learned")
    const st = statSync(learnedDir)
    if (_learnedCache && _learnedCache.mtimeMs === st.mtimeMs) return _learnedCache.entries
    const files = readdirSync(learnedDir).filter((f) => f.endsWith(".md"))
    const entries: LearnedEntry[] = files.map((f) => {
      const slug = f.replace(".md", "")
      const body = readFileSync(join(learnedDir, f), "utf-8")
      const excerpt = body
        .split("\n")
        .filter((l) => !l.startsWith("---") && !l.startsWith("tags:") && !l.startsWith("date:") && !l.startsWith("source:") && !l.startsWith("Related:") && l.trim())
        .slice(0, 2)
        .join(" ")
        .slice(0, 150)
      return { slug, excerpt }
    })
    _learnedCache = { mtimeMs: st.mtimeMs, entries }
    return entries
  } catch {
    return []
  }
}

/** Pick up to `n` distinct random entries (unbiased — no sort-comparator hack). */
function pickRandom<T>(arr: T[], n: number): T[] {
  const pool = arr.slice()
  const out: T[] = []
  const count = Math.min(n, pool.length)
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pool.length)
    out.push(pool.splice(idx, 1)[0])
  }
  return out
}

export interface Interface {
  readonly environment: (model: Provider.Model) => Effect.Effect<string[]>
  readonly skills: (agent: Agent.Info) => Effect.Effect<string | undefined>
  readonly memory: () => Effect.Effect<string | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@arcana/SystemPrompt") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const skill = yield* Skill.Service
    const locations = yield* LocationServiceMap

    return Service.of({
      environment: Effect.fn("SystemPrompt.environment")(function* (model: Provider.Model) {
        const ctx = yield* InstanceState.context
        const references = yield* Effect.gen(function* () {
          yield* (yield* PluginBoot.Service).wait()
          return (yield* (yield* Reference.Service).list()).filter((reference) => reference.description !== undefined)
        }).pipe(Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(ctx.directory) }))))
        return [
          [
            `You are powered by the model named ${model.api.id}. The exact model ID is ${model.providerID}/${model.api.id}`,
            `Here is some useful information about the environment you are running in:`,
            `<env>`,
            `  Working directory: ${ctx.directory}`,
            `  Workspace root folder: ${ctx.worktree}`,
            `  Is directory a git repo: ${ctx.project.vcs === "git" ? "yes" : "no"}`,
            `  Platform: ${process.platform}`,
            `  Today's date: ${new Date().toDateString()}`,
            `</env>`,
          ].join("\n"),
          references.length === 0
            ? undefined
            : [
                "Project references provide additional directories that can be accessed when relevant.",
                "<available_references>",
                ...references
                  .toSorted((a, b) => a.name.localeCompare(b.name))
                  .flatMap((reference) => [
                    "  <reference>",
                    `    <name>${reference.name}</name>`,
                    `    <path>${reference.path}</path>`,
                    ...(reference.description === undefined
                      ? []
                      : [`    <description>${reference.description}</description>`]),
                    "  </reference>",
                  ]),
                "</available_references>",
              ].join("\n"),
        ].filter((part): part is string => part !== undefined)
      }),

      memory: Effect.fn("SystemPrompt.memory")(function* () {
        const parts: string[] = []

        // Read user facts from shared SQLite DB (same as CLI writes to).
        // Reuses one cached readonly handle + prepared statement across turns.
        const stmt = getMemoryStmt()
        if (stmt) {
          try {
            const rows = stmt.all() as Array<{ key: string; value: string; confidence: number }>
            if (rows.length) {
              const lines = rows.map((r) => `- ${r.key}: ${r.value}`)
              parts.push("<persistent-memory>\nThese facts were stored by the user or learned from past sessions and persist across conversations:\n" + lines.join("\n") + "\n</persistent-memory>")
            }
          } catch {
            // handle went bad (db replaced/corrupted) — drop it, retry next turn
            resetMemoryDb()
          }
        }

        // Read learned wiki entries (cached; invalidated on dir mtime).
        const learned = getLearnedEntries()
        if (learned.length) {
          const chosen = pickRandom(learned, 2)
          const lines = chosen.map((e) => `- [[${e.slug}]]: ${e.excerpt}`)
          parts.push("<persistent-memory>\nKnowledge learned from past sessions:\n" + lines.join("\n") + "\n</persistent-memory>")
        }

        return parts.length ? parts.join("\n") : undefined
      }),

      skills: Effect.fn("SystemPrompt.skills")(function* (agent: Agent.Info) {
        if (Permission.disabled(["skill"], agent.permission).has("skill")) return

        const list = yield* skill.available(agent)
        // Cap how many skills are inlined in the system prompt. Overridable via
        // ARCANA_MAX_SKILLS; defaults to 40. The rest stay reachable via skill_list.
        const envMax = Number(process.env["ARCANA_MAX_SKILLS"])
        const MAX_SKILLS = Number.isInteger(envMax) && envMax > 0 ? envMax : 40
        const shown = list.length > MAX_SKILLS
          ? list.slice(0, MAX_SKILLS)
          : list
        const note = list.length > MAX_SKILLS
          ? `\n…and ${list.length - MAX_SKILLS} more skills available. Use \`skill_list\` to search.`
          : ""

        return [
          "Skills provide specialized instructions and workflows for specific tasks.",
          "Use the skill tool to load a skill when a task matches its description.",
          // Markdown bullets save ~40% tokens vs XML. Models handle both formats well.
          Skill.fmt(shown, { verbose: false }),
          note,
        ].filter(Boolean).join("\n")
      }),
    })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Skill.defaultLayer), Layer.provide(LocationServiceMap.layer))

const locationServiceMapNode = LayerNode.make(LocationServiceMap.layer, [])

export const node = LayerNode.make(layer, [Skill.node, locationServiceMapNode])

export * as SystemPrompt from "./system"
