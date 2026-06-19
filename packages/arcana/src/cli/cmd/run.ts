import type { CommandModule } from "yargs"
import { createInterface } from "node:readline"
import { mkdir } from "node:fs/promises"
import { loadConfig, getDataDir } from "../../config.js"
import { AgentRunner } from "../../agent/runner.js"
import { SessionManager } from "../../agent/session.js"
import { registerBuiltinTools } from "../../agent/tools.js"
import { registerMcpTools } from "../../agent/mcp.js"
import { openMemoryDB, MemoryStore } from "@arcana/memory"
import { loadSkills, loadSkillBody, type SkillCatalog } from "../../skills/loader.js"
import { EXTRACTION_PROMPT, extractAndMerge, type LearningExtraction } from "../../learning.js"
import { maybeEvolve, incrementSessionCount, getActivePrompt } from "../../agent/evolve.js"
import { detectInjection, auditLog } from "../../agent/guard.js"
import { createSandbox } from "../../agent/sandbox.js"

const SYSTEM_PROMPT = `You are Arcana, a self-improving AI agent. You have access to:
- memory_search: search past sessions and conversations
- memory_store_fact: store persistent facts about the user
- skill_activate: load a specialized skill's instructions into context
- skill_list: list available skills
- web_fetch: fetch content from a URL
- goal_set: record the user's goal — MUST call this once you understand what they want
- goal_check: check in on goal progress — call periodically to verify alignment
- kanban: manage goal tasks — init, add, move, view, archive

When you learn something important about the user, store it with memory_store_fact.
When asked to use a specific workflow, check skill_list and activate the relevant skill.
Be concise and direct. Format code in markdown blocks.

GOAL DISCIPLINE:
1. As soon as you understand what the user wants, call goal_set to record it.
2. After goal_set, use kanban add to break the goal into trackable tasks.
3. Periodically call goal_check and kanban view to verify progress.
4. Move cards on the kanban as tasks progress (backlog → in_progress → done).
5. The active goal is BINDING — all tool calls must align with it.
6. If goal_check reports "complete", stop working and summarize results to the user.
7. If goal_check reports "blocked", ask the user for guidance before proceeding.
8. After completing the goal, use git_autocommit to save changes.
9. Run git_status to verify the working tree is clean.`

const c = {
  purple: (s: string) => `\x1b[35m${s}\x1b[0m`,
  cyan:   (s: string) => `\x1b[36m${s}\x1b[0m`,
  red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  dim:    (s: string) => `\x1b[90m${s}\x1b[0m`,
}

export const RunCommand: CommandModule = {
  command: "run [prompt]",
  describe: "start an arcana agent session (REPL or one-shot)",
  builder: (yargs) =>
    yargs
      .positional("prompt", { type: "string", describe: "one-shot prompt (no REPL)" })
      .option("skill",           { type: "string",  describe: "activate a skill at session start" })
      .option("model",           { alias: "m", type: "string", describe: "model override" })
      .option("provider",        { alias: "p", type: "string", describe: "provider override" })
      .option("resume",          { alias: "r", type: "string", describe: "resume a previous session by ID" })
      .option("godlike",         { type: "boolean", default: false, describe: "⚠️ disable ALL guardrails (red/blue/purple team use only)" })
      .option("sandbox",         { type: "string", describe: "isolate agent to a root directory (creates tmpdir if empty)" })
      .option("sandbox-net",     { type: "boolean", default: false, describe: "allow network in sandbox mode" })
      .option("disable-memory",  { type: "boolean", default: false, describe: "disable memory for this session" })
      .option("tool-timeout", { type: "number", default: 30000, describe: "max execution time per tool call in ms" })
      .option("safe", { type: "boolean", default: false, describe: "run in read-only mode — disable all write/edit/delete tools" }),

  async handler(args) {
    const config = await loadConfig()
    const dataDir = getDataDir(config)

    const apiKey = config.apiKey
    if (!apiKey) {
      process.stderr.write(
        c.dim(
          "Note: no ARCANA_API_KEY set — a provider-specific env var (e.g. MOONSHOT_API_KEY, DEEPSEEK_API_KEY) must be set for the chosen provider.\n",
        ),
      )
    }

    const model    = (args.model    as string | undefined) ?? config.model
    const provider = (args.provider as string | undefined) ?? config.provider
    const useMemory = !(args.disableMemory as boolean) && config.memory.enabled

    await mkdir(dataDir, { recursive: true })

    let memory: MemoryStore | null = null
    if (useMemory) {
      try {
        const db = openMemoryDB(dataDir)
        memory = new MemoryStore(db)
      } catch (e) {
        process.stderr.write(c.yellow(`Warning: memory unavailable (${String(e)})\n`))
      }
    }

    const skills = await loadSkills(config.skillsDirs)

    const godlike = args.godlike === true
    if (godlike) {
      process.stderr.write(c.red("\n⚠️  GODLIKE MODE — ALL GUARDRAILS DISABLED\n"))
      process.stderr.write(c.dim("  No secret redaction, no injection detection, no command blocking, no rate limits.\n"))
      process.stderr.write(c.dim("  For red team / blue team / purple team use only. You are responsible.\n\n"))
    }
    // Sandbox: isolate agent to configurable root directory
    let sandbox: ReturnType<typeof createSandbox> | undefined
    if (args.sandbox !== undefined) {
      sandbox = createSandbox(args.sandbox || undefined)
      if (args["sandbox-net"]) sandbox.network = true
      process.stderr.write(c.yellow(`\n  Sandbox: ${sandbox.root}\n`))
      process.stderr.write(c.dim(`  Network: ${sandbox.network ? "allowed" : "BLOCKED"}\n\n`))
    }
    const runner = new AgentRunner({ provider, model, apiKey, utilityModel: config.utilityModel, godlike, safeMode: args.safe === true, toolTimeout: args.toolTimeout as number | undefined }, sandbox)
    if (memory) registerBuiltinTools(runner, memory, config.skillsDirs)

    const mcpServers = await registerMcpTools(runner)
    if (mcpServers.length) process.stderr.write(c.dim(`  MCP: ${mcpServers.join(", ")}\n`))

    const sessionMgr = memory ? new SessionManager(memory, model, provider) : null

    // Support --resume to continue a previous session
    if (args.resume && sessionMgr) {
      const resumed = sessionMgr.resume(String(args.resume))
      if (resumed) {
        process.stderr.write(c.dim(`  Resumed session ${String(args.resume).slice(0, 8)}…\n`))
      } else {
        process.stderr.write(c.yellow(`  Session not found: ${args.resume}\n`))
      }
    }

    // Use evolved prompt if one exists and scores better than base
    let systemPrompt = getActivePrompt(SYSTEM_PROMPT)

    // Check for prompt evolution (every N sessions)
    systemPrompt = await maybeEvolve(runner, systemPrompt)
    incrementSessionCount()

    if (args.skill) {
      const skill = skills.find((s) => s.id === String(args.skill) || s.name.toLowerCase().includes(String(args.skill).toLowerCase()))
      if (skill) {
        systemPrompt += `\n\n<arcana-skill name="${skill.name}">\n${skill.body}\n</arcana-skill>`
        process.stderr.write(c.purple(`◆ Skill loaded: ${skill.meta.name}\n`))
      } else {
        process.stderr.write(c.yellow(`Warning: skill not found: ${args.skill}\n`))
      }
    }

    if (memory) {
      // Rotate facts — pick 3 from top 10 weighted by confidence, different each session
      const facts = memory.getTopFacts(10, 0.4)
      if (facts.length) {
        // Weighted random: higher confidence = more likely to be picked
        const pick = (pool: typeof facts, n: number) => {
          const sorted = [...pool].sort(() => Math.random() - 0.5)
          return sorted.slice(0, Math.min(n, sorted.length))
        }
        const chosen = pick(facts, 3)
        const factLines = chosen
          .map((f) => `- [[${f.key.replace(/[\s.]+/g, "-")}]]: ${f.value}`)
          .join("\n")
        systemPrompt += `\n\n<user-context>\n${factLines}\n</user-context>`
      }

      // Inject 2 random learned wiki entries (wiki-style with excerpts)
      const learnedDir = path.join(process.cwd(), ".arcana", "learned")
      try {
        const { readdirSync, readFileSync, existsSync } = await import("node:fs")
        if (existsSync(learnedDir)) {
          const files = readdirSync(learnedDir)
            .filter((f: string) => f.endsWith(".md"))
            .sort(() => Math.random() - 0.5) // shuffle for variety
            .slice(0, 2)
          if (files.length) {
            const entries = files.map((f: string) => {
              const slug = f.replace(".md", "")
              const body = readFileSync(path.join(learnedDir, f), "utf-8")
              const excerpt = body.split("\n").filter((l: string) => !l.startsWith("---") && !l.startsWith("tags:") && !l.startsWith("date:") && !l.startsWith("# ") && l.trim()).slice(0, 2).join(" ").slice(0, 150)
              return `- [[${slug}]]: ${excerpt}`
            })
            systemPrompt += `\n\n<learned>\n${entries.join("\n")}\n</learned>`
          }
        }
      } catch { /* best-effort */ }
    }

    // Only start new session if not resuming an existing one
    const sessionId = sessionMgr?.id() ?? sessionMgr?.start(systemPrompt) ?? null
    if (sessionId) runner.setSession(sessionId)

    async function runTurn(userInput: string): Promise<string> {
      sessionMgr?.addUser(userInput)

      const baseMessages = [{ role: "system" as const, content: systemPrompt }]
      const history = sessionMgr ? sessionMgr.getHistory() : [...baseMessages, { role: "user" as const, content: userInput }]

      // Stream tokens in REPL mode (async iterable not available; use callback)
      let streamed = false
      const result = await runner.run(history, (chunk) => {
        if (!streamed) {
          process.stdout.write(c.cyan("\narcana> "))
          streamed = true
        }
        process.stdout.write(chunk)
      })

      if (streamed) process.stdout.write("\n")
      sessionMgr?.addAssistant(result.content)

      if (result.toolCalls) {
        process.stderr.write(c.dim(`  [${result.toolCalls} tool call(s) · ${result.inputTokens}↑ ${result.outputTokens}↓ tok]\n`))
      }

      return result.content
    }

    if (args.prompt) {
      const reply = await runTurn(String(args.prompt))
      process.stdout.write(reply + "\n")
      process.exit(0)
    }

    const memLabel = memory ? c.dim(`  memory:${sessionId?.slice(0, 6) ?? "?"}`) : c.dim("  memory:off")
    process.stdout.write(c.purple(`\n◆ ARCANA`) + c.dim(`  ${model} @ ${provider}`) + memLabel + "\n")
    process.stdout.write(c.dim("  /skills  /skill <id>  /clear  /history  /exit\n\n"))

    const rl = createInterface({ input: process.stdin, terminal: false })

    const askLine = () => process.stdout.write(c.cyan("you> "))

    askLine()
    for await (const line of rl) {
      const input = line.trim()
      if (!input) { askLine(); continue }

      if (input === "/exit" || input === "/quit") {
        // Extract learnings from this session before exiting
        const msgs = sessionMgr?.getHistory() ?? []
        const turns = msgs.filter((m) => m.role === "user")
        if (turns.length > 2) {
          process.stdout.write(c.dim("\n  Extracting learnings…\n"))
          try {
            const transcript = msgs
              .filter((m) => m.role !== "system")
              .map((m) => `${m.role}: ${("content" in m && m.content) ? String(m.content).slice(0, 500) : "(tool)"}`)
              .join("\n")
            const utilModel = config.utilityModel ?? "gpt-4o-mini"
            const cheapRunner = new AgentRunner({ provider, model: utilModel, apiKey })
            const resp = await cheapRunner.run([
              { role: "system", content: EXTRACTION_PROMPT },
              { role: "user", content: `Session transcript:\n${transcript}` },
            ])
            const json = JSON.parse(resp.content) as LearningExtraction
            const created = extractAndMerge(process.cwd(), json, sessionId ?? undefined)
            if (created.length) {
              process.stdout.write(c.dim(`  Learned ${created.length} thing(s) → .arcana/learned/\n`))
            }
          } catch {
            // Extraction is best-effort; never block exit
          }
        }
        process.exit(0)
      }

      if (input === "/clear") {
        if (sessionMgr && memory) sessionMgr.start(systemPrompt)
        process.stdout.write(c.dim("Session cleared.\n"))
        askLine(); continue
      }

      if (input === "/history") {
        const msgs = sessionMgr?.getHistory() ?? []
        for (const m of msgs) {
          if (m.role === "system") continue
          const label = m.role === "user" ? c.cyan("you:   ") : c.purple("arcana:")
          const text = ("content" in m && m.content ? String(m.content) : "(tool call)").slice(0, 120)
          process.stdout.write(`${label} ${text}\n`)
        }
        askLine(); continue
      }

      if (input === "/skills") {
        const grouped = new Map<string, SkillCatalog[]>()
        for (const s of skills) {
          const cat = s.category || "misc"
          if (!grouped.has(cat)) grouped.set(cat, [])
          grouped.get(cat)!.push(s)
        }
        for (const [cat, catSkills] of grouped) {
          process.stdout.write(c.dim(`\n${cat}\n`))
          for (const s of catSkills) process.stdout.write(`  ${s.id.padEnd(36)} ${s.description}\n`)
        }
        process.stdout.write(`\n${skills.length} skills\n\n`)
        askLine(); continue
      }

      if (input.startsWith("/skill ")) {
        const id = input.slice(7).trim()
        const skill = skills.find((s) => s.id === id || s.name.toLowerCase().includes(id.toLowerCase()))
        if (!skill) { process.stdout.write(c.red(`Skill not found: ${id}\n`)); askLine(); continue }
        const body = await loadSkillBody(skill.id, config.skillsDirs)
        const injection = `\n\n<arcana-skill name="${skill.name}">\n${body}\n</arcana-skill>`
        const msgs = sessionMgr?.getHistory()
        if (msgs?.[0]?.role === "system") (msgs[0] as { role: string; content: string }).content += injection
        else systemPrompt += injection
        process.stdout.write(c.purple(`◆ Skill loaded: ${skill.name}\n`))
        askLine(); continue
      }

      process.stdout.write(c.purple("arcana> "))

      // Guard: check for prompt injection (skip in godlike mode)
      if (!godlike) {
        const injection = detectInjection(input)
        if (injection) {
          process.stdout.write(c.red(`⚠️ ${injection}\n`))
          auditLog({ tool: "prompt-injection", args: { input: input.slice(0, 100) }, session: sessionId ?? undefined, ts: new Date().toISOString() })
          askLine(); continue
        }
      }

      try {
        const reply = await runTurn(input)
        process.stdout.write(reply + "\n\n")
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        process.stdout.write(c.red(`Error: ${msg}\n`))
        if (msg.includes("401") || msg.includes("Unauthorized")) {
          process.stdout.write(c.dim("Check your API key — it may be invalid or expired.\n"))
        }
      }

      askLine()
    }
  },
}
