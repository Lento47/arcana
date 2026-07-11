import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"
import { existsSync } from "node:fs"
import { currentDir } from "./util/path.js"

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
  const envDirs = process.env.ARCANA_SKILLS_DIRS
    ? process.env.ARCANA_SKILLS_DIRS.split(";").map((s) => s.trim()).filter(Boolean)
    : []
  return {
    skillsDirs: envDirs.length > 0
      ? envDirs
      : [
          join(getArcanaHome(), "skills"),
          join(currentDir(import.meta), "..", "..", "..", "skills"),
        ],
    memory: { enabled: true, maxSessions: 1000 },
    cron: { enabled: true, intervalSeconds: 60 },
  }
}

export async function loadConfig(): Promise<ArcanaConfig> {
  // Load proxy_key from disk before auto-detect. The arcana CLI spawns the
  // engine as a child process, so engine/src/index.ts side-effects run too
  // late — auto-detect in this process needs ARCANA_PROXY_KEY already set.
  if (!process.env.ARCANA_PROXY_KEY) {
    try {
      const keyPath = join(getArcanaHome(), "proxy_key")
      if (existsSync(keyPath)) {
        process.env.ARCANA_PROXY_KEY = (await readFile(keyPath, "utf8")).trim()
      }
    } catch {}
  }

  const configPath = join(getArcanaHome(), "config.json")
  let file: Record<string, unknown> = {}

  if (existsSync(configPath)) {
    try { file = JSON.parse(await readFile(configPath, "utf8")) } catch {}
  }

  // Env overrides
  if (process.env.ARCANA_PROVIDER) file.provider = process.env.ARCANA_PROVIDER
  if (process.env.ARCANA_MODEL) file.model = process.env.ARCANA_MODEL
  if (process.env.ARCANA_API_KEY) file.apiKey = process.env.ARCANA_API_KEY
  // Only use OPENAI_API_KEY as generic apiKey fallback when the provider
  // is actually openai or not yet known — never leak it to another provider.
  if (process.env.OPENAI_API_KEY && !file.apiKey) {
    if (!file.provider || file.provider === "openai") file.apiKey = process.env.OPENAI_API_KEY
  }

  // Auto-detect provider + model from models.dev ONLY when neither
  // was set explicitly (config file, ARCANA_PROVIDER, ARCANA_MODEL).
  // Never override a deliberate user choice.
  if (!file.provider) {
    try {
      const { autoDetectProvider } = await import("./agent/providers.js")
      const detected = await autoDetectProvider()
      if (detected.provider) {
        file.provider = detected.provider
        if (!file.model) file.model = detected.model ?? file.model
      }
    } catch (e) { console.debug("[arcana] auto-detect provider skipped (no local provider found):", e instanceof Error ? e.message : String(e)) }
  }

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
