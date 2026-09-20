import { APP_NAME, BOOT_PHRASES, SIGIL_SEQUENCE } from "./branding"

/**
 * Pre-render startup animation.
 *
 * The TUI cannot paint until the engine booted, the daemon answered (or the
 * worker started), and OpenTUI took the terminal — on a cold start that is a
 * silent gap of one to several seconds. This draws one animated line in the
 * main screen while that happens and erases it before the renderer starts, so
 * the TUI always owns a clean terminal.
 *
 * TTY-only by construction: the caller passes `enabled` (the interactive
 * check plus the global `animations_enabled` switch) and the writer refuses a
 * non-TTY stream. Every write is a carriage-return redraw of the same line, so
 * a pipe, redirect, or CI log sees nothing.
 */

export interface StartupAnimationStream {
  write(chunk: string): unknown
  isTTY?: boolean
}

export interface StartupAnimationOptions {
  stream?: StartupAnimationStream
  /** `false` disables the animation entirely (non-interactive or preference). */
  enabled?: boolean
  /** Milliseconds between glyph steps. */
  intervalMs?: number
  /** `false` renders plain text (NO_COLOR). */
  color?: boolean
  /** Phrase pool; defaults to the brand boot phrases. */
  phrases?: readonly string[]
  /** Glyph pool; defaults to the brand sigil sequence. */
  glyphs?: readonly string[]
}

export interface StartupAnimation {
  /** Replace the phrase, e.g. when the boot phase changes. */
  setLabel(label: string): void
  /** Erase the line and stop the timer. Idempotent. */
  stop(): void
}

/** Erase the current line and return the cursor to its start. */
const ERASE_LINE = "\r\x1b[2K"
const DIM = "\x1b[2m"
/** Matches the dark theme's accent family; the theme is not mounted this early. */
const ACCENT = "\x1b[38;2;203;166;247m"
const RESET = "\x1b[0m"

/** One frame of the startup line, without cursor handling. */
export function startupFrame(input: {
  tick: number
  label: string
  glyphs?: readonly string[]
  color?: boolean
}): string {
  const glyphs = input.glyphs && input.glyphs.length > 0 ? input.glyphs : SIGIL_SEQUENCE
  const tick = Number.isFinite(input.tick) ? Math.max(0, Math.floor(input.tick)) : 0
  const glyph = glyphs[tick % glyphs.length] ?? "◆"
  if (input.color === false) return `${glyph} ${APP_NAME} · ${input.label}`
  return `${ACCENT}${glyph}${RESET} ${DIM}${APP_NAME} · ${input.label}${RESET}`
}

export function startStartupAnimation(options: StartupAnimationOptions = {}): StartupAnimation {
  const stream = options.stream ?? process.stdout
  const glyphs = options.glyphs && options.glyphs.length > 0 ? options.glyphs : SIGIL_SEQUENCE
  const phrases = options.phrases && options.phrases.length > 0 ? options.phrases : BOOT_PHRASES
  if (options.enabled === false || stream.isTTY !== true) return { setLabel() {}, stop() {} }

  const intervalMs = Math.max(16, Math.floor(options.intervalMs ?? 90))
  const color = options.color !== false && !process.env.NO_COLOR && process.env.TERM !== "dumb"
  let tick = 0
  let label = phrases[Math.floor(Math.random() * phrases.length)] ?? ""
  let stopped = false

  const draw = () => stream.write(ERASE_LINE + startupFrame({ tick, label, glyphs, color }))
  draw()
  const timer = setInterval(() => {
    tick += 1
    draw()
  }, intervalMs)
  ;(timer as { unref?: () => void }).unref?.()

  return {
    setLabel(next) {
      label = next
      if (!stopped) draw()
    },
    stop() {
      if (stopped) return
      stopped = true
      clearInterval(timer)
      stream.write(ERASE_LINE)
    },
  }
}
