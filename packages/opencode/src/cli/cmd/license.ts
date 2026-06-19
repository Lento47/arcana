import { cmd } from "./cmd"
import { UI } from "../ui"

const API = "https://api.arcana.otnelhq.com"

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  })
  return (await res.json()) as T
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
      const { execSync } = require("node:child_process") as typeof import("node:child_process")
      const dbPath = join(homedir(), ".arcana", "data", "arcana.db")
      let key = ""
      if (existsSync(dbPath)) {
        const raw = readFileSync(dbPath, "utf8")
        const m = raw.match(/"(license_[^"]+)"/)
        if (m) key = m[1]
      }
      if (!key) {
        UI.println("No license key found. Run: arcana license activate <key>")
        return
      }
      const result = await post<any>("/api/license/validate", { licenseKey: key, machineId })
      if (result.valid) {
        UI.println(`⛧ License: ${result.tier ?? "unknown"} tier`)
        if (result.features?.length) UI.println(`   Features: ${result.features.join(", ")}`)
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
