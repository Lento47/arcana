export type SpineKind = "ask" | "plan" | "inspect" | "patch" | "run" | "fail" | "fix" | "ok" | "think"

export type SpineLayout = "wide" | "compact" | "narrow" | "minimal"

export type SpineReceipt = {
  label: string
  command?: string
  stats?: {
    passed?: number
    failed?: number
    ignored?: number
    duration?: string
    added?: number
    removed?: number
  }
  status: "ok" | "fail" | "pending"
}

export type SpineDiffExcerpt = {
  files: string
  stats: string
  body?: string
  splitBody?: { left: string; right: string }
}

export type SpineEntry = {
  id: string
  index: number
  elapsed: string
  kind: SpineKind
  glyph: string
  summary: string
  receipt?: SpineReceipt
  diff?: SpineDiffExcerpt
  hidden?: boolean
}

export function getSpineLayout(width: number): SpineLayout {
  if (width >= 120) return "wide"
  if (width >= 100) return "compact"
  if (width >= 80) return "narrow"
  return "minimal"
}

export function spineTone(kind: SpineKind, theme: Record<string, unknown>) {
  switch (kind) {
    case "ask":
      return theme.accent as any
    case "inspect":
      return theme.accent as any
    case "run":
      return theme.textMuted as any
    case "fail":
      return theme.error as any
    case "fix":
      return theme.warning as any
    case "ok":
      return theme.success as any
    case "think":
      return theme.textMuted as any
    default:
      return theme.textMuted as any
  }
}

export const SPINE_GLYPH: Record<SpineKind, string> = {
  ask: "◆",
  plan: "├",
  inspect: "◈",
  patch: "├",
  run: "▷",
  fail: "×",
  fix: "├",
  ok: "◎",
  think: "?",
}
