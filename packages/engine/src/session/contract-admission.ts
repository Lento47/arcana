import { Effect } from "effect"
import type { SessionID } from "@/session/schema"

/**
 * Production contract admission: compile -> present -> accept -> activate.
 *
 * A primary session with no active contract proposes a completion contract
 * derived from the user's request, presents it to the operator through the
 * Question gate, and activates it on acceptance so the intent runtime enters
 * REQUIRED enforcement. A decline (or dismiss) is recorded on the session so
 * the operator is not re-prompted every turn; the session then stays in
 * explicit LEGACY_COMPAT, which remains visible as degraded assurance.
 */

export interface ContractAdmissionContract {
  readonly id: string
  readonly objective: string
  readonly revision: number
  readonly criteria: readonly string[]
}

export interface ContractAdmissionDeps {
  readonly hasActiveContract: (sessionID: SessionID) => Effect.Effect<boolean>
  readonly wasDeclined: (sessionID: SessionID) => Effect.Effect<boolean>
  readonly propose: (input: {
    sessionID: SessionID
    userRequest: string
    sourceEventId: string
    model?: string
  }) => Effect.Effect<ContractAdmissionContract>
  readonly ask: (
    sessionID: SessionID,
    contract: ContractAdmissionContract,
  ) => Effect.Effect<boolean>
  readonly activate: (contractId: string) => Effect.Effect<void>
  readonly markDeclined: (sessionID: SessionID) => Effect.Effect<void>
}

export const CONTRACT_ACCEPT = "Accept"
export const CONTRACT_DECLINE = "Decline"

export function contractAdmissionQuestion(contract: ContractAdmissionContract) {
  return {
    header: "completion contract",
    question: `Activate the completion contract for this objective? ${contract.objective}`,
    options: [
      {
        label: CONTRACT_ACCEPT,
        description:
          "Activate exact intent enforcement (REQUIRED) — consequential work binds to this objective",
      },
      {
        label: CONTRACT_DECLINE,
        description:
          "Run without a contract — intent enforcement stays degraded (LEGACY_COMPAT)",
      },
    ],
    multiple: false,
    custom: false,
  }
}

/** Returns true when a contract was proposed AND activated for the session. */
export const ensureContractAdmission = Effect.fn("ContractAdmission.ensure")(
  function* (
    deps: ContractAdmissionDeps,
    input: {
      sessionID: SessionID
      userRequest: string
      sourceEventId: string
      model?: string
    },
  ) {
    if (!input.userRequest.trim()) return false
    if (yield* deps.hasActiveContract(input.sessionID)) return false
    if (yield* deps.wasDeclined(input.sessionID)) return false

    const contract = yield* deps.propose(input)
    const accepted = yield* deps.ask(input.sessionID, contract)
    if (!accepted) {
      yield* deps.markDeclined(input.sessionID)
      return false
    }
    yield* deps.activate(contract.id)
    return true
  },
)

export * as ContractAdmission from "./contract-admission"
