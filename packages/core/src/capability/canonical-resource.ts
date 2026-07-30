/**
 * Phase C Gap Closure: Canonical Resource utilities
 *
 * Provides path canonicalization and segment-based subset checking
 * for resource comparison in the delegation system.
 *
 * Key security properties:
 * - Paths are normalized (separators, duplicates, trailing slashes)
 * - '..' traversal is rejected
 * - Segment-based comparison prevents prefix confusion attacks
 *   (e.g., 'packages/engine-malicious' is NOT a subset of 'packages/engine')
 */

import type { CanonicalResource, ResourceSelector } from "./types"

// ─── Path Canonicalization ────────────────────────────────────────────

/**
 * Canonicalize a path string.
 * - Normalizes backslashes to forward slashes
 * - Removes duplicate slashes
 * - Removes trailing slashes
 * - Rejects '..' traversal (returns empty string)
 * - Removes './' segments
 */
export function canonicalizePath(p: string): string {
  // Normalize separators to forward slash
  let normalized = p.replace(/\\/g, "/")

  // Remove duplicate slashes
  normalized = normalized.replace(/\/+/g, "/")

  // Remove './' segments
  normalized = normalized.replace(/\/\.\//g, "/")
  if (normalized.startsWith("./")) {
    normalized = normalized.slice(2)
  }

  // Remove trailing slash (unless root)
  normalized = normalized.replace(/\/$/, "")

  // Reject '..' traversal
  if (normalized.includes("..")) return ""

  return normalized
}

// ─── Segment-Based Subset Checking ────────────────────────────────────

/**
 * Check if child path is a segment-based subset of parent path.
 * This prevents prefix confusion attacks.
 *
 * Examples:
 * - isSegmentSubset('packages/engine/src', 'packages/engine') → true
 * - isSegmentSubset('packages/engine', 'packages') → true
 * - isSegmentSubset('packages/engine-malicious', 'packages/engine') → false
 * - isSegmentSubset('packages/engine', 'packages/engine') → true
 */
export function isSegmentSubset(child: string, parent: string): boolean {
  const c = canonicalizePath(child)
  const p = canonicalizePath(parent)

  // If either path failed canonicalization, not a subset
  if (c.length === 0 || p.length === 0) return false

  // Exact match
  if (c === p) return true

  // Child must start with parent followed by a path separator
  // This ensures 'packages/engine-malicious' does NOT match 'packages/engine'
  return c.startsWith(p + "/")
}

// ─── Canonical Resource Validation ────────────────────────────────────

/**
 * Validate a CanonicalResource has no '..' traversal in any path-like field.
 * Returns null if valid, or an error message if invalid.
 */
export function validateCanonicalResource(resource: CanonicalResource): string | null {
  if (resource.path) {
    if (resource.path.includes("..")) {
      return `Resource path '${resource.path}' contains '..' traversal`
    }
  }
  if (resource.executable) {
    if (resource.executable.includes("..")) {
      return `Resource executable '${resource.executable}' contains '..' traversal`
    }
  }
  if (resource.host) {
    if (resource.host.includes("..")) {
      return `Resource host '${resource.host}' contains '..' traversal`
    }
  }
  return null
}

// ─── Resource Selector Validation ─────────────────────────────────────

/**
 * Validate a ResourceSelector has no '..' traversal in its pattern.
 * Returns null if valid, or an error message if invalid.
 */
export function validateResourceSelector(selector: ResourceSelector): string | null {
  if (selector.pattern.includes("..")) {
    return `Resource selector pattern '${selector.pattern}' contains '..' traversal`
  }
  return null
}

// ─── Canonical Resource Narrower-or-Equal ─────────────────────────────

/**
 * Check if child CanonicalResource is narrower than or equal to parent.
 * Uses canonical paths for comparison and rejects '..' in child paths.
 *
 * Returns true if child ⊆ parent (child is more restrictive).
 */
export function isCanonicalResourceNarrowerOrEqual(
  child: CanonicalResource,
  parent: CanonicalResource,
): boolean {
  // Kind must match
  if (child.kind !== parent.kind) return false

  // Validate child has no traversal
  const childError = validateCanonicalResource(child)
  if (childError) return false

  switch (child.kind) {
    case "file":
    case "directory":
    case "git":
    case "package":
    case "policy": {
      // Path-based comparison
      const childPath = child.path ? canonicalizePath(child.path) : ""
      const parentPath = parent.path ? canonicalizePath(parent.path) : ""

      // Wildcard parent matches anything
      if (parentPath === "*" || parentPath === "**" || parentPath === "/*") return true

      // Child wildcard with non-wildcard parent: not narrower
      if (childPath === "*" || childPath === "**" || childPath === "/*") return false

      // Exact match
      if (childPath === parentPath) return true

      // Segment-based descendant check
      return isSegmentSubset(childPath, parentPath)
    }

    case "process": {
      // Executable comparison
      const childExe = child.executable ?? ""
      const parentExe = parent.executable ?? ""

      if (parentExe === "*") return true
      if (childExe === "*") return false

      // Normalize: extract basename
      const cBase = childExe.split(/[/\\]/).pop() ?? childExe
      const pBase = parentExe.split(/[/\\]/).pop() ?? parentExe
      return cBase === pBase
    }

    case "network": {
      // Host comparison
      const childHost = (child.host ?? "").toLowerCase()
      const parentHost = (parent.host ?? "").toLowerCase()

      if (parentHost === "*" || parentHost === "**") return true
      if (childHost === parentHost) return true

      // Wildcard subdomain
      if (parentHost.startsWith("*.")) {
        const suffix = parentHost.slice(1)
        if (!childHost.endsWith(suffix)) return false
        const prefix = childHost.slice(0, -suffix.length)
        return prefix.length > 0 && !prefix.includes(".")
      }

      return false
    }

    case "secret": {
      // Exact comparison
      return (child.secretKind ?? "") === (parent.secretKind ?? "")
    }

    default:
      return false
  }
}
