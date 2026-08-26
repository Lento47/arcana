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

  /**
   * Union of trust labels across all tracked items whose content contains
   * `value` as an exact substring. Empty when the value derives from no
   * tracked context (model-generated or untracked source).
   */
  labelsForValue(value: string): string[] {
    if (!value || value.length < 4) return []
    const out = new Set<string>()
    for (const item of this.items) {
      if (item.contentPrefix.includes(value)) for (const l of item.labels) out.add(l)
    }
    return [...out]
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

// ── History seeding (K7-full: user-message tracking) ─────────────────────

/** Structural subset of SessionV1.WithParts — decoupled from the schema module. */
export interface ProvenanceSeedMessage {
  role?: string
  parts?: Array<{
    type?: string
    text?: string
    tool?: string
    state?: { status?: string; output?: string }
    source?: { text?: string }
  }>
}

/** Tools whose output is remote content by nature. */
const REMOTE_TOOL_PREFIXES = ["mcp_", "web_"]

/**
 * Objective trust label for a tool OUTPUT, by tool identity (not by
 * escalation outcome): remote-content tools are untrusted whatever the
 * request decided.
 */
export function labelForToolOutput(tool: string): SourceTrustLabel {
  return REMOTE_TOOL_PREFIXES.some((p) => tool.startsWith(p)) ? "UNTRUSTED_REMOTE" : "TRUSTED_LOCAL"
}

/**
 * Seed a tracker from recorded session history so objective derivations work
 * ACROSS turns and across daemon restarts: the tracker becomes a deterministic
 * projection of durable context, not ambient mutable state.
 *
 * Labels are structural (by source kind), never content-classified:
 *   user text/files → USER_AUTHORITY · assistant text → GENERATED ·
 *   completed tool outputs → UNTRUSTED_REMOTE (mcp_/web_ prefixes) or
 *   TRUSTED_LOCAL.
 * Incomplete tool states (pending/running/error/cancelled) carry no
 * trustworthy content and are skipped.
 */
export function seedContextProvenance(
  tracker: ContextProvenanceTracker,
  history: readonly ProvenanceSeedMessage[],
): void {
  for (const msg of history) {
    const role = msg.role === "user" || msg.role === "assistant" ? msg.role : undefined
    for (const part of msg.parts ?? []) {
      if (part.type === "tool") {
        if (!part.tool || !part.state || part.state.status !== "completed" || !part.state.output) continue
        tracker.track(`tool:${part.tool}`, part.state.output, [labelForToolOutput(part.tool)])
        continue
      }
      if (!role) continue
      if (part.type === "text" && part.text) {
        tracker.track(role, part.text, [role === "user" ? "USER_AUTHORITY" : "GENERATED"])
      } else if (part.type === "file" && role === "user") {
        // FilePart text lives under source.text when present; track whatever
        // textual content the attachment carries.
        const src = part.source?.text
        if (src) tracker.track(role, src, ["USER_AUTHORITY"])
      }
    }
  }
}
