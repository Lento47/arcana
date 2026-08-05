/**
 * D-6/D-9 integration: governed distributed PEP.
 *
 * Composes the existing distributed PEP rechecks (`phaseC_pep`) with:
 *   1. Offline/partition policy (D-9): OFFLINE_RESTRICTED requires an
 *      offlineEnabled grant within its lease; OFFLINE_READ_ONLY allows only
 *      non-consequential reads with fresh leases; QUARANTINED denies all.
 *   2. Exactly-once execution claims (D-6): the effect may run only when the
 *      shared execution ledger returns CLAIMED. DUPLICATE delivers the
 *      recorded outcome without a second effect; CONFLICT and
 *      REPLAY_FORBIDDEN fail closed.
 */

import {
  claimExecution,
  type DistributedExecutionKey,
  type ExecutionLedger,
} from "./execution-ledger"
import {
  classifyOfflineRequest,
  evaluateOfflineRequest,
  type OfflineCapableGrant,
  type OfflineLeaseConfig,
  type OfflineNodeState,
} from "./offline-policy"
import {
  phaseC_pep,
  type DerivedLocalGrant,
  type DistributedAction,
} from "./distributed-pep"
import type { DurableNodeSecurityState } from "./durable-state"
import type { ObservedWorkloadIdentity } from "./workload-identity"

export type GovernedPepResult =
  | {
      decision: "ALLOW"
      reason: string
      executionStatus: "CLAIMED"
    }
  | {
      decision: "DENY"
      reason: string
    }
  | {
      decision: "DUPLICATE"
      reason: string
      executionStatus: string
      effectOutcomeJson?: string
    }
  | {
      decision: "REPLAY_FORBIDDEN"
      reason: string
    }

export type GovernedDistributedPepInput = {
  grant: DerivedLocalGrant
  action: DistributedAction
  nodeState: DurableNodeSecurityState
  workloadIdentity: ObservedWorkloadIdentity
  admissionIdentity: ObservedWorkloadIdentity
  /** D-9 offline evaluation. Required whenever the node is not ONLINE. */
  offline?: {
    nodeState: OfflineNodeState
    grant: OfflineCapableGrant
    config?: OfflineLeaseConfig
  }
  /** D-6 exactly-once claim. When provided, ALLOW requires CLAIMED. */
  execution?: {
    key: DistributedExecutionKey
    ledger: ExecutionLedger
    irreversible?: boolean
    now?: Date
  }
  /** D-5 applied revocation state: revoked grant IDs deny immediately. */
  revokedGrantIds?: ReadonlySet<string>
}

export function governedDistributedPep(
  input: GovernedDistributedPepInput,
): GovernedPepResult {
  const base = phaseC_pep(
    input.grant,
    input.action,
    input.nodeState,
    input.workloadIdentity,
    input.admissionIdentity,
  )
  if (base.decision === "DENY") {
    return { decision: "DENY", reason: base.reason }
  }

  if (input.revokedGrantIds?.has(input.grant.localGrantId)) {
    return { decision: "DENY", reason: `grant ${input.grant.localGrantId} is revoked` }
  }

  // D-9: offline policy gates (only when the node is disconnected).
  if (input.offline) {
    const offlineDecision = evaluateOfflineRequest(
      classifyOfflineRequest(input.action, input.grant),
      input.offline.grant,
      input.offline.nodeState,
      input.execution?.now ?? new Date(),
      input.offline.config,
    )
    if (offlineDecision.decision === "DENY") {
      return { decision: "DENY", reason: `offline policy: ${offlineDecision.reason}: ${offlineDecision.detail}` }
    }
  }

  // D-6: exactly-once claim is the final gate before the effect.
  if (input.execution) {
    const claim = claimExecution(
      input.execution.key,
      input.execution.ledger,
      input.execution.now ?? new Date(),
      { irreversible: input.execution.irreversible ?? false },
    )
    switch (claim.kind) {
      case "CLAIMED":
        return { decision: "ALLOW", reason: "execution claimed exactly once", executionStatus: "CLAIMED" }
      case "DUPLICATE":
        return {
          decision: "DUPLICATE",
          reason: `duplicate execution: ${claim.detail}`,
          executionStatus: claim.record.status,
          effectOutcomeJson: claim.record.effectOutcomeJson,
        }
      case "CONFLICT":
        return { decision: "DENY", reason: `execution conflict: ${claim.detail}` }
      case "REPLAY_FORBIDDEN":
        return { decision: "REPLAY_FORBIDDEN", reason: claim.detail }
    }
  }

  return { decision: "ALLOW", reason: "PEP recheck passed", executionStatus: "CLAIMED" }
}
