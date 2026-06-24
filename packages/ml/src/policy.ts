import type { ExecutionPosture, ToolSignal, TurnSignal } from "./types.js"

export type PolicyAction = "allow" | "use_sandbox" | "ask_approval" | "escalate"

export type PolicyDecision = {
  action: PolicyAction
  posture: ExecutionPosture
  confidence: number
  reasons: string[]
}

function decision(action: PolicyAction, posture: ExecutionPosture, confidence: number, reasons: string[]): PolicyDecision {
  return {
    action,
    posture,
    confidence: Math.max(0, Math.min(1, Number(confidence.toFixed(2)))),
    reasons,
  }
}

export function decideTurnPolicy(signal: TurnSignal): PolicyDecision {
  const reasons = [...signal.reasons]
  if (signal.needs.approval || signal.executionPosture === "approval") {
    return decision("ask_approval", signal.executionPosture, signal.confidence.value, [
      ...reasons,
      "Turn signal requires explicit user approval before acting.",
    ])
  }
  if (signal.needs.sandbox || signal.executionPosture === "sandbox") {
    return decision("use_sandbox", signal.executionPosture, signal.confidence.value, [
      ...reasons,
      "Turn signal recommends sandboxed execution.",
    ])
  }
  if (signal.risk === "high") {
    return decision("escalate", signal.executionPosture, signal.confidence.value, [
      ...reasons,
      "High-risk turn should be routed through a stricter workflow.",
    ])
  }
  return decision("allow", signal.executionPosture, signal.confidence.value, reasons.length ? reasons : ["No policy escalation needed."])
}

export function decideToolPolicy(signal: ToolSignal): PolicyDecision {
  const reasons = [...signal.reasons]
  if (signal.executionPosture === "approval") {
    return decision("ask_approval", signal.executionPosture, signal.confidence.value, [
      ...reasons,
      "Tool signal requires explicit user approval before execution.",
    ])
  }
  if (signal.executionPosture === "sandbox") {
    return decision("use_sandbox", signal.executionPosture, signal.confidence.value, [
      ...reasons,
      "Tool signal should execute inside a sandboxed posture.",
    ])
  }
  if (signal.risk === "high") {
    return decision("escalate", signal.executionPosture, signal.confidence.value, [
      ...reasons,
      "High-risk tool signal should be reviewed by a stricter policy layer.",
    ])
  }
  return decision("allow", signal.executionPosture, signal.confidence.value, reasons.length ? reasons : ["Tool is within normal execution posture."])
}

export function formatPolicyDecision(decision: PolicyDecision): string {
  return [
    `action=${decision.action}`,
    `posture=${decision.posture}`,
    `confidence=${Math.round(decision.confidence * 100)}%`,
    `reasons=${decision.reasons.join(" | ") || "none"}`,
  ].join(" ")
}
