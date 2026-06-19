import type { CommandModule } from "yargs"
import { JobStore, Scheduler } from "@arcana/cron"
import { openMemoryDB, MemoryStore } from "@arcana/memory"
import { loadSkills, loadSkillBody, type SkillCatalog } from "../../skills/loader.js"
import { AgentRunner } from "../../agent/runner.js"
import { SessionManager } from "../../agent/session.js"
import { registerBuiltinTools } from "../../agent/tools.js"
import { loadConfig, getDataDir } from "../../config.js"
import { registerMcpTools } from "../../agent/mcp.js"
import { mkdir } from "node:fs/promises"
import type { Job } from "@arcana/cron"

const CRON_SYSTEM = `You are Arcana running a scheduled job. Complete the task described in the user message, then stop. Be concise.`

async function runJob(job: Job, config: Awaited<ReturnType<typeof loadConfig>>, memory: MemoryStore, skills: SkillCatalog[]): Promise<string> {
  const apiKey = config.apiKey
  if (!apiKey) throw new Error("No API key configured")

  const runner = new AgentRunner({ provider: config.provider, model: config.model, apiKey, utilityModel: config.utilityModel })
  registerBuiltinTools(runner, memory, config.skillsDirs)
  registerMcpTools(runner).catch(() => {})

  runner.setSession(`cron-${job.id.slice(0, 8)}`)
  const sessionMgr = new SessionManager(memory, config.model, config.provider)

  let system = CRON_SYSTEM
  if (job.skill) {
    const skill = skills.find((s) => s.id === job.skill || s.name.toLowerCase().includes((job.skill ?? "").toLowerCase()))
    if (skill) {
      const body = await loadSkillBody(skill.id, config.skillsDirs)
      system += `\n\n<arcana-skill name="${skill.name}">\n${body}\n</arcana-skill>`
    }
  }

  sessionMgr.start(system)
  sessionMgr.addUser(job.prompt)
  sessionMgr.updateTitle(`[cron] ${job.name ?? job.prompt.slice(0, 40)}`)

  const result = await runner.run(sessionMgr.getHistory())
  sessionMgr.addAssistant(result.content)
  return result.content
}

export const CronCommand: CommandModule = {
  command: "cron <action>",
  describe: "manage scheduled jobs",
  builder: (yargs) =>
    yargs
      .positional("action", {
        choices: ["list", "add", "remove", "pause", "resume", "run", "start"] as const,
        demandOption: true,
      })
      .option("schedule", { alias: "s", type: "string", describe: "cron schedule (e.g. '0 9 * * *' or @daily)" })
      .option("prompt", { alias: "p", type: "string", describe: "prompt to run on schedule" })
      .option("name", { alias: "n", type: "string", describe: "job name" })
      .option("skill", { type: "string", describe: "activate this skill for the job" })
      .option("id", { type: "string", describe: "job id" })
      .option("timezone", { alias: "tz", type: "string", default: "UTC" }),

  async handler(args) {
    const config = await loadConfig()
    const dataDir = getDataDir(config)
    await mkdir(dataDir, { recursive: true })

    const store = new JobStore(dataDir)
    const action = String(args.action)

    if (action === "list") {
      const jobs = await store.list()
      if (!jobs.length) { console.log("No scheduled jobs."); return }
      console.log(`${"ID".padEnd(10)} ${"NAME/PROMPT".padEnd(34)} ${"SCHEDULE".padEnd(16)} ${"STATUS".padEnd(8)} RUNS  LAST RUN`)
      console.log("─".repeat(100))
      for (const j of jobs) {
        const label = (j.name ?? j.prompt).slice(0, 32)
        const status = j.enabled ? "enabled" : "paused"
        const last = j.last_run ? j.last_run.slice(0, 16).replace("T", " ") : "—"
        console.log(`${j.id.slice(0, 8)}… ${label.padEnd(34)} ${j.schedule.padEnd(16)} ${status.padEnd(8)} ${String(j.run_count).padEnd(5)} ${last}`)
      }
      return
    }

    if (action === "add") {
      if (!args.schedule || !args.prompt) { console.error("--schedule and --prompt required"); process.exit(1) }
      const job = await store.create({
        schedule: String(args.schedule),
        prompt: String(args.prompt),
        name: args.name ? String(args.name) : undefined,
        skill: args.skill ? String(args.skill) : undefined,
        timezone: String(args.timezone),
      })
      console.log(`Created job ${job.id}`)
      console.log(`Schedule: ${job.schedule}  Next: ${job.next_run}`)
      return
    }

    if (action === "start") {
      if (!config.apiKey) { console.error("No API key — set ARCANA_API_KEY"); process.exit(1) }
      const db = openMemoryDB(dataDir)
      const memory = new MemoryStore(db)
      const skills = await loadSkills(config.skillsDirs)

      const scheduler = new Scheduler(store, async (job) => {
        const start = new Date().toISOString()
        console.log(`[${start}] Running job: ${job.name ?? job.id}`)
        try {
          const output = await runJob(job, config, memory, skills)
          console.log(`[output] ${output.slice(0, 200)}${output.length > 200 ? "…" : ""}`)
          return { jobId: job.id, startedAt: start, finishedAt: new Date().toISOString(), success: true }
        } catch (e) {
          console.error(`[error] ${String(e)}`)
          return { jobId: job.id, startedAt: start, finishedAt: new Date().toISOString(), success: false, error: String(e) }
        }
      }, config.cron.intervalSeconds * 1000)

      scheduler.start()
      console.log(`Cron scheduler running (interval: ${config.cron.intervalSeconds}s). Ctrl+C to stop.`)
      process.on("SIGINT", () => { scheduler.stop(); process.exit(0) })
      await new Promise(() => {})
      return
    }

    if (action === "run") {
      if (!args.id) { console.error("--id required"); process.exit(1) }
      const job = await store.get(String(args.id))
      if (!job) { console.error(`Job not found: ${args.id}`); process.exit(1) }
      if (!config.apiKey) { console.error("No API key — set ARCANA_API_KEY"); process.exit(1) }

      const db = openMemoryDB(dataDir)
      const memory = new MemoryStore(db)
      const skills = await loadSkills(config.skillsDirs)

      console.log(`Running: ${job.name ?? job.prompt}`)
      const output = await runJob(job, config, memory, skills)
      await store.markRan(String(args.id))
      console.log("\n" + output)
      return
    }

    if (!args.id) { console.error("--id required"); process.exit(1) }
    const id = String(args.id)

    if (action === "remove") { const ok = await store.remove(id); console.log(ok ? `Removed ${id}` : `Not found: ${id}`); return }
    if (action === "pause") { await store.update(id, { enabled: false }); console.log(`Paused ${id}`); return }
    if (action === "resume") { await store.update(id, { enabled: true }); console.log(`Resumed ${id}`); return }
  },
}
