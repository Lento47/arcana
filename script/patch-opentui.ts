#!/usr/bin/env bun
/**
 * Patches @opentui/core's bundled-file loader for Bun compiled binaries.
 *
 * Upstream bug (0.4.5): `normalizeLoadedFilePath(loadedPath)` throws
 * "undefined is not an object (evaluating 'loadedPath.startsWith')" when
 * `import(..., { with: { type: "file" } })` returns a module without a
 * default export. Bun compile bundles `parser.worker.js` as a JS module
 * (no default export), so OpenTUI's eager module-load call
 * `resolveBundledFilePath("@opentui/core/parser.worker.js", …)` crashes the
 * TUI on Windows before the first frame.
 *
 * The patch adds a null guard (undefined → undefined). In compiled binaries
 * the real worker path still comes from the engine's
 * `OTUI_TREE_SITTER_WORKER_PATH` define; in dev mode OpenTUI's own file
 * loader returns a path string and the guard is a no-op.
 *
 * Version-pinned to @opentui/core 0.4.5. Re-run after `bun install`
 * (wired as the root `postinstall` script).
 */
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const TARGET_VERSION = "0.4.5"
const MARKER = "// [arcana] OpenTUI file-loader null guard (patch-opentui.ts)"
const SIGNATURE = "function normalizeLoadedFilePath(loadedPath, baseUrl) {"
const GUARD = `\n${MARKER}\n  if (loadedPath == null) {\n    return undefined\n  }`

function chunkFilesInCoreDir(coreDir: string, out: Set<string>): void {
  if (!existsSync(coreDir)) return
  for (const name of readdirSync(coreDir)) {
    if (name.startsWith("chunk-bun-") && name.endsWith(".js")) {
      try {
        out.add(realpathSync(join(coreDir, name)))
      } catch {
        // ignore unreadable entries
      }
    }
  }
}

function collectChunks(): string[] {
  const out = new Set<string>()
  const roots = ["node_modules", "packages/tui/node_modules", "packages/engine/node_modules"]

  for (const root of roots) {
    // Direct install: node_modules/@opentui/core/chunk-bun-*.js
    chunkFilesInCoreDir(join(root, "@opentui/core"), out)

    // Bun cache installs: node_modules/.bun/@opentui+core@0.4.5+*/node_modules/@opentui/core
    const bunCache = join(root, ".bun")
    if (!existsSync(bunCache)) continue
    for (const entry of readdirSync(bunCache)) {
      if (!entry.startsWith(`@opentui+core@${TARGET_VERSION}`)) continue
      chunkFilesInCoreDir(join(bunCache, entry, "node_modules/@opentui/core"), out)
    }
  }

  return [...out]
}

function versionOf(chunkPath: string): string | undefined {
  try {
    const pkg = JSON.parse(readFileSync(join(chunkPath, "..", "package.json"), "utf-8"))
    return pkg.version
  } catch {
    return undefined
  }
}

let targets = 0
let ready = 0
let patched = 0
let skipped = 0

for (const chunk of collectChunks()) {
  const version = versionOf(chunk)
  if (version !== TARGET_VERSION) {
    console.log(`[patch-opentui] skip ${chunk} (version ${version ?? "unknown"} != ${TARGET_VERSION})`)
    skipped++
    continue
  }

  targets++
  const source = readFileSync(chunk, "utf-8")
  if (source.includes(MARKER)) {
    console.log(`[patch-opentui] already patched ${chunk}`)
    ready++
    skipped++
    continue
  }
  if (!source.includes(SIGNATURE)) {
    // OpenTUI ships multiple chunk-bun files; only the chunk containing
    // normalizeLoadedFilePath is a patch target. Unrelated chunks are valid.
    console.log(`[patch-opentui] no target signature in ${chunk} — skipping`)
    skipped++
    continue
  }

  const index = source.indexOf(SIGNATURE)
  const inserted =
    source.slice(0, index + SIGNATURE.length)
    + GUARD
    + source.slice(index + SIGNATURE.length)
  writeFileSync(chunk, inserted, "utf-8")
  console.log(`[patch-opentui] patched ${chunk}`)
  ready++
  patched++
}

if (targets === 0) {
  console.log(`[patch-opentui] no @opentui/core ${TARGET_VERSION} chunks found to patch`)
} else if (ready === 0) {
  console.error(`[patch-opentui] found ${targets} @opentui/core ${TARGET_VERSION} chunk(s), but none could be patched`)
  process.exitCode = 1
}
console.log(`[patch-opentui] patched=${patched} skipped=${skipped}`)
