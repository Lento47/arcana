import { createEffect, createMemo } from "solid-js"
import type { Accessor } from "solid-js"
import type { AssistantMessage } from "@arcana/sdk/v2"
import type { ShellProps } from "../types"
import { useThinkingMode } from "../../context/thinking"
import { useSync } from "../../context/sync"
import { useGovernanceConfig } from "../../context/governance-config"
import { shouldShowGovernanceEvent } from "@arcana/core/governance-config"
import { spineProseWidth, spineGutterDigits, type SpineLayout, type SpineEntry } from "./spine-types"
import { messagesToSpineEntriesCached, type SpineEntriesCache } from "./spine-mapper"
import { buildStatusSegments } from "./spine-segments"
import { pendingGateEntries } from "./spine-gates"
import {
  approvalIdFromEntryID,
  approvalToSpineEntry,
} from "./approval-spine-adapter"
import { createDedupeKey, dedupeKeyToString, compareOrderingKeys, createOrderingKey } from "./spine-ordering"
import {
  governanceTraceToSpineEntry,
  productionInputToSpineEntry,
} from "./production-spine-input"
import { collapseGovernanceEntries } from "./spine-governance-group"
import { buildTrustStatus, eventGapFromTrace } from "./spine-trust"
import { projectGovernedTally, projectSessionCharter } from "./session-charter"
import { attachProofContinuations } from "./spine-proof-attach"

// Cross-session cache: keyed by sessionID so back-switching to a session
// reuses the already-computed entries + per-message cache instead of
// re-walking the full message list.
const SESSION_CACHE_LIMIT = 16
const sessionCaches = new Map<string, { cache: SpineEntriesCache; previousEntries: SpineEntry[] }>()

function getSessionCache(sessionID: string) {
  let entry = sessionCaches.get(sessionID)
  if (!entry) {
    entry = { cache: undefined as unknown as SpineEntriesCache, previousEntries: [] }
    sessionCaches.set(sessionID, entry)
    if (sessionCaches.size > SESSION_CACHE_LIMIT) {
      const oldest = sessionCaches.keys().next().value
      if (oldest && oldest !== sessionID) sessionCaches.delete(oldest)
    }
  } else {
    sessionCaches.delete(sessionID)
    sessionCaches.set(sessionID, entry)
  }
  return entry
}

/**
 * Pure data derivation for the spine — governance projection, approval
 * merging, deterministic ordering, session/message mapping, and all the
 * width/gutter/grouping geometry. No rendering; the shell consumes the
 * derived accessors and renders them.
 */
export function useSpineProjection(props: ShellProps, input: {
  layout: Accessor<SpineLayout>
  viewportWidth: Accessor<number>
}) {
  const thinking = useThinkingMode()
  const sync = useSync()
  const governanceConfig = useGovernanceConfig()
  const layout = input.layout
  const viewportWidth = input.viewportWidth

  // Cross-session cache slot for the CURRENT session (memo, not const —
  // <Session /> no longer remounts on session switch).
  const sessionState = createMemo(() => getSessionCache(props.sessionID))

  // ── Header segments ──────────────────────────────────────────────
  const lastAssistant = createMemo(() =>
    props.messages().findLast((m): m is AssistantMessage => m.role === "assistant"),
  )
  const lastUsageAssistant = createMemo(() =>
    props.messages().findLast(
      (m): m is AssistantMessage => m.role === "assistant" && m.tokens.output > 0,
    ),
  )
  const modelName = createMemo(() => {
    const last = lastAssistant()
    if (!last) return undefined
    const provider = sync.data.provider.find((p) => p.id === last.providerID)
    return provider?.models[last.modelID]?.name ?? last.modelID
  })
  const ctxPercent = createMemo(() => {
    const last = lastUsageAssistant()
    if (!last) return null
    const tokens =
      last.tokens.input
      + last.tokens.output
      + last.tokens.reasoning
      + last.tokens.cache.read
      + last.tokens.cache.write
    const provider = sync.data.provider.find((p) => p.id === last.providerID)
    const limit = provider?.models[last.modelID]?.limit?.context
    return limit ? Math.round((tokens / limit) * 100) : null
  })
  const headerSegments = createMemo(() => {
    const session = sync.data.session.find((s) => s.id === props.sessionID)
    return buildStatusSegments({
      sessionID: props.sessionID,
      branch: sync.data.vcs?.branch,
      model: modelName(),
      ctxPercent: ctxPercent(),
      state: props.sessionStatus?.()?.type,
      path: session?.directory,
    })
  })

  // ── Message entries (S6: pure memo, cache persisted outside) ─────
  const entries = createMemo(() => {
    const state = sessionState()
    const sessionStatusType = props.sessionStatus?.()?.type
    return messagesToSpineEntriesCached({
      messages: props.messages(),
      getParts: props.getParts,
      getPartRevision: props.getPartRevision,
      assistantDuration: props.assistantDuration(),
      cache: state.cache,
      previousEntries: state.previousEntries,
      expandThinking: thinking.mode() === "show",
      sessionStatusType,
    })
  })

  createEffect(() => {
    const result = entries()
    const state = sessionState()
    state.cache = result.cache
    state.previousEntries = result.entries
  })

  const gateEntries = createMemo(() =>
    pendingGateEntries({ permissions: props.permissions(), questions: props.questions() }),
  )
  const visibleEntries = createMemo(() => [...entries().entries, ...gateEntries()])

  // ── TUI-2.1: Approval integration ────────────────────────────────
  const approvals = createMemo(() => props.approvals?.() ?? [])

  const approvalEntries = createMemo(() => {
    const seen = new Set<string>()
    const result: SpineEntry[] = []
    for (const approval of approvals()) {
      const key = dedupeKeyToString(createDedupeKey({
        approvalId: approval.approvalId,
        approvalVersion: approval.version,
      }))
      if (seen.has(key)) continue
      seen.add(key)
      result.push(approvalToSpineEntry(approval))
    }
    return result
  })

  const governanceEntries = createMemo(() => {
    const seen = new Set<string>()
    const result: SpineEntry[] = []
    const trace = props.governanceTrace?.()
    if (trace) {
      const traceEntry = governanceTraceToSpineEntry({
        sessionId: props.sessionID,
        status: trace.status,
        expectedCriticalEvents: Number(trace.expectedCriticalEvents),
        recordedCriticalEvents: Number(trace.recordedCriticalEvents),
        recordingErrors: trace.recordingErrors,
      })
      if (traceEntry) result.push(traceEntry)
    }
    for (const event of props.governance?.() ?? []) {
      if (!shouldShowGovernanceEvent(governanceConfig.config(), event.type)) continue
      const key = dedupeKeyToString(createDedupeKey({ governanceEventId: event.id }))
      if (seen.has(key)) continue
      seen.add(key)
      result.push(
        productionInputToSpineEntry({
          source: "GOVERNANCE",
          value: {
            id: event.id,
            sessionId: event.sessionId ?? props.sessionID,
            eventType: event.type,
            sequence: typeof event.sequence === "number" ? event.sequence : 0,
            timestamp: Date.parse(event.timestamp),
            actor: `${event.actor.kind}:${event.actor.id}`,
            payload: event.payload,
          },
        }),
      )
    }
    return result
  })

  const sessionProof = createMemo(() => props.governanceProof?.())
  const sessionCharter = createMemo(() => {
    const proof = sessionProof()
    return projectSessionCharter(proof)
  })
  const trust = createMemo(() => {
    const proof = sessionProof()
    const trace = props.governanceTrace?.()
    const pending = (props.approvals?.() ?? []).filter((approval) => approval.state === "PENDING").length
    const traceHealth = proof?.traceHealth ?? trace?.status
    return buildTrustStatus({
      syncStatus: sync.status,
      streamActive: sync.status === "complete",
      trace: traceHealth,
      integrity: proof?.integrityStatus,
      proofLevel: proof?.proofLevel,
      pendingApprovals: pending,
      eventGap: eventGapFromTrace({
        trace: traceHealth,
        expectedCriticalEvents: Number(trace?.expectedCriticalEvents),
        recordedCriticalEvents: Number(trace?.recordedCriticalEvents),
      }),
    })
  })

  // ── Merge + deterministic ordering ───────────────────────────────
  const allVisibleEntries = createMemo(() => {
    const seen = new Set<string>()
    const merged: SpineEntry[] = []
    for (const entry of [...visibleEntries(), ...governanceEntries(), ...approvalEntries()]) {
      if (seen.has(entry.id)) continue
      seen.add(entry.id)
      merged.push(entry)
    }
    const sid = props.sessionID ?? ""
    merged.sort((a, b) => {
      const keyA = createOrderingKey({
        sessionId: sid,
        sequence: a.index,
        timestamp: a.timestamp ?? "",
        source: a.source?.kind === "governance" ? "GOVERNANCE" : a.source?.kind === "approve" ? "APPROVAL" : "MESSAGE",
        sourceEventId: a.id,
      })
      const keyB = createOrderingKey({
        sessionId: sid,
        sequence: b.index,
        timestamp: b.timestamp ?? "",
        source: b.source?.kind === "governance" ? "GOVERNANCE" : b.source?.kind === "approve" ? "APPROVAL" : "MESSAGE",
        sourceEventId: b.id,
      })
      return compareOrderingKeys(keyA, keyB)
    })
    return merged
  })

  const entriesWithProof = createMemo(() => {
    const events = props.governance?.() ?? []
    const executed = events.filter(
      (event) => event.type === "authorization.executed" || event.type === "authorization.execution_failed",
    )
    const evidenceCountByRequestHash: Record<string, number> = {}
    for (const event of events) {
      if (event.type !== "evidence.attached") continue
      const hash = typeof (event.payload as { requestHash?: unknown } | undefined)?.requestHash === "string"
        ? (event.payload as { requestHash: string }).requestHash
        : undefined
      if (!hash) continue
      evidenceCountByRequestHash[hash] = (evidenceCountByRequestHash[hash] ?? 0) + 1
    }
    return attachProofContinuations({
      entries: allVisibleEntries(),
      executedEvents: executed,
      evidenceCountByRequestHash,
      proof: sessionProof(),
    })
  })

  // ── Turn grouping + display indices + geometry ───────────────────
  const groupedVisibleEntries = createMemo(() => {
    const tui = governanceConfig.config().display.tui
    return collapseGovernanceEntries(entriesWithProof(), {
      enabled: tui.collapseGovernanceGroups,
      maxGroupSize: tui.collapseThreshold,
    })
  })
  const displayRows = createMemo(() => {
    let next = 1
    return groupedVisibleEntries().map((entry) => {
      if (entry.hidden) return entry
      const withIndex = entry.index === next ? entry : { ...entry, index: next }
      next++
      return withIndex
    })
  })
  const governedTally = createMemo(() => projectGovernedTally(groupedVisibleEntries()))
  const gutterWidth = createMemo(() =>
    spineGutterDigits(displayRows().reduce((max, entry) => Math.max(max, entry.index), 0)),
  )
  const proseWidth = createMemo(() => spineProseWidth(viewportWidth(), layout(), "chat", gutterWidth()))
  const thinkWidth = createMemo(() => spineProseWidth(viewportWidth(), layout(), "think", gutterWidth()))
  const thinkContentWidth = createMemo(() => thinkWidth())

  // ── Run state for the composer ───────────────────────────────────
  const runState = createMemo(() => {
    if (gateEntries().length) return "stop"
    const sessionStatus = props.sessionStatus?.()
    const statusType = sessionStatus?.type
    const sessionActive = statusType === "busy" || statusType === "retry"
    if (props.pending() && sessionActive) return "working"
    return "idle"
  })

  // ── Approval lookup helpers (shared by projection consumers) ─────
  const getApprovalForEntry = (entry: SpineEntry) => {
    const id = approvalIdFromEntryID(entry.id)
    if (!id) return undefined
    return approvals().find(a => a.approvalId === id)
  }

  return {
    headerSegments,
    trust,
    sessionCharter,
    sessionProof,
    governedTally,
    approvals,
    approvalEntries,
    allVisibleEntries,
    groupedVisibleEntries,
    displayRows,
    gutterWidth,
    proseWidth,
    thinkContentWidth,
    runState,
    getApprovalForEntry,
  }
}
