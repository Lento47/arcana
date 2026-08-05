/**
 * TUI-2.1C: HTTP Approval Operator Service bridge (RB-01 §D4 transport)
 *
 * The TUI's write path for operator commands. Keyboard input reaches the
 * engine through this bridge — NEVER through a direct executor.
 *
 *   keyboard → ApprovalShellController → HttpApprovalOperatorService
 *           → POST /api/session/:sessionId/approval/:approvalId/command
 *           → session-scoped ApprovalOperatorService (engine) → response
 *
 * Contract (engine side, built in parallel):
 *   POST /api/session/:sessionId/approval/:approvalId/command
 *     body    { command: "APPROVE_ONCE" | "DENY", expectedVersion,
 *               expectedRequestHash, expectedContractRevision }
 *     200     { success: true, approval: ApprovalRecord }
 *           | { success: false, reason: string, stale?: boolean }
 *
 * Read path is the sync channel (sync.data.approvals), not HTTP — the
 * load* helpers below serve from the injected sync-fed accessor.
 *
 * Deviation from core's ApprovalOperatorService (approval-operator-service.ts):
 * submitCommand is ASYNC here (HTTP round-trip) — core's synchronous
 * signature cannot be honored over a network hop. loadApproval and
 * loadPendingApprovals keep core's synchronous signatures via the
 * getApprovals accessor.
 */

import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import type {
  ApprovalCommandKind,
  OperatorCommandRequest,
  OperatorCommandResponse,
} from "@arcana/core/crypto/approval-operator-service"
import type {
  ApprovalCommandInput,
  ApprovalCommandResult,
  ApprovalOperatorService,
} from "./approval-shell-controller"

/**
 * Verified immutable request snapshot (audit PR-2), wire shape of the engine's
 * approval.detail endpoint. The engine recomputes the canonical request hash
 * and verifies it equals the record's requestHash before responding; a missing
 * or tampered snapshot returns 422 (ApprovalSnapshotUnavailableError), which
 * the TUI surfaces as "snapshot unavailable" — never a stale projection.
 */
export type ApprovalSnapshotDetail = {
  schemaVersion: "1"
  approvalId: string
  requestHash: string
  action: string
  resource: string
  /** Canonical JSON of the request arguments (sensitive values redacted). */
  arguments: string
  capability: string
  principalId: string
  intentId?: string
  policyVersion: string
  contractRevision: number
  riskClass: string
  diffPreview?: {
    filePath: string
    kind: string
    additions?: number
    deletions?: number
    content?: string
  }
  artifactPreview?: {
    kind: string
    name: string
    contentType?: string
    size?: number
    url?: string
    description?: string
  }
}

export type HttpApprovalBridgeOptions = {
  /** Engine base URL (sdk.url). */
  baseUrl: string
  /** Fetch implementation (defaults to global fetch). */
  fetch?: typeof fetch
  /** Live session context — read at command time so the persisted
   *  <Session /> component acts on the CURRENT session after a switch. */
  getSessionId: () => string
  getWorkspaceId: () => string
  /** Latest known approval records (sync-fed). Read path for load*. */
  getApprovals?: () => readonly ApprovalRecord[]
}

export class HttpApprovalOperatorService implements ApprovalOperatorService {
  private fetchImpl: typeof fetch

  constructor(private options: HttpApprovalBridgeOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
  }

  private get sessionId(): string {
    return this.options.getSessionId()
  }

  private get workspaceId(): string {
    return this.options.getWorkspaceId()
  }

  private commandUrl(approvalId: string): string {
    const base = this.options.baseUrl.replace(/\/+$/, "")
    return `${base}/api/session/${encodeURIComponent(this.sessionId)}/approval/${encodeURIComponent(approvalId)}/command`
  }

  private detailUrl(approvalId: string): string {
    const base = this.options.baseUrl.replace(/\/+$/, "")
    return `${base}/api/session/${encodeURIComponent(this.sessionId)}/approval/${encodeURIComponent(approvalId)}/detail`
  }

  private async postCommand(
    input: ApprovalCommandInput,
    command: Extract<ApprovalCommandKind, "APPROVE_ONCE" | "DENY">,
  ): Promise<ApprovalCommandResult> {
    const url = this.commandUrl(input.approvalId)
    const body = {
      command,
      expectedVersion: input.expectedVersion,
      expectedRequestHash: input.expectedRequestHash,
      expectedContractRevision: input.expectedContractRevision,
    }

    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    } catch (error) {
      return {
        status: "ERROR",
        approvalId: input.approvalId,
        error: error instanceof Error ? error.message : "Approval command request failed",
      }
    }

    let payload: OperatorCommandResponse
    try {
      payload = (await response.json()) as OperatorCommandResponse
    } catch {
      return {
        status: "ERROR",
        approvalId: input.approvalId,
        error: `Approval command returned non-JSON (HTTP ${response.status})`,
      }
    }

    if (!payload.success) {
      return {
        status: "ERROR",
        approvalId: input.approvalId,
        error: payload.reason,
      }
    }

    return {
      status: command === "APPROVE_ONCE" ? "APPROVED" : "DENIED",
      approvalId: input.approvalId,
      newVersion: payload.approval.version,
    }
  }

  /**
   * Fetch the VERIFIED immutable request snapshot for an approval (audit PR-2).
   * Read-only; additive to the operator service surface. Returns the snapshot,
   * or null when the engine has no verified snapshot for the record (404,
   * 422 snapshot_missing/tampered, or transport failure) — the TUI then shows
   * an explicit "snapshot unavailable" note rather than any stale projection.
   */
  async fetchApprovalSnapshot(approvalId: string): Promise<ApprovalSnapshotDetail | null> {
    let response: Response
    try {
      response = await this.fetchImpl(this.detailUrl(approvalId), {
        method: "GET",
        headers: { "content-type": "application/json" },
      })
    } catch {
      return null
    }
    if (response.status !== 200) return null
    try {
      const payload = (await response.json()) as {
        approval: unknown
        snapshot: ApprovalSnapshotDetail
        snapshotVerified: boolean
      }
      if (payload.snapshotVerified !== true || !payload.snapshot) return null
      return payload.snapshot
    } catch {
      return null
    }
  }

  // ─── TUI shell interface ─────────────────────────────────────────

  async approveOnce(input: ApprovalCommandInput): Promise<ApprovalCommandResult> {
    return this.postCommand(input, "APPROVE_ONCE")
  }

  async deny(input: ApprovalCommandInput): Promise<ApprovalCommandResult> {
    return this.postCommand(input, "DENY")
  }

  // ─── Core interface (async adaptation of the engine operator service) ─

  async submitCommand(request: OperatorCommandRequest): Promise<OperatorCommandResponse> {
    // The TUI surface currently decides via APPROVE_ONCE/DENY only; REVOKE is
    // a workspace-operator/Desktop command and is refused here so the surface
    // never widens silently.
    if (request.command === "REVOKE") {
      return { success: false, reason: "REVOKE is not available from the TUI surface" }
    }
    const result = await this.postCommand(
      {
        approvalId: request.approvalId,
        expectedVersion: request.expectedVersion,
        expectedRequestHash: request.expectedRequestHash,
        expectedContractRevision: request.expectedContractRevision,
      },
      request.command,
    )
    if (result.status === "ERROR") {
      return { success: false, reason: result.error ?? "approval command failed" }
    }
    const approval = this.loadApproval(request.approvalId)
    if (!approval) {
      return { success: false, reason: "approval not found after command" }
    }
    return { success: true, approval }
  }

  loadApproval(approvalId: string): ApprovalRecord | null {
    const approvals = this.options.getApprovals?.() ?? []
    return approvals.find((a) => a.approvalId === approvalId) ?? null
  }

  loadPendingApprovals(): ApprovalRecord[] {
    const approvals = this.options.getApprovals?.() ?? []
    return approvals.filter(
      (a) => a.sessionId === this.sessionId && a.workspaceId === this.workspaceId && a.state === "PENDING",
    )
  }
}
