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

  // Check freshness: mark as stale if last update is older than 30 seconds
  const stale = projection.updated_at && now
    ? (new Date(now).getTime() - new Date(projection.updated_at).getTime()) > 30000
    : false

  return {
    cockpit_summary: stale
      ? `${mission} | ${riskBand} | proof ${proofPct}% (stale)`
      : `${mission} | ${riskBand} | proof ${proofPct}%`,
    kernel_projection: {
      risk_band: riskBand,
      mutation_count: projection.mutations.length,
      proof_completeness: projection.proof?.completeness ?? 0,
    },
  }
}
