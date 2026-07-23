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
      out[out.length - 1] = last.replace(/\s+$/, "") + " " + line.trim()
      continue
    }

    // Ordinary prose soft-wrap join.
    if (buf) {
      if (endsWithHardBreak(buf)) {
        // Keep trailing spaces (markdown hard break) on the finished line.
        out.push(buf)
        buf = line
      } else {
        buf = buf.replace(/\s+$/, "") + " " + line.trim()
      }
    } else {
      // Preserve trailing spaces so hard-break detection works next line.
      buf = line
    }
  }

  flushBuf()
  return out.join("\n")
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
