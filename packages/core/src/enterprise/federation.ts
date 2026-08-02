/**
 * F8: Federation.
 *
 * Controlled trust between organizations: agreements bind audience + validity,
 * effective authority is ALWAYS the intersection of local policy, remote
 * grant, and the agreement — federation never broadens local authority.
 * Unknown issuers/agreement versions fail closed; proof exchange preserves
 * origin; revocation propagates only under an active agreement.
 */

export type FederationAgreement = {
  agreementId: string
  version: number
  orgA: string
  orgB: string
  audienceRestrictions: string[]
  validFrom: string
  validTo: string
  status: "ACTIVE" | "REVOKED"
}

export type FederationStore = {
  putAgreement(agreement: FederationAgreement): void
  getAgreement(agreementId: string): FederationAgreement | undefined
  recordExchange(exchange: ProofExchangeRecord): void
  recordRevocationPropagation(record: RevocationPropagationRecord): void
  exchanges(orgId: string): ProofExchangeRecord[]
  revocations(orgId: string): RevocationPropagationRecord[]
}

export type ProofExchangeRecord = {
  agreementId: string
  orgId: string
  remoteProofId: string
  fingerprint: string
  exchangedAt: string
  origin: string
}

export type RevocationPropagationRecord = {
  agreementId: string
  orgId: string
  subjectId: string
  reason: string
  propagatedAt: string
}

export type AuthorityScope = {
  actions: ReadonlySet<string>
  resources: ReadonlySet<string>
}

export type IntersectionResult =
  | { allowed: true; scope: AuthorityScope }
  | { allowed: false; reason: string }

export function agreementValid(
  agreement: FederationAgreement | undefined,
  now: Date,
): { valid: true } | { valid: false; reason: string } {
  if (!agreement) return { valid: false, reason: "unknown federation agreement" }
  if (agreement.version < 1) return { valid: false, reason: "unsupported agreement version" }
  if (agreement.status !== "ACTIVE") return { valid: false, reason: `agreement is ${agreement.status}` }
  if (now.getTime() < new Date(agreement.validFrom).getTime()) {
    return { valid: false, reason: "agreement not yet valid" }
  }
  if (now.getTime() > new Date(agreement.validTo).getTime()) {
    return { valid: false, reason: "agreement expired" }
  }
  return { valid: true }
}

/**
 * EffectiveFederatedAuthority = LocalPolicy ∩ RemoteGrant ∩ Agreement.
 * The result is never broader than either input.
 */
export function intersectAuthority(
  local: AuthorityScope,
  remote: AuthorityScope,
  agreement: FederationAgreement | undefined,
  now: Date,
): IntersectionResult {
  const validity = agreementValid(agreement, now)
  if (!validity.valid) return { allowed: false, reason: validity.reason }

  const actions = new Set<string>()
  for (const action of local.actions) {
    if (remote.actions.has(action)) actions.add(action)
  }
  const resources = new Set<string>()
  for (const resource of local.resources) {
    if (remote.resources.has(resource)) resources.add(resource)
  }
  if (actions.size === 0 || resources.size === 0) {
    return { allowed: false, reason: "federated authority intersection is empty" }
  }
  return { allowed: true, scope: { actions, resources } }
}

export function conflictResolution(
  localDecision: "ALLOW" | "DENY",
  remoteDecision: "ALLOW" | "DENY",
): "ALLOW" | "DENY" {
  return localDecision === "ALLOW" && remoteDecision === "ALLOW" ? "ALLOW" : "DENY"
}

export type ProofExchangeResult =
  | { kind: "EXCHANGED"; record: ProofExchangeRecord }
  | { kind: "REJECTED"; reason: string }

export function exchangeProof(
  input: {
    agreementId: string
    orgId: string
    remoteProofId: string
    fingerprint: string
    origin: string
    now: Date
  },
  store: FederationStore,
): ProofExchangeResult {
  const agreement = store.getAgreement(input.agreementId)
  const validity = agreementValid(agreement, input.now)
  if (!validity.valid) return { kind: "REJECTED", reason: validity.reason }
  if (!/^[0-9a-f]{64}$/.test(input.fingerprint)) {
    return { kind: "REJECTED", reason: "remote proof fingerprint is not a valid sha256 hex digest" }
  }
  const record: ProofExchangeRecord = {
    agreementId: input.agreementId,
    orgId: input.orgId,
    remoteProofId: input.remoteProofId,
    fingerprint: input.fingerprint,
    exchangedAt: input.now.toISOString(),
    origin: input.origin,
  }
  store.recordExchange(record)
  return { kind: "EXCHANGED", record }
}

export function propagateRevocation(
  input: {
    agreementId: string
    orgId: string
    subjectId: string
    reason: string
    now: Date
  },
  store: FederationStore,
): RevocationPropagationRecord | { kind: "REJECTED"; reason: string } {
  const agreement = store.getAgreement(input.agreementId)
  const validity = agreementValid(agreement, input.now)
  if (!validity.valid) return { kind: "REJECTED", reason: validity.reason }
  const record: RevocationPropagationRecord = {
    agreementId: input.agreementId,
    orgId: input.orgId,
    subjectId: input.subjectId,
    reason: input.reason,
    propagatedAt: input.now.toISOString(),
  }
  store.recordRevocationPropagation(record)
  return record
}
