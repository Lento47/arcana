/**
 * Phase state machine for arcana agents.
 * Controls read-only (plan) vs full-access (build) vs per-ask (ask) modes.
 * Agents detect phase via env var and can request phase switches.
 */

export type AgentPhase = "plan" | "build" | "ask"

const WRITE_TOOLS = new Set(["write", "edit", "apply_patch", "delete", "rename"])

/** Detect current phase from environment. Defaults to "build". */
export function detectPhase(): AgentPhase {
  const phase = process.env.ARCANA_PHASE?.toLowerCase()
  if (phase === "plan" || phase === "build" || phase === "ask") return phase
  return "build"
}

export class PhaseGuard {
  private phase: AgentPhase

  constructor(phase?: AgentPhase) {
    this.phase = phase ?? detectPhase()
  }

  get current(): AgentPhase {
    return this.phase
  }

  /**
   * Check if a tool call is allowed in the current phase.
   * Returns null if allowed, or a reject message if denied.
   */
  check(toolName: string): string | null {
    if (this.phase === "build") return null
    if (this.phase === "plan" && WRITE_TOOLS.has(toolName)) {
      return `[phase-guard] Tool "${toolName}" denied in plan mode. Switch to build mode first.`
    }
    return null
  }

  /** Switch phase (with optional user confirmation). */
  switch(newPhase: AgentPhase): void {
    this.phase = newPhase
    process.env.ARCANA_PHASE = newPhase
  }
}
