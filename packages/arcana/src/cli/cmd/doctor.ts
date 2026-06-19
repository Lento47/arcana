import type { CommandModule } from "yargs"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { loadConfig } from "../../config.js"

const PASS = "✅"
const FAIL = "❌"
const WARN = "⚠️"

export const DoctorCommand: CommandModule = {
  command: "doctor",
  describe: "check arcana system health",
  async handler() {
    const checks: { label: string; ok: boolean; detail: string }[] = []

    // Bun version
    const bunVer = (Bun as any).version ?? process.versions.bun ?? "?"
    checks.push({ label: "Bun runtime", ok: !!bunVer, detail: `v${bunVer}` })

    // node_modules
    const nm = [join(import.meta.dir, "..", "..", "..", "..", "..", "node_modules"), join(import.meta.dir, "..", "..", "..", "..", "node_modules")].find(existsSync)
    checks.push({ label: "node_modules", ok: !!nm, detail: nm ? `found` : "missing — run bun install" })

    // Config
    try {
      const config = await loadConfig()
      checks.push({ label: "Config file", ok: true, detail: `provider=${config.provider}, model=${config.model}` })
      checks.push({ label: "API key", ok: !!config.apiKey, detail: config.apiKey ? `set (…${config.apiKey.slice(-4)})` : "not set — set ARCANA_API_KEY" })
    } catch (e: any) {
      checks.push({ label: "Config file", ok: false, detail: `error: ${e.message}` })
    }

    // Models cache
    const cache = join(homedir(), ".cache", "arcana", "models-dev.json")
    const cacheOk = existsSync(cache)
    checks.push({ label: "Models cache", ok: cacheOk, detail: cacheOk ? `${cache}` : "missing — first launch will fetch models.dev" })

    // Skills cache
    const skillCache = join(homedir(), ".cache", "arcana", "skills-cache.json")
    const skillCacheOk = existsSync(skillCache)
    checks.push({ label: "Skills cache", ok: skillCacheOk, detail: skillCacheOk ? `${skillCache}` : "not yet populated — will build on first startup" })

    // Bridge config
    const bridgeConfig = join(homedir(), ".arcana", "cache", "opencode-config.json")
    const bridgeOk = existsSync(bridgeConfig)
    checks.push({ label: "Bridge config", ok: bridgeOk, detail: bridgeOk ? `${bridgeConfig}` : "missing — TUI may not find skills" })

    // .arcana dirs
    const arcanaHome = join(homedir(), ".arcana")
    checks.push({ label: "Arcana home", ok: existsSync(arcanaHome), detail: arcanaHome })

    // Print
    const ok = checks.filter((c) => c.ok).length
    const total = checks.length
    console.log(`\n  arcana doctor — ${ok}/${total} checks pass\n`)
    for (const c of checks) {
      console.log(`  ${c.ok ? PASS : c.detail.includes("error") ? FAIL : WARN} ${c.label}: ${c.detail}`)
    }
    console.log()
  },
}
