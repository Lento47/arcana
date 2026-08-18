import { DateTime } from "luxon"

export function truncateHash(value: string, maxLen = 12): string {
  if (value.length <= maxLen) return value
  return value.slice(0, maxLen) + "…"
}

export function formatTimestamp(iso: string): string {
  const dt = DateTime.fromISO(iso)
  if (!dt.isValid) return iso
  return dt.toFormat("yyyy-MM-dd HH:mm:ss")
}

export interface AuditEventView {
  id: string
  idShort: string
  actor: string
  actorShort: string
  action: string
  resource: string
  resourceShort: string
  outcome: string
  at: string
}

export interface AuditEvent {
  id: string
  actorUserId: string
  action: string
  resource: string
  outcome: string
  at: string
}

export function mapAuditEvent(evt: AuditEvent): AuditEventView {
  return {
    id: evt.id,
    idShort: truncateHash(evt.id, 16),
    actor: evt.actorUserId,
    actorShort: truncateHash(evt.actorUserId, 10),
    action: evt.action,
    resource: evt.resource,
    resourceShort: truncateHash(evt.resource, 14),
    outcome: evt.outcome,
    at: formatTimestamp(evt.at),
  }
}

/** Engine retention-sweep takes `{ now?: ISO }`. Day counts are rejected. */
export function parseRetentionSweepNow(raw?: string): { now?: string; error?: string } {
  const value = raw?.trim()
  if (!value) return {}
  if (/^\d+$/.test(value)) {
    return { error: "use an ISO timestamp (e.g. 2026-08-17T00:00:00Z), not a day count" }
  }
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) return { error: "invalid now timestamp" }
  return { now: new Date(ms).toISOString() }
}

export interface RetentionSweepResponse {
  deleted: number
  retainedByHold: number
}

/** Surface a fail-closed proxy/engine error instead of a bare HTTP status. */
export async function readApiError(res: Response): Promise<string> {
  const fallback = `HTTP ${res.status}${res.statusText ? `: ${res.statusText}` : ""}`
  try {
    const body = (await res.json()) as { error?: unknown; detail?: unknown }
    const error = typeof body.error === "string" ? body.error : ""
    const detail = typeof body.detail === "string" ? body.detail : ""
    if (error && detail) return `${error}: ${detail}`
    if (detail) return detail
    if (error) return error
  } catch {
    // Non-JSON body — keep the status line.
  }
  return fallback
}

export function formatSweepResult(result: RetentionSweepResponse): string {
  const parts: string[] = []
  if (result.deleted > 0) parts.push(`${result.deleted} deleted`)
  if (result.retainedByHold > 0) parts.push(`${result.retainedByHold} retained by hold`)
  if (parts.length === 0) return "nothing to sweep"
  return parts.join(", ")
}
