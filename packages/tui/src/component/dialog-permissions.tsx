import { TextAttributes } from "@opentui/core"
import { For, Show, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { useSync } from "../context/sync"
import { useRoute } from "../context/route"
import { useSDK } from "../context/sdk"
import { resendApproval } from "../util/approval-resend"
import {
  approvalActivityRow,
  approvalStateMarker,
  approvalStatusRow,
  authorizationSummary,
  authorizationWarnings,
  extractGuardFlags,
  guardWarnings,
  permissionRequestSummary,
  projectPermissionsStatus,
  waitingHint,
} from "../util/permissions-status"

/**
 * Permissions status — the operator's view of what the engine is asking and
 * what it has decided.
 *
 * Three sections:
 *   1. Authorization — the P1–P3 counter profile for the session (requests,
 *      allowed, denied, approvals required, executed) plus any integrity
 *      flags (stale decisions, unauthorized executions, capability
 *      violations). Never hidden when the projection is unavailable: an
 *      unavailable governance projection is shown as such, not as zero.
 *   2. Waiting now — the two queues holding an action pending a decision:
 *      durable approval gates (PENDING ApprovalRecord) and classic
 *      permission action gates. Each approval row names its decision
 *      surface (spine / desktop / central) from the routing policy, and the
 *      footer hint says where the decision happens — with a live Arcana
 *      Desktop, desktop-routed gates wait on Desktop, not the TUI.
 *   3. Recent approvals — settled approval records with their outcome,
 *      newest first, so the view still shows requests status when nothing
 *      is waiting.
 *
 * Fail-closed presentation: empty queues and missing projections are shown
 * as empty/unavailable, never hidden.
 */
export function DialogPermissions() {
  const sync = useSync()
  const route = useRoute()
  const sdk = useSDK()
  const { theme } = useTheme()
  const dialog = useDialog()

  const sessionID = createMemo(() => (route.data.type === "session" ? route.data.sessionID : undefined))

  // Scope durable approvals to the active session when one is open; on the
  // home route show every pending approval (all of it is operator work).
  // Subagent-owned approvals (parentSessionId === active session) are
  // included so a gate raised inside a delegated child is visible here too.
  const approvals = createMemo(() => {
    const all = Object.values(sync.data.approvals)
    const id = sessionID()
    return id
      ? all.filter((approval) => approval.sessionId === id || approval.parentSessionId === id)
      : all
  })

  const requests = createMemo(() => {
    const id = sessionID()
    return id ? (sync.data.permission[id] ?? []) : []
  })

  const governance = createMemo(() => {
    const id = sessionID()
    return id ? (sync.data.governance[id] ?? null) : null
  })

  const status = createMemo(() =>
    projectPermissionsStatus({ approvals: approvals(), requests: requests(), governance: governance() }),
  )

  // Per-approval re-send feedback: idle rows show the [↻ resend] link; a
  // clicked row shows its outcome (re-sent / desktop offline / reason). The
  // engine re-send is idempotent, so rapid clicks never duplicate a request.
  const [resendState, setResendState] = createStore<
    Record<string, { phase: "sending" | "done" | "error"; label: string }>
  >({})

  const onResend = async (approvalId: string) => {
    const approval = approvals().find((item) => item.approvalId === approvalId)
    // The resend path is session-scoped: use the approval's OWN session so a
    // subagent approval re-broadcasts through its child session, never the
    // parent's.
    if (!approval) return
    setResendState(approvalId, { phase: "sending", label: "sending…" })
    const outcome = await resendApproval({
      baseUrl: sdk.url,
      fetchImpl: sdk.fetch,
      sessionID: approval.sessionId,
      approvalID: approval.approvalId,
    })
    if (outcome.ok) {
      setResendState(approvalId, {
        phase: "done",
        label: outcome.desktopOnline ? "re-sent to desktop" : "re-sent · desktop offline",
      })
    } else {
      setResendState(approvalId, { phase: "error", label: outcome.reason })
    }
  }

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Permissions status
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>

      <text fg={theme.textMuted}>
        session {sessionID() ?? "—"} · governance {status().authorization?.traceHealth ?? "UNAVAILABLE"}
      </text>

      <Show
        when={status().authorization}
        fallback={
          <text fg={theme.warning}>
            Governance projection unavailable — authorization status for this session is not recorded.
          </text>
        }
      >
        {(authorization) => (
          <box flexDirection="column" gap={0}>
            <text fg={theme.text} attributes={TextAttributes.BOLD}>
              Authorization
            </text>
            <text fg={theme.text}>{authorizationSummary(authorization())}</text>
            <For each={authorizationWarnings(authorization())}>
              {(warning) => (
                <text fg={theme.warning}>
                  ⚠ {warning}
                </text>
              )}
            </For>
          </box>
        )}
      </Show>

      <box flexDirection="column" gap={0}>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Waiting now
        </text>
        <Show
          when={status().pendingApprovals.length > 0}
          fallback={<text fg={theme.textMuted}>No approval gates waiting.</text>}
        >
          <text fg={theme.textMuted}>
            {status().pendingApprovals.length} approval gate
            {status().pendingApprovals.length === 1 ? "" : "s"} waiting
          </text>
          <For each={status().pendingApprovals}>
            {(approval) => (
              <box flexDirection="row" gap={1}>
                <text fg={theme.warning} flexShrink={0}>
                  ◤
                </text>
                <text fg={theme.text} wrapMode="word">
                  {approvalStatusRow(approval)}
                </text>
                <Show when={sessionID()}>
                  {/* resendState[id] is read inside JSX so the row stays
                      reactive: idle shows [↻ resend], clicked rows show the
                      outcome. The engine re-send is idempotent — repeated
                      clicks never duplicate a request. */}
                  <Show
                    when={resendState[approval.approvalId]}
                    fallback={
                      <text
                        fg={theme.textMuted}
                        attributes={TextAttributes.UNDERLINE}
                        onMouseUp={() => void onResend(approval.approvalId)}
                      >
                        [↻ resend]
                      </text>
                    }
                  >
                    <text
                      fg={
                        resendState[approval.approvalId]!.phase === "error"
                          ? theme.error
                          : theme.textMuted
                      }
                    >
                      {resendState[approval.approvalId]!.label}
                    </text>
                  </Show>
                </Show>
              </box>
            )}
          </For>
        </Show>
        <Show
          when={status().pendingRequests.length > 0}
          fallback={<text fg={theme.textMuted}>No permission requests waiting.</text>}
        >
          <text fg={theme.textMuted}>
            {status().pendingRequests.length} permission request
            {status().pendingRequests.length === 1 ? "" : "s"} waiting
          </text>
          <For each={status().pendingRequests}>
            {(request) => {
              const flags = extractGuardFlags(request.metadata ?? {})
              const hasGuard = flags.wholesale_replacement || flags.large_change
              return (
                <box flexDirection="row" gap={1}>
                  <text fg={hasGuard ? theme.error : theme.warning} flexShrink={0}>
                    {hasGuard ? "⚑" : "△"}
                  </text>
                  <text fg={hasGuard ? theme.warning : theme.text} wrapMode="word">
                    {permissionRequestSummary(request)}
                  </text>
                  <Show when={guardWarnings(flags).length > 0}>
                    <For each={guardWarnings(flags)}>
                      {(chip) => (
                        <text fg={chip === "backup created" ? theme.textMuted : theme.error}>
                          [{chip}]
                        </text>
                      )}
                    </For>
                  </Show>
                </box>
              )
            }}
          </For>
        </Show>
      </box>

      <Show when={status().recentActivity.length > 0}>
        <box flexDirection="column" gap={0}>
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            Recent approvals
          </text>
          <For each={status().recentActivity}>
            {(activity) => (
              <box flexDirection="row" gap={1}>
                <text fg={theme.textMuted} flexShrink={0}>
                  {approvalStateMarker(activity.state)}
                </text>
                <text fg={theme.text} wrapMode="word">
                  {approvalActivityRow(activity)}
                </text>
              </box>
            )}
          </For>
        </box>
      </Show>

      <text fg={theme.textMuted}>{waitingHint(status())}</text>
    </box>
  )
}
