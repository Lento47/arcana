/**
 * Approval re-send transport (approval.resend).
 *
 * Re-broadcasts a PENDING approval to its decision surface (Arcana Desktop)
 * after a missed notification. The engine is strictly idempotent — it only
 * re-publishes the existing durable record, never writes, so a re-send can
 * never create a duplicate request. This module is the thin TUI client for
 * that endpoint; the response also reports whether a Desktop subscriber is
 * live so the operator sees "re-sent, desktop offline" instead of silent loss.
 */

export type ApprovalResendOutcome =
  | { ok: true; resendAt: string; desktopOnline: boolean }
  | { ok: false; reason: string }

export async function resendApproval(input: {
  /** Engine base URL (sdk.url). */
  baseUrl: string
  /** Fetch implementation (sdk.fetch — daemon-respawn wrapped, or global). */
  fetchImpl?: typeof fetch
  sessionID: string
  approvalID: string
}): Promise<ApprovalResendOutcome> {
  const { baseUrl, fetchImpl = globalThis.fetch.bind(globalThis), sessionID, approvalID } = input
  const url = `${baseUrl.replace(/\/+$/, "")}/api/session/${encodeURIComponent(sessionID)}/approval/${encodeURIComponent(approvalID)}/resend`
  let response: Response
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
    })
  } catch {
    return { ok: false, reason: "engine unreachable" }
  }
  if (response.status === 404) {
    return { ok: false, reason: "approval not found" }
  }
  try {
    const body = (await response.json()) as {
      success?: boolean
      reason?: string
      resendAt?: string
      desktopOnline?: boolean
    }
    if (body.success === true) {
      return {
        ok: true,
        resendAt: typeof body.resendAt === "string" ? body.resendAt : new Date().toISOString(),
        desktopOnline: body.desktopOnline === true,
      }
    }
    return { ok: false, reason: typeof body.reason === "string" ? body.reason : `HTTP ${response.status}` }
  } catch {
    return { ok: false, reason: `HTTP ${response.status}` }
  }
}
