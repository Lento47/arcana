import { For } from "solid-js"
import { useTheme } from "../../context/theme"
import { ShimmerText } from "../../component/shimmer-text"
import type { SpineKind, SpineReceipt as SpineReceiptType, SpineLayout } from "./spine-types"

function extractErrorCode(msg: string): { code?: string; cause: string } {
  const match = msg.match(/^(?:error)?\[?([A-Z]\d{4})\]/)
  if (match) {
    const cause = msg.slice(match[0].length).replace(/^:\s*/, "").trim() || msg
    return { code: match[1], cause }
  }
  return { cause: msg }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + "…"
}

function renderRunReceipt(r: SpineReceiptType, layout: SpineLayout, t: Record<string, unknown>) {
  if (r.status === "fail") {
    const msg = r.command ?? "failed"
    if (layout === "minimal") return <text fg={t.spineFail as any}>FAIL</text>
    if (layout === "narrow") {
      const { code, cause } = extractErrorCode(msg)
      if (code) return <text fg={t.spineFail as any}>{code}: {truncate(cause, 30)}</text>
      return <text fg={t.spineFail as any}>{truncate(msg, 40)}</text>
    }
    if (layout === "compact") {
      const { code, cause } = extractErrorCode(msg)
      if (code) return <text fg={t.spineFail as any} wrapMode="word">{code}: {cause}</text>
    }
    return <text fg={t.spineFail as any} wrapMode="word">{msg}</text>
  }

  if (r.status === "pending") {
    return <ShimmerText text="Working" active={true} background={t.backgroundPanel as any} />
  }

  if (r.stats && (r.stats.passed !== undefined || r.stats.failed !== undefined)) {
    const p = r.stats.passed ?? 0
    const f = r.stats.failed ?? 0
    const d = r.stats.duration ?? ""
    const tone = f > 0 ? (t.spineFail as any) : (t.spineOk as any)
    if (layout === "minimal") {
      return <text fg={tone}>✓ {p}/{f}</text>
    }
    if (layout === "narrow") {
      return (
        <text fg={tone}>
          ✓ {p} · {f}{d ? ` · ${d}` : ""}
        </text>
      )
    }
    return (
      <text fg={tone}>
        ✓ {p} passed · {f} failed{d ? ` · ${d}` : ""}
      </text>
    )
  }

  if (r.status === "ok") {
    const inline = r.summary || (r.stats?.duration ? `✓ Done · ${r.stats.duration}` : "✓ Done")
    if (layout === "minimal") {
      return <text fg={t.spineOk as any}>{r.summary || "Done"}</text>
    }
    return <text fg={t.spineOk as any}>{inline}</text>
  }

  return null
}

function renderPatchReceipt(r: SpineReceiptType, layout: SpineLayout, t: Record<string, unknown>) {
  if (layout === "wide" && r.files && r.files.length > 0) {
    const totalAdded = r.files.reduce((s, f) => s + f.added, 0)
    const totalRemoved = r.files.reduce((s, f) => s + f.removed, 0)
    const hasCounts = totalAdded > 0 || totalRemoved > 0
    return (
      <box flexDirection="column">
        <text fg={t.spineOk as any}>
          {r.files.length} file{r.files.length === 1 ? "" : "s"} changed
          {hasCounts ? `: +${totalAdded} -${totalRemoved}` : ""}
        </text>
        <For each={r.files}>
          {(file) => (
            <box flexDirection="row" paddingLeft={2}>
              <text fg={t.spineDiffMuted as any} maxWidth={36}>{file.path}</text>
              <ShowCounts added={file.added} removed={file.removed} theme={t} />
            </box>
          )}
        </For>
      </box>
    )
  }

  const added = r.stats?.added
  const removed = r.stats?.removed
  if (added === undefined && removed === undefined) {
    if (r.status === "pending") return <ShimmerText text="Working" active={true} background={t.backgroundPanel as any} />
    return null
  }

  if (layout === "minimal") {
    return <text fg={t.spineOk as any}>+{added ?? 0}/-{removed ?? 0}</text>
  }
  return (
    <text fg={t.spineOk as any}>
      +{added ?? 0} -{removed ?? 0}
    </text>
  )
}

function ShowCounts(props: { added: number; removed: number; theme: Record<string, unknown> }) {
  if (props.added < 0 && props.removed < 0) {
    return <text fg={props.theme.spineDiffMuted as any}>·</text>
  }
  if (props.added === 0 && props.removed === 0) {
    return <text fg={props.theme.spineDiffMuted as any}>·</text>
  }
  return (
    <>
      {props.added >= 0 && <text fg={props.theme.spineDiffAdd as any} width={8}>+{props.added}</text>}
      {props.removed >= 0 && <text fg={props.theme.spineDiffRemove as any} width={8}>-{props.removed}</text>}
    </>
  )
}

function renderInspectReceipt(r: SpineReceiptType, layout: SpineLayout, t: Record<string, unknown>) {
  if (r.status === "pending") {
    return <ShimmerText text="Working" active={true} background={t.backgroundPanel as any} />
  }
  if (r.status === "fail") {
    const msg = r.command ?? "failed"
    if (layout === "minimal") return <text fg={t.spineFail as any}>FAIL</text>
    return <text fg={t.spineFail as any}>{truncate(msg, layout === "narrow" ? 40 : 80)}</text>
  }
  if (r.status === "ok") {
    if (r.summary && layout !== "minimal") {
      return <text fg={t.spineDiffMuted as any}>{r.summary}</text>
    }
    return <text fg={t.spineOk as any}>Done</text>
  }
  return null
}

function renderFailReceipt(r: SpineReceiptType, layout: SpineLayout, t: Record<string, unknown>) {
  return renderRunReceipt({ ...r, status: "fail" }, layout, t)
}

function renderFallbackReceipt(r: SpineReceiptType, layout: SpineLayout, t: Record<string, unknown>) {
  if (r.status === "pending") {
    return <ShimmerText text="Working" active={true} background={t.backgroundPanel as any} />
  }
  if (r.status === "fail") {
    return renderFailReceipt(r, layout, t)
  }
  if (r.status === "ok") {
    if (layout === "minimal") {
      return <text fg={t.spineOk as any}>Done</text>
    }
    return <text fg={t.spineDiffMuted as any}>{r.label} · Done</text>
  }
  if (layout === "minimal") {
    return <text fg={t.spineDiffMuted as any}>{r.status}</text>
  }
  return <text fg={t.spineDiffMuted as any}>{r.label} · {r.status}</text>
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
      case "fail":
        return renderFailReceipt(r, layout, t)
      case "patch":
      case "fix":
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
    <box>
      {rendered}
    </box>
  )
}
