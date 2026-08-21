/**
 * TUI-2.1A: Production Approval Integration
 *
 * Composable hook for the command-spine shell. Provides:
 * - Approval entries derived from durable approval records
 * - ApprovalShellController wired to real keyboard/mouse
 * - Deterministic ordering with existing entries
 * - Deduplication by durable ID
 *
 * The shell calls useApprovalIntegration() to get entries + controller.
 * Never imports: GovernedApprovalExecutor, raw SQL, Phase C callbacks.
 */

import { createMemo, type Accessor } from "solid-js"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import type { AuthorityAffordance } from "@arcana/core/crypto/authority-affordance"
import type { SpineEntry } from "./spine-types"
import {
  dedupeApprovalEntries,
} from "./approval-spine-adapter"
import {
  createApprovalShellController,
  type ApprovalShellController,
  type ApprovalOperatorService,
  type ApprovalCommandInput,
  type ApprovalCommandResult,
  type SessionContext,
  type ApprovalShellState,
} from "./approval-shell-controller"

// ─── Integration Input ───────────────────────────────────────────

export type ApprovalIntegrationInput = {
  /** Durable approval records for the current session. */
  approvals: Accessor<ApprovalRecord[]>
  /** Runtime-derived authority affordances, keyed by approvalId. */
  approvalAffordances?: Accessor<ReadonlyMap<string, readonly AuthorityAffordance[]>>
  /** The approval operator service (real or mock). */
  service: ApprovalOperatorService
  /** Current session context. */
  session: SessionContext
  /** Called when shell state changes (for UI feedback). */
  onShellStateChange?: (approvalId: string, state: ApprovalShellState | undefined) => void
}

// ─── Integration Output ──────────────────────────────────────────

export type ApprovalIntegrationOutput = {
  /** Approval spine entries, deduped and ready to merge. */
  approvalEntries: Accessor<SpineEntry[]>
  /** The controller for keyboard/mouse commands. */
  controller: ApprovalShellController
}

// ─── Hook ────────────────────────────────────────────────────────

export function useApprovalIntegration(
  input: ApprovalIntegrationInput,
): ApprovalIntegrationOutput {
  // Create the controller
  const controller = createApprovalShellController({
    service: input.service,
    session: input.session,
    getApproval: (id) => input.approvals().find((a) => a.approvalId === id),
    getAffordances: (id) => input.approvalAffordances?.().get(id),
    onStateChange: input.onShellStateChange,
  })

  // Entries derive through the ONE shared adapter path (same as the
  // projection), so the two consumers can never drift.
  const approvalEntries = createMemo(() => dedupeApprovalEntries(input.approvals()))

  return {
    approvalEntries,
    controller,
  }
}
