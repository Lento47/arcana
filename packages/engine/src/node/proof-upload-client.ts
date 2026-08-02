/**
 * D-8B (node side): HTTP transport for proof batch upload.
 *
 * Maps control-plane responses onto the transport contract consumed by
 * `processDueProofUploads`:
 *   - 200 REGISTERED/DUPLICATE → durable receipt
 *   - 200 REJECTED → PERMANENT (the control plane rejected the batch)
 *   - non-200 / network errors → RETRYABLE
 */

import type { ProofBatchEnvelope, ProofRegistrationReceipt } from "@arcana/core/crypto/proof-registration"
import type { ProofUploadTransportResult } from "@arcana/core/crypto/proof-uploader"

export type ProofUploadClientOptions = {
  /** Control-plane base URL, e.g. http://127.0.0.1:9142 */
  endpoint: string
  headers?: Record<string, string>
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}

type ControlPlaneRegistrationResponse =
  | {
      kind: "REGISTERED" | "DUPLICATE"
      receiptId: string
      nodeId: string
      batchRoot: string
      status: "REGISTERED" | "DUPLICATE"
      acknowledgedFirstSequence: number
      acknowledgedLastSequence: number
      acknowledgedAt: string
    }
  | {
      kind: "REJECTED"
      reason: string
      detail: string
    }

export function createProofUploadTransport(
  options: ProofUploadClientOptions,
): (envelope: ProofBatchEnvelope) => Promise<ProofUploadTransportResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const endpoint = options.endpoint.replace(/\/+$/, "")

  return async (envelope: ProofBatchEnvelope): Promise<ProofUploadTransportResult> => {
    let response: Response
    try {
      response = await fetchImpl(`${endpoint}/api/proof/batches`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...options.headers,
        },
        body: JSON.stringify(envelope),
      })
    } catch (error) {
      return { kind: "RETRYABLE", error: `transport error: ${String(error)}` }
    }

    if (response.status !== 200) {
      return { kind: "RETRYABLE", error: `HTTP ${response.status}` }
    }

    let body: ControlPlaneRegistrationResponse
    try {
      body = (await response.json()) as ControlPlaneRegistrationResponse
    } catch (error) {
      return { kind: "RETRYABLE", error: `invalid response body: ${String(error)}` }
    }

    if (body.kind === "REJECTED") {
      return { kind: "PERMANENT", error: `${body.reason}: ${body.detail}` }
    }

    const receipt: ProofRegistrationReceipt = {
      receiptId: body.receiptId,
      nodeId: body.nodeId,
      batchRoot: body.batchRoot,
      acknowledgedFirstSequence: body.acknowledgedFirstSequence,
      acknowledgedLastSequence: body.acknowledgedLastSequence,
      acknowledgedAt: body.acknowledgedAt,
      status: body.status,
    }
    return { kind: body.kind, receipt }
  }
}
