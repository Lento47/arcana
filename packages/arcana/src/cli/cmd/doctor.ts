import type { CommandModule } from "yargs"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { createRequire } from "node:module"
import { loadConfig } from "../../config.js"
import { currentDir } from "../../util/path.js"
import { outputJson, isJsonMode, jsonOption } from "../json-output.js"

const require = createRequire(import.meta.url)

const PASS = "✅"
const FAIL = "❌"
const WARN = "⚠️"

type Check = { label: string; ok: boolean; detail: string }

async function runBaseChecks(): Promise<Check[]> {
  const checks: Check[] = []

  // Bun version
  const bunVer = typeof (globalThis as any).Bun !== "undefined"
    ? (Bun as any).version ?? process.versions.bun ?? "?"
    : process.versions.bun ?? "?"
  checks.push({ label: "Bun runtime", ok: !!bunVer, detail: `v${bunVer}` })

  // node_modules
  const nm = [join(currentDir(import.meta), "..", "..", "..", "..", "..", "node_modules"), join(currentDir(import.meta), "..", "..", "..", "..", "node_modules")].find(existsSync)
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
  const bridgeConfig = join(homedir(), ".arcana", "cache", "bridge-config.json")
  const bridgeOk = existsSync(bridgeConfig)
  checks.push({ label: "Bridge config", ok: bridgeOk, detail: bridgeOk ? `${bridgeConfig}` : "missing — TUI may not find skills" })

  // .arcana dirs
  const arcanaHome = join(homedir(), ".arcana")
  checks.push({ label: "Arcana home", ok: existsSync(arcanaHome), detail: arcanaHome })

  return checks
}

function runWebChecks(): Check[] {
  const checks: Check[] = []
  // repoRoot = packages/arcana/src/cli/cmd/doctor.ts → ../../../..
  const repoRoot = join(currentDir(import.meta), "..", "..", "..", "..", "..")
  const enterpriseDir = join(repoRoot, "packages", "enterprise")

  const pkgPath = join(enterpriseDir, "package.json")
  const pkgOk = existsSync(pkgPath)
  checks.push({ label: "Enterprise package", ok: pkgOk, detail: pkgOk ? pkgPath : `${enterpriseDir} missing — web command will exit` })

  if (pkgOk) {
    const dist = join(enterpriseDir, ".output", "public")
    const srcDir = join(enterpriseDir, "src")
    const distOk = existsSync(dist)
    checks.push({ label: "Enterprise source", ok: existsSync(srcDir), detail: existsSync(srcDir) ? srcDir : "missing — web command will not start" })
    checks.push({ label: "Enterprise build", ok: distOk, detail: distOk ? dist : "not built — run `arcana web --build` to produce" })
  }

  // Vite
  try {
    const vitePath = require.resolve("vite", { paths: [join(repoRoot, "node_modules"), join(repoRoot, "packages", "enterprise", "node_modules")] })
    checks.push({ label: "Vite", ok: true, detail: vitePath })
  } catch {
    checks.push({ label: "Vite", ok: false, detail: "vite not resolvable from repo root — run bun install" })
  }

  // Default port 3002 from packages/enterprise/vite.config.ts
  const defaultPort = 3002
  checks.push({ label: "Default port", ok: true, detail: `${defaultPort} (override with --port)` })

  return checks
}

function printChecks(title: string, checks: Check[]) {
  const ok = checks.filter((c) => c.ok).length
  const total = checks.length
  console.log(`\n  arcana doctor ${title}— ${ok}/${total} checks pass\n`)
  for (const c of checks) {
    console.log(`  ${c.ok ? PASS : c.detail.includes("error") ? FAIL : WARN} ${c.label}: ${c.detail}`)
  }
  console.log()
}

export const DoctorCommand: CommandModule = {
  command: "doctor",
  describe: "check arcana system health",
  builder: (yargs) =>
    yargs.option("web", {
      type: "boolean",
      default: false,
      describe: "include web app checks (packages/enterprise, vite, port, build)",
    })
    .option("json", {
      type: "boolean",
      default: false,
      describe: "output machine-readable JSON to stdout",
    }),
  async handler(args) {
    const checks = await runBaseChecks()
    const webFlag = Boolean((args as { web?: unknown }).web)
    if (webFlag) {
      checks.push(...runWebChecks())
    }
    if (isJsonMode(args)) {
      outputJson(checks.map((c) => ({ label: c.label, ok: c.ok, detail: c.detail })))
      return
    }
    printChecks(webFlag ? "--web " : "", checks)
  },
}
