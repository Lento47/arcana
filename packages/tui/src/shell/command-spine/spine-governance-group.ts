/**
 * TUI-2.1: Governance aggregation (progressive disclosure).
 *
 * Consecutive governance events are collapsed into one summary row:
 *
 *   18 ✓ governed
 *      3 governed actions · 6 authorized · 6 executed · 0 denied
 *      ▸ inspect evidence
 *
 * The individual events remain as children and keep their full committed
 * payloads; expanding the group is the forensic inspector. Leftover RunProof and trace
 * rows are standalone summaries and never merged into an event burst.
 */

import type { SpineEntry } from "./spine-types"
import { formatElapsedMs } from "./spine-types"

const STANDALONE_PREFIXES = ["governance-proof:", "governance-trace:", "proof-continuation:"]

/** Merge consecutive governance event rows; proof/trace rows stay standalone. */
export function groupGovernanceEntries(
  entries: readonly SpineEntry[],
  maxGroupSize = Number.POSITIVE_INFINITY,
): SpineEntry[] {
  const result: SpineEntry[] = []
  let burst: SpineEntry[] = []

  const flush = () => {
    if (burst.length === 1) result.push(burst[0]!)
    else if (burst.length > 1) {
      for (let index = 0; index < burst.length; index += maxGroupSize) {
        result.push(buildGovernanceGroup(burst.slice(index, index + maxGroupSize)))
      }
    }
    burst = []
  }

  for (const entry of entries) {
    const isGovernance = entry.source?.kind === "governance"
    const isStandalone =
      isGovernance &&
      (STANDALONE_PREFIXES.some((prefix) => entry.id.startsWith(prefix))
        || entry.breakthrough === true
        || entry.kind === "fail"
        || entry.kind === "approve")
    if (!isGovernance || isStandalone) {
      flush()
      result.push(entry)
      continue
    }
    burst.push(entry)
  }
  flush()
  return result
}

/** Apply the TUI grouping preference without mutating the source entries. */
export function collapseGovernanceEntries(
  entries: readonly SpineEntry[],
  options: { enabled: boolean; maxGroupSize: number },
): SpineEntry[] {
  if (!options.enabled) return [...entries]
  return groupGovernanceEntries(entries, options.maxGroupSize)
}

/** Build the collapsed aggregate row for a burst of governance events. */
export function buildGovernanceGroup(children: SpineEntry[]): SpineEntry {
  let requested = 0
  let allowed = 0
  let executed = 0
  let denied = 0
  let approvals = 0
  let failures = 0
  let other = 0
  let firstTs: number | undefined
  let lastTs: number | undefined

  for (const child of children) {
    const label = (child.label ?? "").toLowerCase()
    if (label === "authorization") requested++
    else if (label === "authorized") allowed++
    else if (label === "executed") executed++
    else if (label === "denied") denied++
    else if (label === "approval required") approvals++
    else other++
    // Approval-required events are pending operator action, not failures.
    if (child.kind === "fail") failures++

    const ts = child.occurredAt
    if (typeof ts === "number" && Number.isFinite(ts)) {
      if (firstTs === undefined || ts < firstTs) firstTs = ts
      if (lastTs === undefined || ts > lastTs) lastTs = ts
    }
  }

  const durationMs =
    firstTs !== undefined && lastTs !== undefined && lastTs >= firstTs
      ? lastTs - firstTs
      : undefined

  // Authorization-family events always show the full allowed/executed/denied
  // trio (zeros included) so the summary reads as a complete governance claim.
  const sawAuthorization = requested + allowed + executed + denied + approvals > 0
  const summaryParts = [
    `${children.length} governed ${children.length === 1 ? "action" : "actions"}`,
  ]
  if (sawAuthorization) {
    summaryParts.push(`${allowed} authorized`)
    summaryParts.push(`${executed} executed`)
    summaryParts.push(`${denied} denied`)
  }
  if (approvals > 0) summaryParts.push(`${approvals} pending approval`)
  if (failures > 0) summaryParts.push(`${failures} failed`)
  if (other > 0) summaryParts.push(`${other} records`)

  const kind: SpineEntry["kind"] =
    failures > 0 ? "fail" : allowed + executed > 0 ? "ok" : "inspect"
  const glyph = failures > 0 ? "!" : kind === "ok" ? "✓" : "◇"

  return {
    id: `governance-group:${children[0]!.id}`,
    index: 0,
    elapsed: durationMs !== undefined ? formatElapsedMs(durationMs) : "",
    elapsedMs: durationMs,
    occurredAt: firstTs,
    kind,
    glyph,
    label: "governed",
    summary: summaryParts.join(" · "),
    collapsible: true,
    expandedByDefault: false,
    children,
    source: { messageID: children[0]!.id, kind: "governance" },
  }
}
