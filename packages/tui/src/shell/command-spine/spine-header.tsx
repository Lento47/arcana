import { For, Show, createMemo } from "solid-js"
import type { RGBA } from "@opentui/core"
import { useTheme } from "../../context/theme"
import type { Theme } from "../../theme"
import { spineOuterPadding, statusToneColor, type SpineLayout, type StatusSegment, type StatusTone } from "./spine-types"
import { displayWidth, truncate } from "../../util/locale"
import { useTuiConfig } from "../../config"
import type { SpineTrustStatus } from "./spine-trust"
import type { SessionCharter, SessionCharterChip, SessionCharterTone } from "./session-charter"
import {
  buildHeaderStatusItems,
  fitHeaderStatusItems,
  formatHeaderStatusLabel,
  headerLineDisplayWidth,
} from "./session-charter"
import { applyConfiguredSegments } from "./spine-segments"
import { partitionHeaderStatusItems } from "./spine-chrome"
import { navigationSessionLabel, SpineNavigationRail, type SessionNavigationLike } from "./session-navigation-rail"

// Truncation: shared display-width-aware helper from util/locale (audit T5/O6).

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

const STATUS_DROP_ORDER = ["contract", "pending", "governed"] as const
const CONTEXT_DROP_ORDER = ["session", "drive", "agent", "branch", "model", "ctx"] as const

function titleLimit(layout: SpineLayout): number {
  if (layout === "wide") return 48
  if (layout === "compact") return 36
  if (layout === "narrow") return 26
  return 22
}

function contextValueLimit(segment: StatusSegment, layout: SpineLayout): number {
  if (segment.key === "model") return layout === "wide" ? 28 : layout === "compact" ? 20 : 14
  if (segment.key === "branch") return layout === "wide" ? 18 : layout === "compact" ? 14 : 11
  if (segment.key === "ctx") return 8
  if (segment.key === "drive") return 10
  if (segment.key === "agent") return layout === "wide" ? 14 : 10
  return layout === "wide" ? 16 : 12
}

function contextItem(segment: StatusSegment, layout: SpineLayout, theme: Theme): ZonedItem | undefined {
  const value = truncate(segment.value, contextValueLimit(segment, layout))
  if (!value) return undefined
  const label =
    segment.key === "ctx" ? `CTX ${value}`
      : segment.key === "drive" ? `DRIVE ${value}`
        : segment.key === "agent" ? `@${value}`
          : value
  return {
    key: segment.key,
    label,
    tone: "muted",
    fg: segmentFg(segment.tone, theme),
  }
}

function zonedDisplayWidth(items: readonly ZonedItem[]): number {
  const width = headerLineDisplayWidth(items)
  const runtime = items.some((item) => item.key === "live") ? 2 : 0
  const branch = items.some((item) => item.key === "branch") ? 2 : 0
  return width + runtime + branch
}

function navigationMinimum(layout: SpineLayout): number {
  if (layout === "wide") return 24
  if (layout === "compact") return 18
  if (layout === "narrow") return 12
  return 8
}

/**
 * Status line renderer shared by the primary trust row and the secondary
 * metadata row. Major zones use `│`; items within a zone use a quiet middle
 * dot. Context can opt into the breadcrumb arrow when it is carrying a trail.
 */
function ZonedStatusLine(props: {
  items: ZonedItem[]
  theme: Theme
  leading?: boolean
  contextSeparator?: string
}) {
  const zones = createMemo(() => {
    const parts = partitionHeaderStatusItems(props.items)
    return [
      { kind: "runtime" as const, items: parts.runtime, inner: "·", dot: true },
      { kind: "governance" as const, items: parts.governance, inner: "·", dot: false },
      { kind: "context" as const, items: parts.context, inner: props.contextSeparator ?? "▸", dot: false },
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
                    <Show when={props.leading !== false && zoneIndex() === 0 && index() === 0}>
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
  session: () => { id: string; parentID?: string; title?: string } | undefined
  sessions?: readonly SessionNavigationLike[]
  onNavigateToSession?: (sessionID: string) => void
  onPreviousSession?: () => void
  onNextSession?: () => void
  onParentSession?: () => void
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
  // With a configured segment list, the user decides whether the repository
  // trail is present; otherwise it follows the wide/compact auto layout.
  const showPath = createMemo(
    () => {
      const configured = configuredSegments()
      if (configured) return configured.some((segment) => segment.key === "path")
      return !!pathSegment() && (isWide() || isCompact())
    },
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
    }).map((item) => ({
      ...item,
      label: formatHeaderStatusLabel(item),
    })).filter((item) => item.label.length > 0)
  })
  const finiteWidth = createMemo(() => {
    const width = props.contentWidth
    return typeof width === "number" && Number.isFinite(width) ? Math.floor(width) : 120
  })
  const contentWidth = createMemo(() => Math.max(8, finiteWidth() - pad() * 2))
  const brandWidth = createMemo(() => showBrand() ? 8 : 0)
  const primaryWidth = createMemo(() => Math.max(8, contentWidth() - brandWidth()))
  const statusBudget = createMemo(() => {
    const titleReserve = props.layout === "wide" ? 24 : props.layout === "compact" ? 18 : 12
    return Math.max(10, primaryWidth() - titleReserve - 3)
  })
  const visibleStatus = createMemo(() => fitHeaderStatusItems(statusItems(), statusBudget(), STATUS_DROP_ORDER))
  const statusWidth = createMemo(() => zonedDisplayWidth(visibleStatus()))
  const sessionTitle = createMemo(() => {
    const current = props.session()
    if (!current) return ""
    const available = Math.max(8, primaryWidth() - statusWidth() - 3)
    const limit = Math.min(titleLimit(props.layout), available)
    const raw = navigationSessionLabel(current)
    return truncate(raw, Math.max(4, limit - (showBrand() ? 3 : 0)))
  })
  const titleWidth = createMemo(() => {
    const available = Math.max(8, primaryWidth() - statusWidth() - 3)
    return Math.max(8, Math.min(titleLimit(props.layout), available))
  })
  const contextItems = createMemo(() => {
    const items: ZonedItem[] = []
    for (const segment of segments()) {
      if (segment.key === "state" || segment.key === "path" || segment.key === "session") continue
      const item = contextItem(segment, props.layout, theme)
      if (item) items.push(item)
    }
    return items
  })
  const sessionMeta = createMemo(() => {
    if (!isWide()) return ""
    const configured = configuredSegments()
    if (configured && !configured.some((segment) => segment.key === "session")) return ""
    const segment = props.segments.find((item) => item.key === "session")
    const value = segment?.value ?? props.session()?.id
    return value ? truncate(value, 14) : ""
  })
  const hasNavigation = createMemo(() => {
    const current = props.session()
    return Boolean(showPath() || current?.parentID)
  })
  const contextBudget = createMemo(() => {
    const sessionWidth = sessionMeta() ? displayWidth(sessionMeta()) + 2 : 0
    const reservedRail = hasNavigation() ? navigationMinimum(props.layout) : 0
    return Math.max(1, contentWidth() - brandWidth() - sessionWidth - reservedRail - 3)
  })
  const visibleContext = createMemo(() =>
    fitHeaderStatusItems(contextItems(), contextBudget(), CONTEXT_DROP_ORDER),
  )
  const navigationWidth = createMemo(() => {
    if (!hasNavigation()) return 0
    const body = Math.max(8, contentWidth() - brandWidth())
    const sessionWidth = sessionMeta() ? displayWidth(sessionMeta()) + 2 : 0
    const metadataWidth = visibleContext().length ? zonedDisplayWidth(visibleContext()) + 3 : 0
    return Math.max(navigationMinimum(props.layout), body - sessionWidth - metadataWidth)
  })
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
      <box flexDirection="row" paddingLeft={pad()} paddingRight={pad()} minWidth={0} alignItems="center">
        <Show when={showBrand()}>
          <box flexShrink={0} paddingRight={2}>
            <text fg={theme.spineBrand} wrapMode="none">
              ARCANA
            </text>
          </box>
        </Show>
        <box flexDirection="row" flexGrow={1} minWidth={0} flexShrink={1} alignItems="center">
          <box width={titleWidth()} minWidth={0} flexShrink={1} overflow="hidden">
            <text wrapMode="none">
              <Show when={showBrand()}>
                <span style={{ fg: theme.spineDiffMuted }}> / </span>
              </Show>
              <strong><span style={{ fg: theme.text }}>{sessionTitle()}</span></strong>
            </text>
          </box>
          <box flexGrow={1} minWidth={0} />
          <Show when={visibleStatus().length > 0}>
            <box minWidth={0} flexShrink={1} overflow="hidden">
              <ZonedStatusLine items={visibleStatus()} theme={theme} leading={false} />
            </box>
          </Show>
        </box>
      </box>
      <Show when={lockReason()}>
        <box paddingLeft={pad() + brandWidth()} paddingRight={pad()} minWidth={0}>
          <text fg={theme.warning} wrapMode="none">
            ⚠ {lockReason()}
          </text>
        </box>
      </Show>
      <Show when={props.session()}>
        {(session) => (
          <box flexDirection="row" paddingLeft={pad()} paddingRight={pad()} minWidth={0}>
            <Show when={showBrand()}>
              <box width={8} flexShrink={0} />
            </Show>
            <Show when={hasNavigation()}>
              <box width={navigationWidth()} minWidth={0} flexShrink={1} overflow="hidden">
                <SpineNavigationRail
                  layout={props.layout}
                  width={navigationWidth()}
                  path={showPath() ? pathSegment()?.value : undefined}
                  session={session()}
                  sessions={props.sessions}
                  showCurrent={false}
                  onNavigate={props.onNavigateToSession}
                  onPrevious={props.onPreviousSession}
                  onNext={props.onNextSession}
                  onParent={props.onParentSession}
                />
              </box>
            </Show>
            <Show when={visibleContext().length > 0}>
              <box minWidth={0} flexGrow={1} flexShrink={1} overflow="hidden" paddingLeft={hasNavigation() ? 2 : 0}>
                <ZonedStatusLine
                  items={visibleContext()}
                  theme={theme}
                  leading={false}
                  contextSeparator="·"
                />
              </box>
            </Show>
            <Show when={sessionMeta()}>
              <box flexShrink={0} paddingLeft={2}>
                <text fg={theme.spineDiffMuted} wrapMode="none">{sessionMeta()}</text>
              </box>
            </Show>
          </box>
        )}
      </Show>
      <Show when={showBrand() || visibleStatus().length > 0 || visibleContext().length > 0 || lockReason() || props.session()}>
        <box border={["bottom"]} borderColor={theme.borderSubtle} marginTop={1} marginBottom={1} />
      </Show>
    </box>
  )
}
