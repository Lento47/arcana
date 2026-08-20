import { realpathSync } from "node:fs"
import { win32 } from "node:path"
import { stat } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

export function normalizePath(input: string, platform: string) {
  if (platform !== "win32") return input
  const resolved = win32.normalize(win32.resolve(input.replaceAll("/", "\\")))
  try {
    return realpathSync.native(resolved)
  } catch {
    return resolved
  }
}

/**
 * Portable `which`: resolve a command name to an absolute path using PATH,
 * or return the input if it is already an absolute/relative path that exists.
 */
export async function which(name: string): Promise<string | undefined> {
  if (path.isAbsolute(name)) {
    try {
      await stat(name)
      return name
    } catch {
      return undefined
    }
  }

  const pathEnv = process.env.PATH ?? ""
  const pathExt = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";") : [""]
  const dirs = pathEnv.split(process.platform === "win32" ? ";" : ":").filter(Boolean)

  for (const dir of dirs) {
    for (const ext of pathExt) {
      const candidate = path.join(dir, process.platform === "win32" ? `${name}${ext}`.toLowerCase() : `${name}${ext}`)
      try {
        const info = await stat(candidate)
        if (info.isFile()) return candidate
      } catch {
        // continue
      }
    }
  }

  // Relative path that exists in cwd
  try {
    const info = await stat(name)
    if (info.isFile()) return path.resolve(name)
  } catch {
    // fall through
  }

  return undefined
}
