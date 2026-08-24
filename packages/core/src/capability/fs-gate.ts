// packages/core/src/capability/fs-gate.ts
//
// Authority Kernel M1 — the single authority path for FILE MUTATIONS
// (filesystem.write / filesystem.delete). Sibling of process-gate; both share
// withGate() so store/bootstrap/provider logic exists exactly once.
//
// The caller supplies `perform` — the actual mutation runs ONLY inside PEP
// executeExact, i.e. only after the PDP allows this exact canonical request
// (path + content fingerprint via args). This matches the engine's model:
// the kernel owns the decision, callers own the implementation.

import { Effect } from "effect"
import { authorizeAndExecuteEffect } from "./pep"
import type { EnforcementResult } from "./pep"
import { buildAuthorizationRequest } from "./pep-integration"
import { noopEmitter, withGate } from "./process-gate"
import type { ProcessGateOptions } from "./process-gate"
import { recordDecision, observeLatency } from "./authority-metrics"
import { computeRequestHash } from "./request-hash"
import { gateTransportExec } from "./replay-transport"

export interface FileMutationRequest {
  /** Mapped tool name: "write" | "edit" | "patch" | "skill_create" | "env_write" | … */
  toolName: string
  /** Target path (absolute or workspace-relative; canonicalized by the PEP). */
  filePath: string
  /** New full content (write) or replacement text (edit) — hashed into the request. */
  content?: string
  /** Text being replaced (edit) — part of exact-request identity. */
  oldString?: string
  cwd?: string
  /** Captured nondeterminism for deterministic replay (P3). */
  nonce?: string
  requestedAt?: string
  requestId?: string
  /** K2: bind this request to the calling agent instance / tool instance. */
  instanceId?: string
  parentInstanceId?: string
  onBehalfOf?: string
  toolInstance?: { toolId: string; origin?: string; schemaHash?: string }
  /** K3b transport: record this mutation's output, or replay a recorded one. */
  transport?: import("./replay-transport").GateTransport
}

export type FileMutationResult =
  | { status: "EXECUTED"; output: string; requestHash: string }
  | { status: "DENIED"; reasons: ReadonlyArray<{ code: string; message: string }> }
  | { status: "APPROVAL_REQUIRED"; message: string }
  | { status: "STALE_DECISION" | "EXECUTION_FAILED"; detail: string }

/**
 * Authorize-and-execute one file mutation.
 *
 * `perform` performs the physical write and returns a short success message.
 * It runs only on ALLOW. On DENIED the filesystem is untouched — tests should
 * assert exactly that.
 */
export async function authorizeFileMutation(
  options: ProcessGateOptions,
  request: FileMutationRequest,
  perform: () => string,
): Promise<FileMutationResult> {
  const __t0 = Date.now()
  const authReq = buildAuthorizationRequest({
    toolName: request.toolName,
    principalId: options.principalId ?? "arcana-cli",
    sessionId: options.sessionId,
    args: {
      path: request.filePath,
      file_path: request.filePath,
      ...(request.content !== undefined ? { content: request.content } : {}),
      ...(request.oldString !== undefined ? { oldString: request.oldString } : {}),
      cwd: request.cwd ?? null,
    },
    workingDirectory: request.cwd,
    provenance: ["USER_INSTRUCTION"],
    nonce: request.nonce,
    requestedAt: request.requestedAt,
    requestId: request.requestId,
    instanceId: request.instanceId,
    parentInstanceId: request.parentInstanceId,
    onBehalfOf: request.onBehalfOf,
    toolInstance: request.toolInstance,
  })

  const reqHash = computeRequestHash(authReq)

  const result = await withGate(options, (provider) =>
    authorizeAndExecuteEffect(
      {
        request: authReq,
        executeExact: () =>
          Effect.sync(() => {
            const tr = gateTransportExec(options.transport ?? request.transport, reqHash, perform)
            return tr.value
          }),
      },
      provider,
      noopEmitter,
    ),
  )

  recordDecision(result.status)
  observeLatency("gate_total_ms", Math.max(0, Date.now() - __t0))
  switch (result.status) {
    case "EXECUTED":
      return { status: "EXECUTED", output: String(result.value ?? ""), requestHash: result.requestHash }
    case "DENIED":
      return { status: "DENIED", reasons: result.decision.reasons }
    case "APPROVAL_REQUIRED":
      return {
        status: "APPROVAL_REQUIRED",
        message:
          "This file action requires exact operator approval. No approval surface is wired for this runner yet (fail-closed).",
      }
    case "STALE_DECISION":
    case "EXECUTION_FAILED": {
      const r = result as { reason?: string; error?: unknown }
      const detail =
        typeof r.reason === "string"
          ? r.reason
          : r.error instanceof Error
            ? r.error.message
            : r.error != null
              ? String(r.error)
              : result.status
      return { status: result.status, detail }
    }
  }
}
