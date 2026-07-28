/**
 * Crash-safe atomic file writes.
 *
 * Writes to a .tmp file then renames in-place. On POSIX and NTFS, rename
 * is atomic within the same filesystem — the target either gets the complete
 * new content or stays untouched. A crash mid-write leaves only the .tmp stub.
 */
import { writeFileSync, renameSync } from "node:fs"

export function atomicWriteSync(path: string, data: string): void {
  const tmp = path + ".tmp"
  writeFileSync(tmp, data)
  renameSync(tmp, path)
}
