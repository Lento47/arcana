import type { CommandModule } from "yargs"
import { JobStore, Scheduler } from "@arcana/cron"
import type { Job, RunResult } from "@arcana/cron"
import { getDataDir, getArcanaHome } from "./arcana-home.js"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Reads cron interval from ~/.arcana/config.json.
 * Defaults to 60 seconds.
 */
function getCronIntervalSeconds(): number {
  const cp = join(getArcanaHome(), "config.json")
  if (existsSync(cp)) {
    try {
      const cfg = JSON.parse(readFileSync(cp, "utf8"))
      if (typeof cfg.cron?.intervalSeconds === "number") return cfg.cron.intervalSeconds
    } catch {}
  }
  return 60
}

/**
 * Resolves data dir from config, falling back to default.
 */
function getCronDataDir(): string {
  const cp = join(getArcanaHome(), "config.json")
  if (existsSync(cp)) {
    try {
      const cfg = JSON.parse(readFileSync(cp, "utf8"))
      if (typeof cfg.dataDir === "string") return cfg.dataDir
    } catch {}
  }
  return getDataDir()
}

/**
 * Resolves the arcana binary for subprocess execution.
 * In production (Bun-compiled binary), process.execPath IS the engine binary.
 * In dev mode (bun run dev / node), fall back to "arcana" on PATH.
 *
 * Detection: if execPath ends with "bun" or "node", we're in dev mode.
 * Bun-compiled binaries embed the runtime but execPath is the binary file
 * (e.g., arcana.exe on Windows, arcana on Linux/Mac).
 */
function getArcanaBinary(): string {
  const ep = process.execPath.toLowerCase()
  if (
    ep.endsWith("bun.exe") || ep.endsWith("bun") ||
    ep.endsWith("node.exe") || ep.endsWith("node")
  ) {
    return "arcana" // dev mode — resolve via PATH
  }
  // Production (compiled binary) — execPath is arcana.exe / arcana
  return process.execPath
}

function spawnArcanaRun(prompt: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString()
    const binary = getArcanaBinary()
    const result = spawnSync(binary, ["run", prompt], {
      stdio: "pipe",
      timeout: 300_000, // 5 min
    })
    resolve({
      jobId: "",
      startedAt,
      finishedAt: new Date().toISOString(),
      success: result.status === 0,
      error: result.status !== 0
        ? (result.stderr?.toString() || result.stdout?.toString() || `exit ${result.status}`)
        : undefined,
    })
  })
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
      .option("name", { alias: "n", type: "string", describe: "job name" })
      .option("schedule", { alias: "s", type: "string", describe: "cron schedule (e.g. '0 9 * * *' or @daily)" })
      .option("prompt", { alias: "p", type: "string", describe: "prompt to run" })
      .option("id", { alias: "i", type: "string", describe: "job ID" }),
  async handler(args) {
    const dataDir = getCronDataDir()
    const store = new JobStore(dataDir)
    const action = String(args.action)

    // Resolve full UUID from partial prefix (list shows 8-char IDs).
    // Load all jobs, find prefix match, return full ID or null.
    async function resolveJobId(partial: string): Promise<string | null> {
      if (partial.length >= 36) return partial // already full UUID
      const jobs = await store.list()
      const match = jobs.find((j) => j.id.startsWith(partial))
      return match?.id ?? null
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
          console.log(`  ${j.id.slice(0, 8)}  ${status.padEnd(20)} ${j.name ?? j.prompt.slice(0, 50)}`)
        }
        break
      }
      case "add": {
        if (!args.schedule || !args.prompt) {
          console.error("--schedule and --prompt required")
          process.exit(1)
        }
        const job = await store.create({
          schedule: String(args.schedule),
          prompt: String(args.prompt),
          name: args.name ? String(args.name) : undefined,
        })
        console.log(`Job created: ${job.id.slice(0, 8)}  schedule: ${job.schedule}`)
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
        console.log(`Running job: ${job.name ?? job.prompt}`)
        try {
          await spawnArcanaRun(job.prompt)
          await store.markRan(job.id)
          console.log("Done.")
        } catch (e) {
          console.error(`Failed: ${e}`)
        }
        break
      }
      case "start": {
        const intervalMs = getCronIntervalSeconds() * 1000
        console.log(`Starting cron scheduler (interval: ${getCronIntervalSeconds()}s). Ctrl+C to stop.`)
        const scheduler = new Scheduler(store, async (job: Job) => {
          console.log(`[${new Date().toISOString()}] Running: ${job.name ?? job.prompt.slice(0, 40)}`)
          return spawnArcanaRun(job.prompt)
        }, intervalMs)
        scheduler.start()
        process.on("SIGINT", () => { scheduler.stop(); process.exit(0) })
        // Keep process alive
        await new Promise(() => {})
        break
      }
    }
  },
}
