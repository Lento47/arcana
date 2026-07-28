import type { CommandModule } from "yargs"
import { JobStore, Scheduler } from "@arcana/cron"
import type { Job, RunResult } from "@arcana/cron"
import { getDataDir, getArcanaHome } from "./arcana-home.js"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, dirname, relative } from "node:path"
import { homedir } from "node:os"

// ── helpers ──────────────────────────────────────────────────────────

function readConfig(): Record<string, unknown> {
  const cp = join(getArcanaHome(), "config.json")
  if (existsSync(cp)) {
    try { return JSON.parse(readFileSync(cp, "utf8")) } catch {}
  }
  return {}
}

function getCronIntervalSeconds(): number {
  const cfg = readConfig()
  if (typeof (cfg as any).cron?.intervalSeconds === "number") return (cfg as any).cron.intervalSeconds
  return 60
}

function getCronDataDir(): string {
  const cfg = readConfig()
  if (typeof cfg.dataDir === "string") return cfg.dataDir
  return getDataDir()
}

/** Find a SKILL.md body by skill name/id across configured dirs. */
function findSkillBody(skillId: string): string | null {
  const cfg = readConfig()
  const dirs: string[] = (Array.isArray(cfg.skillsDirs) && cfg.skillsDirs.length > 0)
    ? cfg.skillsDirs as string[]
    : [
        join(homedir(), ".arcana", "skills"),
        join(process.cwd(), "skills"),
        join(process.cwd(), ".arcana", "skills"),
      ]

  for (const dir of dirs) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true, recursive: true })
      for (const e of entries) {
        if (e.name !== "SKILL.md") continue
        const fp = join(e.parentPath ?? join(dir, e.name), e.name)
        try {
          const raw = readFileSync(fp, "utf8")
          // Match by id (directory name) or name in frontmatter
          const relDir = relative(dir, dirname(fp)).replace(/[\\/]/g, "/")
          if (relDir === skillId || raw.includes(`name: ${skillId}`)) return raw
        } catch {}
      }
    } catch {}
  }
  return null
}

function getArcanaBinary(): string {
  const ep = process.execPath.toLowerCase()
  if (ep.endsWith("bun.exe") || ep.endsWith("bun") || ep.endsWith("node.exe") || ep.endsWith("node")) {
    return "arcana"
  }
  return process.execPath
}

function spawnArcanaRun(prompt: string): Promise<RunResult & { output?: string }> {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString()
    const binary = getArcanaBinary()
    const result = spawnSync(binary, ["run", prompt], { stdio: "pipe", timeout: 300_000 })
    const stdout = result.stdout?.toString() ?? ""
    resolve({
      jobId: "",
      startedAt,
      finishedAt: new Date().toISOString(),
      success: result.status === 0,
      output: stdout.slice(0, 5000),
      error: result.status !== 0
        ? (result.stderr?.toString() || stdout || `exit ${result.status}`)
        : undefined,
    })
  })
}

// ── command ──────────────────────────────────────────────────────────

export const CronCommand: CommandModule = {
  command: "cron <action>",
  describe: "manage scheduled jobs",
  builder: (yargs) =>
    yargs
      .positional("action", {
        choices: ["list", "add", "remove", "pause", "resume", "run", "start"] as const,
        demandOption: true,
      })
      .option("name", { alias: "n", type: "string", describe: "job name" })
      .option("schedule", { alias: "s", type: "string", describe: "cron schedule (e.g. '0 9 * * *' or @daily)" })
      .option("prompt", { alias: "p", type: "string", describe: "prompt to run" })
      .option("id", { alias: "i", type: "string", describe: "job ID" })
      .option("skill", { type: "string", describe: "skill to activate for this job" }),
  async handler(args) {
    const dataDir = getCronDataDir()
    const store = new JobStore(dataDir)
    const action = String(args.action)

    async function resolveJobId(partial: string): Promise<string | null> {
      if (partial.length >= 36) return partial
      const jobs = await store.list()
      const match = jobs.find((j) => j.id.startsWith(partial))
      return match?.id ?? null
    }

    /** Build the effective prompt: optional skill content + job prompt. */
    function effectivePrompt(job: { prompt: string; skill?: string }, runSkill?: string): string {
      const skillName = runSkill ?? job.skill
      if (!skillName) return job.prompt
      const body = findSkillBody(skillName)
      if (!body) return job.prompt
      return `<arcana-skill name="${skillName}">\n${body}\n</arcana-skill>\n\n${job.prompt}`
    }

    switch (action) {
      case "list": {
        const jobs = await store.list()
        if (!jobs.length) { console.log("No scheduled jobs."); return }
        console.log(`${jobs.length} job(s):\n`)
        for (const j of jobs) {
          const status = !j.enabled
            ? "paused"
            : j.last_run
              ? `last: ${j.last_run.slice(0, 16)}`
              : "pending"
          const label = j.name ?? j.prompt.slice(0, 50)
          const skillTag = j.skill ? ` [${j.skill}]` : ""
          console.log(`  ${j.id.slice(0, 8)}  ${status.padEnd(20)} ${label}${skillTag}`)
        }
        break
      }
      case "add": {
        if (!args.schedule || !args.prompt) {
          console.error("--schedule and --prompt required")
          process.exit(1)
        }
        const skill = args.skill ? String(args.skill) : undefined
        if (skill && !findSkillBody(skill)) {
          console.error(`Skill not found: ${skill}`)
          process.exit(1)
        }
        const job = await store.create({
          schedule: String(args.schedule),
          prompt: String(args.prompt),
          name: args.name ? String(args.name) : undefined,
          skill,
        })
        console.log(`Job created: ${job.id.slice(0, 8)}  schedule: ${job.schedule}${skill ? `  skill: ${skill}` : ""}`)
        break
      }
      case "remove": {
        if (!args.id) { console.error("--id required"); process.exit(1) }
        const removeId = await resolveJobId(String(args.id))
        if (!removeId) { console.error(`Job not found: ${args.id}`); process.exit(1) }
        await store.remove(removeId)
        console.log(`Removed ${removeId.slice(0, 8)}`)
        break
      }
      case "pause": {
        if (!args.id) { console.error("--id required"); process.exit(1) }
        const pauseId = await resolveJobId(String(args.id))
        if (!pauseId) { console.error(`Job not found: ${args.id}`); process.exit(1) }
        await store.update(pauseId, { enabled: false })
        console.log(`Paused ${pauseId.slice(0, 8)}`)
        break
      }
      case "resume": {
        if (!args.id) { console.error("--id required"); process.exit(1) }
        const resumeId = await resolveJobId(String(args.id))
        if (!resumeId) { console.error(`Job not found: ${args.id}`); process.exit(1) }
        await store.update(resumeId, { enabled: true })
        console.log(`Resumed ${resumeId.slice(0, 8)}`)
        break
      }
      case "run": {
        if (!args.id) { console.error("--id required"); process.exit(1) }
        const runId = await resolveJobId(String(args.id))
        if (!runId) { console.error(`Job not found: ${args.id}`); process.exit(1) }
        const job = await store.get(runId)
        if (!job) { console.error(`Job not found: ${args.id}`); process.exit(1) }
        const prompt = effectivePrompt(job)
        const skillName = job.skill ? ` [skill: ${job.skill}]` : ""
        console.log(`Running: ${job.name ?? job.prompt.slice(0, 60)}${skillName}`)
        try {
          const result = await spawnArcanaRun(prompt)
          await store.markRan(job.id)
          if (result.output) console.log(result.output)
          if (result.error) console.error(`Error: ${result.error}`)
          else console.log("Done.")
        } catch (e) {
          console.error(`Failed: ${e}`)
        }
        break
      }
      case "start": {
        const intervalMs = getCronIntervalSeconds() * 1000
        console.log(`Starting cron scheduler (interval: ${getCronIntervalSeconds()}s). Ctrl+C to stop.`)
        const scheduler = new Scheduler(store, async (job: Job) => {
          const prompt = effectivePrompt(job)
          console.log(`[${new Date().toISOString()}] Running: ${job.name ?? job.prompt.slice(0, 40)}`)
          return spawnArcanaRun(prompt)
        }, intervalMs)
        scheduler.start()
        process.on("SIGINT", () => { scheduler.stop(); process.exit(0) })
        await new Promise(() => {})
        break
      }
    }
  },
}
