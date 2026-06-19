export * as ConfigManaged from "./managed"

import { existsSync } from "fs"
import os from "os"
import path from "path"
import { Process } from "@/util/process"

const MANAGED_PLIST_DOMAIN = "com.arcana.managed"
const MANAGED_PLIST_DOMAIN_LEGACY = "ai.opencode.managed"

// Keys injected by macOS/MDM into the managed plist that are not OpenCode config
const PLIST_META = new Set([
  "PayloadDisplayName",
  "PayloadIdentifier",
  "PayloadType",
  "PayloadUUID",
  "PayloadVersion",
  "_manualProfile",
])

function systemManagedConfigDirs(): string[] {
  switch (process.platform) {
    case "darwin":
      return ["/Library/Application Support/arcana", "/Library/Application Support/opencode"]
    case "win32":
      return [
        path.join(process.env.ProgramData || "C:\\ProgramData", "arcana"),
        path.join(process.env.ProgramData || "C:\\ProgramData", "opencode"),
      ]
    default:
      return ["/etc/arcana", "/etc/opencode"]
  }
}

export function managedConfigDir() {
  if (process.env.ARCANA_TEST_MANAGED_CONFIG_DIR) return process.env.ARCANA_TEST_MANAGED_CONFIG_DIR
  const dirs = systemManagedConfigDirs()
  for (const dir of dirs) {
    if (existsSync(dir)) return dir
  }
  return dirs[0]
}

export function parseManagedPlist(json: string): string {
  const raw = JSON.parse(json)
  for (const key of Object.keys(raw)) {
    if (PLIST_META.has(key)) delete raw[key]
  }
  return JSON.stringify(raw)
}

export async function readManagedPreferences() {
  if (process.platform !== "darwin") return

  const user = (() => {
    try {
      return os.userInfo().username || "user"
    } catch {
      return "user"
    }
  })()
  const paths = [
    path.join("/Library/Managed Preferences", user, `${MANAGED_PLIST_DOMAIN}.plist`),
    path.join("/Library/Managed Preferences", `${MANAGED_PLIST_DOMAIN}.plist`),
    path.join("/Library/Managed Preferences", user, `${MANAGED_PLIST_DOMAIN_LEGACY}.plist`),
    path.join("/Library/Managed Preferences", `${MANAGED_PLIST_DOMAIN_LEGACY}.plist`),
  ]

  for (const plist of paths) {
    if (!existsSync(plist)) continue
    const result = await Process.run(["plutil", "-convert", "json", "-o", "-", plist], { nothrow: true })
    if (result.code !== 0) continue
    return {
      source: `mobileconfig:${plist}`,
      text: parseManagedPlist(result.stdout.toString()),
    }
  }

  return
}
