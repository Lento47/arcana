import { For, Show, createMemo } from "solid-js"
import type { RGBA } from "@opentui/core"
import { useTheme } from "../../context/theme"
import type { Theme } from "../../theme"
import { spineOuterPadding, statusToneColor, type SpineLayout, type StatusSegment, type StatusTone } from "./spine-types"
import { truncate } from "../../util/locale"
import { useTuiConfig } from "../../config"
import type { SpineTrustStatus } from "./spine-trust"
import type { SessionCharter, SessionCharterChip, SessionCharterTone } from "./session-charter"
import { buildHeaderStatusItems, fitHeaderStatusItems } from "./session-charter"
import { applyConfiguredSegments } from "./spine-segments"
import { breadcrumbFromPath, partitionHeaderStatusItems } from "./spine-chrome"

// Truncation: shared display-width-aware helper from util/locale (audit T5/O6).

function valueLimit(segment: StatusSegment, layout: SpineLayout): number {
  if (segment.key === "path") {
    if (layout === "wide") return 54
    if (layout === "compact") return 42
    return 0
  }
  if (segment.key === "model") {
    if (layout === "wide") return 22
    if (layout === "compact") return 18
    return 14
  }
  if (segment.key === "branch") return layout === "wide" ? 18 : 14
  if (segment.key === "agent") return layout === "wide" ? 14 : 11
  if (segment.key === "session") return layout === "wide" ? 10 : 9
  if (segment.key === "state") return 9
  if (segment.key === "drive") return 10
  if (segment.key === "ctx") return 8
  return layout === "wide" ? 16 : 12
}

function prioritizeSegments(segments: StatusSegment[], layout: SpineLayout): StatusSegment[] {
  const primary = segments.filter((s) => s.key !== "path" && s.key !== "tok" && s.key !== "proj" && s.key !== "mode")
  const order = new Map(["branch", "agent", "model", "ctx", "state", "drive", "session"].map((key, index) => [key, index]))
  const ranked = [...primary].sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99))
  if (layout === "minimal")
    return ranked
      .filter((s) => s.key === "agent" || s.key === "model" || s.key === "state" || s.key === "ctx")
      .slice(0, 2)
  if (layout === "narrow") return ranked.filter((s) => s.key !== "session").slice(0, 3)
  if (layout === "compact") return ranked.slice(0, 4)
  return ranked.slice(0, 5)
}

function trustWord(trust: SpineTrustStatus): string {
  if (trust.state === "disconnected") return "offline"
  if (trust.state === "degraded") return "degraded"
  return "live"
}

function charterToneColor(tone: SessionCharterTone, theme: Theme) {
  if (tone === "ok") return theme.spineOk
  if (tone === "error") return theme.error
  if (tone === "warn") return theme.warning
  return theme.textMuted
}

function statusFg(tone: SessionCharterTone, theme: Theme) {
  return charterToneColor(tone, theme)
}

function segmentFg(tone: StatusTone, theme: Theme): RGBA {
  return statusToneColor(tone, theme)
}

type ZonedItem = { key: string; label: string; hint?: string; tone: SessionCharterTone; fg?: RGBA }

const RUNTIME_DOT = "◆"
const ZONE_SEP = "│"
/** Context-zone glyphs: structure marks, not labels. */
const CONTEXT_GLYPHS: Record<string, string> = { branch: "⎇" }

/**
 * Option A header: three zones — runtime state (dot + word beside the
 * wordmark), governance (proof/contract/tally kept together so security
 * state never drowns), and a context breadcrumb trail of bare values.
 * Zone separator `│` (borderSubtle); within governance `·`; within context
 * the breadcrumb arrow `▸`. All separators render as space+glyph+space so
 * the 3-cell-per-separator width budget in fitHeaderStatusItems stays
 * accurate. Hints are intentionally dropped — arrows carry the structure.
 */
function ZonedStatusLine(props: { items: ZonedItem[]; theme: Theme }) {
  const zones = createMemo(() => {
    const parts = partitionHeaderStatusItems(props.items)
    return [
      { kind: "runtime" as const, items: parts.runtime, inner: "·", dot: true },
      { kind: "governance" as const, items: parts.governance, inner: "·", dot: false },
      { kind: "context" as const, items: parts.context, inner: "▸", dot: false },
    ].filter((zone) => zone.items.length > 0)
  })
  return (
    <text wrapMode="none">
      <For each={zones()}>
        {(zone, zoneIndex) => (
          <>
            <Show when={zoneIndex() > 0}>
              <span style={{ fg: props.theme.borderSubtle }}> {ZONE_SEP} </span>
            </Show>
            <For each={zone.items}>
              {(item, index) => {
                const glyph = zone.kind === "context" ? CONTEXT_GLYPHS[item.key] : undefined
                const text =
                  zone.dot && index() === 0
                    ? `${RUNTIME_DOT} ${item.label}`
                    : glyph
                      ? `${glyph} ${item.label}`
                      : item.label
                return (
                  <>
                    <Show when={zoneIndex() === 0 && index() === 0}>
                      <span> </span>
                    </Show>
                    <Show when={index() > 0}>
                      <span style={{ fg: props.theme.spineDiffMuted }}> {zone.inner} </span>
                    </Show>
                    <span style={{ fg: item.fg ?? statusFg(item.tone, props.theme) }}>{text}</span>
                  </>
                )
              }}
            </For>
          </>
        )}
      </For>
    </text>
  )
}

export function SpineHeader(props: {
  layout: SpineLayout
  /** Inner spine width (terminal minus session frame). Used to drop status items. */
  contentWidth?: number
  segments: StatusSegment[]
  session: () => { id: string; title?: string } | undefined
  /** PR6: trust-first runtime status (connection, trace, proof, approvals). */
  trust?: SpineTrustStatus
  /** Session contract + proof chips (not timeline rows). */
  charter?: SessionCharter
  /** Governed-action tally — header only, not a chat row. */
  governed?: SessionCharterChip
}) {
  const { theme } = useTheme()
  const tuiConfig = useTuiConfig()
  const pad = createMemo(() => spineOuterPadding(props.layout))
  const isWide = createMemo(() => props.layout === "wide")
  const isMinimal = createMemo(() => props.layout === "minimal")
  const isCompact = createMemo(() => props.layout === "compact")
  const showBrand = createMemo(() => !isMinimal())
  // Config-driven header: when status_segments is set, show exactly those
  // segments in the user's order (dropping unselected ones); otherwise the
  // layout-based auto priority applies. Governance/trust items always stay.
  const configuredSegments = createMemo(() =>
    applyConfiguredSegments(props.segments, tuiConfig.status_segments),
  )
  const segments = createMemo(() =>
    configuredSegments() ?? prioritizeSegments(props.segments, props.layout),
  )
  const pathSegment = createMemo(() => props.segments.find((segment) => segment.key === "path"))
  // With a configured segment list, the user decides path placement; the
  // auto wide/compact path block only applies to the unconfigured layout.
  const showPath = createMemo(
    () => !configuredSegments() && !!pathSegment() && (isWide() || isCompact()),
  )
  const trust = createMemo(() => props.trust)
  const statusItems = createMemo(() => {
    const t = trust()
    if (!t) return []
    return buildHeaderStatusItems({
      live: trustWord(t),
      liveTone: t.state === "healthy" ? "ok" : t.state === "disconnected" ? "muted" : "error",
      charter: props.charter,
      proofFallback: t.proofLevel
        ? `${t.proofLevel} ${(t.integrity ?? "unverified").toLowerCase()}`
        : undefined,
      governed: props.governed,
      pending: t.pendingApprovals,
    })
  })
  const lineItems = createMemo(() => {
    const items: ZonedItem[] = [...statusItems()]
    const breadcrumbMax = isWide() ? 3 : isCompact() ? 2 : 0
    for (const segment of segments()) {
      if (segment.key === "state") continue
      if (items.some((item) => item.key === segment.key)) continue
      items.push({
        key: segment.key,
        hint: segment.label,
        label:
          segment.key === "path"
            ? breadcrumbFromPath(segment.value, breadcrumbMax)
            : truncate(segment.value, valueLimit(segment, props.layout)),
        tone: "muted",
        fg: segmentFg(segment.tone, theme),
      })
    }
    if (showPath() && pathSegment()) {
      items.push({
        key: "path",
        hint: pathSegment()!.label,
        label: breadcrumbFromPath(pathSegment()!.value, Math.max(breadcrumbMax, 2)),
        tone: "muted",
        fg: theme.textMuted,
      })
    }
    return items
  })
  const statusBudget = createMemo(() => {
    const inner = props.contentWidth
    if (typeof inner !== "number" || !Number.isFinite(inner)) {
      return Number.POSITIVE_INFINITY
    }
    const brand = showBrand() ? 8 : 0
    // Runtime zone renders a leading "◆ " before the state word.
    const runtimeDot = statusItems().some((item) => item.key === "live") ? 2 : 0
    const pads = pad() * 2
    return Math.max(1, Math.floor(inner) - brand - runtimeDot - pads)
  })
  const visibleItems = createMemo(() => fitHeaderStatusItems(lineItems(), statusBudget()))
  const lockReason = createMemo(() => {
    const t = trust()
    if (!t || t.state === "healthy") return ""
    if (t.eventGap) return `locked | gap ${t.eventGap.from}–${t.eventGap.to}`
    if (t.trace === "DEGRADED" || t.trace === "UNAVAILABLE") return `locked | trace ${t.trace.toLowerCase()}`
    if (t.integrity === "INVALID" || t.integrity === "UNVERIFIED") return `locked | proof ${t.integrity.toLowerCase()}`
    return "locked"
  })

  return (
    <box flexDirection="column" flexShrink={0}>
      <box flexDirection="row" paddingLeft={pad()} paddingRight={pad()} minWidth={0} alignItems="flex-start">
        <Show when={showBrand()}>
          <box flexShrink={0} paddingRight={2}>
            <text fg={theme.spineBrand} wrapMode="none">
              ARCANA
            </text>
          </box>
        </Show>
        <box flexDirection="column" flexGrow={1} minWidth={0} flexShrink={1}>
          <ZonedStatusLine items={visibleItems()} theme={theme} />
          <Show when={lockReason()}>
            <text fg={theme.warning} wrapMode="word">
              {lockReason()}
            </text>
          </Show>
        </box>
      </box>
      <Show when={showBrand() || visibleItems().length > 0 || lockReason()}>
        <box border={["bottom"]} borderColor={theme.borderSubtle} marginTop={1} marginBottom={1} />
      </Show>
    </box>
  )
}
