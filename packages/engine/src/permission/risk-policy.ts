import type { PermissionV1 } from "@arcana/core/v1/permission"
import type { RiskAssessment } from "@/execution"

type EnginePermissionMetadata = {
  engine_action?: {
    id?: string
    risk?: RiskAssessment
    policy?: { action?: string }
  }
}

export function riskFromMetadata(metadata: Record<string, unknown>): RiskAssessment | undefined {
  const risk = (metadata as EnginePermissionMetadata).engine_action?.risk
  if (!risk || typeof risk !== "object") return undefined
  if (!Array.isArray(risk.required_controls)) return undefined
  if (!Array.isArray(risk.reasons)) return undefined
  if (risk.level !== "low" && risk.level !== "medium" && risk.level !== "high" && risk.level !== "critical") return undefined
  return risk
}

export function riskRequiresInitialAsk(risk: RiskAssessment | undefined): boolean {
  if (!risk) return false
  if (risk.level === "high" || risk.level === "critical") return true
  return risk.required_controls.includes("approval") || risk.required_controls.includes("human_review")
}

export function riskRequiresFreshAsk(risk: RiskAssessment | undefined): boolean {
  if (!risk) return false
  if (risk.level === "high" || risk.level === "critical") return true
  return risk.required_controls.includes("human_review")
}

export function shouldAskAfterRisk(input: {
  configuredRule: PermissionV1.Rule
  approvedRule: PermissionV1.Rule
  risk?: RiskAssessment
}): boolean {
  if (input.configuredRule.action === "deny") return true
  if (input.approvedRule.action === "allow" && !riskRequiresFreshAsk(input.risk)) return false
  if (input.configuredRule.action === "allow" && !riskRequiresInitialAsk(input.risk)) return false
  return true
}
