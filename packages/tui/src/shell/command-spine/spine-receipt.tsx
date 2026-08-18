import { For, Show, createMemo } from "solid-js"
import { useTheme } from "../../context/theme"
import type { Theme } from "../../theme"
import { ShimmerText } from "../../component/shimmer-text"
import type { SpineKind, SpineReceipt as SpineReceiptType, SpineLayout } from "./spine-types"
import { truncate } from "../../util/locale"
import { projectInsightCard } from "./spine-insight"
import { SpineInsightCard } from "./spine-insight-card"

function extractErrorCode(msg: string): { code?: string; cause: string } {
  const match = msg.match(/^(?:error)?\[?([A-Z]\d{4})\]/)
  if (match) {
    const cause = msg.slice(match[0].length).replace(/^:\s*/, "").trim() || msg
    return { code: match[1], cause }
  }
  return { cause: msg }
}

// Truncation: shared display-width-aware helper from util/locale (audit T3).

function renderRunReceipt(r: SpineReceiptType, layout: SpineLayout, t: Theme) {
  if (r.status === "fail") {
    const msg = r.command ?? "failed"
    if (layout === "minimal") return <text fg={t.spineFail}>FAIL</text>
    if (layout === "narrow") {
      const { code, cause } = extractErrorCode(msg)
      if (code) return <text fg={t.spineFail}>{code}: {truncate(cause, 30)}</text>
      return <text fg={t.spineFail}>{truncate(msg, 40)}</text>
    }
    if (layout === "compact") {
      const { code, cause } = extractErrorCode(msg)
      if (code) return <text fg={t.spineFail} wrapMode="word">{code}: {cause}</text>
    }
    return <text fg={t.spineFail} wrapMode="word">{msg}</text>
  }

  if (r.status === "pending") {
    return <ShimmerText text="Working" active={true} background={t.backgroundPanel} />
  }

  if (r.stats && (r.stats.passed !== undefined || r.stats.failed !== undefined)) {
    const p = r.stats.passed ?? 0
    const f = r.stats.failed ?? 0
    const d = r.stats.duration ?? ""
    const tone = f > 0 ? t.spineFail : t.spineOk
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
      return <text fg={t.spineOk}>{r.summary || "Done"}</text>
    }
    return <text fg={t.spineOk}>{inline}</text>
  }

  return null
}

function renderPatchReceipt(r: SpineReceiptType, layout: SpineLayout, t: Theme) {
  if (layout === "wide" && r.files && r.files.length > 0) {
    const totalAdded = r.files.reduce((s, f) => s + f.added, 0)
    const totalRemoved = r.files.reduce((s, f) => s + f.removed, 0)
    const hasCounts = totalAdded > 0 || totalRemoved > 0
    return (
      <box flexDirection="column">
        <text fg={t.spineOk}>
          {r.files.length} file{r.files.length === 1 ? "" : "s"} changed
          {hasCounts ? `: +${totalAdded} -${totalRemoved}` : ""}
        </text>
        <For each={r.files}>
          {(file) => (
            <box flexDirection="row" paddingLeft={2}>
              <text fg={t.spineDiffMuted} maxWidth={36}>{file.path}</text>
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
    if (r.status === "pending") return <ShimmerText text="Working" active={true} background={t.backgroundPanel} />
    return null
  }

  if (layout === "minimal") {
    return <text fg={t.spineOk}>+{added ?? 0}/-{removed ?? 0}</text>
  }
  return (
    <text fg={t.spineOk}>
      +{added ?? 0} -{removed ?? 0}
    </text>
  )
}

/**
 * Width of a signed count cell: the sign column plus the digit count (audit
 * M5). A `+5` now occupies 2 columns instead of the old fixed 8 — counts
 * pack tightly after the 36-col file path instead of leaving a wide gap.
 */
export function countCellWidth(n: number): number {
  return String(n).length + 1
}

function ShowCounts(props: { added: number; removed: number; theme: Theme }) {
  if (props.added === 0 && props.removed === 0) {
    return <text fg={props.theme.spineDiffMuted}>·</text>
  }
  return (
    <>
      {props.added >= 0 && <text fg={props.theme.spineDiffAdd} minWidth={countCellWidth(props.added)}>+{props.added}</text>}
      {props.removed >= 0 && <text fg={props.theme.spineDiffRemove} minWidth={countCellWidth(props.removed)}>-{props.removed}</text>}
    </>
  )
}

function renderInspectReceipt(r: SpineReceiptType, layout: SpineLayout, t: Theme) {
  if (r.status === "pending") {
    return <ShimmerText text="Working" active={true} background={t.backgroundPanel} />
  }
  if (r.status === "fail") {
    const msg = r.command ?? "failed"
    if (layout === "minimal") return <text fg={t.spineFail}>FAIL</text>
    return <text fg={t.spineFail}>{truncate(msg, layout === "narrow" ? 40 : 80)}</text>
  }
  if (r.status === "ok") {
    if (r.summary && layout !== "minimal") {
      return <text fg={t.spineDiffMuted}>{r.summary}</text>
    }
    return <text fg={t.spineOk}>Done</text>
  }
  return null
}

function renderFailReceipt(r: SpineReceiptType, layout: SpineLayout, t: Theme) {
  return renderRunReceipt({ ...r, status: "fail" }, layout, t)
}

function renderFallbackReceipt(r: SpineReceiptType, layout: SpineLayout, t: Theme) {
  if (r.status === "pending") {
    return <ShimmerText text="Working" active={true} background={t.backgroundPanel} />
  }
  if (r.status === "fail") {
    return renderFailReceipt(r, layout, t)
  }
  if (r.status === "ok") {
    if (layout === "minimal") {
      return <text fg={t.spineOk}>Done</text>
    }
    return <text fg={t.spineDiffMuted}>{r.label} · Done</text>
  }
  if (layout === "minimal") {
    return <text fg={t.spineDiffMuted}>{r.status}</text>
  }
  return <text fg={t.spineDiffMuted}>{r.label} · {r.status}</text>
}

export function SpineReceipt(props: {
  kind: SpineKind
  receipt: SpineReceiptType
  layout: SpineLayout
}) {
  const { theme } = useTheme()
  const kind = () => props.kind
  const r = () => props.receipt
  const layout = () => props.layout
  const insight = createMemo(() => projectInsightCard({ receipt: props.receipt }))

  const content = () => {
    const receipt = r()
    if (!receipt) return null
    switch (kind()) {
      case "run":
        return renderRunReceipt(receipt, layout(), theme)
      case "fail":
        return renderFailReceipt(receipt, layout(), theme)
      case "patch":
      case "fix":
        return renderPatchReceipt(receipt, layout(), theme)
      case "inspect":
        return renderInspectReceipt(receipt, layout(), theme)
      default:
        return renderFallbackReceipt(receipt, layout(), theme)
    }
  }

  const rendered = content()
  if (!rendered && !insight()) return null

  return (
    <box flexDirection="column" flexShrink={0} minWidth={0}>
      <Show when={insight()}>
        {(card) => <SpineInsightCard card={card()} />}
      </Show>
      {rendered}
    </box>
  )
}
