import { For, onMount } from "solid-js"
import { TextAttributes } from "@opentui/core"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import type { Message, Part } from "@arcana/sdk/v2"
import type { GovernanceRunProof } from "../types"
import { useTheme } from "../../context/theme"
import { useDialog } from "../../ui/dialog"
import type { SpineApprovalSnapshot, SpineEntry } from "./spine-types"
import { buildSpineInspection } from "./spine-inspector.ts"

/**
 * PR6: universal [v] inspector dialog.
 *
 * Adapts to the focused row: conversation -> source message; tool ->
 * command/inputs/output; approval -> immutable exact request; effect ->
 * execution receipt; proof -> full proof chain; subagent -> process/session;
 * error -> stack/event id/recovery advice.
 */
export function SpineInspector(props: {
  entry: SpineEntry
  approval?: ApprovalRecord
  snapshot?: SpineApprovalSnapshot
  proof?: GovernanceRunProof
  message?: Message
  parts?: Part[]
  subagent?: { id: string; title?: string; agent?: string; directory?: string } | undefined
}) {
  const { theme } = useTheme()
  const dialog = useDialog()

  onMount(() => {
    dialog.setSize("large")
  })

  const sections = () =>
    buildSpineInspection({
      entry: props.entry,
      approval: props.approval,
      snapshot: props.snapshot,
      proof: props.proof,
      message: props.message,
      parts: props.parts,
      subagent: props.subagent,
    })

  return (
    <box flexGrow={1} border={["top", "bottom", "left", "right"]} borderColor={theme.accent} backgroundColor={theme.background}>
      <box
        paddingLeft={2}
        paddingRight={2}
        backgroundColor={theme.backgroundPanel}
        border={["bottom"]}
        borderColor={theme.borderSubtle}
        flexDirection="row"
        gap={1}
        height={1}
      >
        <text fg={theme.accent} attributes={TextAttributes.BOLD}>[v] INSPECT</text>
        <text fg={theme.text}>{props.entry.kind} · {props.entry.label ?? props.entry.summary}</text>
        <box flexGrow={1} />
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>[esc] close</text>
      </box>

      <box flexDirection="column" paddingTop={1} paddingBottom={2} paddingLeft={2} paddingRight={2} gap={1}>
        <For each={sections()}>
          {(section) => (
            <box flexDirection="column" minWidth={0}>
              <text fg={theme.spineBrand} attributes={TextAttributes.BOLD}>{section.title}</text>
              <For each={section.rows}>
                {([label, value]) => (
                  <box flexDirection="row" minWidth={0}>
                    <box width={22} flexShrink={0}>
                      <text fg={theme.textMuted}>{label}</text>
                    </box>
                    <text fg={theme.text} wrapMode="word" flexGrow={1} minWidth={0}>{value}</text>
                  </box>
                )}
              </For>
              <For each={section.body?.split("\n") ?? []}>
                {(line) => (
                  <text fg={theme.spineContext} wrapMode="word">
                    {line}
                  </text>
                )}
              </For>
            </box>
          )}
        </For>
      </box>
    </box>
  )
}
