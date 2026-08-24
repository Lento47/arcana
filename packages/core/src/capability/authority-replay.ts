// packages/core/src/capability/authority-replay.ts
//
// Authority Kernel K3a — deterministic authority replay harness (PURE).
//
// Claim under test (P3 / plan §4.4 Decision+State levels):
//   identical authoritative inputs (captured clock/nonce/ids + identical
//   seed operations) ⇒ identical decision AND identical reconstructed
//   authority state — regardless of which database instance replays them.
//
// The scenario drives the FULL mediation path (provider snapshot → PDP →
// claim → executeExact) so what is proven is the real production pipeline,
// not a parallel test double. executeExact is a counted no-op marker: this
// suite authorizes, it never acts on the world.

import { Effect } from "effect"
import { authorizeAndExecuteEffect } from "./pep"
import type { EnforcementResult } from "./pep"
import { buildAuthorizationRequest } from "./pep-integration"
import { SqliteGrantStore } from "./grant-store-sqlite"
import { SessionPolicyProvider } from "./grant-store"
import { ensureSessionAgentGrants } from "./session-grants"
import { Database } from "../database/database"
import type { CapabilityGrant } from "./types"
import type { CapabilityGrantStore } from "./grant-store"
import { noopEmitter } from "./process-gate"
import type { ProcessGateOptions } from "./process-gate"
import { createHash } from "node:crypto"

export interface ReplayScenario {
  toolName: string
  args: Record<string, unknown>
  executable?: string
  arguments?: string[]
  workingDirectory?: string
  networkDestination?: string
  /** Captured nondeterminism — REQUIRED here: replay always knows its inputs. */
  nonce: string
  requestedAt: string
  requestId: string
  instanceId?: string
}

export interface ReplayOutcome {
  status: string
  /** Full decision object when the result carries one; null otherwise. */
  decision: unknown
  reasonCodes: string[]
  /** Present on EXECUTED; null on non-executed rulings. */
  requestHash: string | null
  /** Canonical hash over ALL grants (sorted by id) after the scenario ran. */
  stateHash: string
  /** Number of times executeExact ran (1 on EXECUTED, else 0). */
  executorCalls: number
}

/** Deterministic JSON: recursive key sort, stable arrays. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`
}

/**
 * Envelope fields excluded from replay comparisons, with rationale:
 *   - decision.decidedAt : wall-clock stamp of WHEN the ruling was made
 *   - grant.createdEventId : random pointer into the evidence ledger
 * Both identify records; neither alters what was decided or owned.
 * Stripping happens HERE so every consumer applies one policy.
 */
function stripEnvelope(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripEnvelope)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "decidedAt" || k === "createdEventId") continue
      out[k] = stripEnvelope(v)
    }
    return out
  }
  return value
}

function hashState(grants: readonly CapabilityGrant[]): string {
  const sorted = [...grants].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return createHash("sha256").update(stableStringify(stripEnvelope(sorted))).digest("hex")
}

/**
 * Run one replay scenario against a fresh-or-existing authority database and
 * return comparable artifacts: decision payload, request hash, state hash,
 * and executor-call count.
 */
export async function replayAuthority(
  options: ProcessGateOptions,
  scenario: ReplayScenario,
  seed?: (store: CapabilityGrantStore) => Promise<void>,
): Promise<ReplayOutcome> {
  const principalId = options.principalId ?? "replay-agent"

  const authReq = buildAuthorizationRequest({
    toolName: scenario.toolName,
    principalId,
    sessionId: options.sessionId,
    args: scenario.args,
    executable: scenario.executable,
    arguments: scenario.arguments,
    workingDirectory: scenario.workingDirectory,
    networkDestination: scenario.networkDestination,
    provenance: ["USER_INSTRUCTION"],
    nonce: scenario.nonce,
    requestedAt: scenario.requestedAt,
    requestId: scenario.requestId,
    instanceId: scenario.instanceId,
  })

  let executorCalls = 0

  const outcome = await Effect.runPromise(
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })
      if (seed) yield* Effect.promise(() => seed(store))
      if (!options.skipBootstrap) {
        yield* ensureSessionAgentGrants(store, { agentName: principalId, sessionId: options.sessionId })
      }
      const provider = new SessionPolicyProvider(
        store,
        { principalId, sessionId: options.sessionId, workspaceTrust: "TRUSTED" },
        undefined,
        "LEGACY_COMPAT",
      )

      const result: EnforcementResult<unknown> = yield* authorizeAndExecuteEffect(
        {
          request: authReq,
          executeExact: () =>
            Effect.sync(() => {
              executorCalls++
              return "replayed-execution"
            }),
        },
        provider,
        noopEmitter,
      )

      // State AFTER the mediated effect (claims may mutate grant lifecycle).
      const allGrants = yield* store.getAllGrants().pipe(Effect.catch(() => Effect.succeed([] as const)))

      const decision = "decision" in result ? result.decision : null
      const reasons =
        result.status === "DENIED" && "decision" in result && result.decision
          ? ((result.decision as { reasons?: Array<{ code: string }> }).reasons ?? []).map((r) => r.code)
          : []

      return {
        status: result.status,
        decision: decision ? stripEnvelope(decision) : null,
        reasonCodes: reasons,
        requestHash: "requestHash" in result ? result.requestHash : null,
        stateHash: hashState(allGrants),
        executorCalls,
      } satisfies ReplayOutcome
    }).pipe(Effect.provide(Database.layerFromPath(options.dbPath))),
  )

  void noopEmitter
  return outcome
}
