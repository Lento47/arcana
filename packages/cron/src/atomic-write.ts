/**
 * Crash-safe atomic file writes.
 *
 * Writes to a .tmp file then renames in-place. On POSIX and NTFS, rename
 * is atomic within the same filesystem — the target either gets the complete
 * new content or stays untouched. A crash mid-write leaves only the .tmp stub.
 */
import { writeFile, rename } from "node:fs/promises"

export async function atomicWrite(path: string, data: string): Promise<void> {
  const tmp = path + ".tmp"
  await writeFile(tmp, data)
  await rename(tmp, path)
}
