// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { providerProfile, tokenProviderProfiles, type ArcanaTokenProviderProfile } from "@/kernel"
import type { ArcanaCockpitProjection } from "./cockpit.projection-store"

export type CockpitSovereigntyCompatView = {
  readonly id: "sovereignty-compat"
  readonly step: 42
  readonly title: "Sovereignty / Compat"
  readonly provider: string
  readonly region: string
  readonly route: "gateway" | "direct" | "local" | "self_hosted" | "unknown"
  readonly usage_style: string
  readonly compat: string
  readonly compat_blocking_shims: number
  readonly rows: readonly string[]
  readonly empty: boolean
}

function providerRoute(profile: ArcanaTokenProviderProfile | undefined): CockpitSovereigntyCompatView["route"] {
  if (!profile) return "unknown"
  if (profile.region === "local") return "local"
  if (profile.region === "self_hosted") return "self_hosted"
  return profile.gateway ? "gateway" : "direct"
}

function inferProviderFromProjection(projection: ArcanaCockpitProjection): string | undefined {
  const modelAction = [...projection.actions].reverse().find((action) => action.kind === "model" || action.kind === "provider")
  if (modelAction?.name) return modelAction.name
  // Fallback: check the kernel's provider_route for a known provider prefix
  if (projection.kernel?.provider_route) {
    const route = projection.kernel.provider_route.toLowerCase()
    const knownProviders = ["openai", "anthropic", "google", "azure", "aws", "xai", "mistral", "cohere", "deepseek"]
    for (const name of knownProviders) {
      if (route.includes(name)) return name
    }
  }
  // Fallback: try to extract a model name from the objective for display
  if (projection.objective) {
    const knownModels = ["gpt-4", "gpt-3.5", "claude", "gemini", "llama", "mistral", "deepseek"]
    const match = knownModels.find((m) => projection.objective.toLowerCase().includes(m))
    if (match) return match
  }
  return undefined
}

export function sovereigntyCompatView(
  projection: ArcanaCockpitProjection,
  providerName = inferProviderFromProjection(projection),
): CockpitSovereigntyCompatView {
  const provider = providerName ? providerProfile(providerName) : undefined
  const profiles = tokenProviderProfiles()
  const compat = projection.compat
  const route = providerRoute(provider)
  const rows = [
    `provider ${provider?.provider ?? providerName ?? "unknown"}`,
    `region ${provider?.region ?? "unknown"}`,
    `route ${route}`,
    `usage ${provider?.usage_style ?? "unknown"}`,
    `families ${provider?.model_families.join(",") ?? "unknown"}`,
    `gateway ${String(provider?.gateway ?? false)}`,
    `local_capable ${String(provider?.local_capable ?? false)}`,
    `compat active=${compat?.active_shims ?? 0} blocking=${compat?.blocking_shims ?? 0} observed=${compat?.observed_hits ?? 0}`,
    `provider_profiles ${profiles.length}`,
  ]

  return {
    id: "sovereignty-compat",
    step: 42,
    title: "Sovereignty / Compat",
    provider: provider?.provider ?? providerName ?? "unknown",
    region: provider?.region ?? "unknown",
    route,
    usage_style: provider?.usage_style ?? "unknown",
    compat: compat ? `${compat.active_shims} active / ${compat.blocking_shims} blocking` : "no compat state",
    compat_blocking_shims: compat?.blocking_shims ?? 0,
    rows,
    empty: !provider && !compat,
  }
}

export function sovereigntyNeedsAttention(view: CockpitSovereigntyCompatView): boolean {
  const unknownRoute = view.route === "unknown" || view.region === "unknown"
  const compatBlocking = view.compat_blocking_shims > 0
  return unknownRoute || compatBlocking
}
