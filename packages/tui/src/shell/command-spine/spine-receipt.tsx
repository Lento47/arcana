import { useTheme } from "../../context/theme"
import type { SpineKind, SpineReceipt as SpineReceiptType, SpineLayout } from "./spine-types"

function extractErrorCode(msg: string): { code?: string; cause: string } {
  const match = msg.match(/^(?:error)?\[?([A-Z]\d{4})\]/)
  if (match) {
    const cause = msg.slice(match[0].length).replace(/^:\s*/, "").trim() || msg
    return { code: match[1], cause }
  }
  return { cause: msg }
}

function renderRunReceipt(r: SpineReceiptType, layout: SpineLayout, t: Record<string, unknown>) {
  if (r.status === "fail") {
    const msg = r.command ?? "failed"
    if (layout === "minimal") return <text fg={t.error as any}>FAIL</text>
    if (layout === "narrow") {
      const { code, cause } = extractErrorCode(msg)
      if (code) return <text fg={t.error as any}>{code}: {truncate(cause, 30)}</text>
      return <text fg={t.error as any}>{truncate(msg, 40)}</text>
    }
    if (layout === "compact") {
      const { code, cause } = extractErrorCode(msg)
      if (code) return <text fg={t.error as any} wrapMode="word">{code}: {cause}</text>
    }
    return <text fg={t.error as any} wrapMode="word">{msg}</text>
  }

  if (r.status === "pending") {
    return <text fg={t.textMuted as any}>running&hellip;</text>
  }

  if (r.stats && (r.stats.passed !== undefined || r.stats.failed !== undefined)) {
    const p = r.stats.passed ?? 0
    const f = r.stats.failed ?? 0
    const d = r.stats.duration ?? ""
    if (layout === "minimal") {
      return <text fg={t.success as any}>✓ {p}/{f}</text>
    }
    if (layout === "narrow") {
      return (
        <text fg={t.success as any}>
          ✓ {p} · {f}{d ? ` · ${d}` : ""}
        </text>
      )
    }
    return (
      <text fg={t.success as any}>
        ✓ {p} passed · {f} failed{d ? ` · ${d}` : ""}
      </text>
    )
  }

  return null
}

function renderPatchReceipt(r: SpineReceiptType, layout: SpineLayout, t: Record<string, unknown>) {
  const added = r.stats?.added
  const removed = r.stats?.removed
  if (added === undefined && removed === undefined) return null

  if (layout === "minimal") {
    return <text fg={t.success as any}>+{added ?? 0}/-{removed ?? 0}</text>
  }
  return (
    <text fg={t.success as any}>
      +{added ?? 0} -{removed ?? 0}
    </text>
  )
}

function renderInspectReceipt(_r: SpineReceiptType, _layout: SpineLayout, _t: Record<string, unknown>) {
  return null
}

function renderFallbackReceipt(r: SpineReceiptType, layout: SpineLayout, t: Record<string, unknown>) {
  if (layout === "minimal") {
    return <text fg={t.textMuted as any}>{r.status}</text>
  }
  return <text fg={t.textMuted as any}>{r.label} · {r.status}</text>
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + "…"
}

export function SpineReceipt(props: {
  kind: SpineKind
  receipt: SpineReceiptType
  layout: SpineLayout
}) {
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>
  const { kind, receipt: r, layout } = props

  if (!r) return null

  const content = () => {
    switch (kind) {
      case "run":
        return renderRunReceipt(r, layout, t)
      case "patch":
        return renderPatchReceipt(r, layout, t)
      case "inspect":
        return renderInspectReceipt(r, layout, t)
      default:
        return renderFallbackReceipt(r, layout, t)
    }
  }

  const rendered = content()
  if (!rendered) return null

  return (
    <box paddingLeft={2}>
      {rendered}
    </box>
  )
}
