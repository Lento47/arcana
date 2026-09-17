import { TextAttributes } from "@opentui/core"
import { Space } from "../ui/chrome"
import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import type { PermissionSavedInfo } from "@arcana/sdk/v2"
import { createStore } from "solid-js/store"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { useSync } from "../context/sync"
import { useRoute } from "../context/route"
import { useSDK } from "../context/sdk"
import { useToast } from "../ui/toast"
import { resendApproval } from "../util/approval-resend"
import {
  approvalActivityRow,
  approvalStateMarker,
  approvalStatusRow,
  authorizationSummary,
  authorizationWarnings,
  extractGuardFlags,
  permissionRequestSummary,
  projectPermissionsStatus,
  waitingHint,
} from "../util/permissions-status"
import { DialogColumn, DialogTitleRow } from "../ui/dialog-chrome"
import { COPY, Glyph } from "../branding"

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
  const toast = useToast()
  const { theme } = useTheme()
  const dialog = useDialog()

  const sessionID = createMemo(() => (route.data.type === "session" ? route.data.sessionID : undefined))
  const projectID = createMemo(() => {
    const id = sessionID()
    return id ? sync.data.session?.find((session) => session.id === id)?.projectID : undefined
  })
  const [remembered, setRemembered] = createSignal<PermissionSavedInfo[]>([])
  // Fail closed: a failed load is an unavailable projection, never rendered as
  // "No remembered permissions." (same rule as the authorization section).
  const [rememberedError, setRememberedError] = createSignal<string | null>(null)
  const [rememberedLoading, setRememberedLoading] = createSignal(false)

  const refreshRemembered = async (id: string) => {
    setRememberedLoading(true)
    try {
      const response = await sdk.client.v2.permission.saved.list({ projectID: id }, { throwOnError: true })
      setRemembered(response.data.data)
      setRememberedError(null)
    } catch {
      setRemembered([])
      setRememberedError("Remembered permissions could not be loaded — reopen this dialog to retry.")
    } finally {
      setRememberedLoading(false)
    }
  }

  createEffect(() => {
    const id = projectID()
    if (id) {
      void refreshRemembered(id)
      return
    }
    setRemembered([])
    setRememberedError(null)
    setRememberedLoading(false)
  })

  const revokeRemembered = async (id: string) => {
    try {
      await sdk.client.v2.permission.saved.remove({ id }, { throwOnError: true })
      const project = projectID()
      if (project) await refreshRemembered(project)
      toast.show({ message: "Remembered permission revoked", variant: "success" })
    } catch {
      toast.show({ message: "Could not revoke remembered permission — try again.", variant: "error" })
    }
  }

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

  // Per-approval re-send feedback: idle rows show the Resend action; a
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
    setResendState(approvalId, { phase: "sending", label: "Sending…" })
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
    <DialogColumn padBottom>
      <DialogTitleRow title="Permissions status" onClose={() => dialog.clear()} />

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
              <box flexDirection="row" gap={Space.gap}>
                <text fg={theme.warning} flexShrink={0}>
                  ◤
                </text>
                <text fg={theme.text} wrapMode="word">
                  {approvalStatusRow(approval)}
                </text>
                <Show when={sessionID()}>
                  {/* resendState[id] is read inside JSX so the row stays
                      reactive: idle shows the action, clicked rows show the
                      outcome. The engine re-send is idempotent — repeated
                      clicks never duplicate a request.

                      No `[key]` wrapper: this row is mouse-only, and the app's
                      `[key] verb` shape means "press this key" — a bracket here
                      would advertise a binding that does not exist.

                      Both the action and its outcome are `flexShrink={0}
                      wrapMode="none"`, so the summary beside them is the row's
                      only elastic part. With two shrinkable segments yoga
                      shared the deficit between them and the action was cut in
                      half and fused into the summary: a 46-column dialog printed
                      `approval a3 · request abcdef12 · 5mResen` with `d` under
                      it, so the one control on the row read as `5mResend`. */}
                  <Show
                    when={resendState[approval.approvalId]}
                    fallback={
                      <text
                        fg={theme.textMuted}
                        attributes={TextAttributes.UNDERLINE}
                        flexShrink={0}
                        wrapMode="none"
                        onMouseUp={() => void onResend(approval.approvalId)}
                      >
                        Resend
                      </text>
                    }
                  >
                    <text
                      fg={
                        resendState[approval.approvalId]!.phase === "error"
                          ? theme.error
                          : theme.textMuted
                      }
                      flexShrink={0}
                      wrapMode="none"
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
              const hasGuard = flags.wholesale_replacement || flags.large_change || flags.destructive_patch ||
                flags.permission_policy || flags.self_awareness || (flags.guard_rules && flags.guard_rules.length > 0)
              return (
                <box flexDirection="row" gap={Space.gap}>
                  <text fg={hasGuard ? theme.error : theme.warning} flexShrink={0}>
                    {hasGuard ? "⚑" : Glyph.attention}
                  </text>
                  {/*
                    The guard warnings are drawn once, here, because the summary
                    already carries them: `permissionRequestSummary` appends
                    `· ⚠ WHOLESALE REPLACEMENT · ⚠ destructive patch` for an edit
                    request, and the row then drew the same warnings a second
                    time as bracketed cells one gap to the right.

                    Two renderings were never the worst of it. The cells were
                    also the row's second elastic segment, so a card too narrow
                    for the summary plus the cells did not merely lose the
                    duplication — yoga shared the deficit between the two and
                    both decoded. The card is capped at 60 columns and opens at
                    `dialogWidth(term, "medium")`, so this is the ordinary case
                    rather than a corner: at a 40-column card the row printed
                    `⚑ edit · src/ [        [      [` over
                    `engine/ WHOLESALEdestrucbackup` and
                    `session.ts REPLACEMEtive create`, cells cut in half and
                    fused into the summary, with the same warnings repeated as a
                    staircase of one-word lines below.

                    One rendering leaves the summary as the row's only elastic
                    segment — the shape the Recent approvals row below already
                    has — so a narrow card wraps whole words and nothing else
                    moves. The `⚠` still reaches the operator, and the guard's
                    severity still reaches them through the mark: `⚑` in error
                    ink when the flags are one of the serious ones, and the
                    attention triangle from the brand layer in warning ink when
                    the only flag is an informational one. (The triangle is not
                    spelled out here on purpose: `attention-glyph.test.tsx`
                    scans this file for the literal, and a comment quoting it
                    would fail the scan as if the surface had re-typed it.)
                  */}
                  <text fg={hasGuard ? theme.warning : theme.text} wrapMode="word">
                    {permissionRequestSummary(request)}
                  </text>
                </box>
              )
            }}
          </For>
        </Show>
      </box>

      <box flexDirection="column" gap={0}>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Remembered permissions
        </text>
        <Show
          when={rememberedError()}
          fallback={
            <Show
              when={remembered().length > 0}
              fallback={
                <Show
                  when={rememberedLoading()}
                  fallback={<text fg={theme.textMuted}>No remembered permissions.</text>}
                >
                  <text fg={theme.textMuted}>Loading remembered permissions…</text>
                </Show>
              }
            >
              <For each={remembered()}>
                {(rule) => (
                  <box flexDirection="row" gap={Space.gap}>
                    <text fg={theme.text} wrapMode="word">
                      {rule.agentID} · {rule.action} · {rule.resource}
                    </text>
                    {/* Same shape as the approval row's action: the rule is the
                        elastic part, the verb is whole or absent. */}
                    <text
                      fg={theme.textMuted}
                      attributes={TextAttributes.UNDERLINE}
                      flexShrink={0}
                      wrapMode="none"
                      onMouseUp={() => void revokeRemembered(rule.id)}
                    >
                      Revoke
                    </text>
                  </box>
                )}
              </For>
            </Show>
          }
        >
          {(message) => <text fg={theme.warning}>{message()}</text>}
        </Show>
      </box>

      {/* The heading belongs to the section, not to its contents: on a fresh
          session nothing has settled yet, and hiding the whole box would take
          the heading with it, hiding the section itself. */}
      <box flexDirection="column" gap={0}>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Recent approvals
        </text>
        <Show
          when={status().recentActivity.length > 0}
          fallback={<text fg={theme.textMuted}>{COPY.dialog.permissionsRecentEmpty}</text>}
        >
          <For each={status().recentActivity}>
            {(activity) => (
              <box flexDirection="row" gap={Space.gap}>
                <text fg={theme.textMuted} flexShrink={0}>
                  {approvalStateMarker(activity.state)}
                </text>
                <text fg={theme.text} wrapMode="word">
                  {approvalActivityRow(activity)}
                </text>
              </box>
            )}
          </For>
        </Show>
      </box>

      <text fg={theme.textMuted}>{waitingHint(status())}</text>
    </DialogColumn>
  )
}
