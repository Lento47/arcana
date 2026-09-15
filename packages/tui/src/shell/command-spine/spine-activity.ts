/**
 * Presentation-only grouping for a turn's non-conversational work.
 *
 * User/assistant prose, approvals, governance, and failures deliberately
 * remain standalone rows. The activity reel compresses only the work that is
 * safe to treat as one chronological burst; every original entry remains a
 * child so expanding or copying never loses provenance.
 */

import { formatElapsedMs, type SpineEntry, type SpineKind } from "./spine-types"

// Delegation is a navigation boundary, not just another tool step. Keeping
// agent rows out of the reel means each subagent remains a first-class row
// that can receive focus and open its own session independently.
export const WORK_ACTIVITY_KINDS: readonly SpineKind[] = ["think", "run", "inspect", "patch"]

const WORK_ACTIVITY_KIND_SET = new Set<SpineKind>(WORK_ACTIVITY_KINDS)

export function isWorkActivityKind(kind: SpineKind): boolean {
  return WORK_ACTIVITY_KIND_SET.has(kind)
}

/** Governance/approval rows can never be absorbed by a work reel. */
export function isWorkActivityEntry(entry: Pick<SpineEntry, "kind" | "source" | "activity">): boolean {
  if (entry.activity?.type === "work") return false
  if (!isWorkActivityKind(entry.kind)) return false
  const sourceKind = entry.source?.kind
  return sourceKind !== "governance" && sourceKind !== "approve"
}

/** A missing source message is intentionally not grouped across rows. */
export function activityTurnID(entry: Pick<SpineEntry, "source">): string | undefined {
  const id = entry.source?.messageID?.trim()
  return id || undefined
}

function flattenWorkEntry(entry: SpineEntry): SpineEntry[] {
  if (!isWorkActivityEntry(entry)) return []
  // The mapper already collapses homogeneous run/inspect/patch bursts. Those
  // synthetic parents may join a wider turn reel. Agent rows are deliberately
  // excluded above: their children describe a separate context and must not
  // be mistaken for siblings of the parent delegation step.
  const canFlatten = entry.kind === "run" || entry.kind === "inspect" || entry.kind === "patch"
  if (!canFlatten || !entry.children?.length) return [entry]
  const flattened: SpineEntry[] = []
  for (const child of entry.children) {
    const nested = flattenWorkEntry(child)
    // A malformed/mixed synthetic parent is not safe to absorb. Returning an
    // empty result makes the caller keep the parent standalone, so a
    // governance/failure child cannot disappear inside a work reel.
    if (nested.length === 0) return []
    flattened.push(...nested)
  }
  return flattened
}

function elapsedFor(units: readonly SpineEntry[]): number | undefined {
  let firstOccurrence: number | undefined
  let lastOccurrence: number | undefined
  for (const entry of units) {
    const value = entry.occurredAt
    if (typeof value !== "number" || !Number.isFinite(value)) continue
    if (firstOccurrence === undefined || value < firstOccurrence) firstOccurrence = value
    if (lastOccurrence === undefined || value > lastOccurrence) lastOccurrence = value
  }
  if (firstOccurrence !== undefined && lastOccurrence !== undefined) {
    if (lastOccurrence >= firstOccurrence && lastOccurrence > 0) return lastOccurrence - firstOccurrence
  }

  let total = 0
  let sawDuration = false
  for (const entry of units) {
    if (typeof entry.elapsedMs !== "number" || !Number.isFinite(entry.elapsedMs) || entry.elapsedMs <= 0) continue
    total += entry.elapsedMs
    sawDuration = true
  }
  return sawDuration ? total : undefined
}

function startFor(units: readonly SpineEntry[]): number | undefined {
  let earliest: number | undefined
  for (const entry of units) {
    const value = entry.startMs
    if (typeof value !== "number" || !Number.isFinite(value)) continue
    if (earliest === undefined || value < earliest) earliest = value
  }
  return earliest
}

export function summarizeWorkActivity(units: readonly Pick<SpineEntry, "kind">[], active: boolean): string {
  const tools = units.filter((entry) => entry.kind !== "think" && entry.kind !== "agent").length
  const thoughts = units.filter((entry) => entry.kind === "think").length
  const agents = units.filter((entry) => entry.kind === "agent").length
  const total = units.length
  const totalNoun = active ? (total === 1 ? "step" : "steps") : total === 1 ? "action" : "actions"
  const parts = [`${total} ${totalNoun}`]
  if (tools > 0) parts.push(`${tools} tool${tools === 1 ? "" : "s"}`)
  if (thoughts > 0) parts.push(`${thoughts} thought${thoughts === 1 ? "" : "s"}`)
  if (agents > 0) parts.push(`${agents} agent${agents === 1 ? "" : "s"}`)
  return parts.join(" · ")
}

function buildWorkActivity(units: SpineEntry[], turnID: string): SpineEntry {
  const first = units[0]!
  const elapsedMs = elapsedFor(units)
  const streaming = units.some((entry) => entry.streaming === true)
  const summary = summarizeWorkActivity(units, streaming)
  const elapsed = elapsedMs !== undefined ? formatElapsedMs(elapsedMs) : first.elapsed
  let firstOccurrence: number | undefined
  for (const entry of units) {
    const value = entry.occurredAt
    if (typeof value !== "number" || !Number.isFinite(value)) continue
    if (firstOccurrence === undefined || value < firstOccurrence) firstOccurrence = value
  }

  return {
    id: `activity:${first.id}`,
    index: first.index,
    elapsed,
    elapsedMs,
    startMs: startFor(units),
    occurredAt: firstOccurrence,
    kind: first.kind,
    glyph: streaming ? "●" : "✓",
    label: "work",
    summary,
    collapsible: true,
    expandedByDefault: false,
    streaming,
    children: units,
    activity: {
      type: "work",
      turnID,
      childCount: units.length,
    },
    source: first.source,
  }
}

type PendingActivity = {
  turnID: string
  roots: SpineEntry[]
  units: SpineEntry[]
}

/** Rebuild a reel from a changed child set, keeping its stable identity. */
function rebuildActivity(parent: SpineEntry, children: SpineEntry[], elapsedMs: number | undefined): SpineEntry {
  const streaming = children.some((child) => child.streaming === true)
  return {
    ...parent,
    glyph: streaming ? "●" : "✓",
    streaming,
    elapsedMs,
    elapsed: elapsedMs !== undefined ? formatElapsedMs(elapsedMs) : parent.elapsed,
    summary: summarizeWorkActivity(children, streaming),
    children,
    activity: parent.activity ? { ...parent.activity, childCount: children.length } : parent.activity,
  }
}

/** Sum measured work time across reels; undefined when neither side measured. */
function addElapsed(a: number | undefined, b: number | undefined): number | undefined {
  const parts = [a, b].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
  )
  if (parts.length === 0) return undefined
  return parts.reduce((sum, value) => sum + value, 0)
}

function isSettledActivity(entry: SpineEntry): boolean {
  return entry.activity?.type === "work" && entry.streaming !== true
}

function isSettledWorkRow(entry: SpineEntry): boolean {
  return entry.activity === undefined && entry.streaming !== true && isWorkActivityEntry(entry)
}

/**
 * Collapse contiguous work rows into a stable activity parent. Existing tool
 * bursts are flattened only when they join a qualifying reel, preventing
 * nested disclosure trees while retaining every original child entry.
 *
 * A second pass merges adjacent SETTLED reels so a run of short turns reads as
 * one work card instead of a wall of per-turn cards. Active reels, prose,
 * failures, approvals and delegation rows remain boundaries.
 */
export function collapseWorkActivities(entries: readonly SpineEntry[]): SpineEntry[] {
  const result: SpineEntry[] = []
  let pending: PendingActivity | undefined
  let deferredHidden: SpineEntry[] = []

  const flushHidden = () => {
    if (deferredHidden.length === 0) return
    result.push(...deferredHidden)
    deferredHidden = []
  }

  const flush = () => {
    if (!pending) {
      flushHidden()
      return
    }
    if (pending.units.length >= 2) result.push(buildWorkActivity(pending.units, pending.turnID))
    else result.push(...pending.roots)
    pending = undefined
    flushHidden()
  }

  for (const entry of entries) {
    // Hidden synthetic rows do not split a burst and stay in their original
    // position relative to the next visible boundary.
    if (entry.hidden) {
      deferredHidden.push(entry)
      continue
    }

    const units = isWorkActivityEntry(entry) ? flattenWorkEntry(entry) : []
    const ids = [...new Set(units.map(activityTurnID))]
    const turnID = ids.length === 1 ? ids[0] : undefined
    if (!turnID || units.length === 0) {
      flush()
      result.push(entry)
      continue
    }

    if (!pending || pending.turnID !== turnID) {
      flush()
      pending = { turnID, roots: [entry], units: [...units] }
    } else {
      pending.roots.push(entry)
      pending.units.push(...units)
    }
  }

  flush()

  const merged: SpineEntry[] = []
  for (const entry of result) {
    const prev = merged[merged.length - 1]
    if (prev && isSettledActivity(prev)) {
      if (isSettledActivity(entry)) {
        merged[merged.length - 1] = rebuildActivity(
          prev,
          [...(prev.children ?? []), ...(entry.children ?? [])],
          addElapsed(prev.elapsedMs, entry.elapsedMs),
        )
        continue
      }
      if (isSettledWorkRow(entry)) {
        merged[merged.length - 1] = rebuildActivity(
          prev,
          [...(prev.children ?? []), entry],
          addElapsed(prev.elapsedMs, entry.elapsedMs),
        )
        continue
      }
    }
    merged.push(entry)
  }
  return merged
}
