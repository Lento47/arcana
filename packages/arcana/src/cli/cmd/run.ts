import type { CommandModule } from "yargs"
import path from "node:path"
import { createInterface } from "node:readline"
import { mkdir } from "node:fs/promises"
import { loadConfig, getDataDir } from "../../config.js"
import { AgentRunner } from "../../agent/runner.js"
import { SessionManager } from "../../agent/session.js"
import { registerBuiltinTools, TOOL_SELECTION_GUIDE } from "../../agent/tools.js"
import { registerMcpTools } from "../../agent/mcp.js"
import { openMemoryDB, MemoryStore } from "@arcana/memory"
import { loadSkills, loadSkillBody, type SkillCatalog } from "../../skills/loader.js"
import { EXTRACTION_PROMPT, extractAndMerge, type LearningExtraction } from "../../learning.js"
import { maybeEvolve, incrementSessionCount, getActivePrompt } from "../../agent/evolve.js"
import { detectInjection, auditLog } from "../../agent/guard.js"
import { createSandbox } from "../../agent/sandbox.js"
import { createProofRuntime } from "../run/proof-runtime.js"

const SYSTEM_PROMPT = `You are Arcana, a self-improving AI agent. You have access to:
- memory_search: search past sessions and conversations
- memory_store_fact: store persistent facts about the user
- account_status: live licensed account (tier, credits, usage) from Arcana Proxy
- skill_activate: load a specialized skill's instructions into context
- skill_list: list available skills
- web_fetch: fetch content from a URL
- goal_set: record the user's goal — MUST call this once you understand what they want
- goal_check: check in on goal progress — call periodically to verify alignment
- kanban: manage goal tasks — init, add, move, view, archive

When you learn something important about the user, store it with memory_store_fact.
When the user asks about their Arcana account, plan, credits, balance, license, or subscription: call account_status (or use the <arcana-account> block if present). Do not invent account details from empty memory.
When asked to use a specific workflow, check skill_list and activate the relevant skill.
Be concise and direct. Format code in markdown blocks.

${TOOL_SELECTION_GUIDE}

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
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[90m${s}\x1b[0m`,
}

const STARTUP_MCP_TIMEOUT_MS = Number(process.env.ARCANA_STARTUP_MCP_TIMEOUT_MS ?? "1200")
const SHARED_MEMORY_TIMEOUT_MS = Number(process.env.ARCANA_SHARED_MEMORY_TIMEOUT_MS ?? "1200")
const SHARED_MEMORY_BASE_URL = process.env.ARCANA_SHARED_MEMORY_URL ?? "https://api.arcana.otnelhq.com"
const EVOLVE_ON_STARTUP = process.env.ARCANA_EVOLVE_ON_STARTUP === "1"

async function withStartupTimeout<T>(label: string, task: Promise<T>, fallback: T, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) return task
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      task,
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => {
          process.stderr.write(c.dim(`  ${label}: continuing startup after ${timeoutMs}ms\n`))
          resolve(fallback)
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function reportBackgroundFailure(label: string, task: Promise<unknown>): void {
  task.catch((error) => {
    process.stderr.write(c.dim(`  ${label}: ${error instanceof Error ? error.message : String(error)}\n`))
  })
}

function commandForPrompt(prompt: string | undefined, proofMode: boolean): string {
  const flags = proofMode ? " --proof" : ""
  return prompt ? `arcana run${flags} ${JSON.stringify(prompt)}` : `arcana run${flags}`
}

export const RunCommand: CommandModule = {
  command: "run [prompt]",
  describe: "start an arcana agent session (REPL or one-shot)",
  builder: (yargs) =>
    yargs
      .positional("prompt", { type: "string", describe: "one-shot prompt (no REPL)" })
      .option("skill", { type: "string", describe: "activate a skill at session start" })
      .option("model", { alias: "m", type: "string", describe: "model override" })
      .option("provider", { alias: "p", type: "string", describe: "provider override" })
      .option("resume", { alias: "r", type: "string", describe: "resume a previous session by ID" })
      .option("godlike", {
        type: "boolean",
        default: false,
        describe: "⚠️ disable ALL guardrails (red/blue/purple team use only)",
      })
      .option("sandbox", { type: "string", describe: "isolate agent to a root directory (creates tmpdir if empty)" })
      .option("sandbox-net", { type: "boolean", default: false, describe: "allow network in sandbox mode" })
      .option("disable-memory", { type: "boolean", default: false, describe: "disable memory for this session" })
      .option("tool-timeout", { type: "number", default: 30000, describe: "max execution time per tool call in ms" })
      .option("safe", {
        type: "boolean",
        default: false,
        describe: "run in read-only mode — disable all write/edit/delete tools",
      })
      .option("proof", {
        alias: "evidence",
        type: "boolean",
        default: false,
        describe: "capture and export a RunProof evidence package",
      }),

  async handler(args) {
    const config = await loadConfig()
    const dataDir = getDataDir(config)
    const prompt = args.prompt ? String(args.prompt) : undefined
    const proofMode = args.proof === true || args.evidence === true
    const proofRuntime = await createProofRuntime({
      enabled: proofMode,
      prompt,
      command: commandForPrompt(prompt, true),
      cwd: process.cwd(),
    })

    const apiKey = config.apiKey
    if (!apiKey) {
      process.stderr.write(
        c.dim(
          "Note: no ARCANA_API_KEY set — a provider-specific env var (e.g. MOONSHOT_API_KEY, DEEPSEEK_API_KEY) must be set for the chosen provider.\n",
        ),
      )
    }

    const argModel = args.model as string | undefined
    const argProvider = args.provider as string | undefined
    let model = argModel ?? config.model
    let provider = argProvider ?? config.provider
    let modelRouteSource: "cli" | "config" | "autodetect" =
      argModel || argProvider ? "cli" : provider || model ? "config" : "autodetect"

    // Auto-detect provider + model from env vars via models.dev when not configured.
    // Each provider in models.dev declares its env key — if that key is set in the
    // environment, the provider is available. Models come from the provider's catalog.
    if (!provider || !model) {
      const { autoDetectProvider } = await import("../../agent/providers.js")
      const detected = await autoDetectProvider()
      if (!provider && detected.provider) {
        provider = detected.provider
        modelRouteSource = "autodetect"
      }
      if (!model && detected.model) {
        model = detected.model
        modelRouteSource = "autodetect"
      }
    }
    // arcana-proxy discovers models from GET /v1/models at runner time — model
    // may be empty here. Other providers need an explicit model id.
    if (!provider) {
      throw new Error(
        "No provider configured and autodetect did not find one. " +
          "Run `arcana console login`, set a provider key, or pass --provider / --model.",
      )
    }
    if (!model && provider !== "arcana-proxy") {
      throw new Error(
        `No model configured for provider "${provider}". Pass --model or set model in ~/.arcana/config.json.`,
      )
    }
    await proofRuntime.recordModelRoute({
      provider,
      model: model ?? "(proxy-catalog)",
      route: provider === "local" ? "local" : "cloud",
      reason: "Active model route selected before agent execution.",
      data_left_local: provider !== "local",
      selection_source: modelRouteSource,
      data_boundary: provider === "local" ? "local" : "cloud",
    })
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

    let skillsCache: SkillCatalog[] | undefined
    const skillsPromise = loadSkills(config.skillsDirs).then((loaded) => {
      skillsCache = loaded
      return loaded
    })
    reportBackgroundFailure("skills", skillsPromise)
    const getSkills = async (): Promise<SkillCatalog[]> => {
      if (skillsCache) return skillsCache
      return await skillsPromise
    }

    const godlike = args.godlike === true
    if (godlike) {
      process.stderr.write(c.red("\n⚠️  GODLIKE MODE — ALL GUARDRAILS DISABLED\n"))
      process.stderr.write(
        c.dim("  No secret redaction, no injection detection, no command blocking, no rate limits.\n"),
      )
      process.stderr.write(c.dim("  For red team / blue team / purple team use only. You are responsible.\n\n"))
    }
    // Sandbox: isolate agent to configurable root directory
    let sandbox: ReturnType<typeof createSandbox> | undefined
    if (args.sandbox !== undefined) {
      sandbox = createSandbox((args.sandbox as string | undefined) || undefined)
      if (args["sandbox-net"]) sandbox.network = true
      process.stderr.write(c.yellow(`\n  Sandbox: ${sandbox.root}\n`))
      process.stderr.write(c.dim(`  Network: ${sandbox.network ? "allowed" : "BLOCKED"}\n\n`))
    }
    const runner = new AgentRunner(
      {
        provider,
        model,
        apiKey,
        utilityModel: config.utilityModel,
        godlike,
        safeMode: args.safe === true,
        toolTimeout: args.toolTimeout as number | undefined,
        proofGate: proofRuntime.enabled ? proofRuntime : undefined,
      },
      sandbox,
    )
    if (memory) {
      registerBuiltinTools(runner, memory, config.skillsDirs)
    } else {
      // Memory open failed — still register account_status so license/billing
      // questions work without local memory.db.
      const { registerAccountTools } = await import("../../agent/tools.js")
      registerAccountTools(runner)
    }

    const mcpServers = await withStartupTimeout("MCP", registerMcpTools(runner), [], STARTUP_MCP_TIMEOUT_MS)
    if (mcpServers.length) process.stderr.write(c.dim(`  MCP: ${mcpServers.join(", ")}\n`))

    // Pipeline shadow: create a lightweight plan from the objective
    // if one was provided. The pipeline drives cockpit stage rendering.
    let _pipelinePlan: string | undefined
    if (args.prompt) {
      _pipelinePlan = `pipeline: intent→plan→action→verify (objective: ${String(args.prompt).slice(0, 80)})`
    }

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

    incrementSessionCount()
    if (EVOLVE_ON_STARTUP) {
      systemPrompt = await maybeEvolve(runner, systemPrompt)
    }

    // Inject live licensed-account snapshot so "what's my account?" works
    // without relying on local memory facts.
    try {
      const { fetchAccountSnapshot, formatAccountSnapshot } = await import("../../proxy-client.js")
      const snap = await fetchAccountSnapshot()
      systemPrompt += `\n\n<arcana-account>\n${formatAccountSnapshot(snap)}\n</arcana-account>`
      if (snap.licensed) {
        process.stderr.write(
          c.dim(
            `  Account: ${snap.tier} · ${snap.userId} · ${Number.isFinite(snap.credits) ? Math.round(snap.credits!) : "—"} credits\n`,
          ),
        )
      }
    } catch {
      /* account injection is best-effort */
    }

    // Load agent contracts from .arcana/contracts/ if available.
    // Contracts inject constraints, evidence requirements, and rollback
    // plans into the system prompt so the agent operates within bounds.
    try {
      const contractsDir = path.join(process.cwd(), ".arcana", "contracts")
      const { readdirSync, readFileSync, existsSync } = await import("node:fs")
      if (existsSync(contractsDir)) {
        const contractFiles = readdirSync(contractsDir).filter((f: string) => f.endsWith(".json"))
        if (contractFiles.length > 0) {
          const contracts = contractFiles
            .map((f: string) => {
              try {
                return JSON.parse(readFileSync(path.join(contractsDir, f), "utf8")) as Record<string, unknown>
              } catch {
                return null
              }
            })
            .filter(Boolean)
          if (contracts.length > 0) {
            const constraints = contracts.flatMap((c) => (c!.constraints as string[]) ?? [])
            const gates = contracts.flatMap((c) => (c!.evidence_required as string[]) ?? [])
            const rollback = contracts.find((c) => c!.rollback_plan)
            systemPrompt += [
              "",
              "<arcana-contracts>",
              `Active contracts: ${contracts.length} (${contracts.map((c) => c!.name).join(", ")})`,
              constraints.length ? `Constraints:\n${constraints.map((c) => `- ${c}`).join("\n")}` : "",
              gates.length ? `Evidence required:\n${gates.map((g) => `- ${g}`).join("\n")}` : "",
              rollback ? `Rollback plan: ${rollback.rollback_plan}` : "",
              "Operate within these contracts. Report violations before acting.",
              "</arcana-contracts>",
            ]
              .filter(Boolean)
              .join("\n")
            process.stderr.write(
              c.dim(
                `  Contracts: ${contracts.length} loaded (${constraints.length} constraints, ${gates.length} gates)\n`,
              ),
            )
          }
        }
      }
    } catch {
      /* contracts are best-effort */
    }

    if (args.skill) {
      const skills = await getSkills()
      const skill = skills.find(
        (s) => s.id === String(args.skill) || s.name.toLowerCase().includes(String(args.skill).toLowerCase()),
      )
      if (skill) {
        const body = await loadSkillBody(skill.id, config.skillsDirs)
        if (body) {
          systemPrompt += `\n\n<arcana-skill name="${skill.name}">\n${body}\n</arcana-skill>`
          process.stderr.write(c.purple(`◆ Skill loaded: ${skill.name}\n`))
        } else {
          process.stderr.write(c.yellow(`Warning: skill body unavailable: ${args.skill}\n`))
        }
      } else {
        process.stderr.write(c.yellow(`Warning: skill not found: ${args.skill}\n`))
      }
    }

    if (memory) {
      // Rotate facts — pick 3 from top 10 weighted by confidence, different each session
      const facts = memory.getTopFacts(10, 0.4)
      if (facts.length) {
        // Weighted random sample without replacement: higher confidence = more
        // likely. (Was `sort(() => Math.random() - 0.5)` — a non-transitive
        // comparator that is neither a valid shuffle nor confidence-weighted.)
        const pick = (pool: typeof facts, n: number) => {
          const remaining = [...pool]
          const out: typeof facts = []
          for (let i = 0; i < n && remaining.length; i++) {
            const totalW = remaining.reduce((s, f) => s + Math.max(f.confidence, 0.01), 0)
            let r = Math.random() * totalW
            let idx = 0
            for (; idx < remaining.length - 1; idx++) {
              r -= Math.max(remaining[idx]!.confidence, 0.01)
              if (r <= 0) break
            }
            out.push(remaining.splice(idx, 1)[0]!)
          }
          return out
        }
        const chosen = pick(facts, 3)
        const factLines = chosen.map((f) => `- [[${f.key.replace(/[\s.]+/g, "-")}]]: ${f.value}`).join("\n")
        systemPrompt += `\n\n<user-context>\n${factLines}\n</user-context>`
      }

      // Pull org-wide shared facts from enterprise server
      if (process.env.ARCANA_LICENSE_TIER && process.env.ARCANA_LICENSE_TIER !== "free") {
        try {
          const orgId = process.env.ARCANA_ORG_ID ?? "default"
          const response = await fetch(`${SHARED_MEMORY_BASE_URL}/api/team/${orgId}/memory/facts`, {
            signal: AbortSignal.timeout(SHARED_MEMORY_TIMEOUT_MS),
          })
          if (response.ok) {
            const data = (await response.json()) as { facts: Array<{ key: string; value: string; source?: string }> }
            if (data.facts?.length > 0) {
              const factLines = data.facts.map((f) => `${f.key}: ${f.value.slice(0, 200)}`)
              systemPrompt += `\n\n<shared-knowledge>\n${factLines.join("\n")}\n</shared-knowledge>`
            }
          }
        } catch {} // silently fail — shared memory is best-effort
      }

      // Inject 2 random learned wiki entries (wiki-style with excerpts)
      const learnedDir = path.join(process.cwd(), ".arcana", "learned")
      try {
        const { readdirSync, readFileSync, existsSync } = await import("node:fs")
        if (existsSync(learnedDir)) {
          const allFiles = readdirSync(learnedDir).filter((f: string) => f.endsWith(".md"))
          // Pick up to 2 at random (unbiased). Was `sort(() => Math.random() - 0.5)`,
          // a non-transitive comparator that is not a valid shuffle.
          const files: string[] = []
          const poolF = [...allFiles]
          for (let i = 0; i < 2 && poolF.length; i++) {
            files.push(poolF.splice(Math.floor(Math.random() * poolF.length), 1)[0]!)
          }
          if (files.length) {
            const entries = files.map((f: string) => {
              const slug = f.replace(".md", "")
              const body = readFileSync(path.join(learnedDir, f), "utf-8")
              const excerpt = body
                .split("\n")
                .filter(
                  (l: string) =>
                    !l.startsWith("---") &&
                    !l.startsWith("tags:") &&
                    !l.startsWith("date:") &&
                    !l.startsWith("# ") &&
                    l.trim(),
                )
                .slice(0, 2)
                .join(" ")
                .slice(0, 150)
              return `- [[${slug}]]: ${excerpt}`
            })
            systemPrompt += `\n\n<learned>\n${entries.join("\n")}\n</learned>`
          }
        }
      } catch {
        /* best-effort */
      }
    }

    // Only start new session if not resuming an existing one
    const sessionId = sessionMgr?.id() ?? sessionMgr?.start(systemPrompt) ?? null
    if (sessionId) runner.setSession(sessionId)

    async function runTurn(userInput: string): Promise<string> {
      sessionMgr?.addUser(userInput)

      // Inject active goal every turn (CLI path).
      let turnSystem = systemPrompt
      try {
        const { formatActiveGoalBlock } = await import("@arcana/core/session/goal")
        const sid =
          sessionMgr?.id()
          || (typeof process.env.ARCANA_SESSION_ID === "string" ? process.env.ARCANA_SESSION_ID : "")
          || `cli-${process.cwd().replace(/[^a-zA-Z0-9]+/g, "_").slice(-48)}`
        if (!process.env.ARCANA_SESSION_ID) process.env.ARCANA_SESSION_ID = sid
        turnSystem =
          systemPrompt
          + "\n\n"
          + formatActiveGoalBlock({
            sessionID: sid,
            sessionAgent: "build",
            actorAgent: "build",
            actorRole: "primary",
          })
      } catch {
        /* optional */
      }

      const baseMessages = [{ role: "system" as const, content: turnSystem }]
      const history = sessionMgr
        ? (() => {
            const h = sessionMgr!.getHistory()
            // Refresh first system message with current goal block
            if (h[0]?.role === "system") return [{ role: "system" as const, content: turnSystem }, ...h.slice(1)]
            return [{ role: "system" as const, content: turnSystem }, ...h]
          })()
        : [...baseMessages, { role: "user" as const, content: userInput }]

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
        process.stderr.write(
          c.dim(`  [${result.toolCalls} tool call(s) · ${result.inputTokens}↑ ${result.outputTokens}↓ tok]\n`),
        )
      }

      await proofRuntime.recordAgentTurn({
        input_summary: userInput,
        output_summary: result.content,
        tool_calls: result.toolCalls,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
      })

      return result.content
    }

    if (args.prompt) {
      try {
        const oneShotPrompt = String(args.prompt)
        await proofRuntime.recordUserCommand(oneShotPrompt, "One-shot user turn accepted.")
        const reply = await runTurn(oneShotPrompt)
        process.stdout.write(reply + "\n")

        await proofRuntime.finalizeCompleted(
          "One-shot run completed. Diff gates and independent verifier are not wired yet; human review remains recommended.",
          25,
        )
      } catch (e) {
        await proofRuntime.finalizeFailed(e)
        throw e
      }
      process.exit(0)
    }

    const memLabel = memory ? c.dim(`  memory:${sessionId?.slice(0, 6) ?? "?"}`) : c.dim("  memory:off")
    process.stdout.write(c.purple(`\n◆ ARCANA`) + c.dim(`  ${model} @ ${provider}`) + memLabel + "\n")
    process.stdout.write(c.dim("  /skills  /skill <id>  /clear  /history  /exit\n"))
    if (proofRuntime.enabled) process.stdout.write(c.dim("  proof:on  evidence will be saved when the session exits\n"))
    process.stdout.write("\n")

    const rl = createInterface({ input: process.stdin, terminal: false })

    const askLine = () => process.stdout.write(c.cyan("you> "))

    askLine()
    for await (const line of rl) {
      const input = line.trim()
      if (!input) {
        askLine()
        continue
      }

      if (input === "/exit" || input === "/quit") {
        // Extract learnings from this session before exiting
        const msgs = sessionMgr?.getHistory() ?? []
        const turns = msgs.filter((m) => m.role === "user")
        if (turns.length > 2) {
          process.stdout.write(c.dim("\n  Extracting learnings…\n"))
          try {
            const transcript = msgs
              .filter((m) => m.role !== "system")
              .map((m) => `${m.role}: ${"content" in m && m.content ? String(m.content).slice(0, 500) : "(tool)"}`)
              .join("\n")
            const utilModel = config.utilityModel || config.model
            const cheapRunner = new AgentRunner({ provider, model: utilModel, apiKey })
            const resp = await cheapRunner.run([
              { role: "system", content: EXTRACTION_PROMPT },
              { role: "user", content: `Session transcript:\n${transcript}` },
            ])
            const json = JSON.parse(resp.content) as LearningExtraction
            const created = extractAndMerge(process.cwd(), json, sessionId ?? undefined)
            const totalCreated = created.wikiFilesCreated.length + created.quarantinedFiles.length
            if (totalCreated) {
              process.stdout.write(c.dim(`  Learned ${totalCreated} thing(s) → .arcana/learned/\n`))
            }
            if (process.env.ARCANA_LICENSE_TIER !== "free") {
              const { readFileSync, readdirSync, existsSync } = await import("node:fs")
              const { join } = await import("node:path")
              const { homedir } = await import("node:os")
              const learnedDir = join(homedir(), ".arcana", "learned")
              if (existsSync(learnedDir)) {
                const files = readdirSync(learnedDir).filter((f) => f.endsWith(".md"))
                const facts = files.map((f) => ({
                  key: `learned.${f.replace(/\.md$/, "")}`,
                  value: readFileSync(join(learnedDir, f), "utf8").slice(0, 500),
                  source: "session-learning",
                  confidence: 0.8,
                  updated_at: Date.now(),
                  updated_by: process.env.ARCANA_USER ?? "local",
                }))
                if (facts.length > 0) {
                  const orgId = process.env.ARCANA_ORG_ID ?? "default"
                  fetch(`${SHARED_MEMORY_BASE_URL}/api/team/${orgId}/memory/sync`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ facts }),
                  }).catch(() => {})
                }
              }
            }
          } catch {
            // Extraction is best-effort; never block exit
          }
        }
        await proofRuntime.finalizeCompleted(
          "Interactive session completed. Diff gates and independent verifier are not wired yet; human review remains recommended.",
          20,
        )
        process.exit(0)
      }

      if (input === "/clear") {
        if (sessionMgr && memory) sessionMgr.start(systemPrompt)
        await proofRuntime.recordUserCommand("/clear", "Session context cleared.")
        process.stdout.write(c.dim("Session cleared.\n"))
        askLine()
        continue
      }

      if (input === "/history") {
        const msgs = sessionMgr?.getHistory() ?? []
        for (const m of msgs) {
          if (m.role === "system") continue
          const label = m.role === "user" ? c.cyan("you:   ") : c.purple("arcana:")
          const text = ("content" in m && m.content ? String(m.content) : "(tool call)").slice(0, 120)
          process.stdout.write(`${label} ${text}\n`)
        }
        await proofRuntime.recordUserCommand("/history", "Displayed session history.")
        askLine()
        continue
      }

      if (input === "/skills") {
        const skills = await getSkills()
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
        await proofRuntime.recordUserCommand("/skills", "Displayed skill catalog.")
        askLine()
        continue
      }

      if (input.startsWith("/skill ")) {
        const id = input.slice(7).trim()
        const skills = await getSkills()
        const skill = skills.find((s) => s.id === id || s.name.toLowerCase().includes(id.toLowerCase()))
        if (!skill) {
          process.stdout.write(c.red(`Skill not found: ${id}\n`))
          askLine()
          continue
        }
        const body = await loadSkillBody(skill.id, config.skillsDirs)
        const injection = `\n\n<arcana-skill name="${skill.name}">\n${body}\n</arcana-skill>`
        const msgs = sessionMgr?.getHistory()
        if (msgs?.[0]?.role === "system") (msgs[0] as { role: string; content: string }).content += injection
        else systemPrompt += injection
        await proofRuntime.recordUserCommand(input, `Loaded skill: ${skill.name}`)
        process.stdout.write(c.purple(`◆ Skill loaded: ${skill.name}\n`))
        askLine()
        continue
      }

      process.stdout.write(c.purple("arcana> "))

      // Guard: check for prompt injection (skip in godlike mode)
      if (!godlike) {
        const injection = detectInjection(input)
        if (injection) {
          process.stdout.write(c.red(`⚠️ ${injection}\n`))
          auditLog({
            tool: "prompt-injection",
            args: { input: input.slice(0, 100) },
            session: sessionId ?? undefined,
            ts: new Date().toISOString(),
          })
          await proofRuntime.recordUserCommand(input, `Prompt injection blocked: ${injection}`)
          await proofRuntime.recordSystemTransition("failed", `Prompt injection blocked: ${injection}`)
          askLine()
          continue
        }
      }

      try {
        await proofRuntime.recordUserCommand(input, "User turn accepted.")
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
