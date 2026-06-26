// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import type { RunCommand } from "./types"

export const ARCANA_COCKPIT_COMMANDS = [
  "mission",
  "actions",
  "risk",
  "diffgate",
  "verify",
  "proof",
  "tokens",
  "candidate",
  "rollback",
  "sovereignty",
  "compat",
  "layout",
  "focus",
  "help",
] as const

export type ArcanaCockpitCommand = (typeof ARCANA_COCKPIT_COMMANDS)[number]

export type ArcanaCockpitCommandEntry = {
  readonly name: ArcanaCockpitCommand
  readonly display: string
  readonly description: string
  readonly authority: string
  readonly keywords: string
}

export type ArcanaCommandCoverage = {
  readonly required: readonly ArcanaCockpitCommand[]
  readonly reflected: readonly string[]
  readonly missing: readonly ArcanaCockpitCommand[]
  readonly complete: boolean
}

export function arcanaCockpitCommandEntries(): ArcanaCockpitCommandEntry[] {
  return [
    { name: "mission", display: "Mission cockpit", authority: "kernel", description: "Show objective, pipeline, risk, proof, rollback, and token state.", keywords: "mission objective pipeline cockpit" },
    { name: "actions", display: "Action timeline", authority: "EngineAction", description: "Inspect model, tool, shell, MCP, network, and file actions.", keywords: "actions timeline tool shell mcp network engine action" },
    { name: "risk", display: "Risk cockpit", authority: "SecurityContext", description: "Show assets, trust boundaries, controls, and permission risk.", keywords: "risk security context permission assets controls" },
    { name: "diffgate", display: "DiffGate queue", authority: "MutationAuthority", description: "Show proposed, approved, applied, verified, rejected, and reverted mutations.", keywords: "diffgate mutation write edit apply patch approval" },
    { name: "verify", display: "Verifier board", authority: "VerifierAuthority", description: "Show verifier verdicts, evidence, limitations, and completion gates.", keywords: "verify verifier evidence done completion limitations" },
    { name: "proof", display: "Proof ledger", authority: "RunProof", description: "Show RunProof events, gaps, receipts, and completeness.", keywords: "proof runproof ledger event receipt completeness" },
    { name: "tokens", display: "Token console", authority: "TokenKernel", description: "Show token estimate, actuals, cache, budget, context pressure, and provider usage.", keywords: "tokens budget context cache usage cost ledger" },
    { name: "candidate", display: "Candidate board", authority: "CandidateSet", description: "Compare generated candidates, scores, rejection reasons, and selection policy.", keywords: "candidate candidates scoring selection alternatives" },
    { name: "rollback", display: "Rollback panel", authority: "Rollback", description: "Show checkpoint, revert, recovery, and rollback readiness.", keywords: "rollback checkpoint revert restore recovery" },
    { name: "sovereignty", display: "Sovereignty panel", authority: "ProviderRegistry", description: "Show provider route, region, local/cloud mode, gateway, and model family.", keywords: "sovereignty provider model route local cloud region gateway" },
    { name: "compat", display: "Compatibility meter", authority: "CompatRegistry", description: "Show compatibility shims, blockers, observations, and contraction readiness.", keywords: "compat compatibility shim blockers contraction migration" },
    { name: "layout", display: "Cockpit layout", authority: "TUIProjection", description: "Switch between dense, focus, split, and cockpit layouts.", keywords: "layout cockpit dense focus split" },
    { name: "focus", display: "Focus mode", authority: "TUIFocus", description: "Move keyboard focus across cockpit panels.", keywords: "focus keyboard panel navigation accessibility" },
    { name: "help", display: "Arcana help", authority: "CommandReflection", description: "Show Arcana cockpit commands and keyboard model.", keywords: "help commands keyboard arcana cockpit" },
  ]
}

export function auditCockpitCommandCoverage(commands: readonly Pick<RunCommand, "name">[] | undefined): ArcanaCommandCoverage {
  const reflected = new Set([...(commands ?? []).map((command) => command.name), ...arcanaCockpitCommandEntries().map((command) => command.name)])
  const missing = ARCANA_COCKPIT_COMMANDS.filter((command) => !reflected.has(command))
  return {
    required: ARCANA_COCKPIT_COMMANDS,
    reflected: [...reflected].sort(),
    missing,
    complete: missing.length === 0,
  }
}
