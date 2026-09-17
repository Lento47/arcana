import { For, Show, createContext, createMemo, createSignal, useContext } from "solid-js"
import { Space } from "../../ui/chrome"
import { TextAttributes, type MouseEvent, type RGBA } from "@opentui/core"
import { selectedForeground, useTheme } from "../../context/theme"
import { SyncContext } from "../../context/sync"
import type { Theme } from "../../theme"
import { Frame } from "../../ui/frame"
import { truncate } from "../../util/locale"
import { priorDecision, recordWallClock, precedentSummary, shortHash } from "./approval-snapshot"
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

/**
 * Approval actions made available to the inline gate. The shell provides the
 * same handlers its a/d/v keyboard bindings use; when no provider is present
 * (isolated renders/tests) the action chips stay non-clickable key hints.
 */
export type ApprovalGateActions = {
  approve: () => void
  deny: () => void
  inspect: () => void
}

export const ApprovalGateActionsContext = createContext<ApprovalGateActions>()

export function useApprovalGateActions() {
  return useContext(ApprovalGateActionsContext)
}

function GateRow(props: { label: string; value?: string; tone?: RGBA; theme: Theme }) {
  const value = props.value?.trim()
  if (!value) return null
  return (
    <box flexDirection="row" flexShrink={0} minWidth={0} gap={Space.gap}>
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
  const actions = useApprovalGateActions()
  const [hover, setHover] = createSignal<string>()
  const facts = approvalGateFacts(undefined, props.layout)
  const onPrimary = () => selectedForeground(props.theme)
  const handlerFor = (key: string) => {
    if (!actions) return undefined
    if (key === "a") return actions.approve
    if (key === "d") return actions.deny
    if (key === "v") return actions.inspect
    return undefined
  }
  /**
   * A chip is a leaf affordance inside the entry row, and OpenTUI mouse events
   * bubble to every ancestor (`Renderable.processMouseEvent`), so without this
   * the row's own handler acts on the way back up. The gate is the one part of
   * the row that renders while the row is COLLAPSED, which is exactly when the
   * row reads a click as "toggle me": approving a request also opened the
   * banner's body.
   *
   * Only a chip that has something to run claims the click. The key line still
   * renders without an actions provider (isolated renders, tests), and there it
   * is a hint rather than a target — the click belongs to the row.
   */
  const handleActionMouseUp = (event: MouseEvent, key: string) => {
    const handler = handlerFor(key)
    if (!handler) return
    event.stopPropagation?.()
    handler()
  }
  return (
    <box flexDirection="row" flexShrink={0} gap={Space.gap} paddingTop={Space.padY}>
      <For each={[...facts.keys]}>
        {(item) => {
          const handler = () => handlerFor(item.key)
          const clickable = () => handler() !== undefined
          const active = () => clickable() && hover() === item.key
          return (
            <box
              flexShrink={0}
              paddingLeft={Space.unit}
              paddingRight={Space.unit}
              backgroundColor={active() ? props.theme.primary : props.theme.backgroundElement}
              onMouseUp={(event) => handleActionMouseUp(event, item.key)}
              onMouseOver={() => clickable() && setHover(item.key)}
              onMouseOut={() => setHover(undefined)}
            >
              <text wrapMode="none">
                <span style={{ fg: active() ? onPrimary() : props.theme.accent }}>{item.key}</span>
                <span style={{ fg: active() ? onPrimary() : props.theme.spineContext }}> {item.action}</span>
              </text>
            </box>
          )
        }}
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
  // The sync store is optional here: the gate renders in isolated tests and
  // plugin surfaces that mount before a SyncProvider (the same tolerance
  // `useMotionEnabled` gives `KVContext`). No store means no precedent, not a
  // crash.
  const sync = useContext(SyncContext)
  const precedent = createMemo(() => {
    const records = sync?.data.approvals
    const hash = snapshot()?.requestHash
    if (!records || !hash) return undefined
    // Entry ids are `approval:<approvalId>:<version>` (approval-spine-adapter).
    const currentApprovalId = props.entry.id.split(":")[1]
    return priorDecision(Object.values(records), hash, currentApprovalId)
  })
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
    <Frame
      tone={riskColor(risk(), theme)}
      background={props.focused ? (theme.backgroundElement as any) : theme.backgroundPanel}
      padX={1}
    >
      <box flexDirection="row" flexShrink={0} alignItems="center" gap={Space.gap}>
        <text fg={theme.warning} attributes={TextAttributes.BOLD}>
          {facts().title}
        </text>
        <box flexGrow={1} minWidth={1} />
        <box paddingLeft={Space.unit} paddingRight={Space.unit} backgroundColor={theme.backgroundElement} flexShrink={0}>
          <text fg={riskColor(risk(), theme)} wrapMode="none">{risk()}</text>
        </box>
      </box>

      <box flexDirection="column" flexShrink={0} gap={0} paddingTop={Space.padY} paddingBottom={Space.padY}>
        <For each={primaryRows()}>
          {(row) => (
            <box flexDirection="row" flexShrink={0} gap={Space.gap} minWidth={0}>
              <For each={row}>
                {(item) => (
                  <box
                    flexShrink={0}
                    paddingLeft={Space.unit}
                    paddingRight={Space.unit}
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
      <GateRow label="request" value={shortHash(snapshot()?.requestHash, 12)} theme={theme} />
      {/*
        The precedent: this exact request was decided before. It is the one
        line in the gate that is not about *this* decision — it is about the
        last time the operator stood here. Exact hash means exact request, so a
        match is evidence, never a "similar call" guess.
      */}
      <Show when={precedent()}>
        {(record) => (
          <text fg={theme.textMuted} wrapMode="word">
            precedent · {precedentSummary(record())}
          </text>
        )}
      </Show>
      <Show when={!snapshot()?.available}>
        <text fg={theme.error}>snapshot unavailable · fail-closed · press v to inspect</text>
      </Show>
      <ActionKeys theme={theme} layout={props.layout} />
    </Frame>
  )
}

