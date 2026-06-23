// Entry and exit splash banners for direct interactive mode scrollback.
//
// Renders the full opencode entry logo and a compact [O] exit badge, plus
// session metadata and the resume command. These are scrollback snapshots, so
// they become immutable terminal history once committed.
//
// Both variants use a cell-based renderer. cells() classifies each character
// in the source template as text, full-block, half-block-mix, or
// half-block-top, and draw() renders it with foreground/background shadow
// colors from the theme.
import {
  BoxRenderable,
  type ColorInput,
  TextAttributes,
  TextRenderable,
  type ScrollbackRenderContext,
  type ScrollbackSnapshot,
  type ScrollbackWriter,
} from "@opentui/core"
import * as Locale from "@/util/locale"
import { go } from "@/cli/logo"
import { APP_NAME, BOOT_PHRASES, SIGIL_SEQUENCE, SIGIL_STEP_MS } from "@arcana/tui/branding"
import type { RunSplashTheme } from "./theme"

/** Pick a deterministic boot phrase per session id for first-paint brand surface. */
export function pickBootPhrase(seed: string): string {
  const hash = Array.from(seed).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 0)
  return BOOT_PHRASES[hash % BOOT_PHRASES.length] ?? BOOT_PHRASES[0] ?? ""
}

export const SPLASH_TITLE_LIMIT = 50
export const SPLASH_TITLE_FALLBACK = "Untitled session"

type SplashInput = {
  title: string | undefined
  session_id: string
}

type SplashWriterInput = SplashInput & {
  theme: RunSplashTheme
  showSession?: boolean
  detail?: string
}

export type SplashMeta = {
  title: string
  session_id: string
}

type Cell = {
  char: string
  mark: "text" | "full" | "mix" | "top"
}

function cells(line: string): Cell[] {
  const list: Cell[] = []
  for (const char of line) {
    if (char === "_") {
      list.push({ char: " ", mark: "full" })
      continue
    }

    if (char === "^") {
      list.push({ char: "▀", mark: "mix" })
      continue
    }

    if (char === "~") {
      list.push({ char: "▀", mark: "top" })
      continue
    }

    list.push({ char, mark: "text" })
  }

  return list
}

function title(text: string | undefined): string {
  if (!text) {
    return SPLASH_TITLE_FALLBACK
  }

  let value = ""
  let gap = false
  for (const char of text.trim()) {
    if (char === " " || char === "\n" || char === "\r" || char === "\t") {
      gap = true
      continue
    }

    if (gap && value.length > 0) {
      value += " "
    }

    value += char
    gap = false
  }

  if (!value) {
    return SPLASH_TITLE_FALLBACK
  }

  return Locale.truncate(value, SPLASH_TITLE_LIMIT)
}

function write(
  root: BoxRenderable,
  ctx: ScrollbackRenderContext,
  line: {
    left: number
    top: number
    text: string
    fg: ColorInput
    bg?: ColorInput
    attrs?: number
  },
): void {
  if (line.left >= ctx.width) {
    return
  }

  root.add(
    new TextRenderable(ctx.renderContext, {
      position: "absolute",
      left: line.left,
      top: line.top,
      width: Math.max(1, ctx.width - line.left),
      height: 1,
      wrapMode: "none",
      content: line.text,
      fg: line.fg,
      bg: line.bg,
      attributes: line.attrs,
    }),
  )
}

function push(
  lines: Array<{ left: number; top: number; text: string; fg: ColorInput; bg?: ColorInput; attrs?: number }>,
  left: number,
  top: number,
  text: string,
  fg: ColorInput,
  bg?: ColorInput,
  attrs?: number,
): void {
  lines.push({ left, top, text, fg, bg, attrs })
}

function draw(
  lines: Array<{ left: number; top: number; text: string; fg: ColorInput; bg?: ColorInput; attrs?: number }>,
  row: string,
  input: {
    left: number
    top: number
    fg: ColorInput
    shadow: ColorInput
    attrs?: number
  },
) {
  let x = input.left
  for (const cell of cells(row)) {
    if (cell.mark === "full" || cell.mark === "mix") {
      push(lines, x, input.top, cell.char, input.fg, input.shadow, input.attrs)
      x += 1
      continue
    }

    if (cell.mark === "top") {
      push(lines, x, input.top, cell.char, input.shadow, undefined, input.attrs)
      x += 1
      continue
    }

    push(lines, x, input.top, cell.char, input.fg, undefined, input.attrs)
    x += 1
  }
}

function build(input: SplashWriterInput, kind: "entry" | "exit", ctx: ScrollbackRenderContext): ScrollbackSnapshot {
  const width = Math.max(1, ctx.width)
  const meta = splashMeta(input)
  const lines: Array<{ left: number; top: number; text: string; fg: ColorInput; bg?: ColorInput; attrs?: number }> = []
  const left = input.theme.left
  const right = input.theme.right
  const leftShadow = input.theme.leftShadow
  let height = 1

  if (kind === "entry") {
    const mark = go.right.slice(1)
    // Brand header sits one row above the wordmark — divining verb + APP_NAME.
    const firstSigil: string = SIGIL_SEQUENCE[0] ?? "◆"
    const brandLine = `${firstSigil} ${pickBootPhrase(meta.session_id)} — ${APP_NAME}`
    const top = 1
    const body_left = (mark[0]?.length ?? 0) + 2

    push(lines, 0, 0, Locale.truncate(brandLine, Math.max(1, width)), left, undefined, TextAttributes.DIM)

    for (let i = 0; i < mark.length; i += 1) {
      draw(lines, mark[i] ?? "", {
        left: 0,
        top: top + i,
        fg: left,
        shadow: leftShadow,
      })
    }

    push(lines, body_left, top, APP_NAME, right, undefined, TextAttributes.BOLD)
    if (input.detail) {
      push(
        lines,
        body_left,
        top + 1,
        Locale.truncateMiddle(input.detail, Math.max(1, width - body_left)),
        left,
        undefined,
      )
    }
    height = top + mark.length
  }

  if (kind === "exit") {
    const mark = go.right.slice(1)
    const top = 1
    const body_left = (mark[0]?.length ?? 0) + 2
    const session = "Session  "
    const label = "Continue "

    for (let i = 0; i < mark.length; i += 1) {
      draw(lines, mark[i] ?? "", {
        left: 0,
        top: top + i,
        fg: left,
        shadow: leftShadow,
      })
    }

    if (input.showSession !== false) {
      push(lines, body_left, top, session, left, undefined, TextAttributes.DIM)
      push(lines, body_left + session.length, top, meta.title, right, undefined, TextAttributes.BOLD)
    }

    push(lines, body_left, top + 1, label, left, undefined, TextAttributes.DIM)
    push(
      lines,
      body_left + label.length,
      top + 1,
      `arcana run -i -s ${meta.session_id}`,
      right,
      undefined,
      TextAttributes.BOLD,
    )
    height = top + mark.length
  }

  const root = new BoxRenderable(ctx.renderContext, {
    position: "absolute",
    left: 0,
    top: 0,
    width,
    height,
  })

  for (const line of lines) {
    write(root, ctx, line)
  }

  return {
    root,
    width,
    height,
    rowColumns: width,
    startOnNewLine: true,
    trailingNewline: false,
  }
}

export function splashMeta(input: SplashInput): SplashMeta {
  return {
    title: title(input.title),
    session_id: input.session_id,
  }
}

export function entrySplash(input: SplashWriterInput): ScrollbackWriter {
  return (ctx) => build(input, "entry", ctx)
}

export function exitSplash(input: SplashWriterInput): ScrollbackWriter {
  return (ctx) => build(input, "exit", ctx)
}

/**
 * Sigil transition — writes the brand sigil sequence (◆ ▰ ❯ ⛧ ✦ ◈) one
 * glyph per row into scrollback. Each row is rendered with the right (fg)
 * color and the left (shadow) tone as its shadow. This sits before the
 * wordmark in `entrySplash` so the brand surface is the first paint the
 * user sees, in order, with the configured per-step delay.
 */
export function sigilTransition(input: { theme: RunSplashTheme; seed?: string }): ScrollbackWriter {
  return (ctx) => {
    const width = Math.max(1, ctx.width)
    const left = input.theme.left
    const right = input.theme.right
    const leftShadow = input.theme.leftShadow
    const lines: Array<{ left: number; top: number; text: string; fg: ColorInput; bg?: ColorInput; attrs?: number }> = []

    // Header row with the deterministic boot phrase so the sigils read as a
    // bounded transition rather than dead glyphs.
    const phrase = pickBootPhrase(input.seed ?? "")
    push(lines, 0, 0, phrase ? `◆ ${phrase}` : "◆", right, undefined, TextAttributes.DIM)

    SIGIL_SEQUENCE.forEach((glyph, idx) => {
      // Each glyph sits in its own row; render shadow as a faded duplicate to
      // mimic a one-cell jitter that the eye reads as motion.
      push(lines, idx * 2, 1 + idx, glyph, right, undefined, idx === 0 ? TextAttributes.BOLD : undefined)
      if (idx > 0) {
        push(lines, idx * 2 - 1, 1 + idx, glyph, left, undefined, TextAttributes.DIM)
      }
      // Shadow underline tying the sequence back to the brand chrome.
      push(lines, idx * 2, 2 + idx, "▰", leftShadow, undefined, TextAttributes.DIM)
    })

    const height = SIGIL_SEQUENCE.length + 2
    const root = new BoxRenderable(ctx.renderContext, {
      position: "absolute",
      left: 0,
      top: 0,
      width,
      height,
    })

    for (const line of lines) write(root, ctx, line)

    return {
      root,
      width,
      height,
      rowColumns: width,
      startOnNewLine: true,
      trailingNewline: false,
    }
  }
}

/** Per-step delay (ms) for the sigil transition; matches SIGIL_STEP_MS. */
export const SIGIL_TRANSITION_STEP_MS = SIGIL_STEP_MS
