import type { PermissionV1 } from "@arcana/core/v1/permission"
import type { RiskAssessment } from "@/execution"
import type { ArcanaSecurityContext } from "@/kernel/security-context"
import { securityContextRequiresHumanReview, securityContextBlocksAutoApply } from "@/kernel/security-context"

type EnginePermissionMetadata = {
  engine_action?: {
    id?: string
    risk?: RiskAssessment
    security_context?: ArcanaSecurityContext
    policy?: { action?: string }
  }
}

/**
 * Extract a compat RiskAssessment from metadata. Prefers kernel
 * SecurityContext over legacy RiskAssessment when both are present.
 */
export function riskFromMetadata(metadata: Record<string, unknown>): RiskAssessment | undefined {
  const action = (metadata as EnginePermissionMetadata).engine_action
  if (!action) return undefined

  // Kernel path: ArcanaSecurityContext → RiskAssessment
  if (action.security_context) {
    return securityContextToRiskAssessment(action.security_context)
  }

  // Legacy path: RiskAssessment directly
  const risk = action.risk
  if (!risk || typeof risk !== "object") return undefined
  if (!Array.isArray(risk.required_controls)) return undefined
  if (!Array.isArray(risk.reasons)) return undefined
  if (risk.level !== "low" && risk.level !== "medium" && risk.level !== "high" && risk.level !== "critical") return undefined
  return risk
}

/**
 * Convert kernel SecurityContext into the permission bridge's RiskAssessment shape.
 * This is the explicit bridge — no more "compatibility shape" guessing.
 */
function securityContextToRiskAssessment(ctx: ArcanaSecurityContext): RiskAssessment {
  return {
    level: ctx.risk,
    required_controls: [...ctx.required_controls] as any,
    reasons: [...ctx.reasons],
  }
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

/**
 * Direct kernel SecurityContext checks — no RiskAssessment intermediary.
 * Consumers that have the full context should use these instead.
 */
export function kernelContextRequiresApproval(ctx: ArcanaSecurityContext): boolean {
  return securityContextBlocksAutoApply(ctx)
}

export function kernelContextRequiresHuman(ctx: ArcanaSecurityContext): boolean {
  return securityContextRequiresHumanReview(ctx)
}

