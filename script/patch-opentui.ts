#!/usr/bin/env bun
/**
 * Applies Arcana's version-pinned @opentui/core compatibility fixes.
 *
 * Upstream bug (0.4.5): `normalizeLoadedFilePath(loadedPath)` throws
 * "undefined is not an object (evaluating 'loadedPath.startsWith')" when
 * `import(..., { with: { type: "file" } })` returns a module without a
 * default export. Bun compile bundles `parser.worker.js` as a JS module
 * (no default export), so OpenTUI's eager module-load call
 * `resolveBundledFilePath("@opentui/core/parser.worker.js", …)` crashes the
 * TUI on Windows before the first frame.
 *
 * The file-loader patch adds a null guard (undefined → undefined). In compiled binaries
 * the real worker path still comes from the engine's
 * `OTUI_TREE_SITTER_WORKER_PATH` define; in dev mode OpenTUI's own file
 * loader returns a path string and the guard is a no-op.
 *
 * OpenTUI 0.4.5 also hides the unstyled fallback for fenced code while a
 * MarkdownRenderable is streaming. Every incremental review update starts an
 * async Tree-sitter pass, leaving the code block blank until highlighting
 * completes. Arcana keeps that fallback visible in both the Bun and Node
 * bundles so code-review content never disappears between stream frames.
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
const MARKDOWN_CREATE_SIGNATURE = "drawUnstyledText: !this._streaming,"
const MARKDOWN_CREATE_PATCH =
  "drawUnstyledText: true, // [arcana] keep streaming markdown code visible (patch-opentui.ts)"
const MARKDOWN_UPDATE_SIGNATURE = "renderable.drawUnstyledText = !this._streaming;"
const MARKDOWN_UPDATE_PATCH =
  "renderable.drawUnstyledText = true; // [arcana] keep streaming markdown code visible (patch-opentui.ts)"

function coreDirs(): string[] {
  const out = new Set<string>()
  const roots = ["node_modules", "packages/tui/node_modules", "packages/engine/node_modules"]

  for (const root of roots) {
    const direct = join(root, "@opentui/core")
    if (existsSync(direct)) {
      try {
        out.add(realpathSync(direct))
      } catch {
        // ignore unreadable entries
      }
    }

    const bunCache = join(root, ".bun")
    if (!existsSync(bunCache)) continue
    for (const entry of readdirSync(bunCache)) {
      if (!entry.startsWith(`@opentui+core@${TARGET_VERSION}`)) continue
      const cached = join(bunCache, entry, "node_modules/@opentui/core")
      if (!existsSync(cached)) continue
      try {
        out.add(realpathSync(cached))
      } catch {
        // ignore unreadable entries
      }
    }
  }

  return [...out]
}

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
  for (const coreDir of coreDirs()) chunkFilesInCoreDir(coreDir, out)

  return [...out]
}

function collectEntryBundles(): string[] {
  const out = new Set<string>()
  for (const coreDir of coreDirs()) {
    for (const name of ["index.bun.js", "index.node.js"]) {
      const file = join(coreDir, name)
      if (!existsSync(file)) continue
      try {
        out.add(realpathSync(file))
      } catch {
        // ignore unreadable entries
      }
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

let markdownTargets = 0
let markdownReady = 0
let markdownPatched = 0

for (const bundle of collectEntryBundles()) {
  const version = versionOf(bundle)
  if (version !== TARGET_VERSION) {
    console.log(`[patch-opentui] skip ${bundle} (version ${version ?? "unknown"} != ${TARGET_VERSION})`)
    skipped++
    continue
  }

  markdownTargets++
  const source = readFileSync(bundle, "utf-8")
  const createReady = source.includes(MARKDOWN_CREATE_PATCH)
  const updateReady = source.includes(MARKDOWN_UPDATE_PATCH)
  if (createReady && updateReady) {
    console.log(`[patch-opentui] markdown fallback already patched ${bundle}`)
    markdownReady++
    skipped++
    continue
  }

  if (
    createReady !== updateReady
    || !source.includes(MARKDOWN_CREATE_SIGNATURE)
    || !source.includes(MARKDOWN_UPDATE_SIGNATURE)
  ) {
    console.error(`[patch-opentui] markdown fallback signatures incomplete in ${bundle}`)
    process.exitCode = 1
    continue
  }

  const next = source
    .replace(MARKDOWN_CREATE_SIGNATURE, MARKDOWN_CREATE_PATCH)
    .replace(MARKDOWN_UPDATE_SIGNATURE, MARKDOWN_UPDATE_PATCH)
  writeFileSync(bundle, next, "utf-8")
  console.log(`[patch-opentui] patched markdown fallback ${bundle}`)
  markdownReady++
  markdownPatched++
}

if (targets === 0) {
  console.log(`[patch-opentui] no @opentui/core ${TARGET_VERSION} chunks found to patch`)
} else if (ready === 0) {
  console.error(`[patch-opentui] found ${targets} @opentui/core ${TARGET_VERSION} chunk(s), but none could be patched`)
  process.exitCode = 1
}
if (markdownTargets === 0) {
  console.log(`[patch-opentui] no @opentui/core ${TARGET_VERSION} entry bundles found to patch`)
} else if (markdownReady !== markdownTargets) {
  console.error(
    `[patch-opentui] patched ${markdownReady}/${markdownTargets} markdown fallback bundle(s)`,
  )
  process.exitCode = 1
}
console.log(
  `[patch-opentui] loader_patched=${patched} markdown_patched=${markdownPatched} skipped=${skipped}`,
)
