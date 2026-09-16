#!/usr/bin/env bun
/**
 * Applies Arcana's version-pinned @opentui/core compatibility fixes.
 *
 * OpenTUI 0.5.9 still calls `normalizeLoadedFilePath(loadedPath)` without a
 * null guard. When `import(..., { with: { type: "file" } })` returns a module
 * without a default export, it can throw
 * "undefined is not an object (evaluating 'loadedPath.startsWith')". Bun
 * compile bundles `parser.worker.js` as a JS module
 * (no default export), so OpenTUI's eager module-load call
 * `resolveBundledFilePath("@opentui/core/parser.worker.js", …)` crashes the
 * TUI on Windows before the first frame.
 *
 * The file-loader patch adds a null guard (undefined → undefined). In compiled binaries
 * the real worker path still comes from the engine's
 * `OTUI_TREE_SITTER_WORKER_PATH` define; in dev mode OpenTUI's own file
 * loader returns a path string and the guard is a no-op.
 *
 * OpenTUI 0.5.9 also hides the unstyled fallback for fenced code while a
 * MarkdownRenderable is streaming. Every incremental review update starts an
 * async Tree-sitter pass, leaving the code block blank until highlighting
 * completes. Arcana keeps that fallback visible in both the Bun and Node
 * bundles so code-review content never disappears between stream frames.
 *
 * The upstream CodeRenderable then replaces the current buffer with plain
 * `setText()` on every content/style invalidation before the async highlight
 * completes. That is the source of the visible syntax-color flash. The
 * CodeRenderable patch below retains the last committed styled frame and
 * swaps in a new frame only after highlighting succeeds. A failed refresh
 * keeps the last good frame.
 *
 * Arcana never hides painted content. Markdown leaves paint their synchronous
 * `initialStyledText` chunks on the first frame; code/tool leaves paint plain
 * text immediately and settle to syntax colors when the worker answers.
 * Updates keep the last styled frame; a failed (or zero-highlight) pass marks
 * the leaf so later updates keep painting plain instead of cycling
 * blank/plain; and neither a slow parser nor a filetype that resolves
 * mid-stream can blank a body the operator is already reading.
 *
 * Version-pinned to @opentui/core 0.5.9. Re-run after `bun install`
 * (wired as the root `postinstall` script).
 */
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const TARGET_VERSION = "0.5.9"
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
      this.invalidateHighlights();`
const CODE_STREAMING_RESET_PATCH = `      this._hadInitialContent = false;
      this.invalidateHighlights();`
const CODE_STALE_HIGHLIGHT_MARKER = "// [arcana] stale highlight result does not schedule a redundant render (patch-opentui.ts)"
const CODE_STALE_HIGHLIGHT = `      if (snapshotId !== this._highlightSnapshotId) {
        this.requestRender();
        return;
      }`
const CODE_STALE_HIGHLIGHT_PATCH = `      if (snapshotId !== this._highlightSnapshotId) {
        ${CODE_STALE_HIGHLIGHT_MARKER}
        return;
      }`
const CODE_STALE_HIGHLIGHT_NESTED = `        if (snapshotId !== this._highlightSnapshotId) {
          this.requestRender();
          return;
        }`
const CODE_STALE_HIGHLIGHT_NESTED_PATCH = `        if (snapshotId !== this._highlightSnapshotId) {
          ${CODE_STALE_HIGHLIGHT_MARKER}
          return;
        }`
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
  "drawUnstyledText: false, // [arcana] retain last styled frame, no flicker (patch-opentui.ts)"
const MARKDOWN_UPDATE_SIGNATURE = "renderable.drawUnstyledText = !this._streaming;"
const MARKDOWN_UPDATE_PATCH =
  "renderable.drawUnstyledText = false; // [arcana] retain last styled frame, no flicker (patch-opentui.ts)"
const LEGACY_MARKDOWN_CREATE_PATCH =
  "drawUnstyledText: true, // [arcana] keep streaming markdown code visible (patch-opentui.ts)"
const LEGACY_MARKDOWN_UPDATE_PATCH =
  "renderable.drawUnstyledText = true; // [arcana] keep streaming markdown code visible (patch-opentui.ts)"
const MARKDOWN_APPLY_SIGNATURE = "renderable.drawUnstyledText = initialStyledText !== undefined;"
const MARKDOWN_APPLY_PATCH =
  "renderable.drawUnstyledText = false; // [arcana] retain last styled frame, no flicker (patch-opentui.ts)"
const MARKDOWN_CREATE_INLINE_SIGNATURE = "drawUnstyledText: initialStyledText !== undefined,"
const MARKDOWN_CREATE_INLINE_PATCH =
  "drawUnstyledText: false, // [arcana] retain last styled frame, no flicker (patch-opentui.ts)"
const PARSE_REUSE_MARKER = "// [arcana] paragraph token stable only at block boundary (patch-opentui.ts)"
const PARSE_REUSE_SIGNATURE = "if (offset + tokenLength <= newContent.length && newContent.startsWith(token.raw, offset)) {"
const PARSE_REUSE_PATCH = `if (offset + tokenLength <= newContent.length && newContent.startsWith(token.raw, offset)) {
      ${PARSE_REUSE_MARKER}
      // A paragraph token is only stable if it ends at a block boundary. If the
      // content after it continues the same paragraph (single newline + text, or
      // same-line continuation), the token is a prefix of a longer paragraph —
      // re-lex it so the paragraph isn't split into two blocks.
      if (token.type === "paragraph") {
        const after = newContent.slice(offset + tokenLength);
        if (after.length > 0 && !/^\\n\\s*\\n/.test(after)) {
          break;
        }
      }`
const MARKDOWN_TS_CLIENT_SIGNATURE = `  set content(value) {
    if (this.isDestroyed)
      return;
    if (this._content !== value) {
      this._content = value;
      this.updateBlocks();
      this.requestRender();
    }
  }`
const MARKDOWN_TS_CLIENT_PATCH = `  set content(value) {
    if (this.isDestroyed)
      return;
    if (this._content !== value) {
      this._content = value;
      this.updateBlocks();
      this.requestRender();
    }
  }
  get treeSitterClient() {
    return this._treeSitterClient;
  }
  set treeSitterClient(value) {
    if (this._treeSitterClient !== value) {
      this._treeSitterClient = value;
      this._styleDirty = true;
    }
  }`
const MARKDOWN_APPLY_TS_SIGNATURE = "renderable.streaming = true;"
const MARKDOWN_APPLY_TS_PATCH =
  "renderable.streaming = true;\n    if (this._treeSitterClient) renderable.treeSitterClient = this._treeSitterClient; // [arcana] propagate treeSitterClient to markdown leaves (patch-opentui.ts)"
// Older unguarded variant (overrode the leaf's default client with undefined).
const MARKDOWN_APPLY_TS_OLD_PATCH =
  "    renderable.treeSitterClient = this._treeSitterClient; // [arcana] propagate treeSitterClient to markdown leaves (patch-opentui.ts)"
const MARKDOWN_STREAMING_FINALIZE_MARKER =
  "// [arcana] reuse blocks on streaming flip, no full re-render (patch-opentui.ts)"
const MARKDOWN_STREAMING_SIGNATURE = `  set streaming(value) {
    if (this.isDestroyed)
      return;
    if (this._streaming !== value) {
      this._streaming = value;
      this.updateBlocks(true);
    }
  }`
const MARKDOWN_STREAMING_PATCH = `  set streaming(value) {
    if (this.isDestroyed)
      return;
    if (this._streaming !== value) {
      this._streaming = value;
      ${MARKDOWN_STREAMING_FINALIZE_MARKER}
      // Reuse stable blocks instead of forcing a full re-render. The upstream
      // forceTableRefresh destroys and re-creates every block on the
      // streaming→idle flip, dropping their retained styled frames — the whole
      // answer flashes to raw text and re-highlights. Reuse keeps stable blocks
      // in place; only the trailing block re-parses.
      this.updateBlocks(false);
    }
  }`

/**
 * Second-generation CodeRenderable patch ("paint styled first frame").
 *
 * Updates the v1 retained-frame patch in place:
 * - Markdown leaves paint `initialStyledText` synchronously on the first frame
 *   (no worker wait, no plain flash).
 * - Leaves whose colors can only come from the async worker defer the first
 *   paint entirely instead of showing plain text; the layout stays measured.
 * - A 500ms deadline (unref'd) paints plain text only if highlighting never
 *   resolves, so content can never stay invisible.
 */
const STYLED_FIRST_FRAME_MARKER = "// [arcana] paint styled first frame (patch-opentui.ts)"
const CODE_FIELDS_V2 = `${CODE_FRAME_FIELDS}
  ${STYLED_FIRST_FRAME_MARKER}
  _arcanaDeadlineTimer;`
const CODE_CTOR_V1 = `    if (this._content.length > 0) {
${CODE_CONSTRUCTOR_BUFFER_PATCH}
      this.updateTextInfo();
${CODE_CONSTRUCTOR_VISIBILITY_PATCH}
    }`
const CODE_CTOR_V2 = `    if (this._content.length > 0) {
      this._arcanaPaintFirstFrame(this._content); ${STYLED_FIRST_FRAME_MARKER}
    }`
const CODE_CONTENT_V1 = `  set content(value) {
    if (this._content !== value) {
      this._content = value;
      this.invalidateHighlights();
      if (value.length > 0 && this._arcanaHasStyledFrame && this._filetype) {
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
      this.updateTextInfo();
    }
  }`
const CODE_CONTENT_V2 = `  set content(value) {
    if (this._content !== value) {
      this._content = value;
      this.invalidateHighlights();
      if (value.length > 0 && this._arcanaHasStyledFrame && this._filetype) {
        this._arcanaKeepStyledFrame();
        this.requestRender();
        return;
      }
      if (value.length > 0) {
        this._arcanaPaintFirstFrame(value); ${STYLED_FIRST_FRAME_MARKER}
        return;
      }
      this._arcanaClearStyledFrame();
      this.textBuffer.setText(value);
      this.setRenderedLineSources(undefined);
      this.updateTextInfo();
      this._shouldRenderTextBuffer = false;
    }
  }`
const CODE_ENSURE_V1 = `  ensureVisibleTextBeforeHighlight() {
    if (this.isDestroyed)
      return;
    const content = this._content;
    if (!this._filetype) {
      this._shouldRenderTextBuffer = true;
      return;
    }
    if (this._arcanaKeepStyledFrame()) {
      return;
    }
    const isInitialContent = this._streaming && !this._hadInitialContent;
    const shouldDrawUnstyledNow = this._streaming ? isInitialContent && this._drawUnstyledText : this._drawUnstyledText;
    if (this._streaming && !isInitialContent) {
      this._shouldRenderTextBuffer = true;
    } else if (shouldDrawUnstyledNow) {
      if (this._initialStyledText) {
        this.textBuffer.setStyledText(this._initialStyledText);
      } else {
        this.textBuffer.setText(content);
      }
      this.setRenderedLineSources(undefined);
      this._shouldRenderTextBuffer = true;
    } else {
      this.textBuffer.setText(content);
      this.setRenderedLineSources(undefined);
      this._shouldRenderTextBuffer = true;
    }
  }`
const CODE_ENSURE_V2 = `  ensureVisibleTextBeforeHighlight() {
    if (this.isDestroyed)
      return;
    const content = this._content;
    if (!this._filetype) {
      this._shouldRenderTextBuffer = true;
      return;
    }
    if (this._arcanaKeepStyledFrame()) {
      return;
    }
    this._arcanaPaintFirstFrame(content); ${STYLED_FIRST_FRAME_MARKER}
  }`
const CODE_HELPERS_V2 = `  ${CODE_FRAME_MARKER}
  _arcanaCommitStyledFrame(styledText, content, lineSources) {
    this._arcanaClearDeadline();
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
    this._arcanaClearDeadline();
    this._arcanaLastStyledText = undefined;
    this._arcanaLastStyledContent = "";
    this._arcanaLastRenderedLineSources = undefined;
    this._arcanaHasStyledFrame = false;
  }
  ${STYLED_FIRST_FRAME_MARKER}
  _arcanaPaintFirstFrame(content) {
    if (this.isDestroyed) return;
    if (this._initialStyledText) {
      this.textBuffer.setStyledText(this._initialStyledText);
      this.setRenderedLineSources(undefined);
      this.updateTextInfo();
      this._arcanaCommitStyledFrame(this._initialStyledText, content, undefined);
      this._shouldRenderTextBuffer = true;
      this.requestRender();
      return;
    }
    this.textBuffer.setText(content);
    this.setRenderedLineSources(undefined);
    this.updateTextInfo();
    if (this._filetype && !this._drawUnstyledText) {
      // Colors are computed asynchronously: keep the layout measured but paint
      // nothing until the first styled frame arrives.
      this._shouldRenderTextBuffer = false;
      this._arcanaArmDeadline();
      this.requestRender();
      return;
    }
    this._shouldRenderTextBuffer = true;
    this.requestRender();
  }
  _arcanaArmDeadline() {
    if (this._arcanaDeadlineTimer !== undefined) return;
    const timer = setTimeout(() => {
      this._arcanaDeadlineTimer = undefined;
      if (this.isDestroyed || this._arcanaHasStyledFrame) return;
      this._shouldRenderTextBuffer = true;
      this.requestRender();
    }, 500);
    if (timer && typeof timer.unref === "function") timer.unref();
    this._arcanaDeadlineTimer = timer;
  }
  _arcanaClearDeadline() {
    const timer = this._arcanaDeadlineTimer;
    if (timer === undefined) return;
    clearTimeout(timer);
    this._arcanaDeadlineTimer = undefined;
  }
`
const CODE_ERROR_DEADLINE_V1 = `      if (this.isDestroyed)
        return;
      if (!this._arcanaHasStyledFrame) {
        this.textBuffer.setText(content);
        this.setRenderedLineSources(undefined);
      }`
const CODE_ERROR_DEADLINE_V2 = `      if (this.isDestroyed)
        return;
      this._arcanaClearDeadline(); ${STYLED_FIRST_FRAME_MARKER}
      if (!this._arcanaHasStyledFrame) {
        this.textBuffer.setText(content);
        this.setRenderedLineSources(undefined);
      }`

/**
 * DiffRenderable creates its inner CodeRenderable with the upstream default
 * `drawUnstyledText: true`, so an edit-tool diff still painted a plain frame
 * before Tree-sitter colors landed. Force the Arcana policy on every diff
 * leaf: never paint unstyled text, defer until the first styled frame (the
 * CodeRenderable deadline still paints plain if highlighting never resolves).
 */
const DIFF_FRAME_MARKER = "// [arcana] diff leaves never paint unstyled text (patch-opentui.ts)"
const DIFF_CREATE_SIGNATURE = "        ...drawUnstyledText !== undefined && { drawUnstyledText },"
const DIFF_CREATE_PATCH = `        drawUnstyledText: false, ${DIFF_FRAME_MARKER}`
const DIFF_UPDATE_SIGNATURE = `      if (drawUnstyledText !== undefined) {
        existingRenderable.drawUnstyledText = drawUnstyledText;
      }`
const DIFF_UPDATE_PATCH = `      existingRenderable.drawUnstyledText = false; ${DIFF_FRAME_MARKER}`
const DIFF_ERROR_SIGNATURE = `        filetype: "diff",
        syntaxStyle: this._syntaxStyle ?? SyntaxStyle.create(),
        wrapMode: this._wrapMode,
        conceal: this._conceal,`
const DIFF_ERROR_PATCH = `${DIFF_ERROR_SIGNATURE}
        drawUnstyledText: false, ${DIFF_FRAME_MARKER}`

/**
 * Fourth pass: a highlight that FAILS (or succeeds with zero highlights) must
 * keep painting plain text on every later update. Without this, each content
 * update re-entered the styled-first deferral, so a streamed body whose parser
 * was unavailable alternated blank -> plain -> blank ("the code blanks and
 * returns"). Both failure paths now set the same monotonic fallback flag as the
 * deadline; a later styled commit clears it.
 */
const FAILED_FALLBACK_MARKER = "// [arcana] failed highlight keeps plain text (patch-opentui.ts)"
const CODE_CATCH_V22_FROM = `      this._arcanaClearDeadline(); ${STYLED_FIRST_FRAME_MARKER}
      if (!this._arcanaHasStyledFrame) {`
const CODE_CATCH_V22_TO = `      this._arcanaClearDeadline(); ${STYLED_FIRST_FRAME_MARKER}
      this._arcanaFirstFrameFallback = true; ${FAILED_FALLBACK_MARKER}
      if (!this._arcanaHasStyledFrame) {`
const CODE_ZERO_HIGHLIGHT_V22_FROM = `      } else {
        this.textBuffer.setText(content);
        this.setRenderedLineSources(undefined);
        this._arcanaClearStyledFrame();
      }`
const CODE_ZERO_HIGHLIGHT_V22_TO = `      } else {
        this.textBuffer.setText(content);
        this.setRenderedLineSources(undefined);
        this._arcanaClearStyledFrame();
        this._arcanaFirstFrameFallback = true; ${FAILED_FALLBACK_MARKER}
      }`

/**
 * Fifth pass: bound any remaining blank window. The deadline previously waited
 * 500ms before painting the plain frame — content could stay invisible for
 * ~30 frames when a highlight was slow or never resolved. 120ms (~7 frames)
 * keeps the styled-first intent for a warm worker while making a blank
 * imperceptible; the failure paths above keep it from returning.
 */
const SHORT_DEADLINE_MARKER = "// [arcana] short first-frame deadline (patch-opentui.ts)"
const CODE_DEADLINE_V23_FROM = `      this._shouldRenderTextBuffer = true;
      this.requestRender();
    }, 500);`
const CODE_DEADLINE_V23_TO = `      this._shouldRenderTextBuffer = true;
      this.requestRender();
    }, 120); ${SHORT_DEADLINE_MARKER}`

/**
 * Sixth pass: never hide a leaf that has already painted. A body can acquire
 * its filetype mid-stream (resolveFiletype() flips from undefined to diff/py
 * as content arrives); the first update after that used to re-enter the
 * styled-first deferral and blank text the operator was already reading.
 * Deferral now applies only to a leaf's very first paint; once anything has
 * been painted, later updates paint plain immediately and settle to styled
 * when the highlight lands.
 */
const PAINTED_LEAF_MARKER = "// [arcana] never hide a painted leaf (patch-opentui.ts)"
const CODE_FIELDS_V24_ANCHOR = `  _arcanaFirstFrameFallback = false;`
const CODE_FIELDS_V24 = `  _arcanaFirstFrameFallback = false;
  ${PAINTED_LEAF_MARKER}
  _arcanaHasPainted = false;`
const CODE_DEFER_V24_FROM = `    if (this._filetype && !this._drawUnstyledText && !this._arcanaFirstFrameFallback) {`
const CODE_DEFER_V24_TO = `    if (this._filetype && !this._drawUnstyledText && !this._arcanaFirstFrameFallback && !this._arcanaHasPainted) {`
const CODE_PLAIN_PAINT_V24_FROM = `    this._shouldRenderTextBuffer = true;
    this.requestRender();
  }
  _arcanaArmDeadline() {`
const CODE_PLAIN_PAINT_V24_TO = `    this._arcanaHasPainted = true; ${PAINTED_LEAF_MARKER}
    this._shouldRenderTextBuffer = true;
    this.requestRender();
  }
  _arcanaArmDeadline() {`
const CODE_COMMIT_V24_FROM = `    this._arcanaClearDeadline();
    this._arcanaFirstFrameFallback = false;`
const CODE_COMMIT_V24_TO = `    this._arcanaClearDeadline();
    this._arcanaFirstFrameFallback = false;
    this._arcanaHasPainted = true;`
const CODE_DEADLINE_V24_FROM = `      this._arcanaFirstFrameFallback = true;
      this._shouldRenderTextBuffer = true;
      this.requestRender();
    }, 120); ${SHORT_DEADLINE_MARKER}`
const CODE_DEADLINE_V24_TO = `      this._arcanaFirstFrameFallback = true;
      this._arcanaHasPainted = true; ${PAINTED_LEAF_MARKER}
      this._shouldRenderTextBuffer = true;
      this.requestRender();
    }, 120); ${SHORT_DEADLINE_MARKER}`

/**
 * Final policy: never blank. Deferring the first styled paint hid content
 * whenever a highlight was slow, failed, or the filetype settled after
 * construction (props apply post-constructor, so a transient no-filetype paint
 * defeated the "first paint only" guard). The first frame now paints plain
 * immediately; updates keep the last styled frame (retention), so the only
 * artifact on a brand-new leaf is a one-time settle from plain to styled.
 */
const NEVER_BLANK_MARKER = "// [arcana] paint first frame plain, never blank (patch-opentui.ts)"
const CODE_DEFER_V25_FROM = `    if (this._filetype && !this._drawUnstyledText && !this._arcanaFirstFrameFallback && !this._arcanaHasPainted) {
      // Colors are computed asynchronously: keep the layout measured but paint
      // nothing until the first styled frame arrives.
      this._shouldRenderTextBuffer = false;
      this._arcanaArmDeadline();
      this.requestRender();
      return;
    }`
const CODE_DEFER_V25_TO = `    ${NEVER_BLANK_MARKER}`

/**
 * Third pass: keep the fallback monotonic. Once the deadline has painted plain
 * text (broken/slow parser), later content updates must keep the leaf visible
 * instead of re-deferring into a blank block. The flag is cleared by the first
 * styled commit, which restores normal deferral for any later unstyled state.
 */
const FIRST_FRAME_FALLBACK_MARKER = "// [arcana] keep first-frame fallback stable (patch-opentui.ts)"
const CODE_FIELDS_V21_ANCHOR = "  _arcanaDeadlineTimer;"
const CODE_FIELDS_V21 = `  _arcanaDeadlineTimer;
  ${FIRST_FRAME_FALLBACK_MARKER}
  _arcanaFirstFrameFallback = false;`
const CODE_COMMIT_V21_FROM = `  _arcanaCommitStyledFrame(styledText, content, lineSources) {
    this._arcanaClearDeadline();`
const CODE_COMMIT_V21_TO = `  _arcanaCommitStyledFrame(styledText, content, lineSources) {
    this._arcanaClearDeadline();
    this._arcanaFirstFrameFallback = false;`
const CODE_DEADLINE_V21_FROM = `  _arcanaArmDeadline() {
    if (this._arcanaDeadlineTimer !== undefined) return;
    const timer = setTimeout(() => {
      this._arcanaDeadlineTimer = undefined;
      if (this.isDestroyed || this._arcanaHasStyledFrame) return;
      this._shouldRenderTextBuffer = true;
      this.requestRender();
    }, 500);`
const CODE_DEADLINE_V21_TO = `  _arcanaArmDeadline() {
    if (this._arcanaDeadlineTimer !== undefined) return;
    const timer = setTimeout(() => {
      this._arcanaDeadlineTimer = undefined;
      if (this.isDestroyed || this._arcanaHasStyledFrame) return;
      this._arcanaFirstFrameFallback = true;
      this._shouldRenderTextBuffer = true;
      this.requestRender();
    }, 500);`
const CODE_DEFER_V21_FROM = `    if (this._filetype && !this._drawUnstyledText) {
      // Colors are computed asynchronously: keep the layout measured but paint
      // nothing until the first styled frame arrives.
      this._shouldRenderTextBuffer = false;
      this._arcanaArmDeadline();
      this.requestRender();
      return;
    }`
const CODE_DEFER_V21_TO = `    if (this._filetype && !this._drawUnstyledText && !this._arcanaFirstFrameFallback) {
      // Colors are computed asynchronously: keep the layout measured but paint
      // nothing until the first styled frame arrives.
      this._shouldRenderTextBuffer = false;
      this._arcanaArmDeadline();
      this.requestRender();
      return;
    }`

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

  // Upgrade a first-generation retained-frame patch in place. Markdown leaves
  // paint their synchronous styled chunks; code/tool leaves defer the first
  // paint until the async highlight lands instead of flashing plain text.
  if (!code.includes(STYLED_FIRST_FRAME_MARKER)) {
    const upgrades: Array<[string, string]> = [
      [CODE_FRAME_FIELDS, CODE_FIELDS_V2],
      [CODE_CTOR_V1, CODE_CTOR_V2],
      [CODE_CONTENT_V1, CODE_CONTENT_V2],
      [CODE_ENSURE_V1, CODE_ENSURE_V2],
      [CODE_HELPERS, CODE_HELPERS_V2],
      [CODE_ERROR_DEADLINE_V1, CODE_ERROR_DEADLINE_V2],
    ]
    for (const [from, to] of upgrades) {
      if (!code.includes(from)) {
        throw new Error(`CodeRenderable styled-first-frame anchor missing: ${from.slice(0, 80)}`)
      }
      code = code.replace(from, to)
    }
  }

  if (!code.includes(FIRST_FRAME_FALLBACK_MARKER)) {
    const fallbackUpgrades: Array<[string, string]> = [
      [CODE_FIELDS_V21_ANCHOR, CODE_FIELDS_V21],
      [CODE_COMMIT_V21_FROM, CODE_COMMIT_V21_TO],
      [CODE_DEADLINE_V21_FROM, CODE_DEADLINE_V21_TO],
      [CODE_DEFER_V21_FROM, CODE_DEFER_V21_TO],
    ]
    for (const [from, to] of fallbackUpgrades) {
      if (!code.includes(from)) {
        throw new Error(`CodeRenderable first-frame fallback anchor missing: ${from.slice(0, 80)}`)
      }
      code = code.replace(from, to)
    }
  }

  if (!code.includes(FAILED_FALLBACK_MARKER)) {
    const failedFallbackFixes: Array<[string, string]> = [
      [CODE_CATCH_V22_FROM, CODE_CATCH_V22_TO],
      [CODE_ZERO_HIGHLIGHT_V22_FROM, CODE_ZERO_HIGHLIGHT_V22_TO],
    ]
    for (const [from, to] of failedFallbackFixes) {
      if (!code.includes(from)) {
        throw new Error(`CodeRenderable failed-fallback anchor missing: ${from.slice(0, 80)}`)
      }
      code = code.replace(from, to)
    }
  }

  if (!code.includes(SHORT_DEADLINE_MARKER)) {
    if (!code.includes(CODE_DEADLINE_V23_FROM)) {
      throw new Error(`CodeRenderable short-deadline anchor missing: ${CODE_DEADLINE_V23_FROM.slice(0, 80)}`)
    }
    code = code.replace(CODE_DEADLINE_V23_FROM, CODE_DEADLINE_V23_TO)
  }

  if (!code.includes(PAINTED_LEAF_MARKER)) {
    const paintedLeafFixes: Array<[string, string]> = [
      [CODE_FIELDS_V24_ANCHOR, CODE_FIELDS_V24],
      [CODE_DEFER_V24_FROM, CODE_DEFER_V24_TO],
      [CODE_PLAIN_PAINT_V24_FROM, CODE_PLAIN_PAINT_V24_TO],
      [CODE_COMMIT_V24_FROM, CODE_COMMIT_V24_TO],
      [CODE_DEADLINE_V24_FROM, CODE_DEADLINE_V24_TO],
    ]
    for (const [from, to] of paintedLeafFixes) {
      if (!code.includes(from)) {
        throw new Error(`CodeRenderable painted-leaf anchor missing: ${from.slice(0, 80)}`)
      }
      code = code.replace(from, to)
    }
  }

  if (!code.includes(NEVER_BLANK_MARKER)) {
    if (!code.includes(CODE_DEFER_V25_FROM)) {
      throw new Error(`CodeRenderable never-blank anchor missing: ${CODE_DEFER_V25_FROM.slice(0, 80)}`)
    }
    code = code.replace(CODE_DEFER_V25_FROM, CODE_DEFER_V25_TO)
  }

  if (!code.includes(CODE_FRAME_RELEASE_MARKER)) {
    if (!code.includes(CODE_RENDER_SIGNATURE)) {
      throw new Error(`CodeRenderable patch signature missing: ${CODE_RENDER_SIGNATURE}`)
    }
    code = code.replace(CODE_RENDER_SIGNATURE, CODE_RENDER_PATCH)
  }

  // A newer content snapshot already requested its own frame. A stale async
  // highlight completion must not enqueue an extra repaint, or it can land
  // between the stream frame and its layout commit and flash the whole TUI.
  if (!code.includes(CODE_STALE_HIGHLIGHT_MARKER) || code.includes(CODE_STALE_HIGHLIGHT_NESTED)) {
    code = code
      .replaceAll(CODE_STALE_HIGHLIGHT_NESTED, CODE_STALE_HIGHLIGHT_NESTED_PATCH)
      .replaceAll(CODE_STALE_HIGHLIGHT, CODE_STALE_HIGHLIGHT_PATCH)
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
  const inserted = source.slice(0, index + SIGNATURE.length) + GUARD + source.slice(index + SIGNATURE.length)
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
  const applyReady = source.includes(MARKDOWN_APPLY_PATCH)
  const inlineReady = source.includes(MARKDOWN_CREATE_INLINE_PATCH)
  if (createReady && updateReady && applyReady && inlineReady) {
    console.log(`[patch-opentui] markdown fallback already patched ${bundle}`)
    markdownReady++
    skipped++
    continue
  }

  // Apply the applyMarkdownCodeRenderable patch if create/update are already patched
  if (createReady && updateReady && !applyReady && source.includes(MARKDOWN_APPLY_SIGNATURE)) {
    const next = source.replace(MARKDOWN_APPLY_SIGNATURE, MARKDOWN_APPLY_PATCH)
    writeFileSync(bundle, next, "utf-8")
    console.log(`[patch-opentui] patched markdown applyMarkdownCodeRenderable ${bundle}`)
    markdownReady++
    markdownPatched++
    continue
  }

  // Migrate bundles patched by the previous release, which forced the
  // unstyled fallback on during streaming. The retained-frame patch now keeps
  // the last highlighted frame stable instead, eliminating color flicker.
  if (source.includes(LEGACY_MARKDOWN_CREATE_PATCH) && source.includes(LEGACY_MARKDOWN_UPDATE_PATCH)) {
    let next = source
      .replace(LEGACY_MARKDOWN_CREATE_PATCH, MARKDOWN_CREATE_PATCH)
      .replace(LEGACY_MARKDOWN_UPDATE_PATCH, MARKDOWN_UPDATE_PATCH)
    if (source.includes(MARKDOWN_APPLY_SIGNATURE)) {
      next = next.replace(MARKDOWN_APPLY_SIGNATURE, MARKDOWN_APPLY_PATCH)
    }
    writeFileSync(bundle, next, "utf-8")
    console.log(`[patch-opentui] migrated markdown fallback patch ${bundle}`)
    markdownReady++
    markdownPatched++
    continue
  }

  if (
    createReady !== updateReady ||
    !source.includes(MARKDOWN_CREATE_SIGNATURE) ||
    !source.includes(MARKDOWN_UPDATE_SIGNATURE)
  ) {
    console.error(`[patch-opentui] markdown fallback signatures incomplete in ${bundle}`)
    process.exitCode = 1
    continue
  }

  let next = source
    .replace(MARKDOWN_CREATE_SIGNATURE, MARKDOWN_CREATE_PATCH)
    .replace(MARKDOWN_UPDATE_SIGNATURE, MARKDOWN_UPDATE_PATCH)
  if (source.includes(MARKDOWN_APPLY_SIGNATURE)) {
    next = next.replace(MARKDOWN_APPLY_SIGNATURE, MARKDOWN_APPLY_PATCH)
  }
  if (source.includes(MARKDOWN_CREATE_INLINE_SIGNATURE)) {
    next = next.replace(MARKDOWN_CREATE_INLINE_SIGNATURE, MARKDOWN_CREATE_INLINE_PATCH)
  }
  writeFileSync(bundle, next, "utf-8")
  console.log(`[patch-opentui] patched markdown fallback ${bundle}`)
  markdownReady++
  markdownPatched++
}

let tsClientTargets = 0
let tsClientReady = 0
let tsClientPatched = 0

for (const bundle of collectEntryBundles()) {
  const version = versionOf(bundle)
  if (version !== TARGET_VERSION) {
    console.log(`[patch-opentui] skip ${bundle} (version ${version ?? "unknown"} != ${TARGET_VERSION})`)
    skipped++
    continue
  }

  tsClientTargets++
  const source = readFileSync(bundle, "utf-8")
  const setterReady = source.includes(MARKDOWN_TS_CLIENT_PATCH)
  const applyReady = source.includes(MARKDOWN_APPLY_TS_PATCH)
  const oldApplyGone = !source.includes(MARKDOWN_APPLY_TS_OLD_PATCH)
  if (setterReady && applyReady && oldApplyGone) {
    console.log(`[patch-opentui] markdown treeSitterClient already patched ${bundle}`)
    tsClientReady++
    skipped++
    continue
  }

  if (!source.includes(MARKDOWN_TS_CLIENT_SIGNATURE) || !source.includes(MARKDOWN_APPLY_TS_SIGNATURE)) {
    console.error(`[patch-opentui] markdown treeSitterClient signatures incomplete in ${bundle}`)
    process.exitCode = 1
    continue
  }

  const next = source
    .replace(MARKDOWN_TS_CLIENT_SIGNATURE, MARKDOWN_TS_CLIENT_PATCH)
    .replaceAll(MARKDOWN_APPLY_TS_OLD_PATCH, "")
    .replace(MARKDOWN_APPLY_TS_SIGNATURE, MARKDOWN_APPLY_TS_PATCH)
  writeFileSync(bundle, next, "utf-8")
  console.log(`[patch-opentui] patched markdown treeSitterClient ${bundle}`)
  tsClientReady++
  tsClientPatched++
}

let parseTargets = 0
let parseReady = 0
let parsePatched = 0

for (const bundle of collectEntryBundles()) {
  const version = versionOf(bundle)
  if (version !== TARGET_VERSION) {
    console.log(`[patch-opentui] skip ${bundle} (version ${version ?? "unknown"} != ${TARGET_VERSION})`)
    skipped++
    continue
  }

  parseTargets++
  const source = readFileSync(bundle, "utf-8")
  if (source.includes(PARSE_REUSE_MARKER)) {
    console.log(`[patch-opentui] parseMarkdownIncremental already patched ${bundle}`)
    parseReady++
    skipped++
    continue
  }
  if (!source.includes(PARSE_REUSE_SIGNATURE)) {
    console.error(`[patch-opentui] parseMarkdownIncremental signature missing in ${bundle}`)
    process.exitCode = 1
    continue
  }
  const next = source.replace(PARSE_REUSE_SIGNATURE, PARSE_REUSE_PATCH)
  writeFileSync(bundle, next, "utf-8")
  console.log(`[patch-opentui] patched parseMarkdownIncremental ${bundle}`)
  parseReady++
  parsePatched++
}

let streamingTargets = 0
let streamingReady = 0
let streamingPatched = 0

for (const bundle of collectEntryBundles()) {
  const version = versionOf(bundle)
  if (version !== TARGET_VERSION) {
    console.log(`[patch-opentui] skip ${bundle} (version ${version ?? "unknown"} != ${TARGET_VERSION})`)
    skipped++
    continue
  }

  streamingTargets++
  const source = readFileSync(bundle, "utf-8")
  if (source.includes(MARKDOWN_STREAMING_FINALIZE_MARKER)) {
    console.log(`[patch-opentui] markdown streaming flip already patched ${bundle}`)
    streamingReady++
    skipped++
    continue
  }
  if (!source.includes(MARKDOWN_STREAMING_SIGNATURE)) {
    console.error(`[patch-opentui] markdown streaming flip signature missing in ${bundle}`)
    process.exitCode = 1
    continue
  }
  const next = source.replace(MARKDOWN_STREAMING_SIGNATURE, MARKDOWN_STREAMING_PATCH)
  writeFileSync(bundle, next, "utf-8")
  console.log(`[patch-opentui] patched markdown streaming flip ${bundle}`)
  streamingReady++
  streamingPatched++
}

let diffTargets = 0
let diffReady = 0
let diffPatched = 0

for (const bundle of collectEntryBundles()) {
  const version = versionOf(bundle)
  if (version !== TARGET_VERSION) {
    skipped++
    continue
  }
  const source = readFileSync(bundle, "utf-8")
  if (!source.includes("class DiffRenderable")) continue
  diffTargets++
  if (source.includes(DIFF_FRAME_MARKER)) {
    console.log(`[patch-opentui] diff unstyled frames already patched ${bundle}`)
    diffReady++
    skipped++
    continue
  }
  if (
    !source.includes(DIFF_CREATE_SIGNATURE) ||
    !source.includes(DIFF_UPDATE_SIGNATURE) ||
    !source.includes(DIFF_ERROR_SIGNATURE)
  ) {
    console.error(`[patch-opentui] diff unstyled frame signatures incomplete in ${bundle}`)
    process.exitCode = 1
    continue
  }
  const next = source
    .replace(DIFF_CREATE_SIGNATURE, DIFF_CREATE_PATCH)
    .replace(DIFF_UPDATE_SIGNATURE, DIFF_UPDATE_PATCH)
    .replace(DIFF_ERROR_SIGNATURE, DIFF_ERROR_PATCH)
  writeFileSync(bundle, next, "utf-8")
  console.log(`[patch-opentui] patched diff unstyled frames ${bundle}`)
  diffReady++
  diffPatched++
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
  console.error(`[patch-opentui] patched ${markdownReady}/${markdownTargets} markdown fallback bundle(s)`)
  process.exitCode = 1
}
if (codeTargets === 0) {
  console.log(`[patch-opentui] no @opentui/core ${TARGET_VERSION} CodeRenderable chunks found to patch`)
} else if (codeReady !== codeTargets) {
  console.error(`[patch-opentui] patched ${codeReady}/${codeTargets} CodeRenderable bundle(s)`)
  process.exitCode = 1
}
if (parseTargets === 0) {
  console.log(`[patch-opentui] no @opentui/core ${TARGET_VERSION} entry bundles found for parseMarkdownIncremental`)
} else if (parseReady !== parseTargets) {
  console.error(`[patch-opentui] patched ${parseReady}/${parseTargets} parseMarkdownIncremental bundle(s)`)
  process.exitCode = 1
}
if (tsClientTargets === 0) {
  console.log(`[patch-opentui] no @opentui/core ${TARGET_VERSION} entry bundles found for markdown treeSitterClient`)
} else if (tsClientReady !== tsClientTargets) {
  console.error(`[patch-opentui] patched ${tsClientReady}/${tsClientTargets} markdown treeSitterClient bundle(s)`)
  process.exitCode = 1
}
if (streamingTargets === 0) {
  console.log(`[patch-opentui] no @opentui/core ${TARGET_VERSION} entry bundles found for markdown streaming flip`)
} else if (streamingReady !== streamingTargets) {
  console.error(`[patch-opentui] patched ${streamingReady}/${streamingTargets} markdown streaming flip bundle(s)`)
  process.exitCode = 1
}
if (diffTargets === 0) {
  console.log(`[patch-opentui] no @opentui/core ${TARGET_VERSION} entry bundles found for diff unstyled frames`)
} else if (diffReady !== diffTargets) {
  console.error(`[patch-opentui] patched ${diffReady}/${diffTargets} diff unstyled frame bundle(s)`)
  process.exitCode = 1
}
console.log(
  `[patch-opentui] loader_patched=${patched} markdown_patched=${markdownPatched} code_patched=${codePatched} parse_patched=${parsePatched} tsclient_patched=${tsClientPatched} streaming_patched=${streamingPatched} diff_patched=${diffPatched} skipped=${skipped}`,
)
