import { Show } from "solid-js"
import { TextAttributes, type RGBA } from "@opentui/core"
import { useTheme } from "../../context/theme"
import type { Theme } from "../../theme"
import { truncate } from "../../util/locale"
import type { SpineApprovalSnapshot, SpineEntry as SpineEntryType, SpineLayout } from "./spine-types"

function riskColor(risk: string | undefined, theme: Theme) {
  if (risk === "CRITICAL") return theme.error
  if (risk === "HIGH") return theme.warning
  if (risk === "MODERATE") return theme.accent
  return theme.textMuted
}

function GateRow(props: { label: string; value?: string; tone?: RGBA; theme: Theme }) {
  const value = props.value?.trim()
  if (!value) return null
  return (
    <box flexDirection="row" flexShrink={0} minWidth={0}>
      <box width={12} flexShrink={0}>
        <text fg={props.theme.spineDiffMuted}>{props.label}</text>
      </box>
      <text fg={props.tone ?? props.theme.text} wrapMode="word" flexGrow={1} minWidth={0}>
        {truncate(value, 120)}
      </text>
    </box>
  )
}

function ActionKeys(props: { theme: Theme; layout: SpineLayout }) {
  if (props.layout === "minimal" || props.layout === "narrow") {
    return (
      <text fg={props.theme.spineContext} wrapMode="none">
        [a] approve once  [x] deny  [v] inspect
      </text>
    )
  }
  return (
    <text fg={props.theme.spineContext} wrapMode="none">
      [a] approve once  [x] deny  [v] full inspection
    </text>
  )
}

/**
 * PR6: inline exact-request gate embedded in the spine.
 *
 * The operator sees the FULL decision context without opening a modal:
 * tool, capability, principal, policy, change, route, expiry, request hash,
 * plus the action keys. Semantic zoom: minimal/narrow terminals show the
 * compact header + key line + actions; compact (100+) adds
 * capability/policy/request; wide (120+) adds inline argument/diff context.
 */
export function SpineApprovalGate(props: {
  entry: SpineEntryType
  snapshot?: SpineApprovalSnapshot
  layout: SpineLayout
  focused?: boolean
}) {
  const { theme } = useTheme()
  const snapshot = () => props.snapshot
  const isWide = () => props.layout === "wide"
  const isCompact = () => props.layout === "compact" || isWide()
  const risk = () => snapshot()?.risk ?? "HIGH"

  return (
    <box flexDirection="column" flexShrink={0} minWidth={0} gap={0} paddingTop={1}>
      <box flexDirection="row" flexShrink={0}>
        <text fg={theme.warning} attributes={TextAttributes.BOLD}>
          ◤ APPROVAL REQUIRED
        </text>
        <box flexGrow={1} />
        <text fg={riskColor(risk(), theme)}>{risk()}</text>
      </box>

      <GateRow label="tool" value={snapshot()?.tool} theme={theme} />
      <Show when={snapshot()?.action}>
        <GateRow label="action" value={snapshot()?.action} theme={theme} />
      </Show>
      <Show when={isCompact()}>
        <GateRow label="capability" value={snapshot()?.capability} theme={theme} />
        <GateRow label="policy" value={snapshot()?.policy} theme={theme} />
        <GateRow label="route" value={snapshot()?.route} theme={theme} />
      </Show>
      <Show when={!isCompact() && snapshot()?.capability}>
        <GateRow label="capability" value={snapshot()?.capability} theme={theme} />
      </Show>
      <GateRow label="principal" value={snapshot()?.principal} theme={theme} />
      <Show when={isCompact()}>
        <GateRow
          label="change"
          value={snapshot()?.change ?? "unavailable · fail-closed"}
          tone={theme.spineDiffAdd}
          theme={theme}
        />
      </Show>
      <Show when={isWide() && snapshot()?.arguments?.length}>
        <GateRow label="args" value={snapshot()!.arguments!.join(" ")} theme={theme} />
      </Show>
      <GateRow label="expires" value={snapshot()?.expires ?? "unknown"} theme={theme} />
      <GateRow label="request" value={shortRequestHash(snapshot())} theme={theme} />
      <Show when={!snapshot()?.available}>
        <text fg={theme.error}>snapshot unavailable · fail-closed</text>
      </Show>
      <ActionKeys theme={theme} layout={props.layout} />
    </box>
  )
}

function shortRequestHash(snapshot?: SpineApprovalSnapshot): string {
  const hash = snapshot?.requestHash
  if (!hash) return "unavailable"
  return hash.length <= 12 ? hash : `${hash.slice(0, 4)}…${hash.slice(-4)}`
}
