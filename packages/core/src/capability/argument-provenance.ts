// packages/core/src/capability/argument-provenance.ts
//
// Authority Kernel K7 — consequential-argument provenance (v1, narrow).
//
// Scope (per frozen architecture): five consequential argument classes.
//   NetworkDestination · FilesystemDestination · ExecutableCommand ·
//   ExternalMutationTarget · SecretIdentifier
//
// v1 model:
//   - Each gate derives default ArgumentInfluenceClaims from its own request
//     fields (deterministic; no model attribution yet).
//   - Callers with richer context MAY supply additional claims via
//     `influenceClaims` on the gate request (engine session integration).
//   - Escalation rule: any consequential claim whose source labels include
//     UNTRUSTED_REMOTE or UNKNOWN augments the request provenance with the
//     matching label so the EXISTING Phase C provenance rules enforce
//     (D1/D10-class denials) — no new policy machinery.
//   - Claims are hashed into the request (influence-k7-v1 block): the claim,
//     not just the effect, is part of exact-request identity.

import type { ArgumentInfluenceClaim, ProvenanceLabel } from "./types"

export const CONSEQUENTIAL_ARGUMENT_CLASSES = [
  "NetworkDestination",
  "FilesystemDestination",
  "ExecutableCommand",
  "ExternalMutationTarget",
  "SecretIdentifier",
] as const

export type SourceTrustLabel =
  | "USER_AUTHORITY"
  | "TRUSTED_LOCAL"
  | "UNTRUSTED_REMOTE"
  | "GENERATED"
  | "UNKNOWN"

/** Labels whose influence on a consequential argument triggers escalation. */
const ESCALATING_LABELS: ReadonlySet<string> = new Set(["UNTRUSTED_REMOTE", "UNKNOWN"])

/**
 * Derive the default influence claim set for a gated request. Gates call this
 * right after building their authorization request inputs; callers may append
 * richer claims (context provenance IDs) before hashing.
 */
export function deriveGateInfluenceClaims(input: {
  toolName: string
  assertedBy?: string
  argv?: string[]
  filePath?: string
  url?: string
  secretName?: string
}): ArgumentInfluenceClaim[] {
  const claims: ArgumentInfluenceClaim[] = []
  if (input.argv && input.argv.length > 0) {
    claims.push({
      argument: "process.command",
      value: input.argv.join(" "),
      claimedSources: ["USER_INSTRUCTION"],
      assertedBy: input.assertedBy,
    })
  }
  if (input.filePath) {
    claims.push({
      argument: "filesystem.path",
      value: input.filePath,
      claimedSources: ["USER_INSTRUCTION"],
      assertedBy: input.assertedBy,
    })
  }
  if (input.url) {
    let host = input.url
    try {
      host = new URL(input.url).host
    } catch {
      /* caller-validated upstream */
    }
    claims.push({
      argument: "network.host",
      value: host,
      claimedSources: ["USER_INSTRUCTION"],
      assertedBy: input.assertedBy,
    })
  }
  if (input.secretName) {
    claims.push({
      argument: "secret.identifier",
      value: input.secretName,
      claimedSources: ["USER_AUTHORITY"],
      assertedBy: input.assertedBy,
    })
  }
  return claims
}

/**
 * K7 escalation decision for a claim set.
 *   "proceed"   — all sources trusted / user-authority
 *   "escalate"  — untrusted or unknown influence present on a claim
 */
export function evaluateInfluenceEscalation(
  claims: ReadonlyArray<ArgumentInfluenceClaim>,
): { escalate: boolean; triggeringArguments: string[] } {
  const triggering: string[] = []
  for (const c of claims) {
    const labels = [...(c.claimedSources ?? []), ...(c.availableSources ?? [])]
    const hasUntrusted = labels.some((l) => ESCALATING_LABELS.has(l))
    // Objective derivations from TRUSTED_LOCAL do NOT escalate; anything else
    // that is neither explicitly user-authority nor deterministically derived
    // is UNKNOWN by construction.
    const knownTrusted = labels.every(
      (l) =>
        l === "USER_AUTHORITY" ||
        l === "TRUSTED_LOCAL" ||
        l === "GENERATED" ||
        l === "USER_INSTRUCTION",
    )
    if (!knownTrusted || hasUntrusted) triggering.push(c.argument)
  }
  return { escalate: triggering.length > 0, triggeringArguments: [...new Set(triggering)] }
}

/**
 * Augment provenance labels for escalation: the PDP's existing provenance
 * rules (fixtures D1/D10) carry the enforcement — this only marks the label.
 */
export function augmentProvenanceForEscalation(
  base: ProvenanceLabel[],
  escalate: boolean,
  claims: ReadonlyArray<ArgumentInfluenceClaim>,
): ProvenanceLabel[] {
  if (!escalate) return base
  const out = new Set<ProvenanceLabel | string>(base)
  out.add("UNTRUSTED_REMOTE")
  for (const c of claims) {
    for (const s of c.claimedSources ?? []) out.add(s)
  }
  return [...out] as ProvenanceLabel[]
}

/** Deterministic hash-input normalization is handled by request-hash.ts. */
export function normalizeInfluenceClaims(
  claims: ReadonlyArray<ArgumentInfluenceClaim>,
): ArgumentInfluenceClaim[] {
  return [...claims]
    .sort((a, b) => (a.argument < b.argument ? -1 : a.argument > b.argument ? 1 : 0))
    .map((c) => ({
      ...c,
      claimedSources: [...(c.claimedSources ?? [])].sort(),
      availableSources: c.availableSources ? [...c.availableSources].sort() : undefined,
      directDerivations: c.directDerivations ? [...c.directDerivations].sort() : undefined,
    }))
}
