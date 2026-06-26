// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import type { ArcanaCockpitPanel, ArcanaCockpitProjection } from "./cockpit.projection-store"

export type ArcanaCockpitAreaID =
  | "mission-header"
  | "action-timeline"
  | "diffgate-queue"
  | "risk-cockpit"
  | "verifier-board"
  | "proof-ledger"
  | "token-console"
  | "sovereignty-compat"
  | "candidate-panel"
  | "rollback-panel"
  | "compat-panel"
  | "layout-panel"
  | "focus-panel"
  | "help-panel"

export type ArcanaCockpitAreaState = "empty" | "active" | "attention" | "danger" | "blocked"
export type ArcanaCockpitAreaColumn = "full" | "left" | "right"

export type ArcanaCockpitArea = {
  readonly id: ArcanaCockpitAreaID
  readonly step: 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27
  readonly panel: ArcanaCockpitPanel
  readonly title: string
  readonly column: ArcanaCockpitAreaColumn
  readonly order: number
  readonly state: ArcanaCockpitAreaState
  readonly summary: string
  readonly metric: string
}

export type ArcanaCockpitShellMode = "cockpit" | "focus" | "dense"

export type ArcanaCockpitShell = {
  readonly mode: ArcanaCockpitShellMode
  readonly run_id: string
  readonly objective: string
  readonly areas: readonly ArcanaCockpitArea[]
  readonly primary: ArcanaCockpitAreaID
  readonly focus: ArcanaCockpitPanel
}

function proofMetric(projection: ArcanaCockpitProjection): string {
  const value = projection.proof?.completeness ?? projection.kernel?.proof_completeness ?? 0
  return `${Math.round(value * 100)}% proof`
}

function missionState(projection: ArcanaCockpitProjection): ArcanaCockpitAreaState {
  if (projection.verifier?.completion_gate_passed === false) return "blocked"
  if (projection.kernel?.risk_band === "blocked") return "blocked"
  if (projection.kernel?.risk_band === "danger") return "danger"
  if (projection.kernel?.risk_band === "attention") return "attention"
  return projection.objective ? "active" : "empty"
}

function tokenState(projection: ArcanaCockpitProjection): ArcanaCockpitAreaState {
  const pressure = projection.tokens?.pressure ?? "calm"
  if (pressure === "blocked") return "blocked"
  if (pressure === "danger") return "danger"
  if (pressure === "attention") return "attention"
  return projection.tokens ? "active" : "empty"
}

function compatState(projection: ArcanaCockpitProjection): ArcanaCockpitAreaState {
  if (!projection.compat) return "empty"
  if (!projection.compat.ready_for_contraction && projection.compat.blocking_shims > 0) return "attention"
  return "active"
}

export function createCockpitAreas(projection: ArcanaCockpitProjection): readonly ArcanaCockpitArea[] {
  return [
    {
      id: "mission-header",
      step: 14,
      panel: "mission",
      title: "Mission Header",
      column: "full",
      order: 0,
      state: missionState(projection),
      summary: projection.objective || "No active objective",
      metric: `${projection.kernel?.risk_band ?? "unknown"} · ${proofMetric(projection)}`,
    },
    {
      id: "action-timeline",
      step: 15,
      panel: "actions",
      title: "Action Timeline",
      column: "left",
      order: 1,
      state: projection.actions.length > 0 ? "active" : "empty",
      summary: "EngineAction stream",
      metric: `${projection.actions.length} actions`,
    },
    {
      id: "diffgate-queue",
      step: 16,
      panel: "diffgate",
      title: "DiffGate Queue",
      column: "right",
      order: 2,
      state: projection.mutations.some((mutation) => mutation.risk === "critical")
        ? "blocked"
        : projection.mutations.some((mutation) => mutation.risk === "high")
          ? "danger"
          : projection.mutations.length > 0
            ? "active"
            : "empty",
      summary: "MutationAuthority lifecycle",
      metric: `${projection.mutations.length} mutations`,
    },
    {
      id: "risk-cockpit",
      step: 17,
      panel: "risk",
      title: "Risk Cockpit",
      column: "left",
      order: 3,
      state: missionState(projection),
      summary: "SecurityContext and permission risk",
      metric: projection.kernel?.risk_band ?? "unknown risk",
    },
    {
      id: "verifier-board",
      step: 18,
      panel: "verify",
      title: "Verifier Board",
      column: "right",
      order: 4,
      state: projection.verifier?.completion_gate_passed === false ? "blocked" : projection.verifier ? "active" : "empty",
      summary: "Verifier evidence and completion gates",
      metric: projection.verifier ? String(projection.verifier.run.verdict) : "no verdict",
    },
    {
      id: "proof-ledger",
      step: 19,
      panel: "proof",
      title: "Proof Ledger",
      column: "left",
      order: 5,
      state: projection.proof?.gaps.length ? "attention" : projection.proof ? "active" : "empty",
      summary: "RunProof events and gaps",
      metric: proofMetric(projection),
    },
    {
      id: "token-console",
      step: 20,
      panel: "tokens",
      title: "Token Console",
      column: "right",
      order: 6,
      state: tokenState(projection),
      summary: "Token ledger, budget, cache, and context pressure",
      metric: projection.tokens?.pressure ?? "no token state",
    },
    {
      id: "sovereignty-compat",
      step: 21,
      panel: "compat",
      title: "Sovereignty / Compat",
      column: "full",
      order: 7,
      state: compatState(projection),
      summary: "Provider route, local/cloud mode, and compat decay",
      metric: projection.compat ? `${projection.compat.active_shims} active shims` : "no compat state",
    },
    {
      id: "candidate-panel",
      step: 22,
      panel: "candidate",
      title: "Candidate",
      column: "right",
      order: 8,
      state: "empty",
      summary: "Candidate proposals",
      metric: "no data",
    },
    {
      id: "rollback-panel",
      step: 23,
      panel: "rollback",
      title: "Rollback",
      column: "right",
      order: 9,
      state: "empty",
      summary: "Rollback state",
      metric: "no data",
    },
    {
      id: "compat-panel",
      step: 24,
      panel: "compat",
      title: "Compat",
      column: "right",
      order: 10,
      state: "empty",
      summary: "Compatibility shims",
      metric: "no data",
    },
    {
      id: "layout-panel",
      step: 25,
      panel: "layout",
      title: "Layout",
      column: "right",
      order: 11,
      state: "empty",
      summary: "Cockpit layout",
      metric: "no data",
    },
    {
      id: "focus-panel",
      step: 26,
      panel: "focus",
      title: "Focus",
      column: "right",
      order: 12,
      state: "empty",
      summary: "Focus mode",
      metric: "no data",
    },
    {
      id: "help-panel",
      step: 27,
      panel: "help",
      title: "Help",
      column: "right",
      order: 13,
      state: "empty",
      summary: "Keyboard shortcuts and help",
      metric: "no data",
    },
  ]
}

export function createCockpitShell(projection: ArcanaCockpitProjection, mode: ArcanaCockpitShellMode = "cockpit"): ArcanaCockpitShell {
  return {
    mode,
    run_id: projection.run_id,
    objective: projection.objective,
    areas: createCockpitAreas(projection),
    primary: "mission-header",
    focus: projection.focus.panel,
  }
}

export function cockpitShellCoversSteps(shell: ArcanaCockpitShell): boolean {
  const steps = new Set(shell.areas.map((area) => area.step))
  return [14, 15, 16, 17, 18, 19, 20, 21].every((step) => steps.has(step as ArcanaCockpitArea["step"]))
}

export function cockpitShellIsArcanaNative(shell: ArcanaCockpitShell): boolean {
  const ids = shell.areas.map((area) => area.id)
  return ids.includes("mission-header") && ids.includes("proof-ledger") && ids.includes("sovereignty-compat")
}
