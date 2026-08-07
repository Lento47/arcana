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

import { createMemo, createSignal, type Accessor } from "solid-js"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import type { AuthorityAffordance } from "@arcana/core/crypto/authority-affordance"
import type { SpineEntry } from "./spine-types"
import {
  approvalToSpineEntry,
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
import {
  createOrderingKey,
  compareOrderingKeys,
  createDedupeKey,
  dedupeKeyToString,
  type SpineOrderingKey,
} from "./spine-ordering"

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
  /** Whether the focused entry is an approval. */
  isFocusedApproval: (entry: SpineEntry) => boolean
  /** Extract approval ID from a spine entry (if it's an approval). */
  extractApprovalId: (entry: SpineEntry) => string | undefined
  /** Get the ApprovalRecord for a spine entry (if it's an approval). */
  getApprovalForEntry: (entry: SpineEntry) => ApprovalRecord | undefined
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

  // Deduplication: track seen approval IDs to prevent duplicate entries
  const approvalEntries = createMemo(() => {
    const approvals = input.approvals()
    const seen = new Set<string>()
    const entries: SpineEntry[] = []

    for (const approval of approvals) {
      const dedupeKey = dedupeKeyToString(
        createDedupeKey({
          approvalId: approval.approvalId,
          approvalVersion: approval.version,
        }),
      )
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      const entry = approvalToSpineEntry(approval)
      entries.push(entry)
    }

    return entries
  })

  // Helper: check if a spine entry is an approval
  function isFocusedApproval(entry: SpineEntry): boolean {
    return entry.source?.kind === "approve" && entry.id.startsWith("approval:")
  }

  // Helper: extract approval ID from spine entry
  function extractApprovalId(entry: SpineEntry): string | undefined {
    if (!entry.id.startsWith("approval:")) return undefined
    // Format: "approval:<approvalId>:<version>"
    const parts = entry.id.split(":")
    return parts[1]
  }

  // Helper: get ApprovalRecord for a spine entry
  function getApprovalForEntry(entry: SpineEntry): ApprovalRecord | undefined {
    const id = extractApprovalId(entry)
    if (!id) return undefined
    return input.approvals().find((a) => a.approvalId === id)
  }

  return {
    approvalEntries,
    controller,
    isFocusedApproval,
    extractApprovalId,
    getApprovalForEntry,
  }
}

// ─── Merge with deterministic ordering ───────────────────────────

/**
 * Merge message entries, gate entries, and approval entries
 * with deterministic ordering. Use this in the shell's visibleEntries memo.
 */
export function mergeSpineEntries(
  messageEntries: SpineEntry[],
  gateEntries: SpineEntry[],
  approvalEntries: SpineEntry[],
): SpineEntry[] {
  // Deduplication by entry ID
  const seen = new Set<string>()
  const all: SpineEntry[] = []

  for (const entry of [...messageEntries, ...gateEntries, ...approvalEntries]) {
    if (seen.has(entry.id)) continue
    seen.add(entry.id)
    all.push(entry)
  }

  return all
}
