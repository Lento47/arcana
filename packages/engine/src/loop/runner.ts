/**
 * Loop runner — starts an autonomous research loop using Arcana's cockpit.
 *
 * The cockpit projection store already handles:
 * - Objective contracts (AgentContract)
 * - Mutation proposals (candidates)
 * - Verifier records (verification gates)
 * - Token budget admission/reconciliation
 * - Run proof (completion certificates)
 * - Governance actions (permission, mutation, rollback, verifier rerun)
 *
 * This runner orchestrates the high-level loop: load contract,
 * spawn search lanes as subagents, subscribe to cockpit events,
 * emit TUI spine entries, and produce a completion certificate.
 */
import { Effect } from "effect"
import { AppRuntime } from "../effect/app-runtime"
import type { AgentContract } from "../cli/cmd/run/cockpit.contract"

export interface LoopConfig {
  contract: Record<string, unknown>
  contractPath: string
  lanes: number
  budget?: string
}

export async function startLoop(config: LoopConfig): Promise<void> {
  await AppRuntime.runPromise(
    Effect.gen(function* () {
      // TODO: Phase 2 — spawn search lanes, subscribe to cockpit events,
      // emit TUI spine entries, and produce completion certificate.
      // For now, the CLI entry point is wired; the full loop engine
      // lives in the cockpit projection store + governance actions
      // which already handle mutation/verifier/token/proof events.
    }),
  )
}
