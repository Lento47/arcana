/**
 * Path set utilities for write-set / read-set conflict detection (Phase 2).
 */
import path from "node:path"

/** Normalize a path for conflict comparison (absolute, posix-ish). */
export function canonicalizePath(raw: string, cwd = process.cwd()): string {
  const trimmed = raw.trim()
  if (!trimmed) return ""
  try {
    const abs = path.isAbsolute(trimmed) ? trimmed : path.resolve(cwd, trimmed)
    // Normalize separators and strip trailing slashes (except root)
    let normalized = path.normalize(abs).replace(/\\/g, "/")
    if (normalized.length > 1 && normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1)
    }
    return normalized.toLowerCase() // Windows-safe path equality
  } catch {
    return trimmed.replace(/\\/g, "/").toLowerCase()
  }
}

export function canonicalizeSet(paths: string[], cwd?: string): string[] {
  const out = new Set<string>()
  for (const p of paths) {
    const c = canonicalizePath(p, cwd)
    if (c) out.add(c)
  }
  return [...out]
}

/** True if two path sets share any path. */
export function setsIntersect(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return false
  const setB = new Set(b)
  return a.some((p) => setB.has(p))
}

/**
 * Conflict if:
 * - write sets overlap, or
 * - either write set intersects the other's read set
 * (read∩read alone is not a conflict)
 */
export function pathSetsConflict(
  a: { readSet: string[]; writeSet: string[] },
  b: { readSet: string[]; writeSet: string[] },
  cwd?: string,
): boolean {
  const aR = canonicalizeSet(a.readSet, cwd)
  const aW = canonicalizeSet(a.writeSet, cwd)
  const bR = canonicalizeSet(b.readSet, cwd)
  const bW = canonicalizeSet(b.writeSet, cwd)
  if (setsIntersect(aW, bW)) return true
  if (setsIntersect(aW, bR)) return true
  if (setsIntersect(bW, aR)) return true
  return false
}
