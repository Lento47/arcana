// packages/core/src/capability/network-gate.ts
//
// Authority Kernel M1 — the single authority path for OUTBOUND NETWORK
// effects from gated runtimes. Sibling of process-gate / fs-gate; shares
// withGate() plumbing.
//
// The gate mediates BEFORE egress; `perform` executes the caller's actual
// fetch (headers, API keys, binary handling stay caller-side) and returns a
// compact summary that becomes the receipt payload. Secret material never
// enters the request identity — SecretUse is its own effect class.
//
// Scope note (honest): SSRF/private-range blocking remains a caller-side
// input-validation concern today; consolidating it into PDP policy is a
// documented follow-up.

import { Effect } from "effect"
import { authorizeAndExecuteEffect } from "./pep"
import { buildAuthorizationRequest } from "./pep-integration"
import { computeRequestHash } from "./request-hash"
import { noopEmitter, withGate } from "./process-gate"
import type { ProcessGateOptions } from "./process-gate"
import { gateTransportExec } from "./replay-transport"

export interface NetworkGateRequest {
  /** Tool name driving the request (web_fetch, web_search, speak, image_generate, env_network, …). */
  toolName: string
  /** Full destination URL. Host is recorded as networkDestination. */
  url: string
  method?: string
  /** Captured nondeterminism for deterministic replay (P3). */
  nonce?: string
  requestedAt?: string
  requestId?: string
  /** K2: bind this request to the calling agent instance / tool instance. */
  instanceId?: string
  parentInstanceId?: string
  onBehalfOf?: string
  toolInstance?: { toolId: string; origin?: string; schemaHash?: string }
  /** K3b transport: record {status,summary} outcomes, or replay recorded ones. Payload is NOT recorded. */
  transport?: import("./replay-transport").GateTransport
}

export interface NetworkExecResult {
  httpStatus: number
  /** Short response summary for the receipt (body preview / byte count). */
  summary: string
  /**
   * Caller-owned payload (binary body, parsed JSON, …). Carried through the
   * EXECUTED result untouched — never part of the request identity.
   */
  payload?: unknown
}

export type NetworkGateResult =
  | { status: "EXECUTED"; httpStatus: number; summary: string; payload?: unknown; requestHash: string }
  | { status: "DENIED"; reasons: ReadonlyArray<{ code: string; message: string }> }
  | { status: "APPROVAL_REQUIRED"; message: string }
  | { status: "STALE_DECISION" | "EXECUTION_FAILED"; detail: string }

/**
 * Authorize-and-execute one outbound network call.
 * `perform` runs only on ALLOW; on DENIED no connection attempt is made.
 */
export async function authorizeNetwork(
  options: ProcessGateOptions,
  request: NetworkGateRequest,
  perform: () => Promise<NetworkExecResult>,
): Promise<NetworkGateResult> {
  let host = "(invalid-url)"
  try {
    host = new URL(request.url).host
  } catch {}

  const authReq = buildAuthorizationRequest({
    toolName: request.toolName,
    principalId: options.principalId ?? "arcana-cli",
    sessionId: options.sessionId,
    args: {
      url: request.url,
      method: request.method ?? "GET",
    },
    networkDestination: host,
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
          Effect.promise(async () => {
            // K3b replay: substitute the recorded observation — zero egress.
            const t = options.transport ?? request.transport
            if (t?.mode === "replay") {
              if (!t.ledger.has(reqHash)) {
                throw new Error(`REPLAY_GAP:${reqHash}`)
              }
              return t.ledger.get(reqHash) as NetworkExecResult
            }
            const exec = await perform()
            if (t?.mode === "record") {
              t.ledger.put(reqHash, exec)
            }
            return exec
          }),
      },
      provider,
      noopEmitter,
    ),
  )

  switch (result.status) {
    case "EXECUTED": {
      const value = result.value as NetworkExecResult
      return {
        status: "EXECUTED",
        httpStatus: value.httpStatus,
        summary: value.summary,
        payload: value.payload,
        requestHash: result.requestHash,
      }
    }
    case "DENIED":
      return { status: "DENIED", reasons: result.decision.reasons }
    case "APPROVAL_REQUIRED":
      return {
        status: "APPROVAL_REQUIRED",
        message:
          "This outbound call requires exact operator approval. No approval surface is wired for this runner yet (fail-closed).",
      }
    case "STALE_DECISION":
    case "EXECUTION_FAILED": {
      const detail =
        "reason" in result && typeof (result as { reason?: string }).reason === "string"
          ? (result as { reason: string }).reason
          : result.status
      return { status: result.status, detail }
    }
  }
}
