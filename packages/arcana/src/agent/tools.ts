import type { AgentRunner } from "./runner.js"
import type { MemoryStore } from "@arcana/memory"
import type { SkillInfo } from "../skills/loader.js"
import { loadSkills } from "../skills/loader.js"
// Module-level tool history for loop_detect
export const toolHistory: Array<{ name: string; ts: number }> = []

import { homedir } from "node:os"
import { join, dirname } from "node:path"
import { mkdirSync, writeFileSync, existsSync } from "node:fs"

export function registerBuiltinTools(runner: AgentRunner, memory: MemoryStore, skillDirs: string[]): void {
  let skills: SkillInfo[] = []
  const skillsPromise = loadSkills(skillDirs).then((s) => { skills = s; return s })

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
      await skillsPromise
      const skill = skills.find((s) => s.id === skillId || s.name.toLowerCase().includes(skillId))
      if (!skill) {
        memory.recordSkillObservation(skillId, "error: skill not found")
        return `Skill not found: ${skillId}. Use skill_list to see available skills.`
      }
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
      await skillsPromise
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
          Bun.spawn(["powershell", "-c", `(New-Object Media.SoundPlayer '${tmp}').PlaySync()`])
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
    async () => {
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
        description: "Run system diagnostics — check health, config, API keys, caches, DB. Use when errors occur.",
        parameters: {
          type: "object",
          properties: {},
        },
      },
    },
    async () => {
      const lines: string[] = []
      const ok = (label: string, pass: boolean, detail: string) => lines.push(`${pass ? "✅" : "❌"} ${label}: ${detail}`)

      // Config + API key
      const configPath = join(homedir(), ".arcana", "config.json")
      ok("Config file", existsSync(configPath), existsSync(configPath) ? "exists" : "missing — arcana config init")
      try {
        const envKey = process.env.ARCANA_API_KEY ?? process.env.OPENAI_API_KEY
        ok("API key", !!envKey, envKey ? `set (…${envKey.slice(-4)})` : "not set — export ARCANA_API_KEY")
      } catch { ok("API key", false, "error reading") }

      // Caches
      const modelsCache = join(homedir(), ".cache", "arcana", "models-dev.json")
      ok("Models cache", existsSync(modelsCache), existsSync(modelsCache) ? `populated (${Math.round((Bun.file(modelsCache).size ?? 0) / 1024)}KB)` : "empty — will fetch on first use")
      const skillsCache = join(homedir(), ".cache", "arcana", "skills-cache.json")
      ok("Skills cache", existsSync(skillsCache), existsSync(skillsCache) ? "warm" : "cold — will build on startup")

      // Memory DB
      const dbPath = join(homedir(), ".arcana", "data", "memory.db")
      ok("Memory DB", existsSync(dbPath), existsSync(dbPath) ? `exists (${Math.round((Bun.file(dbPath).size ?? 0) / 1024)}KB)` : "missing — created on first session")

      // Bridge config
      const bridge = join(homedir(), ".arcana", "cache", "opencode-config.json")
      ok("Bridge config", existsSync(bridge), existsSync(bridge) ? "exists" : "missing — TUI may not find skills")

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
        description: "Save research, findings, or generated content as a persistent artifact. Returns a shareable link.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short title for the artifact" },
            content: { type: "string", description: "Full content to save (markdown supported)" },
            tags: { type: "array", items: { type: "string" }, description: "Optional tags for categorization" },
          },
          required: ["title", "content"],
        },
      },
    },
    async (args) => {
      const artifact = memory.saveArtifact({
        title: String(args.title),
        content: String(args.content),
        tags: args.tags ? (args.tags as string[]).map(String) : undefined,
      })
      return `Artifact saved: ${artifact.title} (${artifact.id.slice(0, 8)})\nShare: arcana://artifact/${artifact.id}\nView: arcana learn show --artifact ${artifact.id.slice(0, 8)}`
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
          },
          required: ["query"],
        },
      },
    },
    async (args) => {
      const results = memory.searchArtifacts(String(args.query), Number(args.limit ?? 10))
      if (!results.length) return "No artifacts found."
      return results.map((a) => `[${a.id.slice(0, 8)}] ${a.title}${a.tags ? ` (${a.tags})` : ""}`).join("\n")
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
          },
          required: ["id"],
        },
      },
    },
    async (args) => {
      const id = String(args.id)
      // Try exact match first, then prefix match
      let artifact = memory.getArtifact(id)
      if (!artifact) {
        const all = memory.listArtifacts(100)
        artifact = all.find((a) => a.id.startsWith(id)) ?? null
      }
      if (!artifact) return `Artifact not found: ${id}`
      return `# ${artifact.title}\n${artifact.tags ? `tags: ${artifact.tags}\n` : ""}\n${artifact.content}`
    },
  )
}
