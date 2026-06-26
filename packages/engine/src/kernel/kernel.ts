// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { Schema } from "effect"

export const ArcanaRuntimeSurface = Schema.Literals(["cli", "tui", "server", "worker", "test"])
export type ArcanaRuntimeSurface = typeof ArcanaRuntimeSurface.Type

export const ArcanaAuthority = Schema.Literals([
  "intent",
  "plan",
  "policy",
  "risk",
  "permission",
  "mutation",
  "verification",
  "rollback",
  "proof",
])
export type ArcanaAuthority = typeof ArcanaAuthority.Type

export const ArcanaRuntimeIdentity = Schema.Struct({
  product: Schema.Literals(["arcana"]),
  runtime: Schema.Literals(["engine"]),
  surface: ArcanaRuntimeSurface,
  pid: Schema.optional(Schema.String),
  compatibility: Schema.Struct({
    opencode_env: Schema.Boolean,
  }),
})
export type ArcanaRuntimeIdentity = typeof ArcanaRuntimeIdentity.Type

export const ArcanaAuthorityBoundary = Schema.Struct({
  authority: ArcanaAuthority,
  owner: Schema.String,
  purpose: Schema.String,
  may_mutate: Schema.Boolean,
  must_emit_evidence: Schema.Boolean,
})
export type ArcanaAuthorityBoundary = typeof ArcanaAuthorityBoundary.Type

export const ArcanaKernelContract = Schema.Struct({
  identity: ArcanaRuntimeIdentity,
  authorities: Schema.Array(ArcanaAuthorityBoundary),
})
export type ArcanaKernelContract = typeof ArcanaKernelContract.Type

export function currentRuntimeIdentity(surface: ArcanaRuntimeSurface): ArcanaRuntimeIdentity {
  return {
    product: "arcana",
    runtime: "engine",
    surface,
    pid: process.env.ARCANA_PID,
    compatibility: {
      opencode_env: process.env.OPENCODE === "1",
    },
  }
}

export function defaultAuthorityBoundaries(): ArcanaAuthorityBoundary[] {
  return [
    {
      authority: "intent",
      owner: "cli-or-tui",
      purpose: "Capture user intent without claiming execution authority.",
      may_mutate: false,
      must_emit_evidence: true,
    },
    {
      authority: "plan",
      owner: "pipeline-planner",
      purpose: "Convert intent into executable stages and acceptance criteria.",
      may_mutate: false,
      must_emit_evidence: true,
    },
    {
      authority: "policy",
      owner: "permission-service",
      purpose: "Decide allow, deny, ask, sandbox, verifier, or diff-gate requirements.",
      may_mutate: false,
      must_emit_evidence: true,
    },
    {
      authority: "risk",
      owner: "risk-engine",
      purpose: "Classify action risk from command, file, network, dependency, and security context.",
      may_mutate: false,
      must_emit_evidence: true,
    },
    {
      authority: "permission",
      owner: "approval-service",
      purpose: "Ask humans or enforce saved approvals without silently bypassing risk controls.",
      may_mutate: false,
      must_emit_evidence: true,
    },
    {
      authority: "mutation",
      owner: "diff-gate",
      purpose: "Own proposed, approved, applied, rejected, and rolled-back mutations.",
      may_mutate: true,
      must_emit_evidence: true,
    },
    {
      authority: "verification",
      owner: "verifier",
      purpose: "Judge completion against tests, checks, evidence, and known limitations.",
      may_mutate: false,
      must_emit_evidence: true,
    },
    {
      authority: "rollback",
      owner: "checkpoint-manager",
      purpose: "Create and apply rollback records for applied mutations.",
      may_mutate: true,
      must_emit_evidence: true,
    },
    {
      authority: "proof",
      owner: "runproof-projector",
      purpose: "Project engine events into portable evidence packages.",
      may_mutate: false,
      must_emit_evidence: true,
    },
  ]
}

export function createKernelContract(surface: ArcanaRuntimeSurface): ArcanaKernelContract {
  return {
    identity: currentRuntimeIdentity(surface),
    authorities: defaultAuthorityBoundaries(),
  }
}

export * as ArcanaKernel from "./kernel"
