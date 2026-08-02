/**
 * F11: Ticketing integration.
 *
 * Canonical ticket payloads derived from admin events so external ticketing
 * systems (Linear, Jira, ServiceNow) receive consistent titles, priorities,
 * and labels. Transport adapters are external; the payload contract is
 * deterministic and tested here.
 */

import type { AdminEvent } from "./admin-events"

export type TicketPriority = "low" | "medium" | "high" | "urgent"

export type TicketPayload = {
  title: string
  description: string
  labels: string[]
  priority: TicketPriority
}

export function toTicketPayload(event: AdminEvent): TicketPayload {
  switch (event.kind) {
    case "approval.pending":
      return {
        title: `Approval pending: ${event.approvalId}`,
        description: `Central approval ${event.approvalId} is pending exact inspection (requestHash ${event.requestHash}).`,
        labels: ["arcana", "approval"],
        priority: "medium",
      }
    case "node.revoked":
      return {
        title: `Node revoked: ${event.nodeId}`,
        description: `Fleet node ${event.nodeId} was revoked (${event.reason}).`,
        labels: ["arcana", "fleet", "incident"],
        priority: "urgent",
      }
    case "policy.promoted":
      return {
        title: `Policy promoted: ${event.policyId} #${event.sequence}`,
        description: `Policy bundle ${event.policyId} sequence ${event.sequence} was promoted.`,
        labels: ["arcana", "policy"],
        priority: "low",
      }
    case "alert.critical":
      return {
        title: `Critical alert: ${event.alertId}`,
        description: `Critical security alert ${event.alertId} was raised.`,
        labels: ["arcana", "security"],
        priority: "urgent",
      }
  }
}
