/**
 * Widget DSL parsers for first-class fenced-code chat widgets.
 *
 * Parsers are pure and tolerant: malformed lines are reported, never thrown.
 * Fence bodies arrive byte-for-byte (all chat-prose sanitizers split on ```
 * and leave fence interiors raw), so this grammar is stable end-to-end.
 */

export type Severity = 1 | 2 | 3

export interface GanttWindow {
  startMin: number
  /** Duration in minutes. */
  spanMin: number
}

export interface GanttRow {
  sev: Severity
  label: string
  startMin: number
  /** null = still open (renders with an open-end marker). */
  endMin: number | null
  mitMin: number | null
  sla: boolean
}

export interface ParsedGantt {
  window: GanttWindow | null
  rows: GanttRow[]
  /** Lines that could not be parsed — widgets render them as marker rows. */
  badLines: string[]
}

const TIME_RE = /^(\d{1,2}):(\d{2})$/
const SPAN_RE = /^(\d+)([hmd])$/

/** "HH:MM" -> minutes since midnight; -1 when invalid. */
export function parseClock(value: string): number {
  const m = TIME_RE.exec(value)
  if (!m) return -1
  const h = Number(m[1])
  const min = Number(m2(m))
  if (h > 23 || min > 59) return -1
  return h * 60 + min
}

function m2(m: RegExpExecArray): string {
  return m[2] ?? "0"
}

/** "8h" / "30m" / "2d" -> minutes; -1 when invalid. */
export function parseSpan(value: string): number {
  const m = SPAN_RE.exec(value.toLowerCase())
  if (!m) return -1
  const n = Number(m[1])
  if (!Number.isFinite(n) || n <= 0) return -1
  const unit = m[2]
  if (unit === "h") return n * 60
  if (unit === "m") return n
  if (unit === "d") return n * 1440
  return -1
}

function parseSev(token: string): Severity | null {
  const t = token.toUpperCase()
  if (t === "S1" || t === "SEV1") return 1
  if (t === "S2" || t === "SEV2") return 2
  if (t === "S3" || t === "SEV3") return 3
  return null
}

/**
 * Gantt grammar:
 *
 *   window <HH:MM> <span: 8h|30m|2d>
 *   S<1-3> <label words...> <HH:MM> -> (<HH:MM> | open) [mit=HH:MM] [sla]
 *
 * Severity tag optional (defaults S3). `mit=`/`sla` may appear anywhere after
 * the arrow. Times outside the declared window are clamped by the renderer,
 * not the parser.
 */
export function parseGantt(source: string): ParsedGantt {
  const out: ParsedGantt = { window: null, rows: [], badLines: [] }
  const lines = source.split("\n")

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    if (/^window\b/i.test(line)) {
      const parts = line.split(/\s+/).slice(1)
      const startMin = parts[0] !== undefined ? parseClock(parts[0]) : -1
      const spanMin = parts[1] !== undefined ? parseSpan(parts[1]) : -1
      if (startMin >= 0 && spanMin > 0) {
        out.window = { startMin, spanMin }
      } else {
        out.badLines.push(rawLine)
      }
      continue
    }

    const row = parseGanttRow(line)
    if (row) {
      out.rows.push(row)
    } else {
      out.badLines.push(rawLine)
    }
  }

  return out
}

function parseGanttRow(line: string): GanttRow | null {
  const tokens = line.split(/\s+/)
  let idx = 0
  let sev: Severity = 3

  const maybeSev = parseSev(tokens[idx] ?? "")
  if (maybeSev) {
    sev = maybeSev
    idx++
  }

  // Label = tokens up to the first clock time.
  const labelWords: string[] = []
  let startMin = -1
  while (idx < tokens.length) {
    const t = parseClock(tokens[idx]!)
    if (t >= 0) {
      startMin = t
      idx++
      break
    }
    labelWords.push(tokens[idx]!)
    idx++
  }

  if (startMin < 0 || labelWords.length === 0) return null
  if ((tokens[idx] ?? "") !== "->") return null
  idx++

  let endMin: number | null = null
  const endTok = tokens[idx]
  if (endTok === undefined) return null
  if (/^open$/i.test(endTok)) {
    idx++
  } else {
    endMin = parseClock(endTok)
    if (endMin < 0) return null
    idx++
  }

  let mitMin: number | null = null
  let sla = false
  for (; idx < tokens.length; idx++) {
    const tok = tokens[idx]!
    if (/^mit=/i.test(tok)) {
      mitMin = parseClock(tok.slice(4))
      if (mitMin < 0) return null
    } else if (/^sla$/i.test(tok)) {
      sla = true
    } else if (tok.startsWith("#")) {
      break // trailing comment
    } else {
      return null
    }
  }

  return { sev, label: labelWords.join(" "), startMin, endMin, mitMin, sla }
}

export type StatusTone = "neutral" | "ok" | "warn" | "crit"

export interface StatusItem {
  key: string
  value: string
  tone: StatusTone
}

const OK_RE = /^(ok|done|pass|passed|healthy|up)$/i
const WARN_RE = /^(warn|warning|degraded|slow|pending)$/i
const CRIT_RE = /^(crit|critical|fail|failed|error|down|breach)$/i

export function statusTone(value: string): StatusTone {
  const v = value.trim()
  if (OK_RE.test(v)) return "ok"
  if (WARN_RE.test(v)) return "warn"
  if (CRIT_RE.test(v)) return "crit"
  return "neutral"
}

/**
 * Status grammar — one item per line:
 *
 *   key: value [tone]
 *
 * Tone inferred from the value word when not given explicitly as the last
 * token (`key: value ok`). Lines without ":" are ignored.
 */
export function parseStatus(source: string): StatusItem[] {
  const items: StatusItem[] = []
  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const sep = line.indexOf(":")
    if (sep <= 0) continue
    const key = line.slice(0, sep).trim()
    let rest = line.slice(sep + 1).trim()
    if (!rest) continue

    let tone: StatusTone | null = null
    const words = rest.split(/\s+/)
    const last = words[words.length - 1]!
    if (words.length > 1 && /^(ok|warn|crit)$/i.test(last)) {
      tone = last.toLowerCase() as StatusTone
      words.pop()
      rest = words.join(" ")
    }
    items.push({ key, value: rest, tone: tone ?? statusTone(rest) })
  }
  return items
}
