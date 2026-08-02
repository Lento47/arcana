/**
 * F11: Enterprise API and automation — webhook/event surface.
 *
 * Canonical admin event envelopes for webhooks, SIEM export, and ticketing
 * integrations. Events are tenant-scoped and serialized deterministically.
 */

export type AdminEvent =
  | {
      kind: "approval.pending"
      tenantId: string
      approvalId: string
      requestHash: string
      at: string
    }
  | {
      kind: "node.revoked"
      tenantId: string
      nodeId: string
      reason: string
      at: string
    }
  | {
      kind: "policy.promoted"
      tenantId: string
      policyId: string
      sequence: number
      at: string
    }
  | {
      kind: "alert.critical"
      tenantId: string
      alertId: string
      at: string
    }

export function serializeAdminEvent(event: AdminEvent): string {
  return JSON.stringify(event)
}

export function parseAdminEvent(json: string): AdminEvent {
  const parsed = JSON.parse(json) as AdminEvent
  if (!parsed || typeof parsed !== "object" || !("kind" in parsed)) {
    throw new Error("admin event must be an object with a kind")
  }
  return parsed
}
