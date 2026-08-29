/**
 * Chat prose normalization for assistant (and rich user) cards.
 *
 * Models often emit hard newlines that look like terminal soft-wraps
 * ("What\n would you like"). Grok always renders agent text as markdown;
 * we still need to clean soft breaks so lists/paragraphs stay scannable.
 *
 * Safe transforms only:
 * - Collapse single newlines between ordinary prose into spaces
 * - Keep blank lines (paragraph breaks)
 * - Keep structural markdown lines (lists, headings, quotes, tables, hr)
 * - Append soft-wrapped continuations onto the previous list/quote line
 * - Leave fenced code blocks byte-for-byte
 * - Honor markdown hard breaks (line ending with two spaces)
 */

const STRUCTURAL =
  /^(?:#{1,6}\s|[-*+]\s+\S|\d+\.\s+\S|>\s?|(-{3,}|\*{3,}|_{3,})\s*$|\|)/

function isBlank(line: string): boolean {
  return line.trim().length === 0
}

function isStructuralLine(line: string): boolean {
  if (isBlank(line)) return false
  return STRUCTURAL.test(line.trimStart())
}

function isListOrQuoteLine(line: string): boolean {
  const t = line.trimStart()
  return /^([-*+]\s+\S|\d+\.\s+\S|>\s?)/.test(t)
}

function endsWithHardBreak(line: string): boolean {
  // Markdown hard line break: two or more trailing spaces before \n
  return / {2,}$/.test(line)
}

function getInlineCodeInfo(text: string): { inside: boolean; openLen: number } {
  let inside = false
  let openLen = 0
  let i = 0
  while (i < text.length) {
    if (text[i] === "\\" && i + 1 < text.length && text[i + 1] === "`") {
      i += 2
      continue
    }
    if (text[i] === "`") {
      let j = i
      while (j < text.length && text[j] === "`") j++
      const run = j - i
      if (!inside) {
        inside = true
        openLen = run
      } else if (run === openLen) {
        inside = false
        openLen = 0
      }
      i = j
      continue
    }
    i++
  }
  return { inside, openLen }
}

function endsWithBacktickRun(text: string, len: number): boolean {
  if (len <= 0) return false
  if (text.length < len) return false
  for (let k = text.length - len; k < text.length; k++) if (text[k] !== "`") return false
  if (text.length > len && text[text.length - len - 1] === "`") return false
  if (text.length > len && text[text.length - len - 1] === "\\") return false
  return true
}

function startsWithBacktickRun(text: string, len: number): boolean {
  if (len <= 0) return false
  if (text.length < len) return false
  for (let k = 0; k < len; k++) if (text[k] !== "`") return false
  if (text.length > len && text[len] === "`") return false
  return true
}

function joinWithInlineAware(a: string, bTrimmed: string, bTrimStart: string): string {
  const base = a.replace(/\s+$/, "")
  const info = getInlineCodeInfo(a)
  if (!info.inside) return base + " " + bTrimmed
  const aEndsDelim = endsWithBacktickRun(base, info.openLen)
  const bStartsDelim = startsWithBacktickRun(bTrimStart, info.openLen)
  if (aEndsDelim || bStartsDelim) return base + bTrimmed
  return base + " " + bTrimmed
}

/**
 * Normalize soft-wrapped chat prose for markdown rendering.
 * Does not invent structure — only joins accidental hard wraps.
 */
export function normalizeChatProse(text: string): string {
  if (!text) return text
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  if (!raw.includes("\n")) return raw

  // Preserve fenced blocks exactly (including incomplete open fences).
  const parts = raw.split(/(```[\s\S]*?(?:```|$))/)
  return parts
    .map((part, i) => {
      if (i % 2 === 1 || part.startsWith("```")) return part
      return normalizeProseRegion(part)
    })
    .join("")
}

function normalizeProseRegion(region: string): string {
  if (!region.includes("\n")) return region

  const lines = region.split("\n")
  const out: string[] = []
  let buf = ""

  const flushBuf = () => {
    if (buf.length > 0) {
      out.push(buf)
      buf = ""
    }
  }

  for (const line of lines) {
    if (isBlank(line)) {
      flushBuf()
      out.push("")
      continue
    }

    if (isStructuralLine(line)) {
      flushBuf()
      out.push(line)
      continue
    }

    // Soft continuation of a list/quote item (indented or mid-item wrap).
    const last = out.length > 0 ? out[out.length - 1]! : undefined
    if (
      !buf
      && last
      && !isBlank(last)
      && isListOrQuoteLine(last)
      && !endsWithHardBreak(last)
    ) {
      out[out.length - 1] = joinWithInlineAware(last, line.trim(), line.trimStart())
      continue
    }

    // Ordinary prose soft-wrap join.
    if (buf) {
      if (endsWithHardBreak(buf)) {
        // Keep trailing spaces (markdown hard break) on the finished line.
        // Hard break wins even inside inline code.
        out.push(buf)
        buf = line
      } else {
        buf = joinWithInlineAware(buf, line.trim(), line.trimStart())
      }
    } else {
      // Preserve trailing spaces so hard-break detection works next line.
      buf = line
    }
  }

  flushBuf()
  return out.join("\n")
}

/**
 * Remove markdown emphasis/strikethrough markers (`***`, `**`, `~~`) from prose
 * so raw syntax never leaks into chat text. OpenTUI hides inline emphasis only
 * via the tree-sitter `markdown_inline` injection at idle; when that path is
 * unavailable (grammar not loaded, highlight failure) the `**` delimiters render
 * verbatim. Stripping the markers outside fenced code blocks and inline code
 * spans guarantees clean text regardless of highlight state. Single `*` is left
 * alone — it is common as arithmetic (`3 * 4`) and its italic markers are rarer
 * and less visually noisy than stray `**`.
 */
export function stripMarkdownEmphasis(text: string): string {
  if (!text) return text
  const parts = text.split(/(```[\s\S]*?(?:```|$))/)
  return parts
    .map((part, i) => {
      if (i % 2 === 1 || part.startsWith("```")) return part
      return part
        .split(/(`[^`\n]+`)/)
        .map((seg, j) => {
          if (j % 2 === 1) return seg
          return seg
            .replace(/\*\*\*([^*\n]+)\*\*\*/g, "$1")
            .replace(/\*\*([^*\n]+)\*\*/g, "$1")
            .replace(/~~([^~\n]+)~~/g, "$1")
        })
        .join("")
    })
    .join("")
}

/** True when text has markdown structure worth rich rendering. */
export function looksLikeMarkdown(text: string): boolean {
  if (/```/.test(text)) return true
  if (/^#{1,6}\s/m.test(text)) return true
  if (/^\s*[-*+]\s+\S/m.test(text)) return true
  if (/^\s*\d+\.\s+\S/m.test(text)) return true
  if (/\*\*[^*]+\*\*|__[^_]+__|`[^`]+`/.test(text)) return true
  if (/^\s*>\s+\S/m.test(text)) return true
  if (/\[.+\]\(.+\)/.test(text)) return true
  return false
}
