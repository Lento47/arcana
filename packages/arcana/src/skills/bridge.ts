import { readFile, writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { homedir } from "node:os"
import { getArcanaHome } from "../config.js"

let cachedPath: string | null = null

/**
 * Build the opencode config file injected via `ARCANA_CONFIG` when arcana spawns
 * the opencode TUI. It carries two things:
 *
 *   1. `provider` extras (nous-portal, mimo — not on models.dev) from the
 *      committed `providers.opencode.json` (single source of truth; also read by
 *      `arcana run`'s `loadLocalExtras`).
 *   2. `skills.paths` — arcana's canonical skills dirs, ABSOLUTE. opencode's
 *      `ConfigSkillPlugin` resolves relative paths against the user's cwd, so an
 *      absolute path is the only reliable choice. All skills live physically
 *      under arcana's folder (consolidated by `scripts/sync-skills.ts`); nothing
 *      is read from `hermes-agent/` or `openwording/` at runtime.
 *
 * opencode merges this file → V1 `skills.paths` → migrate → V2 `skills: string[]`
 * → `ConfigSkillPlugin` adds a `SkillV2.DirectorySource` per path → `SkillV2`
 * scans for SKILL.md files → skills reach `SkillGuidance` (system prompt), the `skill`
 * tool, and the TUI skill dialog.
 *
 * Returns the generated config path (cached per process — the file is cheap to
 * rewrite but there's no need to on every call).
 */
export async function generateBridgeConfig(): Promise<string> {
  if (cachedPath) return cachedPath

  const home = getArcanaHome()

  // arcana canonical skills dirs — mirror arcana `run`'s SkillRegistry defaults.
  // Absolute; existing dirs only (skip ~/.arcana/skills if the user hasn't made one).
  const skillsDirs = [
    join(import.meta.dir, "..", "..", "..", "..", "skills"), // repo skills/ (arcana canonical store)
    join(home, "skills"), // ~/.arcana/skills (user-added)
  ].filter((d) => existsSync(d))

  // Provider extras from the committed file (nous-portal, mimo).
  const providersPath = join(import.meta.dir, "..", "..", "providers.opencode.json")
  let provider: Record<string, unknown> = {}
  try {
    const raw = JSON.parse(await readFile(providersPath, "utf8")) as {
      provider?: Record<string, unknown>
    }
    provider = raw.provider ?? {}
  } catch {
    // committed file missing/unreadable — proceed with no provider extras
  }

  const config: Record<string, unknown> = {
    $schema: "https://arcana.ai/config.json",
    skills: { paths: skillsDirs },
  }
  if (Object.keys(provider).length) config.provider = provider

  const cacheDir = join(home, "cache")
  await mkdir(cacheDir, { recursive: true })
  const configPath = join(cacheDir, "opencode-config.json")
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf8")

  // Ensure models.dev cache exists — a cold fetch has 10s timeout.
  // Warm it once in the background so the TUI doesn't block on first run.
  const modelsDevCache = join(homedir(), ".cache", "arcana", "models-dev.json")
  if (!existsSync(modelsDevCache)) {
    // Fire-and-forget: don't block startup on this
    fetch("https://models.dev/api.json", { signal: AbortSignal.timeout(10000) })
      .then((r) => r.text())
      .then(async (text) => {
        await mkdir(dirname(modelsDevCache), { recursive: true })
        await writeFile(modelsDevCache, text, "utf8")
      })
      .catch(() => {}) // silent — TUI will try its own fetch
  }

  cachedPath = configPath
  return configPath
}
