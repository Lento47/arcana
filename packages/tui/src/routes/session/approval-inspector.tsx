import { createMemo, For, onMount } from "solid-js"
import { TextAttributes } from "@opentui/core"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import { useTheme } from "../../context/theme"
import { useDialog } from "../../ui/dialog"

/**
 * Full-detail inspector for a durable approval (runbook Phase 3).
 *
 * The spine receipt row intentionally truncates hashes/IDs so rows stay
 * compact; this dialog shows every field UNTRUNCATED so the operator can
 * verify the exact request (full hash, session, workspace, contract
 * revision, expiry) before pressing a/d.
 *
 * Opened from the command spine with `v`; closed with Esc, ctrl+c, or
 * clicking outside. The approval entry stays SELECTED after close.
 */
export function ApprovalInspector(props: { approval: ApprovalRecord }) {
  const { theme } = useTheme()
  const dialog = useDialog()
  const a = createMemo(() => props.approval)

  onMount(() => {
    // Full 64-char hashes + labels need the widest dialog.
    dialog.setSize("xlarge")
  })

  const rows = createMemo(() => approvalInspectorRows(a()))

  return (
    <box
      flexGrow={1}
      border={["top", "bottom", "left", "right"]}
      borderColor={theme.accent}
      backgroundColor={theme.background}
    >
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
        <text fg={theme.warning} attributes={TextAttributes.BOLD}>△ APPROVAL INSPECTOR</text>
        <text fg={theme.textMuted}>
          {a().state} · version {a().version}
        </text>
        <box flexGrow={1} />
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>[esc] close</text>
      </box>

      <box
        flexDirection="column"
        paddingTop={1}
        paddingBottom={2}
        paddingLeft={2}
        paddingRight={2}
        gap={0}
      >
        <For each={rows()}>
          {([label, value]) => (
            <box flexDirection="row" minWidth={0}>
              <box width={22} flexShrink={0}>
                <text fg={theme.textMuted}>{label}</text>
              </box>
              <text fg={theme.text} wrapMode="word" flexGrow={1}>{value}</text>
            </box>
          )}
        </For>
      </box>
    </box>
  )
}

/** Pure row builder — untruncated full values (runbook Phase 3.1). */
export function approvalInspectorRows(approval: ApprovalRecord): Array<[string, string]> {
  const base: Array<[string, string]> = [
    ["Approval ID", approval.approvalId],
    ["Version", String(approval.version)],
    ["State", approval.state],
    ["Session ID", approval.sessionId],
    ["Workspace ID", approval.workspaceId],
    ["Request hash", approval.requestHash],
    ["Contract revision", String(approval.contractRevision)],
    ["Expires", approval.expiresAt],
    ["Created", approval.createdAt],
    ["Updated", approval.updatedAt],
  ]
  if (approval.principalId) base.push(["Principal", approval.principalId])
  if (approval.approvedBy) base.push(["Operator", approval.approvedBy])
  if (approval.executionId) base.push(["Execution ID", approval.executionId])
  return base
}
