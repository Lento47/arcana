import { LayerNode } from "@arcana/core/effect/layer-node"
import { Context, Effect, Layer } from "effect"
import { homedir } from "node:os"
import { join } from "node:path"
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs"
import { Database } from "bun:sqlite"

import { InstanceState } from "@/effect/instance-state"

import BASE_ARCANA from "./prompt/base-arcana.txt"
import SHARED_BEHAVIORAL from "./prompt/shared-behavioral.txt"
import PROMPT_ANTHROPIC from "./prompt/anthropic.txt"
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
import { isReservedMemoryKey } from "@arcana/memory"

export function provider(model: Provider.Model) {
  if (model.api.id.includes("gpt-4") || model.api.id.includes("o1") || model.api.id.includes("o3"))
    return [BASE_ARCANA, SHARED_BEHAVIORAL, PROMPT_BEAST]
  if (model.api.id.includes("gpt")) {
    if (model.api.id.includes("codex")) {
      return [BASE_ARCANA, SHARED_BEHAVIORAL, PROMPT_CODEX]
    }
    return [BASE_ARCANA, SHARED_BEHAVIORAL, PROMPT_GPT]
  }
  if (model.api.id.includes("gemini-")) return [BASE_ARCANA, SHARED_BEHAVIORAL, PROMPT_GEMINI]
  if (model.api.id.includes("claude")) return [BASE_ARCANA, SHARED_BEHAVIORAL, PROMPT_ANTHROPIC]
  if (model.api.id.toLowerCase().includes("trinity")) return [BASE_ARCANA, SHARED_BEHAVIORAL, PROMPT_TRINITY]
  if (model.api.id.toLowerCase().includes("kimi")) return [BASE_ARCANA, SHARED_BEHAVIORAL, PROMPT_KIMI]
  return [BASE_ARCANA, SHARED_BEHAVIORAL]
}

// ---------------------------------------------------------------------------
// Cached resources for SystemPrompt.memory — avoid per-turn fs + db churn.
// memory() runs on every system-prompt build (i.e. every LLM request).
// ---------------------------------------------------------------------------

let _memoryDb: Database | null = null
let _memoryStmt: ReturnType<Database["prepare"]> | null = null
let _memoryDbMtime: number | null = null

/** Shared memory DB path (config.dataDir override, else ~/.arcana/data). */
function memoryDbPath(): string {
  let dataDir = join(homedir(), ".arcana", "data")
  const configPath = join(homedir(), ".arcana", "config.json")
  if (existsSync(configPath)) {
    try {
      const cfg = JSON.parse(readFileSync(configPath, "utf8"))
      if (typeof cfg.dataDir === "string") dataDir = cfg.dataDir
    } catch {}
  }
  return join(dataDir, "memory.db")
}

function learnedDirPath(): string {
  return join(homedir(), ".arcana", "learned")
}

/**
 * Fingerprint of the memory sources. A change means the memoized per-session
 * block is stale and must be rebuilt (one-time prefix-cache break).
 */
function memorySourceEpoch(): string {
  let db = "x"
  try {
    db = String(statSync(memoryDbPath()).mtimeMs)
  } catch {}
  let learned = "x"
  try {
    learned = String(statSync(learnedDirPath()).mtimeMs)
  } catch {}
  return `${db}:${learned}`
}

/** Lazily open one shared readonly handle + prepared statement; invalidates on db file mtime change. */
function getMemoryStmt() {
  try {
    const dbPath = memoryDbPath()
    const mtime = statSync(dbPath).mtimeMs
    if (_memoryStmt && _memoryDbMtime === mtime) return _memoryStmt
    // File changed or first open — reconnect.
    resetMemoryDb()
    _memoryDb = new Database(dbPath, { readonly: true })
    _memoryDbMtime = mtime
    _memoryStmt = _memoryDb.prepare(
      `SELECT key, value, confidence FROM user_facts
       WHERE confidence >= 0.5
         AND lower(key) NOT IN ('active', 'goal')
         AND lower(key) NOT LIKE 'active.%'
         AND lower(key) NOT LIKE 'goal.%'
       ORDER BY confidence DESC, updated_at DESC LIMIT 5`,
    )
  } catch {
    _memoryDb = null
    _memoryStmt = null
    _memoryDbMtime = null
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

function escapePromptField(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

export function formatPersistentMemoryFacts(
  rows: ReadonlyArray<{ key: string; value: string; confidence: number }>,
): string | undefined {
  const lines = rows
    .filter((row) => !isReservedMemoryKey(row.key))
    .map((row) => `- ${escapePromptField(row.key)}: ${escapePromptField(row.value)}`)
  if (lines.length === 0) return undefined
  return "<persistent-memory>\nThese facts were stored by the user or learned from past sessions and persist across conversations:\n" + lines.join("\n") + "\n</persistent-memory>"
}

/**
 * Read + parse learned-wiki excerpts, cached and invalidated on the learned
 * dir's mtime (changes when files are added/removed). Avoids re-reading every
 * .md on every turn; content-only edits to an existing file are rare.
 */
function getLearnedEntries(): LearnedEntry[] {
  try {
    const learnedDir = learnedDirPath()
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

/** Assemble the persistent-memory block for the given (lowercase) keywords. */
function buildMemoryBlock(keywords: string[]): string | undefined {
  const parts: string[] = []

  // Read user facts from shared SQLite DB — filter by relevance to current task.
  // Previously sent all 20 facts (2,303 tok) every turn, even `l-drive` when task is `render`.
  const stmt = getMemoryStmt()
  if (stmt) {
    try {
      const rows = stmt.all() as Array<{ key: string; value: string; confidence: number }>
      if (rows.length) {
        const filtered = keywords.length
          ? rows.filter((r) => {
              const hay = `${r.key} ${r.value}`.toLowerCase()
              return keywords.some((k) => hay.includes(k))
            })
          : rows
        // If filter yields nothing, include at most 3 most recent facts as fallback (not all 20).
        const toFormat = filtered.length > 0 ? filtered : rows.slice(-3)
        const facts = formatPersistentMemoryFacts(toFormat)
        if (facts) parts.push(facts)
      }
    } catch {
      resetMemoryDb()
    }
  }

  // Read learned wiki entries: only include if relevant to current task.
  const learned = getLearnedEntries()
  if (learned.length) {
    const relevant = keywords.length
      ? learned.filter((e) => {
          const hay = `${e.slug} ${e.excerpt}`.toLowerCase()
          return keywords.some((k) => hay.includes(k))
        })
      : []
    const chosen = relevant.length > 0 ? relevant.slice(0, 2) : learned.slice(-1)
    const lines = chosen.map((e) => `- [[${e.slug}]]: ${e.excerpt}`)
    parts.push("<persistent-memory>\nKnowledge learned from past sessions:\n" + lines.join("\n") + "\n</persistent-memory>")
  }

  return parts.length ? parts.join("\n") : undefined
}

type MemoryBlockMemo = { block: string | undefined; keywords: Set<string>; epoch: string; calls: number; refreshedAt: number }
const memoryBlockMemo = new Map<string, MemoryBlockMemo>()
const MEMORY_BLOCK_MEMO_LIMIT = 64

/**
 * Minimum topic-shift refreshes are spaced out: rewriting the leading system
 * block invalidates the provider's prefix cache for the whole conversation, so
 * a refresh must cost less than the cache it destroys. Source changes (new
 * facts/learned notes) still refresh immediately.
 */
export const MEMORY_REFRESH_MIN_CALLS = 20

/** Fraction of incoming keywords already present in the memoized set (1 = same topic). */
export function keywordOverlap(memoized: ReadonlySet<string>, incoming: readonly string[]): number {
  if (memoized.size === 0 || incoming.length === 0) return 1
  let hits = 0
  for (const keyword of incoming) if (memoized.has(keyword)) hits += 1
  return hits / incoming.length
}

/**
 * Whether the memoized block can be reused for this call. Reuse while the
 * topic holds; a topic shift is allowed to refresh only after the minimum call
 * spacing, and source changes always refresh.
 */
export function shouldReuseMemoryBlock(
  memo: { keywords: ReadonlySet<string>; epoch: string; calls: number; refreshedAt: number },
  input: { keywords: readonly string[]; epoch: string },
): boolean {
  if (memo.epoch !== input.epoch) return false
  if (keywordOverlap(memo.keywords, input.keywords) >= 0.34) return true
  return memo.calls - memo.refreshedAt < MEMORY_REFRESH_MIN_CALLS
}

export interface Interface {
  readonly environment: (model: Provider.Model) => Effect.Effect<string[]>
  readonly skills: (agent: Agent.Info) => Effect.Effect<string | undefined>
  readonly memory: (filter?: { keywords?: string[]; sessionID?: string }) => Effect.Effect<string | undefined>
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

      memory: Effect.fn("SystemPrompt.memory")(function* (filter?: { keywords?: string[]; sessionID?: string }) {
        const keywords = filter?.keywords?.map((k) => k.toLowerCase()).filter(Boolean) ?? []
        const sessionID = filter?.sessionID
        const epoch = memorySourceEpoch()

        // Prefix-cache stability: this block is part of the leading system
        // prompt, so changing it between turns invalidates the provider's
        // cached prefix for the whole conversation. Reuse one block per session
        // while the topic holds; topic changes are spaced out by a minimum call
        // floor, and source changes refresh immediately (one-time break).
        const existing = sessionID ? memoryBlockMemo.get(sessionID) : undefined
        const calls = (existing?.calls ?? 0) + 1
        if (sessionID && existing) {
          if (shouldReuseMemoryBlock({ ...existing, calls }, { keywords, epoch })) {
            memoryBlockMemo.set(sessionID, { ...existing, calls })
            return existing.block
          }
        }

        const block = buildMemoryBlock(keywords)
        if (sessionID) {
          memoryBlockMemo.set(sessionID, { block, keywords: new Set(keywords), epoch, calls, refreshedAt: calls })
          if (memoryBlockMemo.size > MEMORY_BLOCK_MEMO_LIMIT) {
            const oldest = memoryBlockMemo.keys().next().value
            if (oldest !== undefined) memoryBlockMemo.delete(oldest)
          }
        }
        return block
      }),

      skills: Effect.fn("SystemPrompt.skills")(function* (agent: Agent.Info) {
        if (Permission.disabled(["skill"], agent.permission).has("skill")) return

        // Only show skills hint, not 40 inlined skills (saves ~1900 tok/turn).
        // Agent can use `skill` tool to load a specific skill when needed.
        return [
          "Skills provide specialized instructions and workflows for specific tasks.",
          "Use the skill tool to load a skill when a task matches its description. Use `skill_list` to search available skills.",
        ].join("\n")
      }),
    })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Skill.defaultLayer), Layer.provide(LocationServiceMap.layer))

const locationServiceMapNode = LayerNode.make(LocationServiceMap.layer, [])

export const node = LayerNode.make(layer, [Skill.node, locationServiceMapNode])

export * as SystemPrompt from "./system"
