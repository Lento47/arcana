import { z } from "zod"

export const JobSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  schedule: z.string(),
  prompt: z.string(),
  skill: z.string().optional(),
  enabled: z.boolean().default(true),
  platforms: z.array(z.string()).default([]),
  created_at: z.string(),
  updated_at: z.string(),
  last_run: z.string().optional(),
  next_run: z.string().optional(),
  run_count: z.number().default(0),
  timezone: z.string().default("UTC"),
})

export type Job = z.infer<typeof JobSchema>

export type JobCreate = {
  schedule: string
  prompt: string
  name?: string
  skill?: string
  platforms?: string[]
  timezone?: string
}

export type JobUpdate = Partial<Omit<JobCreate, "schedule">> & {
  schedule?: string
  enabled?: boolean
}

export type RunResult = {
  jobId: string
  startedAt: string
  finishedAt: string
  success: boolean
  error?: string
}
