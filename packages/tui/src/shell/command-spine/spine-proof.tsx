import { Show } from "solid-js"
import { TextAttributes, type RGBA } from "@opentui/core"
import { useTheme } from "../../context/theme"
import type { Theme } from "../../theme"
import type { SpineLayout, SpineProofContinuation } from "./spine-types"
import { FACT_LABEL_WIDTH } from "./spine-chrome"

function ProofRow(props: { label: string; value?: string; tone?: RGBA; theme: Theme }) {
  const value = props.value?.trim()
  if (!value) return null
  return (
    <box flexDirection="row" flexShrink={0} minWidth={0}>
      <box width={FACT_LABEL_WIDTH} flexShrink={0}>
        <text fg={props.theme.spineDiffMuted}>{props.label}</text>
      </box>
      <text fg={props.tone ?? props.theme.text} wrapMode="word" flexGrow={1} minWidth={0}>
        {value}
      </text>
    </box>
  )
}

/**
 * PR6: proof continuation directly beneath a completed effect.
 * request -> decision -> effect -> evidence -> proof without opening views.
 */
export function SpineProof(props: {
  proof: SpineProofContinuation
  layout: SpineLayout
  failed?: boolean
}) {
  const { theme } = useTheme()
  const compact = () => props.layout === "minimal" || props.layout === "narrow"

  if (compact()) {
    return (
      <text fg={props.failed ? theme.spineFail : theme.spineOk} wrapMode="none">
        {props.failed ? "EFFECT FAILED" : "VERIFIED EFFECT"} · {props.proof.proofLevel ?? "P0"} · integrity{" "}
        {(props.proof.integrity ?? "unverified").toLowerCase()}
      </text>
    )
  }

  return (
    <box flexDirection="column" flexShrink={0} minWidth={0} gap={0} paddingTop={1}>
      <text fg={props.failed ? theme.spineFail : theme.spineOk} attributes={TextAttributes.BOLD}>
        {props.failed ? "× EFFECT FAILED" : "◎ VERIFIED EFFECT"}
      </text>
      <ProofRow label="receipt" value={props.proof.receipt} theme={theme} />
      <Show when={typeof props.proof.evidence === "number"}>
        <ProofRow
          label="evidence"
          value={`${props.proof.evidence ?? 0} artifact${(props.proof.evidence ?? 0) === 1 ? "" : "s"}`}
          theme={theme}
        />
      </Show>
      <ProofRow
        label="proof"
        value={`${props.proof.proofLevel ?? "P0"} · integrity ${(props.proof.integrity ?? "unverified").toLowerCase()}`}
        tone={props.proof.integrity === "INVALID" ? theme.error : theme.spineOk}
        theme={theme}
      />
      <ProofRow label="policy" value={props.proof.policy} theme={theme} />
      <Show when={props.proof.executionId}>
        <ProofRow label="execution" value={props.proof.executionId} theme={theme} />
      </Show>
    </box>
  )
}
