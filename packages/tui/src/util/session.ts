import { Locale } from "./locale"

const DEFAULT_TITLE_RE =
  /^(New session - |Child session - )(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)$/

export function isDefaultTitle(title: string) {
  return DEFAULT_TITLE_RE.test(title)
}

/** Max chars for auto/heuristic titles — keep in sync with engine Session.TITLE_MAX_CHARS. */
export const TITLE_MAX_CHARS = 60

/**
 * Derive a list-friendly title from first user message text.
 * Mirrors engine `Session.titleFromUserText`.
 */
export function titleFromUserText(text: string, maxChars = TITLE_MAX_CHARS): string | undefined {
  const collapsed = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  if (!collapsed) return undefined
  const cleaned = collapsed.replace(/^#{1,6}\s+/, "").replace(/\s+/g, " ").trim()
  if (!cleaned) return undefined
  // T9: truncate by display width — the helper keeps maxChars-1 columns + the
  // single "…" glyph, so CJK titles stay inside the exact column budget.
  if (Locale.displayWidth(cleaned) <= maxChars) return cleaned
  return Locale.truncate(cleaned, maxChars)
}

/**
 * Display label for the session list when the stored title is still the default ISO form.
 * Prefer optional first-message snippet; otherwise "Untitled · <local short time>".
 */
export function displaySessionTitle(input: {
  title: string
  created?: number
  /** Optional first user message text already in the TUI store (no network). */
  firstUserText?: string
}): string {
  if (!isDefaultTitle(input.title)) return input.title

  if (input.firstUserText) {
    const fromText = titleFromUserText(input.firstUserText)
    if (fromText) return fromText
  }

  const match = input.title.match(DEFAULT_TITLE_RE)
  const iso = match?.[2]
  const ms = iso ? Date.parse(iso) : input.created
  if (ms !== undefined && Number.isFinite(ms)) {
    try {
      const formatted = new Date(ms).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
      return `Untitled · ${formatted}`
    } catch {
      // fall through
    }
  }
  return "Untitled"
}
