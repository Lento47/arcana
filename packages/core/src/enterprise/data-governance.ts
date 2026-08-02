/**
 * F10: Data governance and privacy.
 *
 * Classification, regional storage, customer-managed keys, PII retention,
 * export/deletion rules, and telemetry opt-out. Security decisions are
 * independent of metering; these rules constrain where data may live and how
 * long PII may be retained.
 */

export type DataClassification = "PUBLIC" | "INTERNAL" | "PRIVATE" | "SECRET" | "PII"

export type DataGovernancePolicy = {
  allowedRegions: string[]
  customerManagedKeys: boolean
  telemetryOptOut: boolean
  piiRetentionMs: number
}

export const DEFAULT_DATA_GOVERNANCE_POLICY: DataGovernancePolicy = {
  allowedRegions: ["US", "EU"],
  customerManagedKeys: false,
  telemetryOptOut: false,
  piiRetentionMs: 90 * 24 * 60 * 60 * 1000,
}

export type DataRecord = {
  id: string
  classification: DataClassification
  region: string
  createdAt: string
}

export type GovernanceCheck =
  | { allowed: true; reason: string }
  | { allowed: false; reason: string }

export function assertStorable(data: DataRecord, policy: DataGovernancePolicy): GovernanceCheck {
  if (!policy.allowedRegions.includes(data.region)) {
    return { allowed: false, reason: `region ${data.region} is not allowed by policy` }
  }
  if (data.classification === "SECRET" && !policy.customerManagedKeys) {
    return { allowed: false, reason: "SECRET data requires customer-managed keys" }
  }
  return { allowed: true, reason: "storable" }
}

export function assertExportable(
  classification: DataClassification,
  policy: DataGovernancePolicy,
): GovernanceCheck {
  if (classification === "PII" && policy.telemetryOptOut) {
    return { allowed: false, reason: "PII export blocked by telemetry opt-out policy" }
  }
  return { allowed: true, reason: "exportable" }
}

export function applyPiiRetention(
  records: readonly DataRecord[],
  policy: DataGovernancePolicy,
  now: Date,
): { retained: DataRecord[]; expired: string[] } {
  const retained: DataRecord[] = []
  const expired: string[] = []
  for (const record of records) {
    if (record.classification !== "PII") {
      retained.push(record)
      continue
    }
    const age = now.getTime() - new Date(record.createdAt).getTime()
    if (age > policy.piiRetentionMs) {
      expired.push(record.id)
    } else {
      retained.push(record)
    }
  }
  return { retained, expired }
}

export function classifyInput(input: { containsPii: boolean; sensitivity: "PUBLIC" | "INTERNAL" | "PRIVATE" | "SECRET" }): DataClassification {
  if (input.containsPii) return "PII"
  return input.sensitivity
}
