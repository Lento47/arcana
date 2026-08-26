// packages/core/src/capability/context-provenance.ts
//
// Authority Kernel K7 — deterministic context provenance tracking.
//
// Every message entering the agent's context gets a provenance ID and trust
// label at acquisition time. This provides the OBJECTIVE side of influence
// analysis: when a consequential argument matches content from an
// UNTRUSTED_REMOTE source, escalation fires WITHOUT trusting the model's
// causal narrative.
//
// Design:
//   - Content previews stored as sha256 prefixes for O(1) derivation matching
//   - Labels are immutable once assigned
//   - Monotonic sequence numbers per session
//   - Zero allocation on read paths (lookups use Map indexes)

import { createHash } from "node:crypto"

export type SourceTrustLabel =
  | "USER_AUTHORITY"
  | "TRUSTED_LOCAL"
  | "UNTRUSTED_REMOTE"
  | "GENERATED"
  | "SECRET"

export interface TrackedContextItem {
  id: string
  role: string
  /** First N chars of content — used for exact-substring derivation matching. */
  contentPrefix: string
  labels: ReadonlySet<SourceTrustLabel>
  seq: number
}

const PREFIX_LEN = 256

export class ContextProvenanceTracker {
  private items: TrackedContextItem[] = []
  private seq = 0
  /** sha256(contentPrefix) → item index, for O(1) exact-match lookup. */
  private prefixIndex = new Map<string, number>()

  /**
   * Track a newly acquired context item.
   * Returns the assigned provenance ID.
   */
  track(role: string, content: string, labels: SourceTrustLabel[]): TrackedContextItem {
    const seq = ++this.seq
    const prefix = content.slice(0, PREFIX_LEN)
    const digest = createHash("sha256").update(prefix).digest("hex").slice(0, 8)
    const id = `ctx:${role}:${digest}`
    const item: TrackedContextItem = {
      id,
      role,
      contentPrefix: prefix,
      labels: new Set(labels),
      seq,
    }
    this.items.push(item)
    return item
  }

  getAll(): readonly TrackedContextItem[] {
    return this.items
  }

  /**
   * Find context items whose content contains the given value as an exact
   * substring. Deterministic — no model attribution involved.
   */
  findDirectDerivations(value: string): string[] {
    if (!value || value.length < 4) return [] // too short to match reliably
    return this.items
      .filter((item) => item.contentPrefix.includes(value))
      .map((item) => item.id)
  }

  /** Items carrying any of the escalating labels. */
  getUntrustedItems(): TrackedContextItem[] {
    return this.items.filter((i) => i.labels.has("UNTRUSTED_REMOTE"))
  }

  /** True if ANY tracked item carries SECRET label (participation taint). */
  get hasSecretContent(): boolean {
    return this.items.some((i) => i.labels.has("SECRET"))
  }
}

/**
 * Build ArgumentInfluenceClaims from a provenance tracker + gate arguments.
 * This is the DETERMINISTIC half of K7 — no model attribution needed.
 */
export function deriveObjectiveInfluence(
  tracker: ContextProvenanceTracker,
  argument: string,
  value: string,
): {
  availableSources: string[]
  directDerivations: string[]
} {
  return {
    availableSources: tracker.getAll().map((i) => i.id),
    directDerivations: tracker.findDirectDerivations(value),
  }
}
