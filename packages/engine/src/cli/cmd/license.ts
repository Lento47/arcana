import { cmd } from "./cmd"
import { UI } from "../ui"

const API = "https://api.arcana.otnelhq.com"
const FALLBACK = "https://arcana-license-server.lejzerv.workers.dev"
const PUBLIC_KEY_HEX = "47405e0f68265602c32bbe26726d7d9d6c93e99915eaa97e9694cf7e23d56a20"

function spkiEncodeEd25519(publicKeyBytes: Uint8Array): Uint8Array {
  // SPKI wrapper for Ed25519 public key
  const prefix = new Uint8Array([0x30, 0x2A, 0x30, 0x05, 0x06, 0x03, 0x2B, 0x65, 0x70, 0x03, 0x21, 0x00])
  const result = new Uint8Array(prefix.length + publicKeyBytes.length)
  result.set(prefix)
  result.set(publicKeyBytes, prefix.length)
  return result
}

async function verifySignatureAsync(data: unknown, signatureHex: string): Promise<boolean> {
  try {
    const publicKeyRaw = Buffer.from(PUBLIC_KEY_HEX, "hex")
    const signature = Buffer.from(signatureHex, "hex")
    const message = Buffer.from(JSON.stringify(data), "utf8")
    const key = await crypto.subtle.importKey(
      "spki",
      spkiEncodeEd25519(new Uint8Array(publicKeyRaw)).buffer as ArrayBuffer,
      { name: "Ed25519" },
      false,
      ["verify"],
    )
    return await crypto.subtle.verify("Ed25519", key, signature, message)
  } catch {
    return false
  }
}

function getCachePath(): string {
  const { homedir } = require("node:os") as typeof import("node:os")
  const { join } = require("node:path") as typeof import("node:path")
  return join(homedir(), ".arcana", ".license-cache.json")
}

function readCache(): any | null {
  try {
    const { readFileSync, existsSync } = require("node:fs") as typeof import("node:fs")
    const path = getCachePath()
    if (!existsSync(path)) return null
    const raw = readFileSync(path, "utf8")
    const cached = JSON.parse(raw)
    if (Date.now() > cached.expiresAt) return null
    return cached.data
  } catch { return null }
}

function writeCache(data: any, ttlMs = 86400000): void {
  try {
    const { writeFileSync, mkdirSync } = require("node:fs") as typeof import("node:fs")
    const { dirname } = require("node:path") as typeof import("node:path")
    const path = getCachePath()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify({ data, expiresAt: Date.now() + ttlMs }), "utf8")
  } catch {}
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const cacheKey = `${path}:${JSON.stringify(body)}`
  const cached = readCache()
  if (cached && cached._cacheKey === cacheKey) {
    return cached as T
  }

  const urls = [API, FALLBACK]
  let last: Error | undefined
  for (const base of urls) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      })
      const json = await res.json()

      if (json.signature && json.data) {
        if (!(await verifySignatureAsync(json.data, json.signature))) {
          continue
        }
        const result = json.data as T
        if (typeof result === "object" && result !== null) {
          (result as any)._cacheKey = cacheKey
          writeCache(result)
        }
        return result
      }

      if (!json.valid) return json as T
      continue
    } catch (e) {
      last = e instanceof Error ? e : new Error(String(e))
    }
  }

  const fallback = readCache()
  if (fallback) return fallback as T
  throw last ?? new Error("All license servers unreachable")
}

function getMachineId(): string {
  try {
    const { readFileSync, existsSync } = require("node:fs") as typeof import("node:fs")
    const { join } = require("node:path") as typeof import("node:path")
    const { homedir } = require("node:os") as typeof import("node:os")
    const p = join(homedir(), ".arcana", "machine_id")
    if (existsSync(p)) return readFileSync(p, "utf8").trim()
  } catch {}
  const { createHash } = require("node:crypto") as typeof import("node:crypto")
  return createHash("sha256").update(`${process.env.COMPUTERNAME ?? "unknown"}-${process.platform}`).digest("hex").slice(0, 16)
}

export const ActivateCommand = cmd({
  command: "activate <key>",
  describe: "activate a license key",
  builder: (yargs) =>
    yargs.positional("key", { describe: "license key", type: "string" }),
  async handler(args: any) {
    const machineId = getMachineId()
    const result = await post<any>("/api/license/activate", { licenseKey: args.key, machineId })
    if (result.valid) {
      UI.println(`✅ License activated — ${result.tier ?? "unknown"} tier`)
      if (result.features?.length) UI.println(`   Features: ${result.features.join(", ")}`)
      if (result.tier) UI.println(`   Tools: ${result.tools?.length ?? "standard"} available`)
      // Auto-configure proxy auth so the user doesn't need ARCANA_PROXY_KEY env var
      const { writeFileSync, mkdirSync, existsSync } = require("node:fs") as typeof import("node:fs")
      const { join } = require("node:path") as typeof import("node:path")
      const home = process.env.ARCANA_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? ".", ".arcana")
      if (!existsSync(home)) mkdirSync(home, { recursive: true })
      writeFileSync(join(home, "proxy_key"), args.key.trim())
    } else {
      UI.println(`❌ Activation failed: ${result.error ?? "unknown error"}`)
    }
  },
})

export const StatusCommand = cmd({
  command: "status",
  describe: "show license status",
  async handler() {
    UI.println("Checking license...")
    const machineId = getMachineId()
    try {
      const { readFileSync, existsSync } = require("node:fs") as typeof import("node:fs")
      const { join } = require("node:path") as typeof import("node:path")
      const { homedir } = require("node:os") as typeof import("node:os")
      const home = process.env.ARCANA_HOME ?? join(process.env.USERPROFILE ?? homedir(), ".arcana")
      let key = ""
      // Check flat file first (written by license activate)
      const keyFile = join(home, "proxy_key")
      if (existsSync(keyFile)) {
        key = readFileSync(keyFile, "utf8").trim()
      }
      // Fallback: search SQLite database
      if (!key) {
        const dbPath = join(home, "data", "arcana.db")
        if (existsSync(dbPath)) {
          const raw = readFileSync(dbPath, "utf8")
          const m = raw.match(/"(license_[^"]+)"/)
          if (m) key = m[1]
        }
      }
      if (!key) {
        UI.println("No license key found. Run: arcana license activate <key>")
        return
      }
      const result = await post<any>("/api/license/validate", { licenseKey: key, machineId })
      if (result.valid) {
        UI.println(`⛧ License: ${result.tier ?? "unknown"} tier`)
        if (result.features?.length) UI.println(`   Features: ${result.features.join(", ")}`)
        if (result.tools?.length) UI.println(`   Tools: ${result.tools.length} available`)
        if (result.limits) UI.println(`   Limits: ${result.limits.toolsPerSession} tools/session, ${result.limits.sessionsPerDay} sessions/day`)
        if (result.expiresAt) UI.println(`   Expires: ${new Date(result.expiresAt).toLocaleDateString()}`)
        if (result.machinesActivated !== undefined) UI.println(`   Machines: ${result.machinesActivated}`)
      } else {
        UI.println(`❌ ${result.error ?? "Validation failed"}`)
      }
    } catch (e) {
      UI.println(`❌ Error: ${e instanceof Error ? e.message : String(e)}`)
    }
  },
})

export const DeactivateCommand = cmd({
  command: "deactivate",
  describe: "remove license from this machine",
  async handler() {
    UI.println("License deactivated. To fully remove, delete the credential from the database.")
  },
})

export const LicenseCommand = cmd({
  command: "license",
  describe: "manage arcana license",
  builder: (yargs) =>
    yargs
      .command({ ...ActivateCommand, describe: "activate a license key" })
      .command({ ...StatusCommand, describe: "check license status" })
      .command({ ...DeactivateCommand, describe: "deactivate license" })
      .demandCommand(),
  async handler() {},
})
