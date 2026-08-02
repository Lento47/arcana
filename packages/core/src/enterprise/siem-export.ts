/**
 * F11: SIEM export.
 *
 * Deterministic serialization of canonical admin events for SIEM ingestion:
 * JSON lines (generic) and ArcSight CEF (common enterprise event format).
 */

import { serializeAdminEvent, type AdminEvent } from "./admin-events"

export function siemJsonLines(events: readonly AdminEvent[]): string {
  return events.map((event) => serializeAdminEvent(event)).join("\n") + (events.length > 0 ? "\n" : "")
}

function escapeCef(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\n/g, "\\n")
}

function cefExtensionValue(value: string | number): string {
  return escapeCef(String(value)).replace(/=/g, "\\=")
}

export type CefMapping = {
  signature: string
  name: string
  severity: number
  extensions: string[]
}

export function mapEventToCef(event: AdminEvent): CefMapping {
  switch (event.kind) {
    case "approval.pending":
      return {
        signature: "arcana/approval/pending",
        name: "Central approval pending",
        severity: 5,
        extensions: [
          `cs1=${cefExtensionValue(event.approvalId)} cs1Label=ApprovalId`,
          `cs2=${cefExtensionValue(event.requestHash)} cs2Label=RequestHash`,
        ],
      }
    case "node.revoked":
      return {
        signature: "arcana/node/revoked",
        name: "Node revoked",
        severity: 10,
        extensions: [
          `cs1=${cefExtensionValue(event.nodeId)} cs1Label=NodeId`,
          `cs2=${cefExtensionValue(event.reason)} cs2Label=Reason`,
        ],
      }
    case "policy.promoted":
      return {
        signature: "arcana/policy/promoted",
        name: "Policy promoted",
        severity: 3,
        extensions: [
          `cs1=${cefExtensionValue(event.policyId)} cs1Label=PolicyId`,
          `cs2=${cefExtensionValue(event.sequence)} cs2Label=Sequence`,
        ],
      }
    case "alert.critical":
      return {
        signature: "arcana/alert/critical",
        name: "Critical security alert",
        severity: 10,
        extensions: [`cs1=${cefExtensionValue(event.alertId)} cs1Label=AlertId`],
      }
  }
}

export function toCef(
  event: AdminEvent,
  device: { vendor: string; product: string; version: string } = {
    vendor: "Arcana",
    product: "Arcana",
    version: "1.0",
  },
): string {
  const mapping = mapEventToCef(event)
  const header = [
    "CEF:0",
    escapeCef(device.vendor),
    escapeCef(device.product),
    escapeCef(device.version),
    escapeCef(mapping.signature),
    escapeCef(mapping.name),
    String(mapping.severity),
  ].join("|")
  const extensions = [
    `rt=${cefExtensionValue(event.at)}`,
    `dtenant=${cefExtensionValue(event.tenantId)}`,
    ...mapping.extensions,
  ].join(" ")
  return `${header}|${extensions}`
}

export function siemCef(events: readonly AdminEvent[]): string {
  return events.map((event) => toCef(event)).join("\n") + (events.length > 0 ? "\n" : "")
}
