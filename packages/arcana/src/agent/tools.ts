import type { AgentRunner } from "./runner.js"
import type { MemoryStore } from "@arcana/memory"
import type { SkillCatalog } from "../skills/loader.js"
import { loadSkills, loadSkillBody } from "../skills/loader.js"
// Module-level tool history for loop_detect
export const toolHistory: Array<{ name: string; ts: number }> = []

import { homedir } from "node:os"
import { basename, join, dirname, resolve, sep } from "node:path"
import { mkdirSync, writeFileSync, existsSync } from "node:fs"
import { gatedSpawn, formatGateResult } from "./authority.js"
import { initBoard, loadBoard, saveBoard, addCard, moveCard, archiveDone, formatBoard, type KanbanCard } from "./kanban.js"
import { fetchAccountSnapshot, formatAccountSnapshot } from "../proxy-client.js"
import { generateAndSaveImages, formatImageGenerateResult } from "./image-generate.js"

/**
 * Resolve a sandbox script path from a model-provided filename (ARC-SEC-I05).
 * Only the basename is used; absolute paths, `..`, and null bytes are rejected.
 */
export function resolveSandboxScriptPath(sandboxDir: string, filename: unknown): string {
  const raw = String(filename ?? "").trim()
  if (!raw) throw new Error("filename is required")
  if (raw.includes("\0")) throw new Error("invalid filename")

  const normalized = raw.replace(/\\/g, "/")
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    throw new Error("absolute paths are not allowed in env_write")
  }
  if (normalized.split("/").some((part) => part === "..")) {
    throw new Error("path traversal is not allowed in env_write")
  }

  const name = basename(normalized)
  if (!name || name === "." || name === "..") {
    throw new Error("invalid filename")
  }

  const root = resolve(sandboxDir)
  const target = resolve(root, name)
  const rootPrefix = root.endsWith(sep) ? root : root + sep
  const inside =
    process.platform === "win32"
      ? target.toLowerCase() === root.toLowerCase() || target.toLowerCase().startsWith(rootPrefix.toLowerCase())
      : target === root || target.startsWith(rootPrefix)
  if (!inside) {
    throw new Error("path escapes sandbox")
  }
  return target
}

// ── Artifact schema (inlined — originally from @arcana/core/artifact/schema;
//     the dynamic import violated this package's tsconfig rootDir, and the
//     schema is small enough to live next to the tools that use it). ─────
type ArtifactType = "markdown" | "code" | "svg" | "html" | "diagram" | "react"
interface ArtifactVersion { version: number; content: string; created_at: number; session_id?: string }
interface ArtifactInfo {
  id: string; title: string; type: ArtifactType; tags: string[]
  session_id?: string; versions: ArtifactVersion[]; current_version: number
  created_at: number; updated_at: number
}
function createArtifact(
  id: string, title: string, content: string, type: ArtifactType = "markdown",
  session_id?: string, tags: string[] = [],
): ArtifactInfo {
  const now = Date.now()
  return {
    id, title, type, tags, session_id,
    versions: [{ version: 1, content, created_at: now, session_id }],
    current_version: 1, created_at: now, updated_at: now,
  }
}
function addVersion(artifact: ArtifactInfo, content: string, session_id?: string): ArtifactInfo {
  const next = artifact.versions.length + 1
  artifact.versions.push({ version: next, content, created_at: Date.now(), session_id })
  artifact.current_version = next
  artifact.updated_at = Date.now()
  return artifact
}
function getArtifactVersion(artifact: ArtifactInfo, version?: number) {
  if (version === undefined) return artifact.versions.find((v) => v.version === artifact.current_version)
  return artifact.versions.find((v) => v.version === version)
}

type GitRunOptions = {
  cwd: string
  maxBuffer?: number
  ignoreErrors?: boolean
}

async function runGit(toolName: string, args: string[], options: GitRunOptions): Promise<string> {
  const result = await gatedSpawn(toolName, ["git", ...args], { cwd: options.cwd })
  if (result.status === "EXECUTED") {
    if (result.exitCode === 0) return result.stdout.trim()
    const err = `git ${args[0]} failed (exit ${result.exitCode}): ${result.stderr.slice(0, 300)}`
    if (options.ignoreErrors) return ""
    throw new Error(err)
  }
  if (options.ignoreErrors) return ""
  throw new Error(formatGateResult(result))
}

function parseGitFiles(input: unknown): string[] {
  if (Array.isArray(input)) return input.map(String).map((file) => file.trim()).filter(Boolean)
  const raw = input === undefined || input === null ? "" : String(input).trim()
  if (!raw) return []
  return raw.split(/\s+/).filter(Boolean)
}

export function gitDiffArgs(input: { staged?: unknown; file?: unknown }): string[] {
  const args = ["diff"]
  if (input.staged) args.push("--staged")
  if (input.file) args.push("--", String(input.file))
  return args
}

export function gitAddArgs(files: unknown): string[] {
  const parsed = parseGitFiles(files)
  return parsed.length ? ["add", "--", ...parsed] : ["add", "--", "."]
}

export function gitCommitArgs(message: unknown): string[] {
  return ["commit", "-m", String(message)]
}

/**
 * Tool-selection guide — injected into the system prompt so the LLM can
 * map user intent to the right tool instead of guessing from descriptions.
 * Keep ≤30 lines. Tweak here, not in run.ts, so it ships with the tools.
 */
export const TOOL_SELECTION_GUIDE = `<tool-selection>
Map user intent to exactly one tool. Don't combine unless the user explicitly asks for batched/parallel work.

- "search the web for X"            → web_search(query=X)
- "fetch URL content"               → web_fetch(url=X)
- "read a file"                     → read(filePath=X)
- "create / overwrite a file"       → write(filePath=X, content=...)
- "edit a file in place"            → edit(filePath=X, oldString=..., newString=...)
- "find files by glob"              → glob(pattern=**/*.ts)
- "search file contents"            → grep(pattern=...)
- "run a shell command"             → shell(cmd=X)        [NOT SANDBOXED — use carefully]
- "remember a fact"                 → memory_store_fact(key=..., value=...)
- "recall past context"             → memory_search(query=...)
- "list available skills"           → skill_list(query=...)
- "activate a skill"                → skill_activate(skill_id=...)
- "record the goal"                 → goal_set(goal=...)
- "check goal progress"             → goal_check(status=in_progress|complete|blocked)
- "manage tasks"                    → kanban(command=init|add|move|view|archive, ...)
- "run independent ops in parallel" → batch(calls=[{tool, args}, ...])
- "git status / diff / commit"      → git_status / git_diff / git_commit
- "diagnose system health"          → diagnose()
- "my account / balance / tier / credits / license" → account_status()
- "save / list artifacts"           → artifact_save / artifact_search / artifact_get
- "generate an image / illustration / mockup" → image_generate(prompt=..., aspect_ratio=...)
- "multi-model debate + vote"       → council(prompt=..., models=[...], rounds=1|2)
- "estimate call cost"              → cost_estimate(estimated_input_tokens=...)

When unsure: read before write, list before activate, search before fetch.
For account/billing/license questions ALWAYS call account_status — do not invent from memory.
For image generation use image_generate (not shell/curl). Files save under ~/.arcana/artifacts/images/.
</tool-selection>`

// ── web_search helpers ───────────────────────────────────────
/** Decode the common HTML entities DuckDuckGo emits in titles/snippets/hrefs. */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
}

/** Strip tags, decode entities, collapse whitespace. */
function cleanText(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim()
}

/**
 * DuckDuckGo HTML wraps every result in a redirector:
 *   //duckduckgo.com/l/?uddg=<url-encoded real url>&rut=<tracking>
 * The previous code returned that redirect link verbatim, so the model never
 * got real destination URLs. Unwrap `uddg` to recover the actual URL.
 */
function extractRealUrl(href: string): string {
  let h = decodeHtmlEntities(href)
  if (h.startsWith("//")) h = "https:" + h
  try {
    const real = new URL(h).searchParams.get("uddg")
    if (real) return real
  } catch { /* not a wrapped URL — return as-is */ }
  return h
}

/** Account / license tools that do not require local memory.db. */
export function registerAccountTools(runner: AgentRunner): void {
  runner.registerTool(
    "account_status",
    {
      type: "function",
      function: {
        name: "account_status",
        description:
          "Look up THIS machine's licensed Arcana account from Arcana Proxy: user id, tier, credit balance, daily usage, and profile. Use whenever the user asks about their account, plan, credits, billing balance, license, or subscription — do not guess from local memory.",
        parameters: { type: "object", properties: {} },
      },
    },
    async () => {
      try {
        const snap = await fetchAccountSnapshot()
        return formatAccountSnapshot(snap)
      } catch (e) {
        return `Failed to load account status: ${e instanceof Error ? e.message : String(e)}`
      }
    },
  )

  runner.registerTool(
    "image_generate",
    {
      type: "function",
      function: {
        name: "image_generate",
        description:
          "Generate an image from a text prompt via Arcana Proxy (OpenRouter / Aihubmix). Saves PNG/JPEG under ~/.arcana/artifacts/images/ and returns local file paths. Use for illustrations, mockups, concept art, logos, and UI comps. Requires proxy login (arcana console login). Billable tiers spend credits.",
        parameters: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Detailed visual description. Do not put UI chrome text unless the user wants text-in-image.",
            },
            aspect_ratio: {
              type: "string",
              description:
                "landscape | portrait | square, or explicit ratio like 16:9, 9:16, 1:1, 4:3",
            },
            model: {
              type: "string",
              description: 'Image model slug (default "openai/gpt-5-image"). Use catalog models with output image.',
            },
            n: {
              type: "number",
              description: "Number of images 1–4 (default 1)",
            },
            size: {
              type: "string",
              description: 'Optional size shorthand e.g. "1024x1024" or "2K"',
            },
            quality: {
              type: "string",
              description: "auto | low | medium | high (when supported)",
            },
          },
          required: ["prompt"],
        },
      },
    },
    async (args) => {
      try {
        const result = await generateAndSaveImages({
          prompt: String(args.prompt ?? ""),
          model: args.model != null ? String(args.model) : undefined,
          aspect_ratio: args.aspect_ratio != null ? String(args.aspect_ratio) : undefined,
          n: args.n != null ? Number(args.n) : undefined,
          size: args.size != null ? String(args.size) : undefined,
          quality: args.quality != null ? String(args.quality) : undefined,
        })
        return formatImageGenerateResult(result)
      } catch (e) {
        return `Image generation error: ${e instanceof Error ? e.message : String(e)}`
      }
    },
  )
}

export function registerBuiltinTools(runner: AgentRunner, memory: MemoryStore, skillDirs: string[]): void {
  let skills: SkillCatalog[] = []
  const catalogPromise = loadSkills(skillDirs).then((s) => { skills = s; return s })

  registerAccountTools(runner)

  runner.registerTool(
    "memory_search",
    {
      type: "function",
      function: {
        name: "memory_search",
        description: "Full-text search past sessions and conversations",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            limit: { type: "number", description: "Max results (default 5)" },
          },
          required: ["query"],
        },
      },
    },
    async (args) => {
      const results = memory.search(String(args.query), Number(args.limit ?? 5))
      if (!results.length) return "No memory results found."
      return results.map((r) => `[${r.type}:${r.id.slice(0, 8)}] ${r.snippet}`).join("\n")
    },
  )

  runner.registerTool(
    "memory_store_fact",
    {
      type: "function",
      function: {
        name: "memory_store_fact",
        description: "Store a persistent fact in long-term memory",
        parameters: {
          type: "object",
          properties: {
            key: { type: "string", description: "Unique key (e.g. 'user.preferred_language')" },
            value: { type: "string", description: "Value to store" },
            source: { type: "string", description: "Where this fact came from (optional)" },
          },
          required: ["key", "value"],
        },
      },
    },
    async (args) => {
      memory.recordUserFact(String(args.key), String(args.value), args.source ? String(args.source) : undefined)
      return `Stored: ${args.key} = ${args.value}`
    },
  )

  runner.registerTool(
    "skill_activate",
    {
      type: "function",
      function: {
        name: "skill_activate",
        description: "Load skill instructions into context. Use skill_list first.",
        parameters: {
          type: "object",
          properties: {
            skill_id: { type: "string", description: "Skill ID or name to activate" },
          },
          required: ["skill_id"],
        },
      },
    },
    async (args) => {
      const skillId = String(args.skill_id).toLowerCase()
      await catalogPromise
      const skill = skills.find((s) => s.id === skillId || s.name.toLowerCase().includes(skillId))
      if (!skill) {
        memory.recordSkillObservation(skillId, "error: skill not found")
        return `Skill not found: ${skillId}. Use skill_list to see available skills.`
      }
      const _fullBody = await loadSkillBody(skill.id, skillDirs)
      memory.recordSkillObservation(skillId, `success: activated ${skill.name}`)
      return `Activated: ${skill.name}. Instructions injected into context.`
    },
  )

  runner.registerTool(
    "skill_list",
    {
      type: "function",
      function: {
        name: "skill_list",
        description: "List available skills, optionally filtered",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Optional search filter" },
          },
        },
      },
    },
    async (args) => {
      await catalogPromise
      const q = args.query ? String(args.query).toLowerCase() : ""
      const filtered = q
        ? skills.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.category.includes(q))
        : skills
      if (!filtered.length) return "No skills found."
      return filtered.map((s) => `${s.id}: ${s.description || s.name}`).join("\n")
    },
  )

  runner.registerTool(
    "web_search",
    {
      type: "function",
      function: {
        name: "web_search",
        description:
          "Search the live internet when the user asks a question that needs external knowledge. " +
          "Use the user's actual request as the query — do NOT scope it to this project, repo, or local files " +
          "(use grep/read for local code, memory_search for past sessions, skill_activate for known workflows). " +
          "Returns ranked results with titles, snippets, and real destination URLs (DuckDuckGo HTML, no API key).",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "What the user wants to find on the web, in natural language or keywords" },
            limit: { type: "number", description: "Max results (default 5, max 10)" },
          },
          required: ["query"],
        },
      },
    },
    async (args) => {
      const queryStr = String(args.query ?? "").trim()
      if (!queryStr) return "web_search needs a non-empty query."
      const query = encodeURIComponent(queryStr)
      const limit = Math.min(Math.max(Number(args.limit ?? 5), 1), 10)
      try {
        // DuckDuckGo HTML search — free, no API key required
        const res = await fetch(`https://html.duckduckgo.com/html/?q=${query}`, {
          headers: {
            // Realistic UA — DDG rate-limits / degrades unknown agents
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            Accept: "text/html",
          },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) return `Search failed: HTTP ${res.status}`
        const html = await res.text()
        // Extract result links from DDG HTML (title text may contain <b> highlights)
        const results: Array<{ title: string; snippet: string; url: string }> = []
        const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
        const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi
        let m
        const links: Array<{ title: string; url: string }> = []
        while ((m = linkRe.exec(html)) !== null && links.length < limit) {
          links.push({ title: cleanText(m[2]!), url: extractRealUrl(m[1]!) })
        }
        const snippets: string[] = []
        while ((m = snippetRe.exec(html)) !== null && snippets.length < limit) {
          snippets.push(cleanText(m[1]!))
        }
        for (let i = 0; i < links.length; i++) {
          results.push({ title: links[i]!.title, url: links[i]!.url, snippet: snippets[i] ?? "" })
        }
        if (!results.length) return `No results found for "${queryStr}". Try rephrasing or broadening the query.`
        return results.map((r, i) => `${i + 1}. **${r.title}**\n   ${r.snippet}\n   ${r.url}`).join("\n\n")
      } catch (e) {
        return `Search error: ${e instanceof Error ? e.message : String(e)}`
      }
    },
  )

  runner.registerTool(
    "speak",
    {
      type: "function",
      function: {
        name: "speak",
        description: "Speak text aloud using ElevenLabs text-to-speech. Use for verbal responses.",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "Text to speak (max 500 chars)" },
            voice: { type: "string", description: "Voice ID (default: 'Rachel' — warm, natural)" },
          },
          required: ["text"],
        },
      },
    },
    async (args) => {
      const apiKey = process.env.ELEVENLABS_API_KEY
      if (!apiKey) return "Set ELEVENLABS_API_KEY to use speech."
      const text = String(args.text).slice(0, 500)
      const voiceId = String(args.voice ?? "21m00Tcm4TlvDq8ikWAM") // Rachel
      try {
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
          body: JSON.stringify({
            text,
            model_id: "eleven_flash_v2_5",
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
          signal: AbortSignal.timeout(15000),
        })
        if (!res.ok) return `TTS error: HTTP ${res.status}`
        const audio = Buffer.from(await res.arrayBuffer())
        const tmp = join(homedir(), ".arcana", "cache", "speech.mp3")
        mkdirSync(dirname(tmp), { recursive: true })
        writeFileSync(tmp, audio)
        // Play via system player
        const platform = process.platform
        // Routed through the Authority Kernel; fire-and-forget preserves the
        // original non-blocking playback semantics.
        const playArgv =
          platform === "win32"
            ? ["powershell", "-c", "(New-Object Media.SoundPlayer (Get-Item -Path $args[0]).FullName).PlaySync()", "--", tmp]
            : platform === "darwin"
              ? ["afplay", tmp]
              : ["mpv", "--no-terminal", tmp]
        void gatedSpawn("speak", playArgv).catch(() => {})
        return `Spoke: "${text.slice(0, 80)}${text.length > 80 ? "…" : ""}"`
      } catch (e) {
        return `Speech error: ${e instanceof Error ? e.message : String(e)}`
      }
    },
  )

  runner.registerTool(
    "skill_create",
    {
      type: "function",
      function: {
        name: "skill_create",
        description: "Create a new skill from research or experience. The skill persists across sessions and is loaded automatically.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Skill name (e.g. 'Rust Debugging')" },
            description: { type: "string", description: "One-line description of what this skill enables" },
            body: { type: "string", description: "Full skill instructions (markdown). Include workflow, tips, examples." },
            tags: { type: "array", items: { type: "string" }, description: "Optional tags" },
          },
          required: ["name", "description", "body"],
        },
      },
    },
    async (args: any) => {
      const name = String(args.name)
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") // safe: directory slug from skill name, no shell/url context
      const tags = args.tags ? (args.tags as string[]).map(String) : []
      const dir = join(homedir(), ".arcana", "skills", id)
      mkdirSync(dir, { recursive: true })
      const frontmatter = [
        "---",
        `name: "${name}"`,
        `description: "${String(args.description)}"`,
        `version: "1.0.0"`,
        tags.length ? `tags: [${tags.join(", ")}]` : "",
        `source: "self-evolved"`,
        `date: ${new Date().toISOString().split("T")[0]}`,
        "---",
      ].filter(Boolean).join("\n")
      writeFileSync(join(dir, "SKILL.md"), `${frontmatter}\n\n${String(args.body).trim()}\n`, "utf8")
      return `Skill created: ${name} (${id})\nStored in ~/.arcana/skills/${id}/SKILL.md\nLoaded automatically next session.`
    },
  )

  runner.registerTool(
    "diagnose",
    {
      type: "function",
      function: {
        name: "diagnose",
        description: "Run system diagnostics — check health, config, API keys, caches, DB, network, MCP, git, disk, model access. Use when errors occur or before starting critical work.",
        parameters: { type: "object", properties: {} },
      },
    },
    async () => {
      const lines: string[] = []
      const ok = (label: string, pass: boolean, detail: string) => lines.push(`${pass ? "✅" : "❌"} ${label}: ${detail}`)

      // 0. Licensed Arcana account (proxy)
      try {
        const snap = await fetchAccountSnapshot()
        if (snap.licensed) {
          ok(
            "Arcana account",
            true,
            `tier=${snap.tier} user=${snap.userId} credits=${Number.isFinite(snap.credits) ? Math.round(snap.credits!) : "—"}`,
          )
        } else {
          ok("Arcana account", false, snap.error ?? "not licensed")
        }
      } catch (e) {
        ok("Arcana account", false, e instanceof Error ? e.message : String(e))
      }

      // 1. Config file
      const configPath = join(homedir(), ".arcana", "config.json")
      ok("Config file", existsSync(configPath), existsSync(configPath) ? "exists" : "missing — run arcana config init")

      // 2. API key
      try {
        const envKey = process.env.ARCANA_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.ARCANA_PROXY_KEY
        ok("API key", !!envKey, envKey ? `set (…${envKey.slice(-4)})` : "not set — export ARCANA_API_KEY or login for ARCANA_PROXY_KEY")
      } catch { ok("API key", false, "error reading") }

      // 3. Models cache
      const modelsCache = join(homedir(), ".cache", "arcana", "models-dev.json")
      ok("Models cache", existsSync(modelsCache), existsSync(modelsCache) ? `populated (${Math.round((Bun.file(modelsCache).size ?? 0) / 1024)}KB)` : "empty — will fetch on first use")

      // 4. Skills cache
      const skillsCache = join(homedir(), ".cache", "arcana", "skills-cache.json")
      ok("Skills cache", existsSync(skillsCache), existsSync(skillsCache) ? "warm" : "cold — will build on startup")

      // 5. Memory DB
      const dbPath = join(homedir(), ".arcana", "data", "memory.db")
      ok("Memory DB", existsSync(dbPath), existsSync(dbPath) ? `exists (${Math.round((Bun.file(dbPath).size ?? 0) / 1024)}KB)` : "missing — created on first session")

      // 6. Bridge config
      const bridge = join(homedir(), ".arcana", "cache", "bridge-config.json")
      ok("Bridge config", existsSync(bridge), existsSync(bridge) ? "exists" : "missing — TUI may not find skills")

      // 7. Network connectivity
      try {
        const dns = await fetch("https://cloudflare-dns.com", { signal: AbortSignal.timeout(5000) })
        ok("Network", dns.ok, dns.ok ? "reachable" : `HTTP ${dns.status}`)
      } catch { ok("Network", false, "unreachable — check internet connection") }

      // 8. Disk space
      try {
        const df = await gatedSpawn("env_probe", ["df", "-h", "."])
        const lastLine =
          df.status === "EXECUTED"
            ? (df.stdout.trim().split("\n").pop() ?? "")
            : "unknown"
        const parts = lastLine.split(/\s+/)
        ok("Disk space", true, parts[4] ?? "unknown") // e.g. "45%"
      } catch { ok("Disk space", true, "unknown") }

      // 9. Git repo
      try {
        const gb = await gatedSpawn("env_probe", ["git", "branch", "--show-current"])
        const branch = gb.status === "EXECUTED" ? gb.stdout.trim() : "not a repo"
        ok("Git repo", branch !== "not a repo" && branch.length > 0, branch !== "not a repo" && branch.length > 0 ? `on ${branch}` : "not in a git repository")
      } catch { ok("Git repo", false, "unknown") }

      // 10. arcana version
      const arcanaVersion = process.env.ARCANA_VERSION ?? "source/dev"
      ok("Arcana version", true, arcanaVersion)

      // 11. Bunny version (runtime)
      ok("Bun version", true, process.version)

      // 12. Home directory writable
      try {
        const testFile = join(homedir(), ".arcana", ".write-test")
        writeFileSync(testFile, "ok", "utf8")
        const { rmSync } = await import("node:fs")
        rmSync(testFile, { force: true })
        ok("Home dir writable", true, "yes")
      } catch { ok("Home dir writable", false, "no — check permissions") }

      return lines.join("\n")
    },
  )

  runner.registerTool(
    "web_fetch",
    {
      type: "function",
      function: {
        name: "web_fetch",
        description: "Fetch raw text content from a known URL (HTTPS only, SSRF-protected — blocks localhost/private/link-local IPs). Use AFTER web_search once you have a destination URL; HTML is stripped to plain text.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL to fetch (must be HTTPS, no localhost/private IPs)" },
            max_chars: { type: "number", description: "Max characters to return (default 8000)" },
          },
          required: ["url"],
        },
      },
    },
    async (args) => {
      const url = String(args.url)
      const max = Number(args.max_chars ?? 8000)

      /** SSRF protection — validate URL before fetching */
  const validateUrl = (raw: string): string | null => {
    let parsed: URL
    try {
      parsed = new URL(raw)
    } catch {
      return `Invalid URL: ${raw}`
    }
    if (parsed.protocol !== "https:") {
      return `Blocked protocol: ${parsed.protocol} Only https:// URLs are allowed.`
    }
    const host = parsed.hostname.toLowerCase()
    // Block localhost
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
          return `Blocked: localhost access is not allowed.`
        }
        // Block link-local and internal domains
        if (host.endsWith(".local") || host.endsWith(".internal")) {
          return `Blocked: private/internal domain (${host}) is not allowed.`
        }
        // Check literal IP addresses against private ranges
        const ipMatch = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
        if (ipMatch) {
          const parts = ipMatch.slice(1).map(Number)
          if (parts.some((p) => p > 255)) return `Invalid IP address: ${host}`
          const [a, b] = parts
          if (a === 127) return `Blocked: loopback address (127.0.0.0/8)`
          if (a === 10) return `Blocked: private address (10.0.0.0/8)`
          if (a === 172 && b >= 16 && b <= 31) return `Blocked: private address (172.16.0.0/12)`
          if (a === 192 && b === 168) return `Blocked: private address (192.168.0.0/16)`
          if (a === 169 && b === 254) return `Blocked: link-local address (169.254.0.0/16)`
        }
        // Block IPv6 private/local addresses
        if (host === "[::1]" || host === "[::]") return `Blocked: IPv6 loopback address`
        if (host.startsWith("[fd") || host.startsWith("[fc")) return `Blocked: IPv6 unique local address`
        if (host.startsWith("[fe80")) return `Blocked: IPv6 link-local address`
        return null
      }

      const urlError = validateUrl(url)
      if (urlError) return urlError

      const res = await fetch(url, {
        headers: { "User-Agent": "arcana-agent/0.1" },
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) return `HTTP ${res.status} for ${url}`
      const text = await res.text()
      const stripped = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      return stripped.slice(0, max) + (stripped.length > max ? `\n...(truncated, ${stripped.length} chars total)` : "")
    },
  )

  // ── Environment awareness tools ──────────────────────────
  runner.registerTool(
    "env_probe",
    {
      type: "function",
      function: {
        name: "env_probe",
        description: "Full environment scan: OS, shell, installed tools, disk, memory, network. Call to understand your environment.",
        parameters: { type: "object", properties: {} },
      },
    },
    async () => {
      const os = `${process.platform} ${process.arch}`
      const shell = process.env.SHELL ?? process.env.COMSPEC ?? "unknown"
      const node = process.version
      const bun = (Bun as any).version ?? "?"
      const cwd = process.cwd()
      const home = homedir()
      const tmp = process.env.TEMP ?? process.env.TMPDIR ?? "/tmp"

      const tools = ["git", "docker", "python", "python3", "node", "npm", "pnpm", "yarn", "cargo", "go", "rustc"]
        // Bun.which resolves PATH natively — no process spawn needed at all.
        .filter((t) => { try { return Bun.which(t).length > 0 } catch { return false } })

      return [
        `OS: ${os}`,
        `Shell: ${shell}`,
        `Node: ${node}  Bun: ${bun}`,
        `CWD: ${cwd}`,
        `Home: ${home}`,
        `Tmp: ${tmp}`,
        `Tools: ${tools.join(", ") || "none detected"}`,
      ].join("\n")
    },
  )

  runner.registerTool(
    "env_caps",
    {
      type: "function",
      function: {
        name: "env_caps",
        description: "List all available tools and their descriptions. Self-discover your own capabilities.",
        parameters: { type: "object", properties: {} },
      },
    },
    async () => {
      const defs = runner.getToolDefs()
      return defs.map((d) => `- **${d.function.name}**: ${d.function.description}`).join("\n")
    },
  )

  runner.registerTool(
    "env_paths",
    {
      type: "function",
      function: {
        name: "env_paths",
        description: "List arcana's configured directory paths (config, cache, data, skills, learned).",
        parameters: { type: "object", properties: {} },
      },
    },
    async () => [
      `Config: ${join(homedir(), ".arcana")}`,
      `Cache: ${join(homedir(), ".cache", "arcana")}`,
      `Data: ${join(homedir(), ".arcana", "data")}`,
      `Skills: ${join(homedir(), ".arcana", "skills")} (user) + repo skills/`,
      `Learned: ${join(homedir(), ".arcana", "learned")}`,
      `Prompts: ${join(homedir(), ".arcana", "prompts")}`,
      `Reflections: ${join(homedir(), ".arcana", "reflections")}`,
      `Strategies: ${join(homedir(), ".arcana", "strategies")}`,
    ].join("\n"),
  )

  runner.registerTool(
    "env_network",
    {
      type: "function",
      function: {
        name: "env_network",
        description: "Check network connectivity: DNS, HTTP, ping health endpoint.",
        parameters: { type: "object", properties: {} },
      },
    },
    async () => {
      const results: string[] = []
      try {
        const dns = await fetch("https://cloudflare-dns.com", { signal: AbortSignal.timeout(5000) })
        results.push(`DNS: OK (${dns.status})`)
      } catch { results.push("DNS: UNREACHABLE") }
      try {
        const models = await fetch("https://models.dev/api.json", { signal: AbortSignal.timeout(5000) })
        results.push(`Models.dev: OK (${Math.round((await models.text()).length / 1024)}KB)`)
      } catch { results.push("Models.dev: UNREACHABLE") }
      return results.join("\n")
    },
  )

  // ── Environment self-mutation tools (sandbox-only) ─────────
  runner.registerTool(
    "env_install",
    {
      type: "function",
      function: {
        name: "env_install",
        description: "Install a package into the sandbox. Requires --sandbox mode. Supported managers: npm, pip. (apt/cargo/go install would need root + network allowlist — open an issue if you need it.)",
        parameters: {
          type: "object",
          properties: {
            manager: { type: "string", description: "Package manager: npm, pip" },
            package: { type: "string", description: "Package name or spec" },
          },
          required: ["manager", "package"],
        },
      },
    },
    async (args) => {
      const manager = String(args.manager)
      const pkg = String(args.package)
      const cmds: Record<string, string[]> = {
        npm: ["npm", "install", "--prefix", join(homedir(), ".arcana", "sandbox"), pkg],
        pip: ["pip", "install", "--target", join(homedir(), ".arcana", "sandbox", "lib"), pkg],
      }
      const cmd = cmds[manager]
      if (!cmd) return `Unknown package manager: ${manager}. Supported: ${Object.keys(cmds).join(", ")}`
      try {
        const dir = join(homedir(), ".arcana", "sandbox")
        mkdirSync(dir, { recursive: true })
        const result = await gatedSpawn("env_install", cmd)
        return result.status === "EXECUTED"
          ? (result.exitCode === 0
              ? `Installed ${pkg} via ${manager}`
              : `Install failed: ${result.stderr.slice(0, 500)}`)
          : `Install blocked: ${formatGateResult(result)}`
      } catch (e) {
        return `Install error: ${e instanceof Error ? e.message : String(e)}`
      }
    },
  )

  runner.registerTool(
    "env_write",
    {
      type: "function",
      function: {
        name: "env_write",
        description: "Write a script to the sandbox and make it executable.",
        parameters: {
          type: "object",
          properties: {
            filename: { type: "string", description: "Script filename (e.g. analyze.py)" },
            content: { type: "string", description: "Script content" },
            interpreter: { type: "string", description: "Interpreter: python3, node, bash" },
          },
          required: ["filename", "content"],
        },
      },
    },
    async (args) => {
      const dir = join(homedir(), ".arcana", "sandbox")
      try {
        mkdirSync(dir, { recursive: true })
        const fp = resolveSandboxScriptPath(dir, args.filename)
        writeFileSync(fp, String(args.content), { encoding: "utf8", mode: 0o600 })
        try {
          await gatedSpawn("env_write", ["chmod", "+x", fp])
        } catch {
          /* Windows / no chmod */
        }
        return `Script written: ${fp}`
      } catch (e) {
        return `env_write rejected: ${e instanceof Error ? e.message : String(e)}`
      }
    },
  )

  runner.registerTool(
    "env_clean",
    {
      type: "function",
      function: {
        name: "env_clean",
        description: "Reset the sandbox to its initial state (deletes all sandbox files).",
        parameters: { type: "object", properties: {} },
      },
    },
    async () => {
      const dir = join(homedir(), ".arcana", "sandbox")
      try {
        const { rmSync } = await import("node:fs")
        if (existsSync(dir)) { rmSync(dir, { recursive: true, force: true }); return "Sandbox reset." }
        return "Sandbox is already clean."
      } catch (e) {
        return `Clean error: ${e instanceof Error ? e.message : String(e)}`
      }
    },
  )

  runner.registerTool(
    "git_status",
    {
      type: "function",
      function: {
        name: "git_status",
        description: "Show git working tree status — staged, unstaged, untracked files, branch name, ahead/behind remote.",
        parameters: { type: "object", properties: { path: { type: "string", description: "Optional repo path (defaults to cwd)" } } },
      },
    },
    async (args) => {
      const cwd = args.path ? String(args.path) : process.cwd()
      try {
        const branch = await runGit("git_status", ["branch", "--show-current"], { cwd })
        const status = await runGit("git_status", ["status", "--short"], { cwd })
        const ahead = await runGit("git_status", ["rev-list", "--count", "@{upstream}..HEAD"], { cwd, ignoreErrors: true }) || "0"
        const behind = await runGit("git_status", ["rev-list", "--count", "HEAD..@{upstream}"], { cwd, ignoreErrors: true }) || "0"
        const lines = [`Branch: ${branch}`]
        if (ahead !== "0") lines.push(`Ahead: ${ahead} commits`)
        if (behind !== "0") lines.push(`Behind: ${behind} commits`)
        if (status) lines.push("", "Changes:", status)
        else lines.push("", "Working tree clean.")
        return lines.join("\n")
      } catch (e: any) {
        if (e.message?.includes("not a git repository")) return "Not a git repository."
        return `Git error: ${e.message ?? String(e)}`
      }
    },
  )

  runner.registerTool(
    "git_diff",
    {
      type: "function",
      function: {
        name: "git_diff",
        description: "Show git diff for staged, unstaged, or specific files. Use before committing to review changes.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Optional repo path" },
            staged: { type: "boolean", description: "Show staged diff (default: unstaged)" },
            file: { type: "string", description: "Optional file path to filter diff" },
          },
        },
      },
    },
    async (args) => {
      const cwd = args.path ? String(args.path) : process.cwd()
      try {
        const diff = await runGit("git_diff", gitDiffArgs({ staged: args.staged, file: args.file }), { cwd, maxBuffer: 1024 * 1024 })
        if (!diff) return "No changes to show."
        return diff.length > 3000 ? diff.slice(0, 3000) + `\n...(truncated, ${diff.length} chars)` : diff
      } catch (e: any) {
        if (e.message?.includes("not a git repository")) return "Not a git repository."
        return `Git error: ${e.message ?? String(e)}`
      }
    },
  )

  runner.registerTool(
    "git_commit",
    {
      type: "function",
      function: {
        name: "git_commit",
        description: "Stage and commit changes. Use after code changes are complete. Supports conventional commits.",
        parameters: {
          type: "object",
          properties: {
            message: { type: "string", description: "Commit message. Use conventional commits format (feat:, fix:, docs:, etc)." },
            files: { type: "string", description: "Optional: specific files to stage (space-separated). Defaults to all." },
            path: { type: "string", description: "Optional repo path" },
          },
          required: ["message"],
        },
      },
    },
    async (args) => {
      const cwd = args.path ? String(args.path) : process.cwd()
      try {
        await runGit("git_commit", gitAddArgs(args.files), { cwd })
        await runGit("git_commit", gitCommitArgs(args.message), { cwd })
        const hash = await runGit("git_commit", ["rev-parse", "HEAD"], { cwd }).slice(0, 8)
        return `Committed: ${hash} — ${String(args.message)}`
      } catch (e: any) {
        if (e.message?.includes("not a git repository")) return "Not a git repository."
        if (e.message?.includes("nothing to commit")) return "Nothing to commit. Stage files first or check git_status."
        return `Commit error: ${e.message ?? String(e)}`
      }
    },
  )

  runner.registerTool(
    "git_autocommit",
    {
      type: "function",
      function: {
        name: "git_autocommit",
        description: "Automatically stage all changes, generate a conventional commit message, and commit. Run when goal_check reports complete or after significant progress.",
        parameters: {
          type: "object",
          properties: {
            message: { type: "string", description: "Optional: override the auto-generated commit message" },
            path: { type: "string", description: "Optional: repo path" },
            push: { type: "boolean", description: "Optional: push after commit (default false)" },
          },
        },
      },
    },
    async (args) => {
      const cwd = args.path ? String(args.path) : process.cwd()
      try {
        let msg = args.message ? String(args.message) : ""
        if (!msg) {
          const diffStat = await runGit("git_autocommit", ["diff", "--stat"], { cwd, maxBuffer: 1024 * 100 })
          const filesChanged = diffStat ? diffStat.split("\n").length : 0
          const branch = await runGit("git_status", ["branch", "--show-current"], { cwd })
          const _added = await runGit("git_autocommit", ["diff", "--cached", "--name-only"], { cwd, ignoreErrors: true })
          msg = `feat: update ${filesChanged > 0 ? filesChanged + " files" : "working state"} (${branch})`
        }
        await runGit("git_autocommit", ["add", "-A"], { cwd })
        await runGit("git_autocommit", gitCommitArgs(msg), { cwd })
        const hash = await runGit("git_commit", ["rev-parse", "HEAD"], { cwd }).slice(0, 8)
        let result = `✅ Committed ${hash}: ${msg}`
        if (args.push) {
          await runGit("git_push", ["push"], { cwd })
          result += `\n📤 Pushed to origin`
        }
        return result
      } catch (e: any) {
        if (e.message?.includes("nothing to commit")) return "Nothing to commit."
        return `Error: ${e.message ?? String(e)}`
      }
    },
  )

  // ── Meta-cognition tools ──────────────────────────────────

  runner.registerTool(
    "reflect",
    {
      type: "function",
      function: {
        name: "reflect",
        description: "Self-review: analyze what went well, what failed, and why. Use after completing a task or hitting a dead end.",
        parameters: {
          type: "object",
          properties: {
            outcome: { type: "string", description: "What was the outcome? (success, partial, failed, stuck)" },
            analysis: { type: "string", description: "What went well, what didn't, and why?" },
            lesson: { type: "string", description: "What would you do differently next time?" },
          },
          required: ["outcome", "analysis", "lesson"],
        },
      },
    },
    async (args) => {
      const entry = {
        outcome: String(args.outcome),
        analysis: String(args.analysis),
        lesson: String(args.lesson),
        ts: new Date().toISOString(),
      }
      // Persist reflection to learned entries
      const dir = join(homedir(), ".arcana", "reflections")
      mkdirSync(dir, { recursive: true })
      const id = `reflection-${Date.now()}`
      writeFileSync(join(dir, `${id}.md`), `# Reflection\n\n**Outcome:** ${entry.outcome}\n\n**Analysis:** ${entry.analysis}\n\n**Lesson:** ${entry.lesson}\n`, "utf8")
      return `Reflection saved. ${entry.lesson ? `Lesson: ${entry.lesson.slice(0, 100)}` : ""}`
    },
  )

  runner.registerTool(
    "loop_detect",
    {
      type: "function",
      function: {
        name: "loop_detect",
        description: "Check if you're stuck in a loop — repeating the same tool calls. Call when progress stalls.",
        parameters: { type: "object", properties: {} },
      },
    },
    async () => {
      const recent = toolHistory.slice(-10)
      if (recent.length < 4) return "Not enough history to detect loops."
      const counts = new Map<string, number>()
      for (const t of recent) counts.set(t.name, (counts.get(t.name) ?? 0) + 1)
      const repeats = [...counts.entries()].filter(([, c]) => c >= 3)
      if (repeats.length) {
        return `⚠️ Loop detected! Repeated tools: ${repeats.map(([n, c]) => `${n} (${c}x)`).join(", ")}. Consider changing strategy, asking for help, or trying a different approach.`
      }
      return "No loop detected. Recent tool calls are varied."
    },
  )

  runner.registerTool(
    "goal_set",
    {
      type: "function",
      function: {
        name: "goal_set",
        description: "Record an explicit multi-step mutation objective. Do not call for greetings, explanations, reviews, or simple read-only requests.",
        parameters: {
          type: "object",
          properties: {
            goal: { type: "string", description: "The user's goal — what they asked to be done. Be specific and complete." },
            scope: { type: "string", description: "Scope boundaries: what's in scope, what's explicitly out of scope." },
            priority: { type: "string", enum: ["high", "medium", "low"], description: "How important is this goal?" },
          },
          required: ["goal"],
        },
      },
    },
    async (args) => {
      const goal = String(args.goal)
      const scope = args.scope ? String(args.scope) : "not specified"
      const priority = String(args.priority ?? "medium") as "high" | "medium" | "low"
      const sessionId =
        (typeof process.env.ARCANA_SESSION_ID === "string" && process.env.ARCANA_SESSION_ID.trim()
          ? process.env.ARCANA_SESSION_ID.trim()
          : "")
        || `cli-${process.cwd().replace(/[^a-zA-Z0-9]+/g, "_").slice(-48)}`
      try {
        const { getSessionGoal, setSessionGoal } = await import("@arcana/core/session/goal")
        const current = getSessionGoal(sessionId)
        if (current.status === "complete_pending_verify") {
          return "Goal is awaiting independent verification. Do not replace it to unlock mutations; wait for the verdict or ask the user to use /goal for an explicit new objective."
        }
        setSessionGoal(sessionId, {
          goal,
          scope,
          priority,
          status: "in_progress",
          boardSessionID: sessionId,
        })
        runner.beginGoalEvidence()
      } catch {
        /* core store optional if path unavailable */
      }
      const _board = initBoard(sessionId, goal, scope)
      return `Goal recorded: "${goal}"\nScope: ${scope}\nPriority: ${priority}\nSession: ${sessionId}\nKanban board initialized.\nThis goal is now active — all actions MUST align with it.`
    },
  )

  runner.registerTool(
    "goal_check",
    {
      type: "function",
      function: {
        name: "goal_check",
        description: "CHECK IN on goal progress. Call periodically to verify the active goal is being achieved. Reports what's done, what's pending, what's blocked. If the goal is fully achieved, this will tell you to stop.",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["in_progress", "complete", "blocked", "stale"], description: "Current status of the work" },
            done: { type: "string", description: "What has been accomplished so far." },
            pending: { type: "string", description: "What still needs to be done." },
            blocked: { type: "string", description: "Any blockers or obstacles." },
          },
          required: ["status"],
        },
      },
    },
    async (args) => {
      const status = String(args.status)
      const done = args.done ? String(args.done) : "nothing yet"
      const pending = args.pending ? String(args.pending) : "unknown"
      const blocked = args.blocked ? String(args.blocked) : "none"

      const sessionId =
        (typeof process.env.ARCANA_SESSION_ID === "string" && process.env.ARCANA_SESSION_ID.trim()
          ? process.env.ARCANA_SESSION_ID.trim()
          : "")
        || `cli-${process.cwd().replace(/[^a-zA-Z0-9]+/g, "_").slice(-48)}`

      // Session goal state is authoritative. Persistent memory must never
      // masquerade as the runtime's active goal.
      let goalLine = "No active goal set. Call goal_set first."
      let verificationLine: string | undefined
      try {
        const {
          getSessionGoal,
          patchSessionGoal,
          claimSessionGoalCompletion,
          resolveSessionGoalVerification,
          startSessionGoalVerification,
        } = await import("@arcana/core/session/goal")
        const snap = getSessionGoal(sessionId)
        if (snap.status !== "unset") {
          goalLine = snap.goal
          if (status === "complete") {
            const claimed = claimSessionGoalCompletion(sessionId)
            if (claimed.status === "complete_pending_verify") {
              startSessionGoalVerification({
                sessionID: sessionId,
                goalID: claimed.goalID,
                revision: claimed.revision,
              })
              try {
                const verdict = await runner.verifyGoalCompletion({
                  goal: claimed.goal,
                  scope: claimed.scope,
                  done,
                  pending,
                  blocked,
                })
                const resolved = resolveSessionGoalVerification({
                  sessionID: sessionId,
                  goalID: claimed.goalID,
                  revision: claimed.revision,
                  result: verdict,
                })
                verificationLine = resolved.applied
                  ? verdict.verdict === "verified"
                    ? `VERIFIED: ${verdict.summary}`
                    : `REJECTED: ${verdict.summary}`
                  : "STALE VERDICT: the goal changed before verification completed."
              } catch (error) {
                resolveSessionGoalVerification({
                  sessionID: sessionId,
                  goalID: claimed.goalID,
                  revision: claimed.revision,
                  result: {
                    verdict: "error",
                    summary: error instanceof Error ? error.message : String(error),
                    unmetCriteria: ["Independent verification could not complete."],
                    evidenceRefs: [],
                  },
                })
                verificationLine = "VERIFIER ERROR: goal blocked pending operator review."
              }
            }
          } else if (status === "blocked") {
            patchSessionGoal(sessionId, { status: "blocked" })
          } else if (status === "stale") {
            patchSessionGoal(sessionId, { status: "stale" })
          } else {
            patchSessionGoal(sessionId, { status: "in_progress" })
          }
        }
      } catch {}

      // Record the check-in
      const checkId = `check-${Date.now()}`
      const dir = join(homedir(), ".arcana", "reflections")
      mkdirSync(dir, { recursive: true })
      const entry = [
        `# Goal Check: ${checkId}`,
        "",
        `**Status:** ${status}`,
        `**Done:** ${done}`,
        `**Pending:** ${pending}`,
        `**Blocked:** ${blocked}`,
        `**Time:** ${new Date().toISOString()}`,
      ].join("\n")
      writeFileSync(join(dir, `${checkId}.md`), entry, "utf8")

      const lines = [`## Goal Check-in\n`, `**Active Goal:** ${goalLine}`]
      lines.push(`**Status:** ${status === "complete" ? "✅ Complete" : status === "blocked" ? "❌ Blocked" : status === "stale" ? "⚠️ Stale" : "🔄 In Progress"}`)
      lines.push(`**Done:** ${done}`)
      if (pending) lines.push(`**Pending:** ${pending}`)
      if (blocked !== "none") lines.push(`**Blocked:** ${blocked}`)

      if (status === "complete") {
        lines.push(
          "",
          verificationLine ?? "Completion claim could not be verified because no active goal was found.",
          verificationLine?.startsWith("VERIFIED:")
            ? "The verified goal was archived and the active slot was cleared."
            : "The same goal remains active or blocked. Do not invent a replacement goal to unlock tools.",
        )
      } else if (status === "blocked") {
        lines.push("", "⛔ Blocked. Consider asking the user for help or changing approach.")
      } else if (status === "stale") {
        lines.push("", "⚠️ Goal may be stale. Reconsider if this is still the right objective.")
      }

      return lines.join("\n")
    },
  )

  runner.registerTool(
    "kanban",
    {
      type: "function",
      function: {
        name: "kanban",
        description: "MANAGE the goal kanban board. Use init to create a board, add to add tasks, move to change status, view to see the full board. Board data is auto-saved as vault wiki.",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", enum: ["init", "add", "move", "view", "archive"], description: "init: create board for goal. add: add a card. move: change card status. view: show full board. archive: remove done cards." },
            title: { type: "string", description: "Card title (required for add, optional for move)." },
            description: { type: "string", description: "Card description (for add)." },
            card_id: { type: "string", description: "Card ID to move or archive (for move)." },
            status: { type: "string", enum: ["backlog", "in_progress", "done", "blocked"], description: "Target status (for move)." },
            priority: { type: "string", enum: ["high", "medium", "low"], description: "Card priority (for add)." },
            session_id: { type: "string", description: "Session ID for the board (auto-generated by goal_set if omitted)." },
          },
          required: ["command"],
        },
      },
    },
    async (args) => {
      const cmd = String(args.command)
      const sid = args.session_id ? String(args.session_id) : `goal-${Date.now()}`
      let board = loadBoard(sid)

      if (cmd === "init") {
        const goal = args.title ? String(args.title) : "untitled goal"
        board = initBoard(sid, goal, String(args.description ?? ""))
        return formatBoard(board)
      }

      if (!board) return "No kanban board found for this session. Call goal_set first or use `kanban init`."

      if (cmd === "add") {
        if (!args.title) return "title is required for add."
        addCard(board, String(args.title), String(args.description ?? ""), (args.priority as KanbanCard["priority"]) ?? "medium")
        saveBoard(sid, board)
        return `Card added: "${args.title}"\n${formatBoard(board)}`
      }

      if (cmd === "move") {
        if (!args.card_id || !args.status) return "card_id and status are required for move."
        const card = moveCard(board, String(args.card_id), args.status as KanbanCard["status"])
        if (!card) return `Card not found: ${args.card_id}`
        return `Card moved to ${args.status}: "${card.title}"\n${formatBoard(board)}`
      }

      if (cmd === "archive") {
        const count = archiveDone(board)
        return `Archived ${count} done cards.\n${formatBoard(board)}`
      }

      return formatBoard(board)
    },
  )

  runner.registerTool(
    "session_summary",
    {
      type: "function",
      function: {
        name: "session_summary",
        description: "Generate a summary of the current session — total tokens, cost, tool calls, duration, files changed. Call at session end or when goal_check reports complete.",
        parameters: {
          type: "object",
          properties: {
            files_changed: { type: "string", description: "Comma-separated list of files changed this session" },
            highlights: { type: "string", description: "Key accomplishments or decisions made" },
            duration: { type: "string", description: "Optional session duration string" },
          },
        },
      },
    },
    async (args) => {
      const files = args.files_changed ? String(args.files_changed) : "none recorded"
      const highlights = args.highlights ? String(args.highlights) : "none recorded"
      const duration = args.duration ? String(args.duration) : "unknown"

      const toolCounts = new Map<string, number>()
      for (const t of toolHistory) {
        toolCounts.set(t.name, (toolCounts.get(t.name) ?? 0) + 1)
      }
      const totalToolCalls = toolHistory.length
      const topTools = [...toolCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => `${name} (${count}x)`)
        .join(", ")

      const lines = [
        "## Session Summary",
        "",
        `**Duration:** ${duration}`,
        `**Total tool calls:** ${totalToolCalls}`,
        `**Top tools:** ${topTools || "none"}`,
        `**Files changed:** ${files}`,
        `**Highlights:** ${highlights}`,
        "",
        "Record session summary to memory? Call memory_store_fact with key 'session.summary' to persist.",
      ]

      const dir = join(homedir(), ".arcana", "reflections")
      mkdirSync(dir, { recursive: true })
      const id = `summary-${Date.now()}`
      writeFileSync(join(dir, `${id}.md`), lines.join("\n"), "utf8")

      return lines.join("\n")
    },
  )

  runner.registerTool(
    "confidence_check",
    {
      type: "function",
      function: {
        name: "confidence_check",
        description: "Rate your confidence in the current approach (0-1). Call before critical or irreversible actions.",
        parameters: {
          type: "object",
          properties: {
            rating: { type: "number", description: "Confidence from 0.0 (guessing) to 1.0 (certain)" },
            rationale: { type: "string", description: "Why this rating?" },
          },
          required: ["rating", "rationale"],
        },
      },
    },
    async (args) => {
      const rating = Math.max(0, Math.min(1, Number(args.rating ?? 0.5)))
      const msg = rating < 0.4 ? "⚠️ Low confidence — consider gathering more info or asking the user." :
        rating < 0.7 ? "Moderate confidence — proceed with caution." :
        "High confidence — proceed."
      return `${msg} (${Math.round(rating * 100)}%)\nRationale: ${String(args.rationale)}`
    },
  )

  runner.registerTool(
    "success_rate",
    {
      type: "function",
      function: {
        name: "success_rate",
        description: "Query your own tool success/failure statistics from past sessions.",
        parameters: {
          type: "object",
          properties: {
            tool: { type: "string", description: "Optional: filter to specific tool name" },
          },
        },
      },
    },
    async (args) => {
      const stats = memory.getRecentSkillStats(20)
      const filtered = args.tool ? stats.filter((s) => s.skillId.includes(String(args.tool))) : stats
      if (!filtered.length) return "No tool usage data yet."
      return filtered.map((s) => `${s.skillId}: ${s.recent} recent / ${s.total} total`).join("\n")
    },
  )

  runner.registerTool(
    "prompt_propose",
    {
      type: "function",
      function: {
        name: "prompt_propose",
        description: "Propose an improvement to your own system prompt based on experience. Saved and scored over time.",
        parameters: {
          type: "object",
          properties: {
            change: { type: "string", description: "What to change (add, remove, rephrase, restructure)" },
            new_text: { type: "string", description: "The proposed new prompt text (full system prompt)" },
            reason: { type: "string", description: "Why this change improves performance" },
          },
          required: ["change", "new_text", "reason"],
        },
      },
    },
    async (args) => {
      const dir = join(homedir(), ".arcana", "prompts")
      mkdirSync(dir, { recursive: true })
      const id = `v${Date.now()}`
      const entry = {
        change: String(args.change),
        new_text: String(args.new_text),
        reason: String(args.reason),
        score: 0,
        ts: new Date().toISOString(),
      }
      writeFileSync(join(dir, `${id}.json`), JSON.stringify(entry, null, 2), "utf8")
      return `Prompt proposal saved as ${id}. Score: 0 (will be evaluated over next sessions). Reason: ${String(args.reason).slice(0, 100)}`
    },
  )

  runner.registerTool(
    "strategy_log",
    {
      type: "function",
      function: {
        name: "strategy_log",
        description: "Record the approach you used and its outcome. Builds a dataset for future strategy selection.",
        parameters: {
          type: "object",
          properties: {
            task: { type: "string", description: "What were you trying to accomplish?" },
            approach: { type: "string", description: "What approach did you take?" },
            outcome: { type: "string", description: "success, partial, or failed" },
            tools_used: { type: "array", items: { type: "string" }, description: "Which tools were used?" },
          },
          required: ["task", "approach", "outcome"],
        },
      },
    },
    async (args) => {
      const dir = join(homedir(), ".arcana", "strategies")
      mkdirSync(dir, { recursive: true })
      const id = `strategy-${Date.now()}`
      const entry = {
        task: String(args.task),
        approach: String(args.approach),
        outcome: String(args.outcome),
        tools_used: args.tools_used ? (args.tools_used as string[]).map(String) : [],
        ts: new Date().toISOString(),
      }
      writeFileSync(join(dir, `${id}.json`), JSON.stringify(entry, null, 2), "utf8")
      return `Strategy logged: ${entry.outcome}. ${entry.tools_used.length ? `Tools: ${entry.tools_used.join(", ")}` : ""}`
    },
  )

  runner.registerTool(
    "artifact_save",
    {
      type: "function",
      function: {
        name: "artifact_save",
        description: "Save research, findings, or generated content as a persistent artifact with version tracking. Returns artifact ID and version number.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short title for the artifact" },
            content: { type: "string", description: "Full content to save (markdown supported)" },
            type: { type: "string", enum: ["markdown", "code", "svg", "html", "diagram"], description: "Type of artifact content" },
            tags: { type: "array", items: { type: "string" }, description: "Optional tags for categorization" },
          },
          required: ["title", "content"],
        },
      },
    },
    async (args) => {
      const id = `art-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      const artifact = createArtifact(
        id,
        String(args.title),
        String(args.content),
        (args.type as any) ?? "markdown",
        undefined,
        args.tags ? (args.tags as string[]).map(String) : [],
      )
      const { writeFileSync, mkdirSync, existsSync: _existsSync, readFileSync: _readFileSync } = await import("node:fs")
      const { join } = await import("node:path")
      const { homedir } = await import("node:os")
      const dir = join(homedir(), ".arcana", "artifacts")
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${id}.json`), JSON.stringify(artifact, null, 2), "utf8")
      return `Artifact saved: ${artifact.title} (v${artifact.current_version})\nID: ${id}\nType: ${artifact.type}`
    },
  )

  runner.registerTool(
    "artifact_update",
    {
      type: "function",
      function: {
        name: "artifact_update",
        description: "Update an existing artifact by ID. Creates a new version. Previous versions are preserved.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "Artifact ID to update" },
            content: { type: "string", description: "New content for the new version" },
          },
          required: ["id", "content"],
        },
      },
    },
    async (args) => {
      const { readFileSync, writeFileSync, existsSync } = await import("node:fs")
      const { join } = await import("node:path")
      const { homedir } = await import("node:os")
      const dir = join(homedir(), ".arcana", "artifacts")
      const filePath = join(dir, `${String(args.id)}.json`)
      if (!existsSync(filePath)) return `Artifact not found: ${args.id}`
      const artifact = JSON.parse(readFileSync(filePath, "utf8"))
      addVersion(artifact, String(args.content))
      writeFileSync(filePath, JSON.stringify(artifact, null, 2), "utf8")
      return `Artifact updated: ${artifact.title} (v${artifact.current_version})`
    },
  )

  runner.registerTool(
    "artifact_search",
    {
      type: "function",
      function: {
        name: "artifact_search",
        description: "Search saved artifacts by query (title, content, tags)",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            limit: { type: "number", description: "Max results (default 10)" },
            type: { type: "string", description: "Optional: filter by artifact type" },
          },
          required: ["query"],
        },
      },
    },
    async (args) => {
      const { readFileSync, existsSync } = await import("node:fs")
      const { join } = await import("node:path")
      const { homedir } = await import("node:os")
      const dir = join(homedir(), ".arcana", "artifacts")
      const q = String(args.query).toLowerCase()
      const limit = Number(args.limit ?? 10)
      const typeFilter = args.type ? String(args.type) : null
      const results: any[] = []
      if (!existsSync(dir)) return "No artifacts found."
      const files = await import("node:fs").then(m => m.readdirSync(dir))
      for (const file of files) {
        if (!file.endsWith(".json")) continue
        const artifact = JSON.parse(readFileSync(join(dir, file), "utf8"))
        if (typeFilter && artifact.type !== typeFilter) continue
        if (artifact.title.toLowerCase().includes(q) || artifact.content.toLowerCase().includes(q)) {
          results.push(artifact)
          if (results.length >= limit) break
        }
      }
      if (!results.length) return "No artifacts found."
      return results.map((a) => `[${a.id}] ${a.title} (v${a.current_version})${a.type ? ` [${a.type}]` : ""}`).join("\n")
    },
  )

  runner.registerTool(
    "artifact_get",
    {
      type: "function",
      function: {
        name: "artifact_get",
        description: "Retrieve a saved artifact by ID",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "Artifact ID or prefix (first 8 chars)" },
            version: { type: "number", description: "Optional: specific version to retrieve" },
          },
          required: ["id"],
        },
      },
    },
    async (args) => {
      const { readFileSync, existsSync, readdirSync } = await import("node:fs")
      const { join } = await import("node:path")
      const { homedir } = await import("node:os")
      const dir = join(homedir(), ".arcana", "artifacts")
      const id = String(args.id)
      let filePath = join(dir, `${id}.json`)
      if (!existsSync(filePath)) {
        // The param is documented as "ID or prefix (first 8 chars)" — honor that:
        // fall back to the first artifact whose filename starts with the prefix.
        const match = existsSync(dir)
          ? readdirSync(dir).find((f) => f.endsWith(".json") && f.startsWith(id))
          : undefined
        if (!match) return `Artifact not found: ${id}`
        filePath = join(dir, match)
      }
      const artifact = JSON.parse(readFileSync(filePath, "utf8"))
      const version = args.version ? Number(args.version) : undefined
      if (version) {
        const v = getArtifactVersion(artifact, version)
        if (!v) return `Version ${version} not found for artifact ${id}`
        return `# ${artifact.title} (v${version})\n${artifact.tags ? `tags: ${artifact.tags}\n` : ""}\n${v}`
      }
      return `# ${artifact.title}${artifact.type ? ` [${artifact.type}]` : ""} (v${artifact.current_version})\n${artifact.tags ? `tags: ${artifact.tags}\n` : ""}\n${artifact.content}`
    },
  )

  runner.registerTool(
    "code_review",
    {
      type: "function",
      function: {
        name: "code_review",
        description: "Review staged or unstaged code changes for bugs, security issues, and style problems. Call before committing or when asked to review code.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Optional: repo path" },
            staged: { type: "boolean", description: "Review staged changes (default true)" },
            file: { type: "string", description: "Optional: specific file to review" },
            severity: { type: "string", enum: ["all", "error", "warning"], description: "Minimum severity to report (default: all)" },
          },
        },
      },
    },
    async (args) => {
      const cwd = args.path ? String(args.path) : process.cwd()
      const staged = args.staged !== false
      try {
        const diff = await runGit("git_diff", gitDiffArgs({ staged, file: args.file }), { cwd, maxBuffer: 1024 * 1024 })
        if (!diff.trim()) return "No changes to review."
        return `## Code Review\n\n\`\`\`diff\n${diff.slice(0, 4000)}\`\`\`\n\nReview the changes above. Focus on:\n1. Logic errors or bugs\n2. Security vulnerabilities\n3. Style inconsistencies\n4. Missing edge cases\n5. Performance concerns\n\nRate severity: 🔴 critical / 🟡 warning / 🟢 info`
      } catch (e: any) {
        if (e.message?.includes("not a git repository")) return "Not a git repository."
        return `Error: ${e.message ?? String(e)}`
      }
    },
  )

  runner.registerTool(
    "glob",
    {
      type: "function",
      function: {
        name: "glob",
        description: "Search for files matching a glob pattern. Uses gitignore-aware fast globbing.",
        parameters: {
          type: "object",
          properties: {
            pattern: { type: "string", description: "Glob pattern (e.g. **/*.ts, src/**/*.tsx)" },
            path: { type: "string", description: "Optional: directory to search (defaults to cwd)" },
          },
          required: ["pattern"],
        },
      },
    },
    async (args) => {
      const { join: _join } = await import("node:path")
      const cwd = args.path ? String(args.path) : process.cwd()
      try {
        const { Glob } = await import("bun")
        const glob = new Glob(String(args.pattern))
        const results: string[] = []
        for await (const file of glob.scan({ cwd, absolute: true })) {
          results.push(file)
          if (results.length >= 100) break
        }
        if (!results.length) return `No files matching "${args.pattern}"`
        return results.map((f) => `  ${f}`).join("\n")
      } catch (e) {
        return `Glob error: ${e instanceof Error ? e.message : String(e)}`
      }
    },
  )

  runner.registerTool(
    "grep",
    {
      type: "function",
      function: {
        name: "grep",
        description: "Search file contents using a regex pattern. Returns matching lines with line numbers.",
        parameters: {
          type: "object",
          properties: {
            pattern: { type: "string", description: "Regex pattern to search for" },
            path: { type: "string", description: "Optional: directory or file to search (defaults to cwd)" },
            include: { type: "string", description: "Optional: file glob filter (e.g. *.ts)" },
            maxResults: { type: "number", description: "Max results (default 50)" },
          },
          required: ["pattern"],
        },
      },
    },
    async (args) => {
      const cwd = args.path ? String(args.path) : process.cwd()
      const maxResults = Number(args.maxResults ?? 50)
      try {
        // Pass args directly (no shell) — avoids the cross-platform `2>nul || true`
        // breakage (stray `nul` file on POSIX, `'true' not recognized` on Windows)
        // and shell injection from the model-supplied pattern. `--glob` is rg's
        // include filter (`--include` is GNU grep, which rg rejects). `--` ends flags.
        const rgArgs = ["-n", "--no-heading"]
        if (args.include) rgArgs.push("--glob", String(args.include))
        rgArgs.push("--", String(args.pattern), cwd)
        const result = await gatedSpawn("grep", ["rg", ...rgArgs])
        if (result.status !== "EXECUTED") return formatGateResult(result)
        if (result.exitCode !== 0 && result.exitCode !== 1) {
          // rg exit 1 = no matches; anything else is a real failure
          return `Grep error: ripgrep exited ${result.exitCode}: ${result.stderr.slice(0, 300)}`
        }
        const output = result.stdout.trim()
        if (!output) return `No matches for "${args.pattern}"`
        const all = output.split("\n")
        const lines = all.slice(0, maxResults)
        return lines.join("\n") + (all.length > maxResults ? `\n... (${all.length - maxResults} more matches)` : "")
      } catch (e) {
        return `Grep error: ${e instanceof Error ? e.message : String(e)}`
      }
    },
  )

  runner.registerTool(
    "read",
    {
      type: "function",
      function: {
        name: "read",
        description: "Read a file's contents (cat-style, with line numbers). Use FIRST before edit/apply_patch so you know what the file looks like.",
        parameters: {
          type: "object",
          properties: {
            filePath: { type: "string", description: "Path to the file to read" },
            offset: { type: "number", description: "Optional: starting line (1-indexed)" },
            limit: { type: "number", description: "Optional: max lines to read (default 2000)" },
          },
          required: ["filePath"],
        },
      },
    },
    async (args) => {
      const { readFileSync, existsSync } = await import("node:fs")
      const fp = String(args.filePath)
      if (!existsSync(fp)) return `File not found: ${fp}`
      try {
        const content = readFileSync(fp, "utf8")
        const lines = content.split("\n")
        // Clamp: offset is 1-indexed and limit positive. Guards against
        // offset<=0 → slice(-1,…) returning garbage from the end of the file.
        const offset = Math.max(1, Number(args.offset ?? 1) || 1)
        const limit = Math.max(1, Number(args.limit ?? 2000) || 2000)
        const selected = lines.slice(offset - 1, offset - 1 + limit)
        return selected.map((l, i) => `${offset + i}:${l}`).join("\n") +
          (lines.length > offset + limit - 1 ? `\n... (${lines.length - offset - limit + 1} more lines)` : "")
      } catch (e) {
        return `Read error: ${e instanceof Error ? e.message : String(e)}`
      }
    },
  )

  runner.registerTool(
    "write",
    {
      type: "function",
      function: {
        name: "write",
        description: "Create a new file or overwrite an existing file with content. Use for NEW files or FULL rewrites; prefer edit for targeted changes to existing files.",
        parameters: {
          type: "object",
          properties: {
            filePath: { type: "string", description: "Path where to write the file" },
            content: { type: "string", description: "Full file content" },
          },
          required: ["filePath", "content"],
        },
      },
    },
    async (args) => {
      const { writeFileSync, mkdirSync } = await import("node:fs")
      const { dirname } = await import("node:path")
      const fp = String(args.filePath)
      try {
        mkdirSync(dirname(fp), { recursive: true })
        writeFileSync(fp, String(args.content), "utf8")
        return `Written ${fp} (${String(args.content).length} chars)`
      } catch (e) {
        return `Write error: ${e instanceof Error ? e.message : String(e)}`
      }
    },
  )

  runner.registerTool(
    "edit",
    {
      type: "function",
      function: {
        name: "edit",
        description: "Edit an existing file by find-and-replace. oldString must match exactly. Use for SMALL targeted changes — safer than write/apply_patch. Read first if unsure of current contents.",
        parameters: {
          type: "object",
          properties: {
            filePath: { type: "string", description: "File to edit" },
            oldString: { type: "string", description: "Text to find (must match exactly)" },
            newString: { type: "string", description: "Replacement text" },
          },
          required: ["filePath", "oldString", "newString"],
        },
      },
    },
    async (args) => {
      const { readFileSync, writeFileSync } = await import("node:fs")
      const fp = String(args.filePath)
      try {
        const content = readFileSync(fp, "utf8")
        const oldStr = String(args.oldString)
        const newStr = String(args.newString)
        if (!content.includes(oldStr)) return `Error: oldString not found in ${fp}`
        const updated = content.replace(oldStr, newStr)
        writeFileSync(fp, updated, "utf8")
        return `Edited ${fp} — replaced "${oldStr.slice(0, 40)}..."`
      } catch (e) {
        return `Edit error: ${e instanceof Error ? e.message : String(e)}`
      }
    },
  )

  runner.registerTool(
    "batch",
    {
      type: "function",
      function: {
        name: "batch",
        description:
          "Execute multiple INDEPENDENT read/network tool calls in parallel (bounded). " +
          "Use ONLY for independent reads (files, greps, status). DO NOT batch dependent calls. " +
          "Server allowlist (enforced): glob, grep, read, web_fetch, web_search, git_status, git_diff, env_probe, artifact_get, memory_search. " +
          "Writes/shell are rejected. Max 16 calls; sub-calls re-run full auth/sandbox/timeout.",
        parameters: {
          type: "object",
          properties: {
            calls: {
              type: "array",
              maxItems: 16,
              items: {
                type: "object",
                properties: {
                  tool: {
                    type: "string",
                    description: "Allowlisted tool name (reads/network only)",
                    enum: [
                      "glob",
                      "grep",
                      "read",
                      "web_fetch",
                      "web_search",
                      "git_status",
                      "git_diff",
                      "env_probe",
                      "artifact_get",
                      "memory_search",
                    ],
                  },
                  args: { type: "object", description: "Arguments for the tool" },
                },
                required: ["tool", "args"],
              },
              description: "Independent allowlisted tool calls (max 16)",
            },
          },
          required: ["calls"],
        },
      },
    },
    async (args) => {
      // AgentRunner intercepts "batch" and runs validateAndPlanBatch + runBatchWaves.
      // This stub is only for out-of-loop invocation (tests / direct registry).
      const calls = args.calls as Array<{ tool: string; args: Record<string, unknown> }> | undefined
      if (!calls?.length) return "No calls provided"
      return `Batch of ${calls.length} call(s) will run via the agent loop under the nested allowlist and bounded scheduler.`
    },
  )

  runner.registerTool(
    "cost_estimate",
    {
      type: "function",
      function: {
        name: "cost_estimate",
        description: "Estimate the token cost of an operation. Use before expensive calls to avoid surprise bills.",
        parameters: {
          type: "object",
          properties: {
            estimated_input_tokens: { type: "number", description: "Estimated input tokens for this operation" },
            estimated_output_tokens: { type: "number", description: "Estimated output tokens (defaults to input * 0.3)" },
            model: { type: "string", description: "Model name (e.g. claude-sonnet-4-20250514, gpt-4o). Defaults to current model." },
          },
          required: ["estimated_input_tokens"],
        },
      },
    },
    async (args) => {
      const inputTokens = Number(args.estimated_input_tokens)
      const outputTokens = Number(args.estimated_output_tokens ?? Math.round(inputTokens * 0.3))
      const model = String(args.model ?? runner.config.model)

      const pricing: Record<string, { input: number; output: number }> = {
        "claude-sonnet-4-20250514": { input: 0.003, output: 0.015 },
        "claude-3-5-sonnet-20241022": { input: 0.003, output: 0.015 },
        "claude-opus-4-20250514": { input: 0.015, output: 0.075 },
        "gpt-4o": { input: 0.0025, output: 0.01 },
        "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
        "deepseek-chat": { input: 0.00027, output: 0.0011 },
      }
      const rates = pricing[model] ?? { input: 0.003, output: 0.015 }

      const inputCost = (inputTokens / 1000) * rates.input
      const outputCost = (outputTokens / 1000) * rates.output
      const total = inputCost + outputCost

      const lines = [
        `Cost Estimate for ${model}`,
        `   Input:  ${inputTokens.toLocaleString()} tokens -> $${inputCost.toFixed(4)}`,
        `   Output: ${outputTokens.toLocaleString()} tokens -> $${outputCost.toFixed(4)}`,
        `   Total:  ~$${total.toFixed(4)}`,
      ]
      if (total > 0.10) lines.push("", "This operation costs over $0.10. Consider if you can be more specific.")
      if (total > 1.00) lines.push("OVER $1.00 - confirm before proceeding.")
      return lines.join("\n")
    },
  )

  runner.registerTool(
    "council",
    {
      type: "function",
      function: {
        name: "council",
        description: "Convene a paid-license council of 2-5 LLMs to debate a question, then return the winning answer. Each model proposes, optionally critiques (rounds=2), then votes. Use for high-stakes decisions, architecture choices, or when one model's blindspot is the risk. License: Pro/Team/Enterprise (or --godlike).",
        parameters: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "The question to put to the council. Be specific." },
            models: {
              type: "array",
              items: { type: "string" },
              minItems: 2,
              maxItems: 5,
              description: 'Models as "provider/model" (e.g. ["anthropic/claude-sonnet-4-20250514", "openai/gpt-4o", "google/gemini-2.0-flash"]). 2-5 entries.',
            },
            rounds: { type: "integer", enum: [1, 2], description: "1 = propose+vote, 2 = +critique+revise (default 1)" },
            vote_mode: { type: "string", enum: ["majority", "ranked", "judge"], description: "majority=plurality wins, ranked=ignore (v1 same as majority), judge=judge model picks (default majority)" },
            judge_model: { type: "string", description: 'For vote_mode="judge": which model decides. Defaults to first model.' },
            context: { type: "string", description: "Optional background the council should consider alongside the prompt." },
          },
          required: ["prompt", "models"],
        },
      },
    },
    async (args) => {
      const { runCouncil } = await import("./council.js")
      return runCouncil({
        prompt: String(args.prompt),
        models: (args.models as string[]) ?? [],
        rounds: args.rounds as 1 | 2 | undefined,
        vote_mode: args.vote_mode as "majority" | "ranked" | "judge" | undefined,
        judge_model: args.judge_model as string | undefined,
        context: args.context as string | undefined,
      }, runner, memory)
    },
  )
}
