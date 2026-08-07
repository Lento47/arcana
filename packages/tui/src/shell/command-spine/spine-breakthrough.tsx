import { TextAttributes } from "@opentui/core"
import { Show } from "solid-js"
import { useTheme } from "../../context/theme"
import type { SpineEntry as SpineEntryType } from "./spine-types"

/**
 * PR6: security breakthrough row.
 *
 * Important governance events (revocation, stale decisions, denied effects,
 * degraded proof) visually interrupt the spine with a "!" banner and stay
 * visible under every view filter. `protectedExecuted` is the real
 * unauthorized-execution count from the RunProof snapshot; when the proof is
 * unavailable the row says so instead of claiming zero.
 */
export function SpineBreakthrough(props: {
  entry: SpineEntryType
  protectedExecuted?: number
}) {
  const { theme } = useTheme()
  const title = () => (props.entry.label ?? props.entry.kind).toUpperCase()
  const protectedLine = () =>
    typeof props.protectedExecuted === "number"
      ? `protected effects executed: ${props.protectedExecuted}`
      : "protected effects executed: unavailable · fail-closed"

  return (
    <box flexDirection="column" flexShrink={0} minWidth={0} gap={0} paddingTop={1}>
      <box flexDirection="row" flexShrink={0}>
        <text fg={theme.error} attributes={TextAttributes.BOLD}>
          !  {title()}
        </text>
      </box>
      <Show when={props.entry.summary}>
        <text fg={theme.warning} wrapMode="word">
          {props.entry.summary}
        </text>
      </Show>
      <text fg={theme.spineDiffMuted} wrapMode="word">
        {protectedLine()}
      </text>
    </box>
  )
}
