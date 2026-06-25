import { readFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"
import { existsSync } from "node:fs"

export type ArcanaConfig = {
  provider?: string
  model?: string
  /** Cheap model for extraction and compaction. Falls back to the main model when unset. */
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

  // Auto-detect provider + model from models.dev. Env-set keys take
  // precedence over file config so a stale config file doesn't lock
  // you into a provider whose key was rotated or removed.
  try {
    const { autoDetectProvider } = await import("./agent/providers.js")
    const detected = await autoDetectProvider()
    if (detected.provider) {
      file.provider = detected.provider
      if (!file.model) file.model = detected.model ?? file.model
    }
  } catch (e) { console.error("[arcana] auto-detect provider failed:", e instanceof Error ? e.message : String(e)) }

  const base = defaults()
  return {
    provider: file.provider as string | undefined,
    model: file.model as string | undefined,
    utilityModel: file.utilityModel as string | undefined,
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
