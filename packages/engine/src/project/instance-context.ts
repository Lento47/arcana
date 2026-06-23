import { LocalContext } from "@/util/local-context"
import { FSUtil } from "@arcana/core/fs-util"
import type * as Project from "./project"

export interface InstanceContext {
  directory: string
  worktree: string
  project: Project.Info
  /** Epoch millis when the instance was first loaded. Used for repo drift detection. */
  startedAt: number
}

export const context = LocalContext.create<InstanceContext>("instance")

/**
 * Check if a path is within the project boundary.
 * Returns true if path is inside ctx.directory OR ctx.worktree.
 * Paths within the worktree but outside the working directory should not trigger external_directory permission.
 */
export function containsPath(filepath: string, ctx: InstanceContext): boolean {
  if (FSUtil.contains(ctx.directory, filepath)) return true
  // Non-git projects set worktree to the filesystem root ("/" on POSIX, "C:\\" on
  // Windows) which would match ANY absolute path under that root. Skip the
  // worktree check in that case to preserve external_directory permissions.
  if (isFilesystemRoot(ctx.worktree)) return false
  return FSUtil.contains(ctx.worktree, filepath)
}

function isFilesystemRoot(path: string): boolean {
  if (path === "/") return true
  // Windows drive root: "C:\\", "c:/", etc.
  return /^[A-Za-z]:[\\/]?$/.test(path)
}
