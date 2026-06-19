import { readFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"
import { existsSync } from "node:fs"

export type ArcanaConfig = {
  provider: string
  model: string
  /** Cheap model for extraction, compaction, and background tasks. Default: gpt-4o-mini. */
  utilityModel?: string
  apiKey?: string
  dataDir?: string
  skillsDirs: string[]
  gateway?: {
    telegram?: { token: string; allowedUsers?: string[] }
    discord?: { token: string; allowedChannels?: string[] }
    slack?: { botToken: string; signingSecret: string; allowedChannels?: string[] }
    whatsapp?: { phoneNumberId: string; accessToken: string; appSecret?: string; verifyToken?: string; allowedUsers?: string[] }
  }
  memory: { enabled: boolean; maxSessions: number }
  cron: { enabled: boolean; intervalSeconds: number }
}

export function getArcanaHome(): string {
  return process.env.ARCANA_HOME ?? join(homedir(), ".arcana")
}

export function getDataDir(config: ArcanaConfig): string {
  return config.dataDir ?? join(getArcanaHome(), "data")
}

function defaults(): ArcanaConfig {
  return {
    provider: "openai",
    model: "gpt-4o",
    utilityModel: "gpt-4o-mini",
    skillsDirs: [
      join(getArcanaHome(), "skills"),
      join(import.meta.dir, "..", "..", "..", "skills"),
    ],
    memory: { enabled: true, maxSessions: 1000 },
    cron: { enabled: true, intervalSeconds: 60 },
  }
}

export async function loadConfig(): Promise<ArcanaConfig> {
  const configPath = join(getArcanaHome(), "config.json")
  let file: Record<string, unknown> = {}

  if (existsSync(configPath)) {
    try { file = JSON.parse(await readFile(configPath, "utf8")) } catch {}
  }

  // Env overrides
  if (process.env.ARCANA_PROVIDER) file.provider = process.env.ARCANA_PROVIDER
  if (process.env.ARCANA_MODEL) file.model = process.env.ARCANA_MODEL
  if (process.env.ARCANA_API_KEY) file.apiKey = process.env.ARCANA_API_KEY
  if (process.env.OPENAI_API_KEY && !file.apiKey) file.apiKey = process.env.OPENAI_API_KEY

  const base = defaults()
  return {
    provider: (file.provider as string) ?? base.provider,
    model: (file.model as string) ?? base.model,
    utilityModel: (file.utilityModel as string) ?? base.utilityModel,
    apiKey: file.apiKey as string | undefined,
    dataDir: file.dataDir as string | undefined,
    skillsDirs: (file.skillsDirs as string[]) ?? base.skillsDirs,
    gateway: file.gateway as ArcanaConfig["gateway"],
    memory: {
      enabled: ((file.memory as any)?.enabled as boolean) ?? base.memory.enabled,
      maxSessions: ((file.memory as any)?.maxSessions as number) ?? base.memory.maxSessions,
    },
    cron: {
      enabled: ((file.cron as any)?.enabled as boolean) ?? base.cron.enabled,
      intervalSeconds: ((file.cron as any)?.intervalSeconds as number) ?? base.cron.intervalSeconds,
    },
  }
}
