import type { ToolSignal, TurnSignal } from "./types.js"

function bullet(label: string, value: string): string {
  return `- ${label}: ${value}`
}

export function formatTurnSignalForSystemPrompt(signal: TurnSignal): string {
  return [
    "<arcana-signal-engine>",
    bullet("intent", signal.intent),
    bullet("risk", signal.risk),
    bullet("execution_posture", signal.executionPosture),
    bullet("model_route", `${signal.modelRoute.profile} — ${signal.modelRoute.reason}`),
    bullet("needs", Object.entries(signal.needs).filter(([, enabled]) => enabled).map(([key]) => key).join(", ") || "none"),
    bullet("confidence", `${Math.round(signal.confidence.value * 100)}%`),
    bullet("labels", signal.labels.join(", ") || "none"),
    bullet("reasons", signal.reasons.join(" | ") || "none"),
    "</arcana-signal-engine>",
  ].join("\n")
}

export function formatToolSignalForAudit(signal: ToolSignal): string {
  return [
    `tool=${signal.toolName}`,
    `risk=${signal.risk}`,
    `posture=${signal.executionPosture}`,
    `confidence=${Math.round(signal.confidence.value * 100)}%`,
    `labels=${signal.labels.join(",") || "none"}`,
    `reasons=${signal.reasons.join(" | ") || "none"}`,
  ].join(" ")
}
