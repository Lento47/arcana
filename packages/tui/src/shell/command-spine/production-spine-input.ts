/**
 * TUI-2.1A: Production Spine Input Union
 *
 * Unified input type for the production command-spine mapper.
 * Prevents approval lifecycle logic from leaking across the shell.
 *
 * Path:
 *   governance event → ProductionSpineInput → productionInputToSpineEntry → SpineEntry
 *
 * Never imports:
 *   GovernedApprovalExecutor
 *   raw database mutations
 *   Phase C executor callbacks
 */

import type { SpineEntry } from "./spine-types"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import { approvalToSpineEntry } from "./approval-spine-adapter"

// ─── Input Union ──────────────────────────────────────────────────

export type ProductionSpineInput =
  | { source: "MESSAGE"; value: MessageView }
  | { source: "GOVERNANCE"; value: GovernanceView }
  | { source: "APPROVAL"; value: ApprovalRecord }

export type MessageView = {
  id: string
  sessionId: string
  role: string
  timestamp: number
  content: string
}

export type GovernanceView = {
  id: string
  sessionId: string
  eventType: string
  timestamp: number
  payload: Record<string, unknown>
}

// ─── Mapper ──────────────────────────────────────────────────────

/**
 * Convert a ProductionSpineInput to a SpineEntry.
 * Single integration boundary for the production shell.
 */
export function productionInputToSpineEntry(
  input: ProductionSpineInput,
): SpineEntry {
  switch (input.source) {
    case "APPROVAL":
      return approvalToSpineEntry(input.value)

    case "GOVERNANCE":
      return governanceToSpineEntry(input.value)

    case "MESSAGE":
      return messageToSpineEntry(input.value)
  }
}

function governanceToSpineEntry(view: GovernanceView): SpineEntry {
  return {
    id: `governance:${view.id}`,
    index: 0,
    elapsed: "",
    kind: "inspect",
    glyph: "◇",
    summary: `${view.eventType}`,
    body: JSON.stringify(view.payload, null, 2),
    bodyLabel: "governance event",
    collapsible: true,
    expandedByDefault: false,
    source: {
      messageID: view.id,
      kind: "approve",
    },
  }
}

function messageToSpineEntry(view: MessageView): SpineEntry {
  return {
    id: `message:${view.id}`,
    index: 0,
    elapsed: "",
    kind: view.role === "assistant" ? "plan" : "ask",
    glyph: view.role === "assistant" ? "✦" : "◆",
    summary: view.content.slice(0, 120),
    body: view.content,
    collapsible: true,
    expandedByDefault: false,
    source: {
      messageID: view.id,
      kind: "message",
    },
  }
}
