import { createMemo, For, onMount, Show, type Accessor } from "solid-js"
import { Space } from "../../ui/chrome"
import { RGBA, TextAttributes } from "@opentui/core"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import type { ApprovalSnapshotDetail } from "../../shell/command-spine/approval-http-bridge"
import { Glyph, StatusGlyph } from "../../branding"
import { useTheme } from "../../context/theme"
import { useDialog } from "../../ui/dialog"
import { DialogPanelHeader } from "../../ui/dialog-chrome"
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
 *
 * The panel draws no private frame: the card in `ui/dialog.tsx` is the one
 * frame, and `DialogPanelHeader` is its hairline — the same anatomy as the
 * permission inspector and every dialog.
 */
/**
 * The section heading for a failed snapshot, hoisted because both failure
 * states render it — the literal used to be typed twice in this file, which is
 * how one copy drifts from the other.
 *
 * The words are the gate's own (`snapshot unavailable · fail-closed`, in
 * `spine-approval-gate.tsx`): the inspector is what `v` opens from that gate, so
 * it has to name the condition the operator just read.
 */
const SNAPSHOT_UNAVAILABLE = `${Glyph.attention} SNAPSHOT UNAVAILABLE · FAIL-CLOSED`

/**
 * Why the snapshot is unavailable. The `missing` wording is the audit's
 * requirement, not a stylistic choice: the operator must not act on a hash whose
 * request cannot be read, so the note says so instead of merely reporting a
 * fetch outcome. The `error` case is the same conclusion reached by a different
 * route, and it carries the one action that can help.
 */
const UNAVAILABLE_NOTE: Record<"missing" | "error", string> = {
  missing:
    "This approval has no verified immutable request snapshot (engine failed closed — the exact request behind this hash cannot be reviewed). Do not approve or deny until a snapshot is available.",
  error:
    "Could not reach the engine to fetch the verified request snapshot — close and reopen the inspector to retry.",
}

/**
 * The report's section banner: a framed heading, and a note under it when the
 * section has to explain itself.
 *
 * All three snapshot states render through this one shape — a heading the
 * operator can find while scrolling, between two hairlines on the panel fill —
 * because the report is long enough that a bare bold line is indistinguishable
 * from the rows around it, and because it makes the section's height and
 * position identical across states: the `loading` banner is what stands where
 * the verified one lands, so the report does not jump under the operator's eyes
 * at the moment they start reading it.
 *
 * The two unavailable states used to stack a heading and an indented paragraph
 * in a plain column box, which is why the paragraph opened with a literal
 * `{" "}`: JSX drops whitespace-only text between elements, so the indent had to
 * be smuggled in as a text node. A banner that owns its own padding needs no
 * such hack — the note takes its inset from the frame, and the ink is what
 * separates heading from note.
 */
function SnapshotBanner(props: {
  /** Heading ink — the state's colour. */
  ink: RGBA
  /** Frame colour; kept separate so the frame can stay chrome while the heading carries the state. */
  frame: RGBA
  heading: string
  note?: string
  /** Set when rows follow the banner and it has to stand off them. */
  padBottom?: boolean
}) {
  const { theme } = useTheme()
  return (
    <box
      flexDirection="column"
      marginTop={Space.gap}
      marginBottom={props.padBottom ? 1 : undefined}
      paddingLeft={Space.unit}
      backgroundColor={theme.backgroundPanel}
      border={["top", "bottom"]}
      borderColor={props.frame}
    >
      {/* The heading is a label, not prose: it wraps to a second row only if
          the frame is narrower than the text, which reads as a broken banner. */}
      <text fg={props.ink} attributes={TextAttributes.BOLD} wrapMode="none">
        {props.heading}
      </text>
      <Show when={props.note}>
        {(note) => (
          <text fg={theme.textMuted} wrapMode="word">
            {note()}
          </text>
        )}
      </Show>
    </box>
  )
}

/** The report's label column — wide enough for the longest label in the file. */
const LABEL_WIDTH = 22

/**
 * One `label → value` row of the report.
 *
 * The value wraps rather than clipping, which is the opposite of the rule the
 * spine's readouts follow, and deliberately so: a 64-character request hash has
 * no space to break at, so `wrapMode="none"` could only cut it — and showing the
 * value whole is the reason this dialog exists. The label column is fixed, so
 * the values line up as one column down the report however long any of them is.
 */
function FieldRow(props: { label: string; value: string }) {
  const { theme } = useTheme()
  return (
    <box flexDirection="row" minWidth={0}>
      <box width={LABEL_WIDTH} flexShrink={0}>
        <text fg={theme.textMuted} wrapMode="none">
          {props.label}
        </text>
      </box>
      <text fg={theme.text} wrapMode="word" flexGrow={1}>
        {props.value}
      </text>
    </box>
  )
}

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

  /**
   * The two failure states render one banner and differ only in their note, so
   * the branch asks for them as the pair they are rather than re-reading the
   * whole status union twice.
   */
  const unavailable = createMemo(() => {
    const value = status()
    return value === "missing" || value === "error" ? value : undefined
  })

  onMount(() => {
    // Full 64-char hashes + labels need the widest dialog.
    dialog.setSize("xlarge")
  })

  const rows = createMemo(() => approvalInspectorRows(a()))
  const snapshotRows = createMemo(() => approvalSnapshotRows(snapshot(), a()))

  return (
    <box flexGrow={1} minWidth={0}>
      <DialogPanelHeader
        title="APPROVAL INSPECTOR"
        titleColor={theme.warning}
        mark={Glyph.attention}
        detail={`${a().state} · version ${a().version}`}
        onClose={() => dialog.clear()}
      />

      <scrollbox
        flexGrow={1}
        minHeight={0}
        paddingTop={Space.padY}
        paddingBottom={Space.padX}
        paddingLeft={Space.padX}
        paddingRight={Space.padX}
        verticalScrollbarOptions={{
          trackOptions: { backgroundColor: theme.backgroundPanel, foregroundColor: theme.borderActive },
        }}
      >
        <For each={rows()}>{(row) => <FieldRow label={row[0]} value={row[1]} />}</For>

        <Show when={status() === "ready"}>
          <SnapshotBanner
            ink={theme.accent}
            frame={theme.borderActive}
            padBottom
            heading={`REQUEST SNAPSHOT · verified ${snapshot()?.requestHash === a().requestHash ? StatusGlyph.done : StatusGlyph.failed}`}
          />
          <For each={snapshotRows()}>{(row) => <FieldRow label={row[0]} value={row[1]} />}</For>
        </Show>

        <Show when={status() === "loading"}>
          <SnapshotBanner ink={theme.textMuted} frame={theme.borderSubtle} heading="REQUEST SNAPSHOT · loading…" />
        </Show>

        <Show when={unavailable()}>
          {(reason) => (
            <SnapshotBanner
              ink={theme.warning}
              frame={theme.warning}
              heading={SNAPSHOT_UNAVAILABLE}
              note={UNAVAILABLE_NOTE[reason()]}
            />
          )}
        </Show>
      </scrollbox>
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
      ? `verified ${StatusGlyph.done} matches record requestHash`
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
