/**
 * Path extraction + canonicalization for engine write-set locking (Phase 2).
 */
import path from "path"
import { FSUtil } from "@arcana/core/fs-util"
import { classifyToolName } from "./classify"

export function canonicalizePath(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ""
  try {
    return FSUtil.resolve(trimmed).replace(/\\/g, "/").toLowerCase()
  } catch {
    return path.normalize(trimmed).replace(/\\/g, "/").toLowerCase()
  }
}

function collectPaths(input: unknown, keys: string[]): string[] {
  if (!input || typeof input !== "object") return []
  const record = input as Record<string, unknown>
  const out: string[] = []
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) out.push(value.trim())
    else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.trim()) out.push(item.trim())
      }
    }
  }
  return out
}

/**
 * Paths that must be exclusively locked for this tool call.
 * Write tools lock the target file; rename locks source+dest when present.
 */
export function extractLockedPaths(toolName: string, input: unknown): string[] {
  const capability = classifyToolName(toolName)
  if (capability !== "write") return []

  const name = toolName.toLowerCase()
  const keys =
    name === "rename"
      ? ["path", "filePath", "filepath", "file", "from", "to", "oldPath", "newPath"]
      : ["path", "filePath", "filepath", "file"]

  // apply_patch may embed paths in patch text — best-effort from known fields
  const raw = collectPaths(input, keys)
  if (name === "apply_patch" || name === "applypatch") {
    const patch = typeof (input as any)?.patchText === "string" ? (input as any).patchText : ""
    // Minimal: *** Update File: path / *** Add File: path
    for (const match of patch.matchAll(/\*\*\*\s+(?:Update|Add|Delete|Move)\s+File:\s+(.+)$/gm)) {
      const p = match[1]?.trim()
      if (p) raw.push(p)
    }
  }

  return [...new Set(raw.map(canonicalizePath).filter(Boolean))]
}
