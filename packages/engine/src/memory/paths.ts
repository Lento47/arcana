import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export function arcanaHome(): string {
  return process.env.ARCANA_HOME?.trim() || join(homedir(), ".arcana")
}

export function memoryDataDir(): string {
  const configPath = join(arcanaHome(), "config.json")
  if (existsSync(configPath)) {
    try {
      const cfg = JSON.parse(readFileSync(configPath, "utf8")) as { dataDir?: unknown }
      if (typeof cfg.dataDir === "string" && cfg.dataDir.trim()) return cfg.dataDir
    } catch {
      /* fall through */
    }
  }
  return join(arcanaHome(), "data")
}
