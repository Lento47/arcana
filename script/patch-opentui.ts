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
 * The upstream CodeRenderable then replaces the current buffer with plain
 * `setText()` on every content/style invalidation before the async highlight
 * completes. That is the source of the visible syntax-color flash. The
 * CodeRenderable patch below retains the last committed styled frame and
 * swaps in a new frame only after highlighting succeeds. A first frame is
 * still visible immediately as plain text, and a failed refresh keeps the
 * last good frame.
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
const CODE_FRAME_MARKER = "// [arcana] retain last styled code frame (patch-opentui.ts)"
const CODE_FRAME_RELEASE_MARKER = "// [arcana] release retained code frame (patch-opentui.ts)"
const CODE_CLASS_SIGNATURE = "class CodeRenderable extends TextBufferRenderable {"
const CODE_FRAME_FIELDS_SIGNATURE = "  _lastHighlights = [];"
const CODE_FRAME_FIELDS = `  _lastHighlights = [];
  ${CODE_FRAME_MARKER}
  _arcanaLastStyledText;
  _arcanaLastStyledContent = "";
  _arcanaLastRenderedLineSources;
  _arcanaHasStyledFrame = false;`
const CODE_CONSTRUCTOR_BUFFER = `      if (this._initialStyledText && this._drawUnstyledText) {
        this.textBuffer.setStyledText(this._initialStyledText);
      } else {
        this.textBuffer.setText(this._content);
      }`
const CODE_CONSTRUCTOR_BUFFER_PATCH = `      if (this._initialStyledText && this._drawUnstyledText) {
        this.textBuffer.setStyledText(this._initialStyledText);
        this._arcanaCommitStyledFrame(this._initialStyledText, this._content, undefined);
      } else {
        this.textBuffer.setText(this._content);
      }`
const CODE_CONSTRUCTOR_VISIBILITY = "      this._shouldRenderTextBuffer = this._drawUnstyledText || !this._filetype;"
const CODE_CONSTRUCTOR_VISIBILITY_PATCH =
  "      this._shouldRenderTextBuffer = true; // [arcana] first frame is visible while highlighting (patch-opentui.ts)"
const CODE_CONTENT_UPDATE = `      if (this._streaming && this._filetype && !this._drawUnstyledText) {
        this.requestRender();
        return;
      }
      if (this._initialStyledText && this._drawUnstyledText) {
        this.textBuffer.setStyledText(this._initialStyledText);
      } else {
        this.textBuffer.setText(value);
      }
      this.setRenderedLineSources(undefined);
      this.updateTextInfo();`
const CODE_CONTENT_UPDATE_PATCH = `      if (value.length > 0 && this._arcanaHasStyledFrame && this._filetype) {
        this._arcanaKeepStyledFrame();
        this.requestRender();
        return;
      }
      this._arcanaClearStyledFrame();
      if (this._initialStyledText && this._drawUnstyledText) {
        this.textBuffer.setStyledText(this._initialStyledText);
        this._arcanaCommitStyledFrame(this._initialStyledText, value, undefined);
      } else {
        this.textBuffer.setText(value);
      }
      this.setRenderedLineSources(undefined);
      this.updateTextInfo();`
const CODE_HELPER_SIGNATURE = "  get isHighlighting() {"
const CODE_HELPERS = `  ${CODE_FRAME_MARKER}
  _arcanaCommitStyledFrame(styledText, content, lineSources) {
    this._arcanaLastStyledText = styledText;
    this._arcanaLastStyledContent = content;
    this._arcanaLastRenderedLineSources = lineSources;
    this._arcanaHasStyledFrame = true;
  }
  _arcanaKeepStyledFrame() {
    if (!this._arcanaHasStyledFrame || !this._arcanaLastStyledText) return false;
    this._shouldRenderTextBuffer = true;
    return true;
  }
  _arcanaClearStyledFrame() {
    this._arcanaLastStyledText = undefined;
    this._arcanaLastStyledContent = "";
    this._arcanaLastRenderedLineSources = undefined;
    this._arcanaHasStyledFrame = false;
  }
`
const CODE_ENSURE_FILETYPE = `    if (!this._filetype) {
      this._shouldRenderTextBuffer = true;
      return;
    }`
const CODE_ENSURE_FILETYPE_PATCH = `    if (!this._filetype) {
      this._shouldRenderTextBuffer = true;
      return;
    }
    if (this._arcanaKeepStyledFrame()) {
      return;
    }`
const CODE_ENSURE_FALLBACK = `    } else {
      this._shouldRenderTextBuffer = false;
    }`
const CODE_ENSURE_FALLBACK_PATCH = `    } else {
      this.textBuffer.setText(content);
      this.setRenderedLineSources(undefined);
      this._shouldRenderTextBuffer = true;
    }`
const CODE_STYLED_COMMIT = `        const styledText = new StyledText(chunks);
        this.textBuffer.setStyledText(styledText);
        this.setRenderedLineSources(renderedLineSources);`
const CODE_STYLED_COMMIT_PATCH = `        const styledText = new StyledText(chunks);
        this.textBuffer.setStyledText(styledText);
        this.setRenderedLineSources(renderedLineSources);
        this._arcanaCommitStyledFrame(styledText, content, renderedLineSources);`
const CODE_PLAIN_COMMIT = `        this.textBuffer.setText(content);
        this.setRenderedLineSources(undefined);`
const CODE_PLAIN_COMMIT_PATCH = `        this.textBuffer.setText(content);
        this.setRenderedLineSources(undefined);
        this._arcanaClearStyledFrame();`
const CODE_ERROR_FALLBACK = `      console.warn("Code highlighting failed, falling back to plain text:", error);
      if (this.isDestroyed)
        return;
      this.textBuffer.setText(content);
      this.setRenderedLineSources(undefined);
      this._shouldRenderTextBuffer = true;`
const CODE_ERROR_FALLBACK_PATCH = `      if (this.isDestroyed)
        return;
      if (!this._arcanaHasStyledFrame) {
        this.textBuffer.setText(content);
        this.setRenderedLineSources(undefined);
      }
      this._shouldRenderTextBuffer = true;`
const CODE_STREAMING_RESET = `      this._hadInitialContent = false;
      this._lastHighlights = [];
      this._highlightsDirty = true;`
const CODE_STREAMING_RESET_PATCH = `      this._hadInitialContent = false;
      this._highlightsDirty = true;`
const CODE_RENDER_SIGNATURE = "  renderSelf(buffer) {"
const CODE_RENDER_PATCH = `  ${CODE_FRAME_RELEASE_MARKER}
  destroy() {
    this._arcanaClearStyledFrame();
    super.destroy();
  }
  renderSelf(buffer) {`
const CODE_RENDER_PATCH_PREFIX = `  ${CODE_FRAME_RELEASE_MARKER}
  destroy() {
    this._arcanaClearStyledFrame();
    super.destroy();
  }
`
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
    if ((name.startsWith("chunk-bun-") || name.startsWith("chunk-node-")) && name.endsWith(".js")) {
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

function patchCodeRenderable(source: string): string | undefined {
  const classStart = source.indexOf(CODE_CLASS_SIGNATURE)
  if (classStart === -1) return undefined
  const classEnd = source.indexOf("\n// src/", classStart + CODE_CLASS_SIGNATURE.length)
  if (classEnd === -1) {
    throw new Error("CodeRenderable class boundary missing")
  }

  // Keep any previous interrupted run from leaving the release hook on the
  // first unrelated Renderable.renderSelf method in the bundle. The hook is
  // reinserted below inside CodeRenderable only.
  let patched = source.replaceAll(CODE_RENDER_PATCH_PREFIX, "")
  const adjustedClassStart = patched.indexOf(CODE_CLASS_SIGNATURE)
  const adjustedClassEnd = patched.indexOf("\n// src/", adjustedClassStart + CODE_CLASS_SIGNATURE.length)
  if (adjustedClassStart === -1 || adjustedClassEnd === -1) {
    throw new Error("CodeRenderable class boundary missing")
  }
  let code = patched.slice(adjustedClassStart, adjustedClassEnd)

  if (!code.includes(CODE_FRAME_MARKER)) {
    const replacements: Array<[string, string]> = [
      [CODE_FRAME_FIELDS_SIGNATURE, CODE_FRAME_FIELDS],
      [CODE_CONSTRUCTOR_BUFFER, CODE_CONSTRUCTOR_BUFFER_PATCH],
      [CODE_CONSTRUCTOR_VISIBILITY, CODE_CONSTRUCTOR_VISIBILITY_PATCH],
      [CODE_CONTENT_UPDATE, CODE_CONTENT_UPDATE_PATCH],
      [CODE_HELPER_SIGNATURE, CODE_HELPERS + CODE_HELPER_SIGNATURE],
      [CODE_ENSURE_FILETYPE, CODE_ENSURE_FILETYPE_PATCH],
      [CODE_ENSURE_FALLBACK, CODE_ENSURE_FALLBACK_PATCH],
      [CODE_STYLED_COMMIT, CODE_STYLED_COMMIT_PATCH],
      [CODE_PLAIN_COMMIT, CODE_PLAIN_COMMIT_PATCH],
      [CODE_ERROR_FALLBACK, CODE_ERROR_FALLBACK_PATCH],
      [CODE_STREAMING_RESET, CODE_STREAMING_RESET_PATCH],
    ]

    for (const [signature, replacement] of replacements) {
      if (!code.includes(signature)) {
        throw new Error(`CodeRenderable patch signature missing: ${signature.slice(0, 80)}`)
      }
      code = code.replace(signature, replacement)
    }
  }

  if (!code.includes(CODE_FRAME_RELEASE_MARKER)) {
    if (!code.includes(CODE_RENDER_SIGNATURE)) {
      throw new Error(`CodeRenderable patch signature missing: ${CODE_RENDER_SIGNATURE}`)
    }
    code = code.replace(CODE_RENDER_SIGNATURE, CODE_RENDER_PATCH)
  }

  return patched.slice(0, adjustedClassStart) + code + patched.slice(adjustedClassEnd)
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

let codeTargets = 0
let codeReady = 0
let codePatched = 0

for (const chunk of collectChunks()) {
  const version = versionOf(chunk)
  if (version !== TARGET_VERSION) {
    console.log(`[patch-opentui] skip ${chunk} (version ${version ?? "unknown"} != ${TARGET_VERSION})`)
    skipped++
    continue
  }

  const source = readFileSync(chunk, "utf-8")
  if (!source.includes(CODE_CLASS_SIGNATURE)) continue
  codeTargets++

  try {
    const next = patchCodeRenderable(source)
    if (!next) continue
    if (next === source) {
      console.log(`[patch-opentui] code frame retention already patched ${chunk}`)
      codeReady++
      skipped++
      continue
    }
    writeFileSync(chunk, next, "utf-8")
    console.log(`[patch-opentui] patched code frame retention ${chunk}`)
    codeReady++
    codePatched++
  } catch (error) {
    console.error(`[patch-opentui] code frame signatures incomplete in ${chunk}:`, error)
    process.exitCode = 1
  }
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
if (codeTargets === 0) {
  console.log(`[patch-opentui] no @opentui/core ${TARGET_VERSION} CodeRenderable chunks found to patch`)
} else if (codeReady !== codeTargets) {
  console.error(`[patch-opentui] patched ${codeReady}/${codeTargets} CodeRenderable bundle(s)`)
  process.exitCode = 1
}
console.log(
  `[patch-opentui] loader_patched=${patched} markdown_patched=${markdownPatched} code_patched=${codePatched} skipped=${skipped}`,
)
