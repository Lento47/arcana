import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { JobSchema, type Job, type JobCreate, type JobUpdate } from "./types.js"

function now(): string {
  return new Date().toISOString()
}

function parseSchedule(schedule: string): string {
  const aliases: Record<string, string> = {
    "@hourly": "0 * * * *",
    "@daily": "0 0 * * *",
    "@midnight": "0 0 * * *",
    "@weekly": "0 0 * * 0",
    "@monthly": "0 0 1 * *",
    "@yearly": "0 0 1 1 *",
    "@annually": "0 0 1 1 *",
  }
  return aliases[schedule] ?? schedule
}

function expandField(field: string, max: number): Set<number> {
  const values = new Set<number>()
  for (const part of field.split(",")) {
    if (part === "*") {
      for (let i = 0; i <= max; i++) values.add(i)
    } else if (part.startsWith("*/")) {
      const step = parseInt(part.slice(2), 10)
      if (step > 0) for (let i = 0; i <= max; i += step) values.add(i)
    } else if (part.includes("-")) {
      const [lo, hi] = part.split("-").map(Number)
      for (let i = lo; i <= hi; i++) values.add(i)
    } else {
      values.add(parseInt(part, 10))
    }
  }
  return values
}

function nextRun(schedule: string, _timezone = "UTC"): string {
  const parsed = parseSchedule(schedule)
  const parts = parsed.split(" ")
  if (parts.length < 5) return now()

  const mins = expandField(parts[0]!, 59)
  const hours = expandField(parts[1]!, 23)
  const dom = expandField(parts[2]!, 31)
  const month = expandField(parts[3]!, 12)
  const dow = expandField(parts[4]!, 7) // 0=Sun, 7=Sun

  const d = new Date()
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() + 1) // start from next minute

  // Search forward up to 2 years (safety cap)
  const limit = new Date(d.getTime() + 730 * 24 * 60 * 60 * 1000)
  while (d <= limit) {
    const m = d.getMonth() + 1
    const day = d.getDate()
    const wd = d.getDay()
    if (
      mins.has(d.getMinutes()) &&
      hours.has(d.getHours()) &&
      dom.has(day) &&
      month.has(m) &&
      (dow.has(wd) || (parts[4] === "*" && dom.has(day))) // day-of-week match OR explicit DOM
    ) {
      return d.toISOString()
    }
    d.setMinutes(d.getMinutes() + 1)
  }
  // Fallback: return +1 minute if no match found
  return new Date(Date.now() + 60000).toISOString()
}

export class JobStore {
  private jobs: Map<string, Job> = new Map()

  constructor(private readonly dataPath: string) {}

  private get filePath(): string {
    return join(this.dataPath, "cron-jobs.json")
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8")
      const parsed = JSON.parse(raw) as unknown[]
      this.jobs.clear()
      for (const item of parsed) {
        const result = JobSchema.safeParse(item)
        if (result.success) this.jobs.set(result.data.id, result.data)
      }
    } catch {
      this.jobs.clear()
    }
  }

  async save(): Promise<void> {
    await mkdir(this.dataPath, { recursive: true })
    const jobs = [...this.jobs.values()]
    await writeFile(this.filePath, JSON.stringify(jobs, null, 2), "utf8")
  }

  async create(input: JobCreate): Promise<Job> {
    await this.load()
    const job: Job = {
      id: randomUUID(),
      name: input.name,
      schedule: parseSchedule(input.schedule),
      prompt: input.prompt,
      skill: input.skill,
      enabled: true,
      platforms: input.platforms ?? [],
      created_at: now(),
      updated_at: now(),
      next_run: nextRun(input.schedule, input.timezone),
      run_count: 0,
      timezone: input.timezone ?? "UTC",
    }
    this.jobs.set(job.id, job)
    await this.save()
    return job
  }

  async update(id: string, patch: JobUpdate): Promise<Job | null> {
    await this.load()
    const job = this.jobs.get(id)
    if (!job) return null
    const updated: Job = {
      ...job,
      ...patch,
      id: job.id,
      created_at: job.created_at,
      updated_at: now(),
    }
    if (patch.schedule) updated.next_run = nextRun(patch.schedule, updated.timezone)
    this.jobs.set(id, updated)
    await this.save()
    return updated
  }

  async remove(id: string): Promise<boolean> {
    await this.load()
    const existed = this.jobs.has(id)
    this.jobs.delete(id)
    if (existed) await this.save()
    return existed
  }

  async list(): Promise<Job[]> {
    await this.load()
    return [...this.jobs.values()]
  }

  async get(id: string): Promise<Job | null> {
    await this.load()
    return this.jobs.get(id) ?? null
  }

  async markRan(id: string): Promise<Job | null> {
    const job = this.jobs.get(id)
    if (!job) return null
    const updated: Job = {
      ...job,
      last_run: now(),
      next_run: nextRun(job.schedule, job.timezone),
      run_count: job.run_count + 1,
      updated_at: now(),
    }
    this.jobs.set(id, updated)
    await this.save()
    return updated
  }

  dueJobs(): Job[] {
    const n = new Date()
    return [...this.jobs.values()].filter((j) => {
      if (!j.enabled) return false
      if (!j.next_run) return true
      return new Date(j.next_run) <= n
    })
  }
}
