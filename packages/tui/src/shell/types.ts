import type { Component, Accessor } from "solid-js"
import type { ScrollBoxRenderable, ScrollAcceleration } from "@opentui/core"
import type { Message, Part, SessionGovernanceResponse } from "@arcana/sdk/v2"
import type { PromptRef } from "../component/prompt"
import type { PromptInfo } from "../component/prompt/history"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import type { AuthorityAffordance } from "@arcana/core/crypto/authority-affordance"
import type { ApprovalShellController } from "./command-spine/approval-shell-controller"
import type { ApprovalSnapshotDetail } from "./command-spine/approval-http-bridge"
import type { Theme } from "../theme"

export interface RevertInfo {
  messageID: string
  reverted: Message[]
  diff?: string
  diffFiles?: Array<{ filename: string; additions: number; deletions: number }>
}

export type GovernanceEventRecord = SessionGovernanceResponse["events"][number]
export type GovernanceTraceHealth = SessionGovernanceResponse["trace"]
export type GovernanceRunProof = SessionGovernanceResponse["proof"]

export interface ShellProps {
  scrollRef: (r: ScrollBoxRenderable) => void
  showScrollbar: Accessor<boolean>
  showGutter?: Accessor<boolean>
  scrollAcceleration: ScrollAcceleration

  messages: Accessor<Message[]>
  /** Latest transcript page is still hydrating; cached metadata remains usable. */
  historyLoading?: Accessor<boolean>
  getParts: (messageId: string) => Part[]
  getPartRevision: (messageId: string) => number
  revert: Accessor<RevertInfo | undefined>
  pending: Accessor<string | undefined>
  lastAssistant: Accessor<Message | undefined>
  assistantDuration: Accessor<Map<string, number>>

  permissions: Accessor<unknown[]>
  questions: Accessor<unknown[]>
  session: Accessor<{ id: string; parentID?: string; title?: string } | undefined>
  /** Project sessions used to derive root → subagent ancestry and sibling position. */
  sessionList?: Accessor<readonly {
    id: string
    parentID?: string | null
    title?: string | null
    time?: { created?: number }
  }[]>
  /** Session turn status (idle/busy/retry/…) — stops assistant "writing" chrome. */
  sessionStatus?: Accessor<{
    type: string
    attempt?: number
    message?: string
    next?: number
  } | undefined>
  /**
   * Turn status for EVERY known session, keyed by sessionID (subagent-liveness
   * S1): lets the projection present a settled subagent row as alive while its
   * child session is busy again (e.g. resumed manually after a failure).
   */
  childStatuses?: Accessor<Record<string, { type: string; attempt?: number; message?: string; next?: number } | undefined>>
  visible: Accessor<boolean>
  disabled: Accessor<boolean>
  sessionID: string

  toBottom: () => void
  bind: (r: PromptRef | undefined) => void
  setPrompt: (info: PromptInfo) => void

  viewingArtifact: Accessor<string | null>
  setViewingArtifact: (id: string | null) => void

  theme: Theme
  transBorder: Accessor<unknown>

  // ─── TUI-2.1: Approval integration (optional) ────────────────
  /** Reactive approval records for the current session. */
  approvals?: Accessor<readonly ApprovalRecord[]>
  /** Runtime-derived authority affordances, keyed by approvalId. */
  approvalAffordances?: Accessor<ReadonlyMap<string, readonly AuthorityAffordance[]>>
  /** The approval shell controller. */
  approvalController?: ApprovalShellController
  /**
   * Fetch the VERIFIED immutable request snapshot for an approval (audit PR-2).
   * Returns null when the engine has no verified snapshot (missing/tampered or
   * transport failure). Additive: absent loader → inspector shows hash-only.
   */
  approvalDetailLoader?: (approvalId: string) => Promise<ApprovalSnapshotDetail | null>
  /** Active session ID for isolation checks. */
  activeSessionId?: Accessor<string>
  /** Active workspace ID for isolation checks. */
  activeWorkspaceId?: Accessor<string>
  /** Durable Phase C governance events for the current session. */
  governance?: Accessor<readonly GovernanceEventRecord[]>
  /** Authoritative engine trace health for the current session. */
  governanceTrace?: Accessor<GovernanceTraceHealth | undefined>
  /** Canonical read-only RunProof projection for the current session. */
  governanceProof?: Accessor<GovernanceRunProof | undefined>
  /**
   * Navigate into a child/subagent session. The implementation should sync the
   * target session before routing so the route guard never rejects a valid
   * child session that is not yet in the local list.
   */
  onNavigateToSession?: (sessionID: string) => void
  /**
   * Called when the user activates an agent (subagent) row that has no child
   * session link yet. The implementation should refresh the session list,
   * resolve the child (by actor title, newest fallback), and navigate.
   */
  onResolveChild?: (entry: { kind: string; actor?: string }) => void
}

export type ShellComponent = Component<ShellProps>
