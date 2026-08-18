import { For, Show, createMemo } from "solid-js"
import { TextAttributes, type RGBA } from "@opentui/core"
import { useTheme } from "../../context/theme"
import type { Theme } from "../../theme"
import { RoundBorder } from "../../ui/chrome"
import { truncate } from "../../util/locale"
import type { SpineApprovalSnapshot, SpineEntry as SpineEntryType, SpineLayout } from "./spine-types"
import {
  approvalFactGroups,
  approvalGateFacts,
  chipCellWidth,
  FACT_LABEL_WIDTH,
  packChipRows,
} from "./spine-chrome"

export { approvalGateFacts, formatApprovalActionKeys } from "./spine-chrome"

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
    <box flexDirection="row" flexShrink={0} minWidth={0} gap={1}>
      <box width={FACT_LABEL_WIDTH} flexShrink={0}>
        <text fg={props.theme.spineDiffMuted}>{props.label}</text>
      </box>
      <text fg={props.tone ?? props.theme.text} wrapMode="word" flexGrow={1} minWidth={0}>
        {truncate(value, 120)}
      </text>
    </box>
  )
}

function ActionKeys(props: { theme: Theme; layout: SpineLayout }) {
  const facts = approvalGateFacts(undefined, props.layout)
  return (
    <box flexDirection="row" flexShrink={0} gap={1} paddingTop={1}>
      <For each={[...facts.keys]}>
        {(item) => (
          <box
            flexShrink={0}
            paddingLeft={1}
            paddingRight={1}
            backgroundColor={props.theme.backgroundElement}
          >
            <text wrapMode="none">
              <span style={{ fg: props.theme.accent }}>{item.key}</span>
              <span style={{ fg: props.theme.spineContext }}> {item.action}</span>
            </text>
          </box>
        )}
      </For>
    </box>
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
  contentWidth?: number
}) {
  const { theme } = useTheme()
  const snapshot = () => props.snapshot
  const facts = () => approvalGateFacts(snapshot(), props.layout)
  const groups = () => approvalFactGroups(snapshot(), props.layout)
  const risk = () => facts().risk
  const chipBudget = createMemo(() => {
    const raw = props.contentWidth
    if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(1, Math.floor(raw) - 4)
    return props.layout === "minimal" || props.layout === "narrow" ? 28 : 48
  })
  const primaryRows = createMemo(() =>
    packChipRows(
      groups().primary.map((row) => ({ ...row, text: `${row.label} ${truncate(row.value, 28)}` })),
      chipBudget(),
      (item) => chipCellWidth(item.text),
    ),
  )

  return (
    <box
      flexDirection="column"
      flexShrink={0}
      minWidth={0}
      gap={0}
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={1}
      paddingRight={1}
      border={true}
      customBorderChars={RoundBorder}
      borderColor={riskColor(risk(), theme)}
      backgroundColor={theme.backgroundPanel}
    >
      <box flexDirection="row" flexShrink={0} alignItems="center" gap={1} paddingBottom={1}>
        <text fg={theme.warning} attributes={TextAttributes.BOLD}>
          {facts().title}
        </text>
        <box flexGrow={1} minWidth={1} />
        <box paddingLeft={1} paddingRight={1} backgroundColor={theme.backgroundElement} flexShrink={0}>
          <text fg={riskColor(risk(), theme)} wrapMode="none">{risk()}</text>
        </box>
      </box>

      <box flexDirection="column" flexShrink={0} gap={1} paddingBottom={1}>
        <For each={primaryRows()}>
          {(row) => (
            <box flexDirection="row" flexShrink={0} gap={1} minWidth={0}>
              <For each={row}>
                {(item) => (
                  <box
                    flexShrink={0}
                    paddingLeft={1}
                    paddingRight={1}
                    backgroundColor={theme.backgroundElement}
                  >
                    <text wrapMode="none">
                      <span style={{ fg: theme.spineDiffMuted }}>{item.label} </span>
                      <span style={{ fg: theme.text }}>{truncate(item.value, 28)}</span>
                    </text>
                  </box>
                )}
              </For>
            </box>
          )}
        </For>
      </box>

      <For each={groups().meta}>
        {(row) => (
          <GateRow
            label={row.label}
            value={row.value}
            tone={row.label === "change" ? theme.spineDiffAdd : undefined}
            theme={theme}
          />
        )}
      </For>
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
