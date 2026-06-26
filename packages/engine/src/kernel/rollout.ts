// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { Schema } from "effect"

export const RolloutMode = Schema.Literals(["off", "observational", "shadow", "enforced"])
export type RolloutMode = typeof RolloutMode.Type

export const RolloutFlag = Schema.Struct({
  key: Schema.String,
  description: Schema.String,
  mode: RolloutMode,
  phase: Schema.String,
  since_commit: Schema.optional(Schema.String),
})
export type RolloutFlag = typeof RolloutFlag.Type

/**
 * Runtime feature flags for the kernel migration. Each flag controls
 * whether a kernel authority runs in observational, shadow, or enforced
 * mode. The migration phases gate when flags graduate.
 *
 * No flag is "on by default" — that's a forbidden escape hatch.
 */
export function kernelRolloutFlags(): RolloutFlag[] {
  return [
    {
      key: "kernel.actions.observational",
      description: "Create EngineAction records for every tool execution",
      mode: "observational",
      phase: "observability_foundation",
      since_commit: "d2272fe3",
    },
    {
      key: "kernel.security_context.enabled",
      description: "Attach SecurityContext to every EngineAction",
      mode: "observational",
      phase: "observability_foundation",
    },
    {
      key: "kernel.permission_risk_bridge",
      description: "Bridge kernel risk classification into permission asks",
      mode: "observational",
      phase: "compatibility_bridge",
    },
    {
      key: "kernel.diffgate.shadow",
      description: "Mirror write actions through mutation-shadow without enforcement",
      mode: "observational",
      phase: "governed_mutation_shadow",
    },
    {
      key: "kernel.diffgate.enforced",
      description: "Require mutation approval before file changes apply",
      mode: "off",
      phase: "governed_mutation_enforced",
    },
    {
      key: "kernel.verifier.passive",
      description: "Run verifier evidence collection without blocking completion",
      mode: "off",
      phase: "independent_verification",
    },
    {
      key: "kernel.verifier.required",
      description: "Block completion until verifier gates are satisfied",
      mode: "off",
      phase: "independent_verification",
    },
    {
      key: "proof.native_projection",
      description: "Project kernel events into RunProof evidence stream",
      mode: "off",
      phase: "native_proof_and_api",
    },
    {
      key: "ui.kernel_projection_only",
      description: "TUI renders from kernel projection state, not raw chat",
      mode: "off",
      phase: "native_proof_and_api",
    },
  ]
}

export function migrationPhaseFlags(): RolloutFlag[] {
  return [
    {
      key: "migration.baseline_pin.done",
      description: "Baseline fork point pinned; divergence measured",
      mode: "enforced",
      phase: "baseline_pin",
    },
    {
      key: "migration.observability_foundation.done",
      description: "Telemetry, spans, and action contracts operational",
      mode: "enforced",
      phase: "observability_foundation",
    },
    {
      key: "migration.compatibility_bridge.done",
      description: "Shim registry active; compat metrics decaying",
      mode: "enforced",
      phase: "compatibility_bridge",
    },
    {
      key: "migration.governed_mutation_shadow.active",
      description: "Mutation shadow adapter running alongside live writes",
      mode: "enforced",
      phase: "governed_mutation_shadow",
      since_commit: "5336fb4c",
    },
    {
      key: "migration.governed_mutation_enforced.planned",
      description: "DiffGate enforcement not yet active",
      mode: "off",
      phase: "governed_mutation_enforced",
    },
    {
      key: "migration.independent_verification.planned",
      description: "Verifier authority not yet blocking",
      mode: "off",
      phase: "independent_verification",
    },
    {
      key: "migration.native_proof_and_api.planned",
      description: "Native proof projection not yet active",
      mode: "off",
      phase: "native_proof_and_api",
    },
    {
      key: "migration.contraction.planned",
      description: "Compat shim removal not yet active",
      mode: "off",
      phase: "contraction",
    },
  ]
}

export function allRolloutFlags(): RolloutFlag[] {
  return [...kernelRolloutFlags(), ...migrationPhaseFlags()]
}

/**
 * Returns flags whose mode is not "off" — these are the active migration
 * surface. The count should increase as phases advance.
 */
export function activeRolloutFlags(): RolloutFlag[] {
  return allRolloutFlags().filter((f) => f.mode !== "off")
}

/**
 * Returns flags for a specific phase. Used by the migration readiness
 * report to check whether a phase's flags are all at the expected mode.
 */
export function flagsForPhase(phase: string): RolloutFlag[] {
  return allRolloutFlags().filter((f) => f.phase === phase)
}

/**
 * Checks whether all flags for a phase have graduated past "off".
 * A phase is "live" when every flag is at least observational.
 */
export function phaseIsLive(phase: string): boolean {
  const flags = flagsForPhase(phase)
  if (flags.length === 0) return false
  return flags.every((f) => f.mode !== "off")
}
