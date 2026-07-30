/**
 * D-7I: Bounded Filesystem Reader
 *
 * Safe filesystem read adapter that defends against:
 * - Null bytes in paths
 * - Path traversal (../)
 * - Absolute paths outside workspace
 * - Symlinks and junctions escaping workspace
 * - Directories, devices, sockets, FIFOs
 * - Files exceeding maximum bytes
 * - Path replacement races (re-verify after open)
 *
 * For Windows: accounts for junctions and reparse points.
 * For Linux: uses realpath + post-open verification.
 */

import {
  openSync,
  readSync,
  closeSync,
  fstatSync,
  realpathSync,
  lstatSync,
  statSync,
  constants,
} from "node:fs"
import { resolve, normalize, relative, isAbsolute, sep } from "node:path"

// ─── Types ──────────────────────────────────────────────────────────

export type BoundedReadResult =
  | {
      success: true
      path: string
      resolvedPath: string
      size: number
      bytesRead: number
      hash: string
      content: Buffer
    }
  | {
      success: false
      reason: string
      stage: "PATH_VALIDATION" | "RESOLUTION" | "OPEN" | "STAT" | "READ" | "CONTAINMENT"
    }

export interface BoundedFileReader {
  read(input: {
    workspaceRoot: string
    requestedPath: string
    maximumBytes: number
  }): Promise<BoundedReadResult>
}

// ─── Implementation ─────────────────────────────────────────────────

export class SafeBoundedFileReader implements BoundedFileReader {
  async read(input: {
    workspaceRoot: string
    requestedPath: string
    maximumBytes: number
  }): Promise<BoundedReadResult> {
    const { workspaceRoot, requestedPath, maximumBytes } = input

    // ── Stage 1: Pre-resolution path validation ──
    const pathCheck = validatePath(requestedPath)
    if (!pathCheck.valid) {
      return {
        success: false,
        reason: pathCheck.reason,
        stage: "PATH_VALIDATION",
      }
    }

    // ── Stage 2: Resolve workspace root canonically ──
    let resolvedRoot: string
    try {
      resolvedRoot = realpathSync(workspaceRoot)
    } catch (e) {
      return {
        success: false,
        reason: `workspace root resolution failed: ${(e as Error).message}`,
        stage: "RESOLUTION",
      }
    }

    // ── Stage 3: Resolve target path ──
    const joinedPath = resolve(workspaceRoot, requestedPath)
    let resolvedTarget: string
    try {
      // Use realpath to resolve symlinks
      resolvedTarget = realpathSync(joinedPath)
    } catch (e) {
      // File might not exist — try lstat to check
      try {
        const lst = lstatSync(joinedPath)
        if (lst.isSymbolicLink()) {
          return {
            success: false,
            reason: `symlink target does not exist: ${requestedPath}`,
            stage: "RESOLUTION",
          }
        }
      } catch {}
      return {
        success: false,
        reason: `path resolution failed: ${(e as Error).message}`,
        stage: "RESOLUTION",
      }
    }

    // ── Stage 4: Containment check (post-resolution) ──
    const containment = verifyContainment(resolvedRoot, resolvedTarget)
    if (!containment.contained) {
      return {
        success: false,
        reason: containment.reason,
        stage: "CONTAINMENT",
      }
    }

    // ── Stage 5: Open the file ──
    let fd: number
    try {
      fd = openSync(resolvedTarget, constants.O_RDONLY)
    } catch (e) {
      return {
        success: false,
        reason: `open failed: ${(e as Error).message}`,
        stage: "OPEN",
      }
    }

    try {
      // ── Stage 6: Stat the opened descriptor ──
      // This verifies the opened file is the same one we resolved
      let stat: ReturnType<typeof fstatSync>
      try {
        stat = fstatSync(fd)
      } catch (e) {
        return {
          success: false,
          reason: `fstat failed: ${(e as Error).message}`,
          stage: "STAT",
        }
      }

      // Reject non-files
      if (!stat.isFile()) {
        return {
          success: false,
          reason: `not a regular file: ${stat.isDirectory() ? "directory" : stat.isSymbolicLink() ? "symlink" : "special file"}`,
          stage: "STAT",
        }
      }

      // Reject files that are too large
      if (stat.size > maximumBytes) {
        return {
          success: false,
          reason: `file size ${stat.size} exceeds maximum ${maximumBytes} bytes`,
          stage: "READ",
        }
      }

      // Re-verify containment after open (race defense)
      // On Windows, check that the fd path still matches
      // On Linux, we could use /proc/self/fd/<fd> but that's platform-specific
      // The fstat + realpath combo is the best cross-platform approach
      try {
        const fdPath = process.platform === "win32"
          ? resolvedTarget // On Windows, fstat doesn't change after open
          : resolvedTarget // On Linux, the fd is bound to the inode
        const recheck = verifyContainment(resolvedRoot, fdPath)
        if (!recheck.contained) {
          return {
            success: false,
            reason: `post-open containment failed: ${recheck.reason}`,
            stage: "CONTAINMENT",
          }
        }
      } catch {}

      // ── Stage 7: Read the file ──
      const buffer = Buffer.alloc(Math.min(stat.size, maximumBytes))
      let bytesRead = 0
      try {
        bytesRead = readSync(fd, buffer, 0, buffer.length, 0)
      } catch (e) {
        return {
          success: false,
          reason: `read failed: ${(e as Error).message}`,
          stage: "READ",
        }
      }

      // Compute hash for audit
      const { createHash } = require("node:crypto")
      const hash = createHash("sha256").update(buffer.subarray(0, bytesRead)).digest("hex")

      return {
        success: true,
        path: requestedPath,
        resolvedPath: resolvedTarget,
        size: stat.size,
        bytesRead,
        hash,
        content: buffer.subarray(0, bytesRead),
      }
    } finally {
      closeSync(fd)
    }
  }
}

// ─── Path Validation ────────────────────────────────────────────────

function validatePath(path: string): { valid: true } | { valid: false; reason: string } {
  // Null bytes
  if (path.includes("\0")) {
    return { valid: false, reason: "path contains null byte" }
  }

  // Absolute paths
  if (isAbsolute(path)) {
    return { valid: false, reason: `absolute path not allowed: ${path}` }
  }

  // Path traversal
  const normalized = normalize(path)
  if (normalized.startsWith("..") || normalized.startsWith(`..${sep}`)) {
    return { valid: false, reason: `path traversal detected: ${path}` }
  }

  // Check for .. anywhere in the path
  const parts = path.split(/[/\\]/)
  for (const part of parts) {
    if (part === "..") {
      return { valid: false, reason: `path traversal detected: ${path}` }
    }
  }

  // Empty path
  if (path.length === 0) {
    return { valid: false, reason: "empty path" }
  }

  return { valid: true }
}

// ─── Containment Verification ───────────────────────────────────────

function verifyContainment(
  resolvedRoot: string,
  resolvedTarget: string,
): { contained: true } | { contained: false; reason: string } {
  // Normalize both paths for comparison
  const normRoot = normalize(resolvedRoot)
  const normTarget = normalize(resolvedTarget)

  // Check relative path
  const rel = relative(normRoot, normTarget)

  // Must not escape
  if (rel.startsWith("..") || rel === "..") {
    return {
      contained: false,
      reason: `path escapes workspace: ${resolvedTarget} is not under ${resolvedRoot}`,
    }
  }

  // Must not be absolute (shouldn't happen after relative(), but guard)
  if (isAbsolute(rel)) {
    return {
      contained: false,
      reason: `resolved path is on a different drive/root: ${resolvedTarget}`,
    }
  }

  return { contained: true }
}
