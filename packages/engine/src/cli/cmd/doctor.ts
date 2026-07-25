import type { CommandModule } from "yargs"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const PASS = "✅"
const FAIL = "❌"
const WARN = "⚠️"

type Check = { label: string; ok: boolean; detail: string }

function runChecks(): Check[] {
  const checks: Check[] = []

  // Platform
  checks.push({ label: "Platform", ok: true, detail: `${process.platform} ${process.arch}` })

  // Bun / Node
  const bunVer = typeof (globalThis as any).Bun !== "undefined"
    ? (Bun as any).version ?? "?"
    : process.versions.bun ?? process.versions.node ?? "?"
  checks.push({ label: "Runtime", ok: !!bunVer, detail: `v${bunVer}` })

  // Arcana home
  const arcanaHome = join(homedir(), ".arcana")
  checks.push({ label: "Arcana home", ok: existsSync(arcanaHome), detail: arcanaHome })

  // Proxy key
  const proxyKey = join(homedir(), ".arcana", "proxy_key")
  const keyOk = existsSync(proxyKey)
  checks.push({ label: "Proxy key", ok: keyOk, detail: keyOk ? "found" : "missing — run arcana console login" })

  // Models cache (models.dev)
  const modelsCache = join(homedir(), ".cache", "arcana", "models.json")
  const modelsOk = existsSync(modelsCache)
  checks.push({ label: "Models cache", ok: modelsOk, detail: modelsOk ? modelsCache : "missing — fetched on first launch" })

  // Proxy models cache
  const proxyModelsCache = join(homedir(), ".arcana", "cache", "proxy-models.json")
  const proxyOk = existsSync(proxyModelsCache)
  checks.push({ label: "Proxy catalog", ok: proxyOk, detail: proxyOk ? proxyModelsCache : "missing — fetched on first proxy connect" })

  // Skills cache
  const skillCache = join(homedir(), ".cache", "arcana", "skills-cache.json")
  const skillOk = existsSync(skillCache)
  checks.push({ label: "Skills cache", ok: skillOk, detail: skillOk ? skillCache : "not yet populated" })

  // License cache
  const licCache = join(homedir(), ".arcana", ".license-cache.json")
  const licOk = existsSync(licCache)
  checks.push({ label: "License", ok: licOk, detail: licOk ? "cached" : "not cached — run arcana console login" })

  // Version
  try {
    const pkg = require("../../../package.json")
    checks.push({ label: "Version", ok: true, detail: pkg.version ?? "?" })
  } catch {
    checks.push({ label: "Version", ok: true, detail: "bundled" })
  }

  return checks
}

export const DoctorCommand: CommandModule = {
  command: "doctor",
  describe: "check arcana system health",
  async handler() {
    const checks = runChecks()
    const ok = checks.filter((c) => c.ok).length
    const total = checks.length
    console.log(`\n  arcana doctor — ${ok}/${total} checks pass\n`)
    for (const c of checks) {
      console.log(`  ${c.ok ? PASS : c.detail.includes("missing") ? WARN : FAIL} ${c.label}: ${c.detail}`)
    }
    console.log()
  },
}
