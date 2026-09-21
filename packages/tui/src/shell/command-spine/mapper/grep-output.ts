/**
 * Grep-tool output parser for the command spine.
 *
 * The engine renders `matches`-mode grep as grouped plain text:
 *
 *   Found 28 matches in 3 files
 *   L:\proj\src\a.ts (13 matches):
 *     Line 31:   try { return localStorage; }
 *
 *   L:\proj\src\b.ts (2 matches):
 *     Line 8: foo
 *
 * Rendered as prose that shape is weak: no match highlight, a blank row
 * between every match, full workspace paths. Parsed here into file groups so
 * the renderer can draw dense rows with the query hit highlighted. Pure;
 * returns `undefined` for anything that is not grep-matches shaped (other
 * modes, empty results, foreign text) so those keep their existing rendering.
 */

export interface GrepMatch {
  line: number
  text: string
}

export interface GrepFile {
  path: string
  /** Engine's per-file count, kept for the header when rows were capped. */
  count: number
  matches: GrepMatch[]
}

export interface ParsedGrepOutput {
  files: GrepFile[]
  /** Matches the engine reported across all files. */
  totalMatches: number
}

/** What the renderer needs: the pattern for hit highlighting plus the files. */
export interface GrepMatchesData {
  pattern?: string
  files: GrepFile[]
  totalMatches: number
}

const FILE_HEADER_RE = /^(.*) \((\d+) (?:match|matches)\):$/
const MATCH_ROW_RE = /^Line (\d+): ?(.*)$/

/**
 * Parse engine grep `matches`-mode output. Blank lines and the `Found …` /
 * truncation footers are structural, not content — exactly one match row per
 * `Line N:` line, grouped under the nearest preceding file header. Rows before
 * any header attach to the first header's file; with no header at all the text
 * is not grep-shaped and the result is `undefined`.
 */
export function parseGrepOutput(output: string): ParsedGrepOutput | undefined {
  const files: GrepFile[] = []
  let totalMatches: number | undefined
  let current: GrepFile | undefined
  let pending: GrepMatch[] = []
  let sawHeader = false

  for (const rawLine of output.split("\n")) {
    const line = rawLine.trimEnd()
    if (line.trim().length === 0) continue

    const found = /^Found (\d+) matches? in \d+ files?/.exec(line.trim())
    if (found) {
      totalMatches = Number(found[1])
      continue
    }

    const header = FILE_HEADER_RE.exec(line.trim())
    if (header) {
      sawHeader = true
      current = { path: header[1]!.trim(), count: Number(header[2]), matches: [] }
      if (pending.length > 0) {
        current.matches.push(...pending)
        pending = []
      }
      files.push(current)
      continue
    }

    const row = MATCH_ROW_RE.exec(line.trim())
    if (row) {
      const match = { line: Number(row[1]), text: row[2] ?? "" }
      if (current) current.matches.push(match)
      else pending.push(match)
      continue
    }
    // Anything else (truncation footers, notes) is not a match row.
  }

  if (!sawHeader) return undefined
  const counted = files.reduce((sum, file) => sum + file.matches.length, 0)
  if (counted === 0) return undefined
  return { files, totalMatches: totalMatches ?? counted }
}
