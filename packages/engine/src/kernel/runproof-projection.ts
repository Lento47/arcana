// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

export type ArcanaRunProofEventKind =
  | "pipeline"
  | "action"
  | "security"
  | "candidate_set"
  | "mutation"
  | "verification"
  | "rollback"
  | "compat"
  | "limitation"

export type ArcanaRunProofEvent = {
  readonly id: string
  readonly kind: ArcanaRunProofEventKind
  readonly summary: string
  readonly at: string
  readonly reference_id?: string
}

export type ArcanaRunProofProjection = {
  readonly run_id: string
  readonly objective: string
  readonly events: readonly ArcanaRunProofEvent[]
  readonly completeness: number
  readonly gaps: readonly string[]
}

export function createRunProofEvent(input: Omit<ArcanaRunProofEvent, "id" | "at"> & { id?: string; at?: string }): ArcanaRunProofEvent {
  return {
    id: input.id ?? `rpe_${input.kind}_${crypto.randomUUID()}`,
    kind: input.kind,
    summary: input.summary,
    at: input.at ?? new Date().toISOString(),
    reference_id: input.reference_id,
  }
}

export function runProofGaps(events: readonly ArcanaRunProofEvent[]): string[] {
  const kinds = new Set(events.map((event) => event.kind))
  const gaps: string[] = []

  if (!kinds.has("pipeline")) gaps.push("missing pipeline evidence")
  if (!kinds.has("action")) gaps.push("missing action evidence")
  if (!kinds.has("security")) gaps.push("missing security evidence")
  if (!kinds.has("verification")) gaps.push("missing verifier evidence")
  if (kinds.has("mutation") && !kinds.has("rollback")) gaps.push("mutation has no rollback evidence")

  return gaps
}

export function runProofCompleteness(events: readonly ArcanaRunProofEvent[], gaps: readonly string[]): number {
  if (events.length === 0) return 0
  const coverage = Math.min(1, events.length / 6)
  const penalty = Math.min(1, gaps.length * 0.15)
  return Number(Math.max(0, coverage - penalty).toFixed(2))
}

export function createRunProofProjection(input: {
  readonly run_id: string
  readonly objective: string
  readonly events: readonly ArcanaRunProofEvent[]
}): ArcanaRunProofProjection {
  const gaps = runProofGaps(input.events)
  return {
    run_id: input.run_id,
    objective: input.objective,
    events: input.events,
    gaps,
    completeness: runProofCompleteness(input.events, gaps),
  }
}

export function runProofIsComplete(projection: ArcanaRunProofProjection): boolean {
  return projection.gaps.length === 0 && projection.completeness >= 1
}
