export function titlecase(str: string) {
  return str.replace(/\b\w/g, (c) => c.toUpperCase())
}

export function time(input: number): string {
  const date = new Date(input)
  return date.toLocaleTimeString(undefined, { timeStyle: "short" })
}

export function datetime(input: number): string {
  const date = new Date(input)
  const localTime = time(input)
  const localDate = date.toLocaleDateString()
  return `${localTime} · ${localDate}`
}

export function todayTimeOrDateTime(input: number): string {
  const date = new Date(input)
  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()

  if (isToday) {
    return time(input)
  } else {
    return datetime(input)
  }
}

export function number(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M"
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K"
  }
  return num.toString()
}

/**
 * Compact duration formatter (ms input) — the ONE canonical implementation.
 * `util/format`'s `formatDuration` delegates here (audit M7).
 *
 * Fixes the day math bug (audit M6): the old day term was computed from the
 * sub-hour remainder (`floor((input % 3600000) / 86400000)`) — always 0 — so
 * any duration ≥ 1 day rendered "0d 25h" instead of "1d 1h".
 *
 * Lexicon (consolidated): "123ms" · "5s" / "12.3s" (no trailing .0) ·
 * "5m" / "5m 10s" (zero tails omitted) · "1h" / "1h 5m" · "1d" / "1d 2h".
 * Zero, negative, and non-finite input → "" (matches formatDuration).
 */
export function duration(input: number) {
  if (!Number.isFinite(input) || input <= 0) return ""
  if (input < 1000) {
    return `${Math.round(input)}ms`
  }
  if (input < 60000) {
    return `${(input / 1000).toFixed(1).replace(/\.0$/, "")}s`
  }
  if (input < 3600000) {
    const minutes = Math.floor(input / 60000)
    const seconds = Math.floor((input % 60000) / 1000)
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
  }
  if (input < 86400000) {
    const hours = Math.floor(input / 3600000)
    const minutes = Math.floor((input % 3600000) / 60000)
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }
  const days = Math.floor(input / 86400000)
  const hours = Math.floor((input % 86400000) / 3600000)
  const minutes = Math.floor((input % 3600000) / 60000)
  if (hours > 0) return `${days}d ${hours}h`
  if (minutes > 0) return `${days}d ${minutes}m`
  return `${days}d`
}

// Grapheme + display-width-aware truncation (audit T1): the terminal measures
// display columns, not UTF-16 code units. CJK glyphs render at 2 columns, emoji
// span multiple code units, and a mid-surrogate cut renders a broken glyph — so
// count with Intl.Segmenter + Bun.stringWidth (the technique prompt/display.ts
// already uses).
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

/** Display width in terminal columns — grapheme-aware; newlines cost 0 columns. */
export function displayWidth(str: string): number {
  let width = 0
  for (const token of tokenizeAnsi(str)) {
    if (token.sgr) continue
    for (const part of graphemes.segment(token.chunk)) {
      width += Bun.stringWidth(part.segment)
    }
  }
  return width
}

/**
 * The string as styled spans and plain text. SGR color sequences are atomic
 * zero-width units that are always kept whole; every other CSI sequence
 * (cursor moves, line erases) is dropped, because it cannot survive a cut —
 * keeping `\x1b[2K` would erase the row it lands on.
 *
 * Without this, cutting `\x1b[38;2;30;30;30m` mid-sequence leaks a literal
 * `8;2;30;30;30m` tail into the row: `Bun.stringWidth` counts the `[38;2…m`
 * characters as visible columns, so a width walk happily splits the escape.
 */
const CSI_RE = /\x1b\[[0-9;:?]*[A-Za-z]/g
const SGR_RE = /^\x1b\[[0-9;:?]*m$/

function* tokenizeAnsi(str: string): Generator<{ chunk: string; sgr: boolean }> {
  CSI_RE.lastIndex = 0
  let last = 0
  for (let match = CSI_RE.exec(str); match !== null; match = CSI_RE.exec(str)) {
    if (match.index > last) yield { chunk: str.slice(last, match.index), sgr: false }
    if (SGR_RE.test(match[0])) yield { chunk: match[0], sgr: true }
    last = match.index + match[0].length
  }
  if (last < str.length) yield { chunk: str.slice(last), sgr: false }
}

/** Longest grapheme prefix fitting `maxWidth` display columns (never splits a glyph). */
function takeGraphemes(str: string, maxWidth: number): string {
  let out = ""
  let width = 0
  let done = false
  for (const token of tokenizeAnsi(str)) {
    // Style codes ride along even past the cut — a trailing reset keeps the
    // ellipsis from inheriting the cut text's color.
    if (token.sgr) {
      out += token.chunk
      continue
    }
    if (done) continue
    for (const part of graphemes.segment(token.chunk)) {
      const w = Bun.stringWidth(part.segment)
      if (width + w > maxWidth) {
        done = true
        break
      }
      out += part.segment
      width += w
    }
  }
  // The cut lands after whole graphemes, so trailing whitespace is just the
  // word-break remainder — drop it (and only it) ahead of trailing resets.
  // Only when a cut actually happened: a fitting string keeps its spaces.
  if (!done) return out
  return out.replace(/\s+((?:\x1b\[[0-9;:?]*m)*)$/, "$1")
}

/** Last graphemes fitting `maxWidth` display columns, in original order. */
function takeGraphemesFromEnd(str: string, maxWidth: number): string {
  const tokens = [...tokenizeAnsi(str)]
  let tail = ""
  let width = 0
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i]!
    if (token.sgr) {
      tail = token.chunk + tail
      continue
    }
    const parts = [...graphemes.segment(token.chunk)].map((p) => p.segment)
    for (let j = parts.length - 1; j >= 0; j--) {
      const w = Bun.stringWidth(parts[j]!)
      if (width + w > maxWidth) return tail
      tail = parts[j]! + tail
      width += w
    }
  }
  return tail
}

export function truncate(str: string, len: number): string {
  const budget = Math.floor(Number.isFinite(len) ? len : 0)
  if (budget <= 0) return ""
  // Fast path (spine-mapper hot path): display width can never exceed 2× code
  // units, so a short string is guaranteed to fit without a Segmenter walk.
  if (str.length <= Math.floor(budget / 2)) return str
  if (displayWidth(str) <= budget) return str
  // Keep budget-1 columns so the ellipsis (1 col) stays inside the budget.
  // Trailing whitespace/newlines are trimmed so no dangling gap sits before "…".
  return takeGraphemes(str, budget - 1).trimEnd() + "…"
}

export function truncateLeft(str: string, len: number): string {
  const budget = Math.floor(Number.isFinite(len) ? len : 0)
  if (budget <= 0) return ""
  if (displayWidth(str) <= budget) return str
  return "…" + takeGraphemesFromEnd(str, budget - 1)
}

export function truncateMiddle(str: string, maxLength: number = 35): string {
  const budget = Math.floor(Number.isFinite(maxLength) ? maxLength : 35)
  if (budget <= 0) return ""
  if (displayWidth(str) <= budget) return str
  const keepStart = Math.ceil((budget - 1) / 2)
  const keepEnd = Math.floor((budget - 1) / 2)
  return takeGraphemes(str, keepStart) + "…" + takeGraphemesFromEnd(str, keepEnd)
}

export function pluralize(count: number, singular: string, plural: string): string {
  const template = count === 1 ? singular : plural
  return template.replace("{}", count.toString())
}

/**
 * Currency formatter (audit M11) — the ONE canonical implementation. Uses the
 * runtime default locale like every other Locale.* helper (the four old copies
 * in statusbar/metrics-bar/sidebar-context/subagent-footer hardcoded a
 * US-English locale); USD stays as the currency because session costs are
 * tracked in USD. Non-finite input → "" (never a "NaN" glyph).
 */
const currencyFormatter = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" })

export function currency(num: number): string {
  if (!Number.isFinite(num)) return ""
  return currencyFormatter.format(num)
}

export * as Locale from "./locale"
