import { JobStore } from "./jobs.js"
import type { Job, RunResult } from "./types.js"

export type JobRunner = (job: Job) => Promise<RunResult>

export class Scheduler {
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false

  constructor(
    private readonly store: JobStore,
    private readonly runner: JobRunner,
    private readonly intervalMs = 60_000,
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), this.intervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async tick(): Promise<RunResult[]> {
    if (this.running) return []
    this.running = true
    const results: RunResult[] = []
    try {
      await this.store.load()
      const due = this.store.dueJobs()
      for (const job of due) {
        try {
          const result = await this.runner(job)
          await this.store.markRan(job.id)
          results.push(result)
        } catch (err) {
          results.push({
            jobId: job.id,
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            success: false,
            error: String(err),
          })
        }
      }
    } finally {
      this.running = false
    }
    return results
  }
}
