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
  actor: string
  action: string
  resource: string
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
    id: truncateHash(evt.id, 16),
    actor: truncateHash(evt.actorUserId, 10),
    action: evt.action,
    resource: truncateHash(evt.resource, 14),
    outcome: evt.outcome,
    at: formatTimestamp(evt.at),
  }
}

export interface RetentionSweepResponse {
  deleted: number
  retainedByHold: number
}

export function formatSweepResult(result: RetentionSweepResponse): string {
  const parts: string[] = []
  if (result.deleted > 0) parts.push(`${result.deleted} deleted`)
  if (result.retainedByHold > 0) parts.push(`${result.retainedByHold} retained by hold`)
  if (parts.length === 0) return "nothing to sweep"
  return parts.join(", ")
}
