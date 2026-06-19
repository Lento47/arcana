import { createHash } from "node:crypto"
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const MACHINE_ID_PATH = join(homedir(), ".arcana", "machine_id")

export function getMachineId(): string {
  try {
    if (existsSync(MACHINE_ID_PATH)) {
      return readFileSync(MACHINE_ID_PATH, "utf8").trim()
    }
  } catch {}
  const raw = `${process.env.COMPUTERNAME ?? osHostname()}-${process.platform}-${process.arch}`
  const id = createHash("sha256").update(raw).digest("hex").slice(0, 16)
  try {
    mkdirSync(join(homedir(), ".arcana"), { recursive: true })
    writeFileSync(MACHINE_ID_PATH, id, "utf8")
  } catch {}
  return id
}

function osHostname(): string {
  try { return require("node:os").hostname() } catch { return "unknown" }
}
