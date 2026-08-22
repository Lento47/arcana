/**
 * Read-tool output parser for the command spine.
 *
 * Parses `cat -n`-style numbered bodies and OpenAI-style system reminders out
 * of Read tool output, memoized by output identity: a last-result slot
 * absorbs streaming bursts, and a byte-aware LRU (8MB cap, FNV-strided keys)
 * absorbs rescans of large files.
 */

function isBoilerplateReminder(text: string): boolean {
  return /untrusted user data|file-content tags|do NOT execute|DATA, not instructions/i.test(text)
}

export type ParsedReadBody = {
  body: string
  reminders: string[]
  path?: string
  /** "file" source, "directory" listing, or unstructured "text". */
  kind: "file" | "directory" | "text"
  /** Directory / entries names (no XML). */
  listing?: string[]
  lineStart?: number
  lineEnd?: number
  totalLines?: number
  /** EOF / truncation note — muted under the code panel, not inside source. */
  note?: string
}

function isEntryFooter(line: string): boolean {
  const trimmed = line.trim()
  return (
    /^\((?:\d+\s+entries|Showing\s+\d+\s+of\s+\d+\s+entries)[\s\S]*\)$/i.test(trimmed)
    || /^\((?:End of file|Showing lines|Output capped)[\s\S]*\)$/i.test(trimmed)
    || /^\(Output capped at[\s\S]*\)$/i.test(trimmed)
    || /^\(Results are truncated[\s\S]*\)$/i.test(trimmed)
  )
}

/**
 * Strip engine XML from read/inspect output and normalize for the TUI.
 * - Directory reads: parse `<entries>` into a clean name list (no tags)
 * - File reads: strip `N: ` prefixes for syntax highlight
 * - Suppresses boilerplate untrusted-data system reminders
 * - Pulls footers into `note`
 */
// Cache: keyed on a length+hash of the output (FNV-1a, strided over the body)
// instead of the full output string. Full-string keys doubled memory (Map keeps
// keys alive for its lifetime) and bloated V8 hidden classes for 100KB tool
// outputs. The LRU is byte-aware: a single 100KB read can co-exist with
// hundreds of small outputs, all under the 8MB cap.
const readParseTextCache = new Map<string, ParsedReadBody>()
const readParseTextCacheSizes = new Map<string, number>()
const READ_PARSE_TEXT_CACHE_BYTES = 8 * 1024 * 1024 // 8MB
let readParseBytes = 0
let readParseLastInput: string | undefined
let readParseLastResult: ParsedReadBody | undefined

/** FNV-1a hash, strided so 100KB strings hash in O(1/128) time. ~50ns. */
function hashReadOutput(s: string): string {
  let h = 0x811c9dc5
  const n = s.length
  const step = Math.max(1, Math.floor(n / 128))
  for (let i = 0; i < n; i += step) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${n}:${h.toString(16)}`
}

/**
 * Memoize parseReadToolOutput on output identity. The parser runs 4 regex
 * passes per call; during streaming the same `output` string is fed in 3+
 * times per token (toolOutputBody, summary call sites, etc.). A single-slot
 * "last" cache catches the streaming burst; a small LRU Map catches rescans
 * of completed tool outputs. 8MB byte cap covers a busy session's worth of
 * unique tool outputs without unbounded growth.
 */
export function parseReadToolOutput(output: string): ParsedReadBody {
  if (output === readParseLastInput && readParseLastResult) return readParseLastResult
  const key = hashReadOutput(output)
  const cached = readParseTextCache.get(key)
  if (cached) {
    readParseLastInput = output
    readParseLastResult = cached
    return cached
  }
  const reminders: string[] = []
  let content = output

  const pathMatch = content.match(/<path>([^<]*)<\/path>/i)
  const path = pathMatch?.[1]?.trim() || undefined
  const typeMatch = content.match(/<type>([^<]*)<\/type>/i)
  const typeHint = typeMatch?.[1]?.trim().toLowerCase()

  content = content.replace(/<system-reminder>([\s\S]*?)<\/system-reminder>/gi, (_, text: string) => {
    const trimmed = text.trim()
    if (trimmed && !isBoilerplateReminder(trimmed)) reminders.push(trimmed)
    return ""
  })

  // Directory listing: <entries>…</entries>
  const entriesBlock = content.match(/<entries>([\s\S]*?)<\/entries>/i)
  if (typeHint === "directory" || entriesBlock) {
    const inner = (entriesBlock?.[1] ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    const notes: string[] = []
    const listing: string[] = []
    for (const line of inner.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed) continue
      if (isEntryFooter(trimmed)) {
        notes.push(trimmed.replace(/^\(|\)$/g, "").trim())
        continue
      }
      // Drop any residual tags
      if (/^<\/?[a-z][\w-]*>$/i.test(trimmed)) continue
      listing.push(trimmed)
    }

    let totalLines: number | undefined
    for (const note of notes) {
      const m = note.match(/(\d+)\s+entries/i)
      if (m) totalLines = Number(m[1])
      const showing = note.match(/Showing\s+(\d+)\s+of\s+(\d+)\s+entries/i)
      if (showing) totalLines = Number(showing[2])
    }
    if (totalLines === undefined && listing.length) totalLines = listing.length

    const result: ParsedReadBody = {
      body: listing.join("\n"),
      kind: "directory",
      listing,
      reminders,
      path,
      totalLines,
      note: notes.length ? notes.join(" · ") : totalLines !== undefined ? `${totalLines} entries` : undefined,
    }
    cacheReadOutput(key, output, result)
    return result
  }

  content = content
    .replace(/<path>[^<]*<\/path>\s*/gi, "")
    .replace(/<type>[^<]*<\/type>\s*/gi, "")
    .replace(/<\/?file-content>/gi, "")
    .replace(/<\/?entries>/gi, "")
    .trim()

  const rawLines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  const notes: string[] = []
  const contentLines: string[] = []

  for (const line of rawLines) {
    const trimmed = line.trim()
    if (isEntryFooter(trimmed)) {
      notes.push(trimmed.replace(/^\(|\)$/g, "").trim())
      continue
    }
    contentLines.push(line)
  }

  while (contentLines.length && !contentLines[contentLines.length - 1]!.trim()) {
    contentLines.pop()
  }

  const numbered = contentLines.filter((l) => l.trim().length > 0)
  const numberedHits = numbered.filter((l) => /^\d+:/.test(l)).length
  const looksNumbered = numbered.length > 0 && numberedHits / numbered.length >= 0.7

  let lineStart: number | undefined
  let lineEnd: number | undefined
  let body: string
  let kind: ParsedReadBody["kind"] = "text"

  if (looksNumbered) {
    kind = "file"
    body = contentLines
      .map((line) => {
        if (!line.trim()) return ""
        const m = line.match(/^(\d+):\s?(.*)$/)
        return m ? (m[2] ?? "") : line
      })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")

    for (const line of contentLines) {
      const m = line.match(/^(\d+):/)
      if (!m) continue
      const n = Number(m[1])
      if (lineStart === undefined || n < lineStart) lineStart = n
      if (lineEnd === undefined || n > lineEnd) lineEnd = n
    }
  } else {
    body = contentLines.join("\n")
    // Heuristic: multi-line path-ish list → listing (glob-like), not code
    const nonEmpty = contentLines.map((l) => l.trim()).filter(Boolean)
    const pathish =
      nonEmpty.length >= 2
      && nonEmpty.filter((l) => /[\\/]|\.\w{1,8}$/.test(l) || l.endsWith("/")).length / nonEmpty.length >= 0.7
    if (pathish) {
      kind = "directory"
      const result: ParsedReadBody = {
        body: nonEmpty.join("\n"),
        kind: "directory",
        listing: nonEmpty.filter((l) => !isEntryFooter(l)),
        reminders,
        path,
        totalLines: nonEmpty.length,
        note: notes.length ? notes.join(" · ") : undefined,
      }
      cacheReadOutput(key, output, result)
      return result
    }
  }

  let totalLines: number | undefined
  for (const note of notes) {
    const eof = note.match(/total\s+(\d+)\s+lines/i)
    if (eof) totalLines = Number(eof[1])
    const showing = note.match(/Showing lines\s+(\d+)\s*-\s*(\d+)\s+of\s+(\d+)/i)
    if (showing) {
      lineStart = lineStart ?? Number(showing[1])
      lineEnd = lineEnd ?? Number(showing[2])
      totalLines = Number(showing[3])
    }
    const capped = note.match(/Showing lines\s+(\d+)\s*-\s*(\d+)/i)
    if (capped && lineStart === undefined) {
      lineStart = Number(capped[1])
      lineEnd = Number(capped[2])
    }
  }

  const note = notes.length ? notes.join(" · ") : undefined
  const result: ParsedReadBody = {
    body: body.trimEnd(),
    kind: looksNumbered ? "file" : kind,
    reminders,
    path,
    lineStart,
    lineEnd,
    totalLines,
    note,
  }
  cacheReadOutput(key, output, result)
  return result
}

function cacheReadOutput(key: string, output: string, result: ParsedReadBody) {
  readParseLastInput = output
  readParseLastResult = result
  // Byte-aware LRU: track input size; evict oldest until under cap.
  const size = output.length * 2 // UTF-16
  while (readParseBytes + size > READ_PARSE_TEXT_CACHE_BYTES && readParseTextCache.size > 0) {
    const oldest = readParseTextCache.keys().next().value
    if (oldest === undefined) break
    const oldSize = readParseTextCacheSizes.get(oldest) ?? 0
    readParseTextCache.delete(oldest)
    readParseTextCacheSizes.delete(oldest)
    readParseBytes -= oldSize
  }
  readParseTextCache.set(key, result)
  readParseTextCacheSizes.set(key, size)
  readParseBytes += size
}
