import type { Component, Accessor } from "solid-js"
import type { ScrollBoxRenderable, ScrollAcceleration } from "@opentui/core"
import type { Message, Part } from "@arcana/sdk/v2"
import type { PromptRef } from "../component/prompt"
import type { PromptInfo } from "../component/prompt/history"

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
  revert: Accessor<RevertInfo | undefined>
  pending: Accessor<string | undefined>
  lastAssistant: Accessor<Message | undefined>
  assistantDuration: Accessor<Map<string, number>>

  permissions: Accessor<unknown[]>
  questions: Accessor<unknown[]>
  session: Accessor<{ id: string; parentID?: string; title?: string } | undefined>
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
}

export type ShellComponent = Component<ShellProps>
