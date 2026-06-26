// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

export type ArcanaCockpitCommandTemplate = {
  readonly name: string
  readonly description: string
  readonly template: string
}

export function arcanaCockpitCommandTemplates(): ArcanaCockpitCommandTemplate[] {
  return [
    {
      name: "mission",
      description: "show Arcana mission cockpit state",
      template: "Inspect the Arcana mission cockpit: objective, pipeline, risk, proof completeness, rollback readiness, and token pressure. Do not mutate files.",
    },
    {
      name: "actions",
      description: "show EngineAction timeline",
      template: "Inspect the Arcana EngineAction timeline for this run: tool, model, shell, MCP, file, network, and provider actions. Do not mutate files.",
    },
    {
      name: "risk",
      description: "show SecurityContext and permission risk",
      template: "Inspect the Arcana SecurityContext state: assets, trust boundaries, required controls, permission risk, and blockers. Do not mutate files.",
    },
    {
      name: "diffgate",
      description: "show DiffGate mutation queue",
      template: "Inspect the Arcana DiffGate mutation queue: proposed, approved, applied, verified, rejected, reverted, and failed mutations. Do not mutate files.",
    },
    {
      name: "verify",
      description: "show verifier board and completion gates",
      template: "Inspect Arcana verifier state: verdicts, required checks, evidence, failures, limitations, and completion gates. Do not mutate files.",
    },
    {
      name: "proof",
      description: "show RunProof ledger and gaps",
      template: "Inspect Arcana RunProof projection: evidence events, completeness, gaps, receipts, limitations, and audit state. Do not mutate files.",
    },
    {
      name: "tokens",
      description: "show token ledger, budget, and context pressure",
      template: "Inspect Arcana token state: estimates, actuals, reconciliation, budget admission, cache usage, context pressure, and provider accounting. Do not mutate files.",
    },
    {
      name: "candidate",
      description: "show CandidateSet scoring",
      template: "Inspect Arcana candidate state: generated candidates, scoring, evidence, rejection reasons, and selected candidate. Do not mutate files.",
    },
    {
      name: "rollback",
      description: "show rollback and checkpoint readiness",
      template: "Inspect Arcana rollback state: checkpoints, mutation reversibility, rollback readiness, and recovery gaps. Do not mutate files.",
    },
    {
      name: "sovereignty",
      description: "show provider route and AI sovereignty state",
      template: "Inspect Arcana AI sovereignty state: provider, model family, region, gateway/local route, and opaque provider state. Do not mutate files.",
    },
    {
      name: "compat",
      description: "show compatibility shim health",
      template: "Inspect Arcana compatibility state: active shims, observed hits, blockers, removal signals, and contraction readiness. Do not mutate files.",
    },
    {
      name: "layout",
      description: "show cockpit layout modes",
      template: "Inspect Arcana cockpit layout state and available layout modes: mission, focus, dense, split, and proof cockpit. Do not mutate files.",
    },
    {
      name: "focus",
      description: "show cockpit focus and keyboard state",
      template: "Inspect Arcana cockpit focus state: focused panel, selected index, keyboard navigation, and accessibility gaps. Do not mutate files.",
    },
    {
      name: "help",
      description: "show Arcana cockpit command help",
      template: "Explain the Arcana cockpit commands and keyboard model using the current runtime state. Do not mutate files.",
    },
  ]
}
