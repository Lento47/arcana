/**
 * Cross-runtime path utilities.
 *
 * `import.meta.dir` is Bun-specific and evaluates to `undefined` in Node.js/Deno.
 * This module provides a single `currentDir()` replacement that works everywhere
 * via the standard `import.meta.url` + `fileURLToPath` + `dirname` chain.
 */

import { fileURLToPath } from "node:url"
import { dirname } from "node:path"

/** Equivalent to Bun's `import.meta.dir` — cross-runtime. */
export function currentDir(meta: ImportMeta): string {
  return dirname(fileURLToPath(meta.url))
}
