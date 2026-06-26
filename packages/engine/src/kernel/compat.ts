// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { Schema } from "effect"
import type { ArcanaMigrationPhaseID } from "./migration"

export const CompatShimStatus = Schema.Literals(["active", "removable", "removed"])
export type CompatShimStatus = typeof CompatShimStatus.Type

export const CompatShim = Schema.Struct({
  id: Schema.String,
  description: Schema.String,
  bridges: Schema.Array(Schema.String),
  removal_signal: Schema.String,
  removal_phase: Schema.String,
  status: CompatShimStatus,
})
export type CompatShim = typeof CompatShim.Type

/** Runtime type for compat shim with literal migration phase. */
export interface CompatShimResolved {
  id: string
  description: string
  bridges: string[]
  removal_signal: string
  removal_phase: ArcanaMigrationPhaseID
  status: CompatShimStatus
}

/**
 * Registry of every OpenCode compatibility shim still present in the engine.
 * Each entry tracks what it wraps and what must happen before it can be
 * removed. The migration model gates contraction on this registry being
 * fully "removable" or "removed".
 */
export function compatShimRegistry(): CompatShimResolved[] {
  return [
    {
      id: "opencode-env-flag",
      description: "OPENCODE=1 env flag for legacy plugins and scripts",
      bridges: ["Plugins checking process.env.OPENCODE", "CI scripts using OPENCODE for detection"],
      removal_signal: "All known plugins/scripts migrated to ARCANA_ENGINE check",
      removal_phase: "contraction",
      status: "active",
    },
    {
      id: "opencode-config-file",
      description: "~/.config/arcana/opencode.jsonc and opencode.json config loading",
      bridges: ["User config files from old opencode install paths"],
      removal_signal: "Config migration tool shipped + deprecation notice in logs for >=2 releases",
      removal_phase: "contraction",
      status: "active",
    },
    {
      id: "opencode-sdk-client",
      description: "OpencodeClient type exposed to TUI plugins",
      bridges: ["Plugin API surface typing", "SDK consumer code"],
      removal_signal: "ArcanaClient alias + deprecation of OpencodeClient export",
      removal_phase: "compatibility_bridge",
      status: "active",
    },
    {
      id: "opencode-ai-plugin-compat",
      description: "@opencode-ai/plugin npm compat shim for TUI plugin format",
      bridges: ["Third-party TUI plugins published as @opencode-ai/plugin"],
      removal_signal: "Plugin registry supports @arcana/plugin; migration guide published",
      removal_phase: "contraction",
      status: "active",
    },
    {
      id: "opencode-service-tags",
      description: "@opencode/* Effect service tags still in use internally",
      bridges: ["Internal engine services registered under old tags"],
      removal_signal: "All service tags migrated to @arcana/* (Tier 3: .opencode dir, OPENCODE_ env)",
      removal_phase: "contraction",
      status: "active",
    },
    {
      id: "opencode-provider-gateway",
      description: "Provider and gateway code still referencing opencode-authored base URLs",
      bridges: ["Provider base URL defaults from opencode era"],
      removal_signal: "All provider base URLs sourced from models.dev or arcana config",
      removal_phase: "native_proof_and_api",
      status: "active",
    },
    {
      id: "opencode-tool-conventions",
      description: "Tool definitions following opencode naming/behavior conventions",
      bridges: ["Tool names, output formats, and lifecycle hooks from opencode"],
      removal_signal: "Tools conform to Arcana authority contracts (policy, risk, mutation, verifier)",
      removal_phase: "governed_mutation_enforced",
      status: "active",
    },
    {
      id: "opencode-session-format",
      description: "Session message and part schemas matching opencode V1 format",
      bridges: ["Session storage format", "Share/sync payloads"],
      removal_signal: "Session V2 schema with expand-contract migration path",
      removal_phase: "native_proof_and_api",
      status: "active",
    },
    {
      id: "opencode-tui-theme-keys",
      description: "TUI theme keys and branding still using opencode-era names",
      bridges: ["Theme JSON keys, CSS class names, branding constants"],
      removal_signal: "All theme keys use @arcana namespace; migration script for user configs",
      removal_phase: "contraction",
      status: "active",
    },
  ]
}

/**
 * Returns shims that still block advancement to a given migration phase.
 * A shim blocks if its removal_phase is <= the target phase and its status
 * is still "active".
 */
export function blockingShims(targetPhase: string, phases: ReadonlyArray<{ id: string }>): CompatShimResolved[] {
  const registry = compatShimRegistry()
  const phaseIndex = new Map(phases.map((p, i) => [p.id, i]))
  const targetIdx = phaseIndex.get(targetPhase)
  if (targetIdx === undefined) return []

  return registry.filter((shim) => {
    if (shim.status !== "active") return false
    const shimIdx = phaseIndex.get(shim.removal_phase)
    return shimIdx !== undefined && shimIdx <= targetIdx
  })
}

/**
 * Count of active shims — a contraction health metric.
 */
export function activeShimCount(): number {
  return compatShimRegistry().filter((s) => s.status === "active").length
}
