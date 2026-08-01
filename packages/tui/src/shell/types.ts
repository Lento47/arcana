import type { Component, Accessor } from "solid-js"
import type { ScrollBoxRenderable, ScrollAcceleration } from "@opentui/core"
import type { Message, Part } from "@arcana/sdk/v2"
import type { PromptRef } from "../component/prompt"
import type { PromptInfo } from "../component/prompt/history"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import type { ApprovalShellController } from "./command-spine/approval-shell-controller"

export interface RevertInfo {
  messageID: string
  reverted: Message[]
  diff?: string
  diffFiles?: Array<{ filename: string; additions: number; deletions: number }>
}

export interface ShellProps {
  scrollRef: (r: ScrollBoxRenderable) => void
  showScrollbar: Accessor<boolean>
  scrollAcceleration: ScrollAcceleration

  messages: Accessor<Message[]>
  getParts: (messageId: string) => Part[]
  getPartRevision: (messageId: string) => number
  revert: Accessor<RevertInfo | undefined>
  pending: Accessor<string | undefined>
  lastAssistant: Accessor<Message | undefined>
  assistantDuration: Accessor<Map<string, number>>

  permissions: Accessor<unknown[]>
  questions: Accessor<unknown[]>
  session: Accessor<{ id: string; parentID?: string; title?: string } | undefined>
  /** Session turn status (idle/busy/retry/…) — stops assistant "writing" chrome. */
  sessionStatus?: Accessor<{ type: string } | undefined>
  visible: Accessor<boolean>
  disabled: Accessor<boolean>
  sessionID: string

  toBottom: () => void
  bind: (r: PromptRef | undefined) => void
  setPrompt: (info: PromptInfo) => void

  viewingArtifact: Accessor<string | null>
  setViewingArtifact: (id: string | null) => void

  theme: Record<string, unknown>
  transBorder: Accessor<unknown>

  // ─── TUI-2.1: Approval integration (optional) ────────────────
  /** Reactive approval records for the current session. */
  approvals?: Accessor<readonly ApprovalRecord[]>
  /** The approval shell controller. */
  approvalController?: ApprovalShellController
  /** Active session ID for isolation checks. */
  activeSessionId?: Accessor<string>
  /** Active workspace ID for isolation checks. */
  activeWorkspaceId?: Accessor<string>
}

export type ShellComponent = Component<ShellProps>
