// packages/memory/src/learning-export-boundary.ts
//
// Narrow privileged adapter: the ONLY module in @arcana/memory allowed to
// perform raw filesystem mutation for learning-data export. Declared in the
// K0 Authority Surface manifest (docs/architecture/authority/surface.manifest.json);
// slated for Authority Kernel FsMutation mediation per AUTHORITY-KERNEL.md §7.
//
// learning-export.ts stays pure logic and receives this boundary (or a test
// double), so the raw fs surface is pinned to one reviewable module.

import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs"

export interface LearningExportFileHandle {
  readonly write: (text: string) => void
  readonly close: () => void
}

export interface LearningExportBoundary {
  /** Existence probe (the export refuses to overwrite existing artifacts). */
  readonly exists: (path: string) => boolean
  /** Create the parent directory chain for a destination file. */
  readonly ensureDirectory: (directory: string) => void
  /** Exclusive-create (wx, 0600) the staging file; throws if it exists. */
  readonly openExclusive: (path: string) => LearningExportFileHandle
  /** Atomically publish the staged dataset file. */
  readonly rename: (from: string, to: string) => void
  /** Remove a path; missing paths are ignored. */
  readonly remove: (path: string) => void
  /** Exclusive-create (wx, 0600) a complete file (manifest commit). */
  readonly writeFileExclusive: (path: string, content: string) => void
}

export const learningExportBoundary: LearningExportBoundary = {
  exists: (path) => existsSync(path),
  ensureDirectory: (directory) => {
    mkdirSync(directory, { recursive: true })
  },
  openExclusive: (path) => {
    const fd = openSync(path, "wx", 0o600)
    let closed = false
    return {
      write: (text) => {
        writeSync(fd, text, undefined, "utf8")
      },
      close: () => {
        if (!closed) {
          closeSync(fd)
          closed = true
        }
      },
    }
  },
  rename: (from, to) => {
    renameSync(from, to)
  },
  remove: (path) => {
    rmSync(path, { force: true })
  },
  writeFileExclusive: (path, content) => {
    writeFileSync(path, content, { encoding: "utf8", flag: "wx", mode: 0o600 })
  },
}
