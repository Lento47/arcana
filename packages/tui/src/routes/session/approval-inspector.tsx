import { createMemo, For, onMount, Show, type Accessor } from "solid-js"
import { TextAttributes } from "@opentui/core"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import type { ApprovalSnapshotDetail } from "../../shell/command-spine/approval-http-bridge"
import { useTheme } from "../../context/theme"
import { useDialog } from "../../ui/dialog"
export type ApprovalSnapshotStatus = "loading" | "ready" | "missing" | "error" | undefined

/**
 * Full-detail inspector for a durable approval (runbook Phase 3).
 *
 * The spine receipt row intentionally truncates hashes/IDs so rows stay
 * compact; this dialog shows every field UNTRUNCATED so the operator can
 * verify the exact request (full hash, session, workspace, contract
 * revision, expiry) before pressing a/d.
 *
 * Audit PR-2: when the engine returns a VERIFIED immutable request snapshot
 * (action, resource, arguments, capability, policy version, previews), the
 * inspector renders the real reviewable content under a "REQUEST SNAPSHOT"
 * section. The engine recomputes the canonical request hash and requires it to
 * equal the record's requestHash before responding; a missing or tampered
 * snapshot is surfaced as an explicit "snapshot unavailable" note — the
 * operator is never shown a hash-associated record without its verified
 * request. `snapshot`/`snapshotStatus` are Accessors so the section updates
 * reactively once the detail fetch resolves.
 *
 * Opened from the command spine with `v`; closed with Esc, ctrl+c, or
 * clicking outside. The approval entry stays SELECTED after close.
 */
export function ApprovalInspector(props: {
  approval: ApprovalRecord
  snapshot?: Accessor<ApprovalSnapshotDetail | undefined>
  snapshotStatus?: Accessor<ApprovalSnapshotStatus>
}) {
  const { theme } = useTheme()
  const dialog = useDialog()
  const a = createMemo(() => props.approval)
  const snapshot = createMemo(() => props.snapshot?.() ?? undefined)
  const status = createMemo(() => props.snapshotStatus?.() ?? undefined)

  onMount(() => {
    // Full 64-char hashes + labels need the widest dialog.
    dialog.setSize("xlarge")
  })

  const rows = createMemo(() => approvalInspectorRows(a()))
  const snapshotRows = createMemo(() => approvalSnapshotRows(snapshot(), a()))

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

        <Show when={status() === "ready"}>
          <box
            marginTop={1}
            marginBottom={1}
            paddingLeft={1}
            backgroundColor={theme.backgroundPanel}
            border={["top", "bottom"]}
            borderColor={theme.accent}
          >
            <text fg={theme.accent} attributes={TextAttributes.BOLD}>
              REQUEST SNAPSHOT · verified {snapshot()?.requestHash === a().requestHash ? "✓" : "✗"}
            </text>
          </box>
          <For each={snapshotRows()}>
            {([label, value]) => (
              <box flexDirection="row" minWidth={0}>
                <box width={22} flexShrink={0}>
                  <text fg={theme.textMuted}>{label}</text>
                </box>
                <text fg={theme.text} wrapMode="word" flexGrow={1}>{value}</text>
              </box>
            )}
          </For>
        </Show>

        <Show when={status() === "loading"}>
          <box marginTop={1} paddingLeft={1}>
            <text fg={theme.textMuted}>Loading verified request snapshot…</text>
          </box>
        </Show>

        <Show when={status() === "missing"}>
          <box marginTop={1} paddingLeft={1}>
            <text fg={theme.warning} attributes={TextAttributes.BOLD}>
              SNAPSHOT UNAVAILABLE
            </text>
            <text fg={theme.textMuted} wrapMode="word">
              {" "}
              This approval has no verified immutable request snapshot (engine failed closed — the exact request behind
              this hash cannot be reviewed).
            </text>
          </box>
        </Show>

        <Show when={status() === "error"}>
          <box marginTop={1} paddingLeft={1}>
            <text fg={theme.warning} attributes={TextAttributes.BOLD}>
              SNAPSHOT UNAVAILABLE
            </text>
            <text fg={theme.textMuted} wrapMode="word">
              {" "}
              Could not reach the engine to fetch the verified request snapshot.
            </text>
          </box>
        </Show>
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

function prettyJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

/** Pure row builder for the verified immutable request snapshot (audit PR-2). */
export function approvalSnapshotRows(
  snapshot: ApprovalSnapshotDetail | undefined,
  approval: ApprovalRecord,
): Array<[string, string]> {
  if (!snapshot) return []
  const rows: Array<[string, string]> = [
    ["Action", snapshot.action],
    ["Resource", snapshot.resource],
    ["Capability", snapshot.capability],
    ["Policy version", snapshot.policyVersion],
    ["Contract revision", String(snapshot.contractRevision)],
    ["Risk class", snapshot.riskClass],
  ]
  if (snapshot.intentId) rows.push(["Intent ID", snapshot.intentId])
  if (snapshot.principalId) rows.push(["Principal", snapshot.principalId])
  rows.push([
    "Hash parity",
    snapshot.requestHash === approval.requestHash
      ? "verified ✓ matches record requestHash"
      : "MISMATCH — engine failed closed, do not act",
  ])
  rows.push(["Arguments", prettyJson(snapshot.arguments)])
  if (snapshot.diffPreview) {
    const d = snapshot.diffPreview
    rows.push([
      "Diff preview",
      `file ${d.filePath} · ${d.kind}` +
        (typeof d.additions === "number" ? ` · +${d.additions}/-${d.deletions ?? 0}` : ""),
    ])
    if (d.content) rows.push(["Diff content", d.content])
  }
  if (snapshot.artifactPreview) {
    const p = snapshot.artifactPreview
    rows.push([
      "Artifact preview",
      `${p.name} (${p.kind})` +
        (p.contentType ? ` · ${p.contentType}` : "") +
        (typeof p.size === "number" ? ` · ${p.size} bytes` : ""),
    ])
    if (p.description) rows.push(["Artifact description", p.description])
  }
  return rows
}
