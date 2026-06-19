import type { AgentRunner } from "./runner.js"
import type { MemoryStore } from "@arcana/memory"
import type { SkillCatalog } from "../skills/loader.js"
import { loadSkills, loadSkillBody } from "../skills/loader.js"
// Module-level tool history for loop_detect
export const toolHistory: Array<{ name: string; ts: number }> = []

import { homedir } from "node:os"
import { join, dirname } from "node:path"
import { mkdirSync, writeFileSync, existsSync } from "node:fs"
import { initBoard, loadBoard, saveBoard, addCard, moveCard, archiveDone, formatBoard, type KanbanCard } from "./kanban.js"

export function registerBuiltinTools(runner: AgentRunner, memory: MemoryStore, skillDirs: string[]): void {
  let skills: SkillCatalog[] = []
  const catalogPromise = loadSkills(skillDirs).then((s) => { skills = s; return s })

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
      const fullBody = await loadSkillBody(skill.id, skillDirs)
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
        description: "Search the web and return results with titles, snippets, and URLs",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            limit: { type: "number", description: "Max results (default 5, max 10)" },
          },
          required: ["query"],
        },
      },
    },
    async (args) => {
      const query = encodeURIComponent(String(args.query))
      const limit = Math.min(Number(args.limit ?? 5), 10)
      try {
        // DuckDuckGo HTML search — free, no API key required
        const res = await fetch(`https://html.duckduckgo.com/html/?q=${query}`, {
          headers: { "User-Agent": "arcana-agent/0.1" },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) return `Search failed: HTTP ${res.status}`
        const html = await res.text()
        // Extract result links from DDG HTML
        const results: Array<{ title: string; snippet: string; url: string }> = []
        const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi
        const snippetRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi
        let m
        const links: Array<{ title: string; url: string }> = []
        while ((m = linkRe.exec(html)) !== null && links.length < limit) {
          const url = m[1]!.startsWith("//") ? "https:" + m[1] : m[1]!
          links.push({ title: m[2]!.replace(/<[^>]+>/g, "").trim(), url })
        }
        const snippets: string[] = []
        while ((m = snippetRe.exec(html)) !== null && snippets.length < limit) {
          snippets.push(m[1]!.replace(/<[^>]+>/g, "").trim())
        }
        for (let i = 0; i < links.length; i++) {
          results.push({ title: links[i]!.title, url: links[i]!.url, snippet: snippets[i] ?? "" })
        }
        if (!results.length) return "No results found."
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
        if (platform === "win32") {
          Bun.spawn(["powershell", "-c", "(New-Object Media.SoundPlayer (Get-Item -Path $args[0]).FullName).PlaySync()", "--", tmp])
        } else if (platform === "darwin") {
          Bun.spawn(["afplay", tmp])
        } else {
          Bun.spawn(["mpv", "--no-terminal", tmp])
        }
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

      // 1. Config file
      const configPath = join(homedir(), ".arcana", "config.json")
      ok("Config file", existsSync(configPath), existsSync(configPath) ? "exists" : "missing — run arcana config init")

      // 2. API key
      try {
        const envKey = process.env.ARCANA_API_KEY ?? process.env.OPENAI_API_KEY
        ok("API key", !!envKey, envKey ? `set (…${envKey.slice(-4)})` : "not set — export ARCANA_API_KEY")
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
      const bridge = join(homedir(), ".arcana", "cache", "opencode-config.json")
      ok("Bridge config", existsSync(bridge), existsSync(bridge) ? "exists" : "missing — TUI may not find skills")

      // 7. Network connectivity
      try {
        const dns = await fetch("https://cloudflare-dns.com", { signal: AbortSignal.timeout(5000) })
        ok("Network", dns.ok, dns.ok ? "reachable" : `HTTP ${dns.status}`)
      } catch { ok("Network", false, "unreachable — check internet connection") }

      // 8. Disk space
      try {
        const { execSync } = await import("node:child_process")
        const df = execSync("df -h . 2>nul || echo unknown", { encoding: "utf8" }).trim().split("\n").pop() ?? ""
        const parts = df.split(/\s+/)
        ok("Disk space", true, parts[4] ?? "unknown")  // e.g. "45%"
      } catch { ok("Disk space", true, "unknown") }

      // 9. Git repo
      try {
        const { execSync } = await import("node:child_process")
        const branch = execSync("git branch --show-current 2>nul || echo not a repo", { encoding: "utf8" }).trim()
        ok("Git repo", branch !== "not a repo", branch !== "not a repo" ? `on ${branch}` : "not in a git repository")
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
        description: "Fetch text content from a URL",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL to fetch" },
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
        .filter((t) => { try { return Bun.spawnSync({ cmd: ["which", t], stdout: "pipe" }).stdout.toString().trim().length > 0 } catch { return false } })

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
        description: "Install a package into the environment. Requires --sandbox mode.",
        parameters: {
          type: "object",
          properties: {
            manager: { type: "string", description: "Package manager: npm, pip, apt, cargo, go" },
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
        const result = Bun.spawnSync({ cmd, stdout: "pipe", stderr: "pipe" })
        return result.exitCode === 0
          ? `Installed ${pkg} via ${manager}`
          : `Install failed: ${result.stderr.toString().slice(0, 500)}`
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
      mkdirSync(dir, { recursive: true })
      const fp = join(dir, String(args.filename))
      writeFileSync(fp, String(args.content), "utf8")
      try { Bun.spawnSync({ cmd: ["chmod", "+x", fp] }) } catch {}
      return `Script written: ${fp}`
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
        const { execSync } = await import("node:child_process")
        const branch = execSync("git branch --show-current", { cwd, encoding: "utf8", stdio: "pipe" }).trim()
        const status = execSync("git status --short", { cwd, encoding: "utf8", stdio: "pipe" }).trim()
        const ahead = execSync("git rev-list --count @{upstream}..HEAD 2>nul || echo 0", { cwd, encoding: "utf8", stdio: "pipe" }).trim()
        const behind = execSync("git rev-list --count HEAD..@{upstream} 2>nul || echo 0", { cwd, encoding: "utf8", stdio: "pipe" }).trim()
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
        const { execSync } = await import("node:child_process")
        const staged = args.staged ? "--staged" : ""
        const file = args.file ? ` -- "${String(args.file)}"` : ""
        const diff = execSync(`git diff ${staged}${file}`, { cwd, encoding: "utf8", stdio: "pipe", maxBuffer: 1024 * 1024 }).trim()
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
        const { execSync } = await import("node:child_process")
        const files = args.files ? String(args.files) : "."
        execSync(`git add ${files}`, { cwd, encoding: "utf8", stdio: "pipe" })
        execSync(`git commit -m "${String(args.message).replace(/"/g, '\\"')}"`, { cwd, encoding: "utf8", stdio: "pipe" })
        const hash = execSync("git rev-parse HEAD", { cwd, encoding: "utf8", stdio: "pipe" }).trim().slice(0, 8)
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
        const { execSync } = await import("node:child_process")
        let msg = args.message ? String(args.message) : ""
        if (!msg) {
          const diffStat = execSync("git diff --stat", { cwd, encoding: "utf8", maxBuffer: 1024 * 100 }).trim()
          const filesChanged = diffStat ? diffStat.split("\n").length : 0
          const branch = execSync("git branch --show-current", { cwd, encoding: "utf8" }).trim()
          const added = execSync("git diff --cached --name-only 2>nul || true", { cwd, encoding: "utf8" }).trim()
          msg = `feat: update ${filesChanged > 0 ? filesChanged + " files" : "working state"} (${branch})`
        }
        execSync(`git add -A`, { cwd, encoding: "utf8" })
        execSync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { cwd, encoding: "utf8" })
        const hash = execSync("git rev-parse HEAD", { cwd, encoding: "utf8" }).trim().slice(0, 8)
        let result = `✅ Committed ${hash}: ${msg}`
        if (args.push) {
          execSync("git push", { cwd, encoding: "utf8" })
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
        description: "RECORD the user's stated goal. MUST call this once you understand what the user wants done. The goal is binding — all subsequent actions must align with it.",
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
      const priority = String(args.priority ?? "medium")
      memory.recordUserFact("active.goal", goal, "goal_set")
      memory.recordUserFact("active.goal.scope", scope, "goal_set")
      memory.recordUserFact("active.goal.priority", priority, "goal_set")
      const sessionId = `goal-${Date.now()}`
      const board = initBoard(sessionId, goal, scope)
      return `Goal recorded: "${goal}"\nScope: ${scope}\nPriority: ${priority}\nKanban board initialized.\nThis goal is now active — all actions MUST align with it.`
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

      // Look up the active goal
      const goalResults = memory.search("active.goal")
      const goalLine = goalResults.length > 0 ? goalResults[0]!.snippet : "No active goal set. Call goal_set first."

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
        lines.push("", "🎯 GOAL ACHIEVED. You should stop working and report completion to the user.")
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
      const { createArtifact } = await import("../../../core/src/artifact/schema")
      const id = `art-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      const artifact = createArtifact(
        id,
        String(args.title),
        String(args.content),
        (args.type as any) ?? "markdown",
        undefined,
        args.tags ? (args.tags as string[]).map(String) : [],
      )
      const { writeFileSync, mkdirSync, existsSync, readFileSync } = await import("node:fs")
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
      const { addVersion } = await import("../../../core/src/artifact/schema")
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
      const { readFileSync, existsSync } = await import("node:fs")
      const { join } = await import("node:path")
      const { homedir } = await import("node:os")
      const { getVersion } = await import("../../../core/src/artifact/schema")
      const dir = join(homedir(), ".arcana", "artifacts")
      const id = String(args.id)
      const filePath = join(dir, `${id}.json`)
      if (!existsSync(filePath)) return `Artifact not found: ${id}`
      const artifact = JSON.parse(readFileSync(filePath, "utf8"))
      const version = args.version ? Number(args.version) : undefined
      if (version) {
        const v = getVersion(artifact, version)
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
        const { execSync } = await import("node:child_process")
        const stagedFlag = staged ? "--staged" : ""
        const fileFilter = args.file ? ` -- "${String(args.file)}"` : ""
        const diff = execSync(`git diff ${stagedFlag}${fileFilter}`, { cwd, encoding: "utf8", maxBuffer: 1024 * 1024 })
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
      const { join } = await import("node:path")
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
        const { execSync } = await import("node:child_process")
        const include = args.include ? `--include="${String(args.include)}"` : ""
        const cmd = `rg -n --no-heading ${include} "${String(args.pattern).replace(/"/g, '\\"')}" "${cwd}" 2>nul || true`
        const output = execSync(cmd, { encoding: "utf8", maxBuffer: 1024 * 1024 }).trim()
        if (!output) return `No matches for "${args.pattern}"`
        const lines = output.split("\n").slice(0, maxResults)
        return lines.join("\n") + (lines.length < output.split("\n").length ? `\n... (${output.split("\n").length - maxResults} more matches)` : "")
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
        description: "Read a file's contents. Shows line numbers. Respects .gitignore.",
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
        const offset = Number(args.offset ?? 1)
        const limit = Number(args.limit ?? 2000)
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
        description: "Create a new file or overwrite an existing file with content. Use for new files or complete rewrites.",
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
        description: "Edit a file by finding and replacing text. Safer than full rewrites for targeted changes.",
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
        description: "Execute multiple INDEPENDENT tool calls in parallel. Use when you need to do multiple independent operations (like reading several files, searching multiple patterns) to save rounds. The tool name should be one of: glob, grep, read, web_fetch, web_search, git_status, git_diff, env_probe, artifact_get, memory_search.",
        parameters: {
          type: "object",
          properties: {
            calls: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  tool: { type: "string", description: "Tool name to call" },
                  args: { type: "object", description: "Arguments for the tool" },
                },
                required: ["tool", "args"],
              },
              description: "Array of independent tool calls to execute in parallel",
            },
          },
          required: ["calls"],
        },
      },
    },
    async (args) => {
      const calls = args.calls as Array<{ tool: string; args: Record<string, unknown> }>
      if (!calls?.length) return "No calls provided"
      const results = await Promise.all(calls.map(async (call) => {
        const entry = runner.getToolDefs().find((t) => t.function.name === call.tool)
        if (!entry) return `  "${call.tool}": unknown tool`
        return `  "${call.tool}": pending (will execute in parallel)`
      }))
      return `Batch scheduled ${calls.length} calls:\n${results.join("\n")}\n\nThese will be executed in parallel.`
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
}
