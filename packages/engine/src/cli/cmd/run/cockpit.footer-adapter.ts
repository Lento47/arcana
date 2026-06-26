// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import type { ArcanaCockpitProjection } from "./cockpit.projection-store"
import { createCockpitShell } from "./cockpit.shell"
import { cockpitMissionLine } from "./cockpit.shell-text"
import type { FooterPatch } from "./types"

/**
 * Bridge: projection store → cockpit shell → text → FooterPatch.
 *
 * Call this from the stream transport or runtime when the projection
 * store updates. Produces a FooterPatch with cockpit_summary that the
 * statusbar renders without touching footer.view.tsx.
 */
export function cockpitFooterPatch(
  projection: ArcanaCockpitProjection,
  now?: string,
): FooterPatch {
  const shell = createCockpitShell(projection)
  const mission = cockpitMissionLine(shell, 80)

  const riskBand = projection.kernel?.risk_band ?? "calm"
  const proofPct = Math.round((projection.proof?.completeness ?? 0) * 100)
  const ctx = projection.tokens

  // Context pack: show pressure when estimated tokens approach budget
  const ctxPressure =
    ctx?.context_estimated_tokens && ctx.context_budget_tokens
      ? ctx.context_estimated_tokens > ctx.context_budget_tokens
        ? "CTX⚠"
        : `CTX ${Math.round((ctx.context_estimated_tokens / ctx.context_budget_tokens) * 100)}%`
      : ""

  // Pipeline: show current stage if active
  const pipelineStage = projection.pipeline_plan ? "▶plan" : ""

  const parts = [
    mission,
    pipelineStage,
    ctxPressure,
    riskBand,
    `proof ${proofPct}%`,
  ].filter(Boolean)

  const stale = projection.updated_at && now
    ? (new Date(now).getTime() - new Date(projection.updated_at).getTime()) > 30000
    : false

  return {
    cockpit_summary: (stale ? parts.join(" | ") + " (stale)" : parts.join(" | ")),
    kernel_projection: {
      risk_band: riskBand,
      mutation_count: projection.mutations.length,
      proof_completeness: projection.proof?.completeness ?? 0,
    },
  }
}
