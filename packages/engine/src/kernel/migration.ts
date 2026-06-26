// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

export const ARCANA_MIGRATION_QUALITY_DIMENSIONS = [
  "performance",
  "security",
  "ai_sovereignty",
  "ai_governance",
  "known_bug_freedom",
  "scalability",
  "technology_support",
] as const

export type ArcanaMigrationQualityDimension = (typeof ARCANA_MIGRATION_QUALITY_DIMENSIONS)[number]

export const ARCANA_MIGRATION_PHASES = [
  "baseline_pin",
  "observability_foundation",
  "compatibility_bridge",
  "governed_mutation_shadow",
  "governed_mutation_enforced",
  "independent_verification",
  "native_proof_and_api",
  "contraction",
] as const

export type ArcanaMigrationPhaseID = (typeof ARCANA_MIGRATION_PHASES)[number]

export type ArcanaMigrationRolloutMode = "off" | "shadow" | "canary" | "staged" | "default" | "contracted"

export type ArcanaMigrationGate = {
  readonly dimension: ArcanaMigrationQualityDimension
  readonly name: string
  readonly required: boolean
  readonly target: string
}

export type ArcanaCompatibilityShim = {
  readonly name: string
  readonly protects: string
  readonly removal_signal: string
  readonly owner: "api" | "tool" | "permission" | "proof" | "tui" | "config" | "provider" | "kernel"
}

export type ArcanaMigrationFlag = {
  readonly name: string
  readonly mode: ArcanaMigrationRolloutMode
  readonly removal_required: boolean
}

export type ArcanaMigrationPhase = {
  readonly id: ArcanaMigrationPhaseID
  readonly goal: string
  readonly rollout: ArcanaMigrationRolloutMode
  readonly flags: readonly ArcanaMigrationFlag[]
  readonly shims: readonly ArcanaCompatibilityShim[]
  readonly gates: readonly ArcanaMigrationGate[]
  readonly exit_criteria: readonly string[]
}

export type ArcanaMigrationReadinessInput = {
  readonly phase: ArcanaMigrationPhaseID
  readonly shim_hit_rate: number
  readonly replay_mismatches: number
  readonly proof_gaps: number
  readonly ungated_mutations: number
  readonly high_risk_verifier_coverage: number
  readonly rollback_drill_passed: boolean
  readonly blocking_bugs: number
  readonly p95_overhead_percent: number
}

export type ArcanaMigrationReadinessReport = {
  readonly phase: ArcanaMigrationPhaseID
  readonly ready: boolean
  readonly blockers: readonly string[]
}

function gate(
  dimension: ArcanaMigrationQualityDimension,
  name: string,
  target: string,
  required = true,
): ArcanaMigrationGate {
  return { dimension, name, target, required }
}

function flag(name: string, mode: ArcanaMigrationRolloutMode, removal_required = true): ArcanaMigrationFlag {
  return { name, mode, removal_required }
}

function shim(
  owner: ArcanaCompatibilityShim["owner"],
  name: string,
  protects: string,
  removal_signal: string,
): ArcanaCompatibilityShim {
  return { owner, name, protects, removal_signal }
}

export function nativeRuntimeMigrationPhases(): ArcanaMigrationPhase[] {
  return [
    {
      id: "baseline_pin",
      goal: "Pin the inherited runtime baseline and make every future divergence explicit.",
      rollout: "default",
      flags: [flag("api.v1.compat", "default", false)],
      shims: [shim("kernel", "BaselineAliasRegistry", "legacy IDs and external references", "baseline is documented and replay corpus is captured")],
      gates: [
        gate("security", "license-and-attribution-audit", "fork lineage, notices, and license obligations remain visible"),
        gate("ai_governance", "divergence-map", "every intentional break maps to an Arcana authority"),
        gate("known_bug_freedom", "golden-replay-corpus", "representative sessions are captured before migration behavior changes"),
      ],
      exit_criteria: [
        "Baseline commit is recorded.",
        "Compatibility policy is written.",
        "Replay corpus exists before enforcing new behavior.",
      ],
    },
    {
      id: "observability_foundation",
      goal: "Dual-write kernel events, action telemetry, and RunProof-compatible evidence without changing behavior.",
      rollout: "shadow",
      flags: [flag("kernel.actions.observational", "shadow"), flag("proof.compat.enabled", "shadow")],
      shims: [shim("proof", "RunProofCompatLayer", "legacy session/message/diff evidence", "native proof projection has zero sampled gaps")],
      gates: [
        gate("performance", "telemetry-overhead", "p95 runtime overhead stays within the configured migration budget"),
        gate("security", "secret-safe-telemetry", "telemetry never records secret values, credentials, or raw private payloads"),
        gate("ai_governance", "action-coverage", "tool, shell, model, file, and session operations produce action records"),
        gate("known_bug_freedom", "proof-replay", "RunProof compatibility export is deterministic on sampled sessions"),
        gate("scalability", "bounded-event-volume", "event volume is bounded and safe for long-horizon runs"),
      ],
      exit_criteria: [
        "Action/event coverage is at least 99.9% for sampled runs.",
        "Proof gaps are zero on the replay corpus.",
        "Telemetry overhead is inside the migration performance budget.",
      ],
    },
    {
      id: "compatibility_bridge",
      goal: "Route legacy APIs, permissions, tools, TUI actions, and config through Arcana-native adapters.",
      rollout: "canary",
      flags: [flag("kernel.policy.bridge", "canary"), flag("api.v1.compat", "default", false)],
      shims: [
        shim("api", "OpenApiV1Compat", "existing server clients and scripts", "v1 shim hit rate stays below removal threshold"),
        shim("permission", "PermissionCompatAdapter", "allow/ask/deny permission behavior", "policy decision coverage reaches 100%"),
        shim("tool", "LegacyToolFacade", "built-in and custom tool calls", "all tools emit EngineAction envelopes"),
        shim("config", "ConfigMigrator", "legacy config keys and provider aliases", "migrate check reports no blocking config gaps"),
      ],
      gates: [
        gate("performance", "adapter-latency-budget", "compatibility adapters add no visible latency regression"),
        gate("security", "reserved-authority-guard", "reserved kernel authority surfaces cannot be shadowed by custom tools"),
        gate("ai_sovereignty", "provider-alias-continuity", "existing provider/model IDs remain usable while native provider registry is introduced"),
        gate("ai_governance", "policy-decision-coverage", "every privileged action records a policy decision"),
        gate("technology_support", "v1-v2-contract-split", "compatibility and native contracts can coexist"),
      ],
      exit_criteria: [
        "No behavior delta on replay corpus.",
        "All privileged operations pass through policy bridge.",
        "Compatibility shim usage is measured per shim.",
      ],
    },
    {
      id: "governed_mutation_shadow",
      goal: "Introduce DiffGate proposals for all write paths without enforcing them yet.",
      rollout: "shadow",
      flags: [flag("kernel.diffgate.shadow", "shadow"), flag("kernel.diffgate.enforced", "off")],
      shims: [shim("tool", "PatchProposalAdapter", "write/edit/apply_patch behavior", "proposal/apply reconciliation is perfect")],
      gates: [
        gate("performance", "diff-capture-budget", "diff proposal creation stays inside p95 latency budget"),
        gate("security", "no-secret-diff-leakage", "diff artifacts redact secrets and credentials"),
        gate("ai_governance", "mutation-ledger-coverage", "every file mutation has a mutation proposal ID"),
        gate("known_bug_freedom", "mutation-reconcile", "proposal, apply, and filesystem state reconcile with zero mismatch"),
        gate("scalability", "large-diff-handling", "large patches degrade gracefully and remain auditable"),
      ],
      exit_criteria: [
        "Ungated mutation count is zero in shadow accounting.",
        "Rollback catalog is available for sampled mutations.",
        "Mutation proposal/apply counts reconcile exactly.",
      ],
    },
    {
      id: "governed_mutation_enforced",
      goal: "Make DiffGate the owner of file mutation for write/edit/apply_patch paths.",
      rollout: "staged",
      flags: [flag("kernel.diffgate.shadow", "default"), flag("kernel.diffgate.enforced", "staged")],
      shims: [shim("tool", "DiffGateCompat", "legacy write semantics", "no legacy write path remains in Arcana mode")],
      gates: [
        gate("performance", "apply-latency-budget", "approved mutation apply remains inside p95 latency budget"),
        gate("security", "checkpoint-before-apply", "mutations requiring checkpoint cannot apply without checkpoint evidence"),
        gate("ai_governance", "approval-before-apply", "approval-required mutations cannot apply from proposed state"),
        gate("known_bug_freedom", "rollback-drill", "canary rollback drill passes before staged rollout"),
        gate("scalability", "concurrent-mutation-safety", "parallel runs cannot corrupt mutation state"),
      ],
      exit_criteria: [
        "No file mutation can bypass mutation authority in Arcana mode.",
        "Canary rollback drill passes.",
        "Blocking bugs are zero before default rollout.",
      ],
    },
    {
      id: "independent_verification",
      goal: "Make verifier evidence the completion authority for high-risk work.",
      rollout: "staged",
      flags: [flag("kernel.verifier.passive", "default"), flag("kernel.verifier.required", "staged")],
      shims: [shim("proof", "VerifierCompat", "legacy completion summaries", "high-risk completion has verifier coverage")],
      gates: [
        gate("performance", "verifier-budget", "verifier pass stays inside configured latency and token budgets"),
        gate("security", "verifier-redteam", "verifier bypass and reward-hacking tests pass"),
        gate("ai_governance", "completion-authority", "high-risk runs cannot finalize without verifier result or explicit human override"),
        gate("known_bug_freedom", "false-pass-suite", "seeded fault suite stays below false-pass target"),
        gate("ai_sovereignty", "model-independent-verifier", "verifier can use a different model/provider from the builder"),
      ],
      exit_criteria: [
        "High-risk verifier coverage reaches 100% in canary.",
        "False-pass and false-block metrics are within target.",
        "Human override path is auditable in RunProof.",
      ],
    },
    {
      id: "native_proof_and_api",
      goal: "Default new runs to native RunProof and expose Arcana kernel APIs as the primary contract.",
      rollout: "default",
      flags: [flag("proof.native.enabled", "default"), flag("ui.kernel_projection_only", "canary")],
      shims: [shim("api", "KernelV2Api", "native integrations", "v2 contract tests pass and v1 shim usage trends down")],
      gates: [
        gate("performance", "proof-export-budget", "native proof export remains fast for long-horizon runs"),
        gate("security", "local-first-proof", "proof export is local-first and remote publication is explicit"),
        gate("ai_sovereignty", "multi-provider-routing", "provider registry supports local, cloud, gateway, and enterprise routes"),
        gate("ai_governance", "runproof-completeness", "RunProof contains actions, policy, mutation, verifier, rollback, and limitations"),
        gate("technology_support", "native-api-contract", "native kernel APIs have stable versioned contracts"),
      ],
      exit_criteria: [
        "Native proof is default for new runs.",
        "Kernel API contract tests pass.",
        "TUI can be reconstructed from kernel projection for sampled sessions.",
      ],
    },
    {
      id: "contraction",
      goal: "Remove obsolete legacy write paths and time-boxed compatibility shims only after measured safety.",
      rollout: "contracted",
      flags: [flag("api.v1.compat", "contracted", false)],
      shims: [],
      gates: [
        gate("performance", "post-contraction-baseline", "removing shims does not regress steady-state runtime performance"),
        gate("security", "no-legacy-bypass", "removed shims leave no bypassable legacy authority paths"),
        gate("ai_governance", "major-version-boundary", "breaking removals are documented and versioned"),
        gate("known_bug_freedom", "zero-blocking-bugs", "no known blocking bugs remain at contraction time"),
        gate("scalability", "production-rollout-readiness", "rollout and rollback targets are met under canary load"),
      ],
      exit_criteria: [
        "Shim hit rate remains below threshold for the required window.",
        "Replay mismatches are zero.",
        "Proof gaps are zero.",
        "Rollback drill passes.",
        "Major version migration notes exist.",
      ],
    },
  ]
}

export function phaseByID(id: ArcanaMigrationPhaseID): ArcanaMigrationPhase {
  const phase = nativeRuntimeMigrationPhases().find((candidate) => candidate.id === id)
  if (!phase) throw new Error(`Unknown Arcana migration phase: ${id}`)
  return phase
}

export function qualityDimensionsCoveredByPhase(id: ArcanaMigrationPhaseID): Set<ArcanaMigrationQualityDimension> {
  return new Set(phaseByID(id).gates.map((gate) => gate.dimension))
}

export function migrationPlanCoversAllRequiredDimensions(): boolean {
  const covered = new Set(nativeRuntimeMigrationPhases().flatMap((phase) => phase.gates.map((gate) => gate.dimension)))
  return ARCANA_MIGRATION_QUALITY_DIMENSIONS.every((dimension) => covered.has(dimension))
}

export function phaseHasGovernedRollout(id: ArcanaMigrationPhaseID): boolean {
  const phase = phaseByID(id)
  return phase.flags.length > 0 || phase.rollout === "contracted"
}

export function assessMigrationReadiness(input: ArcanaMigrationReadinessInput): ArcanaMigrationReadinessReport {
  const blockers: string[] = []

  if (input.blocking_bugs > 0) blockers.push("blocking bugs must be zero before advancing")
  if (input.proof_gaps > 0) blockers.push("RunProof gaps must be zero before advancing")
  if (input.replay_mismatches > 0) blockers.push("replay mismatches must be zero before advancing")
  if (input.p95_overhead_percent > 10) blockers.push("p95 migration overhead exceeds 10% budget")

  if (input.phase === "governed_mutation_shadow" && input.ungated_mutations > 0) {
    blockers.push("shadow accounting still sees ungated mutations")
  }

  if (input.phase === "governed_mutation_enforced") {
    if (input.ungated_mutations > 0) blockers.push("enforced mutation phase still has ungated writes")
    if (!input.rollback_drill_passed) blockers.push("rollback drill must pass before enforced mutation rollout")
  }

  if (input.phase === "independent_verification" && input.high_risk_verifier_coverage < 1) {
    blockers.push("high-risk verifier coverage must reach 100%")
  }

  if (input.phase === "contraction") {
    if (input.shim_hit_rate > 0.01) blockers.push("compatibility shim hit rate must be below 1% before contraction")
    if (!input.rollback_drill_passed) blockers.push("rollback drill must pass before contraction")
    if (input.high_risk_verifier_coverage < 1) blockers.push("high-risk verifier coverage must remain 100% before contraction")
  }

  return { phase: input.phase, ready: blockers.length === 0, blockers }
}
