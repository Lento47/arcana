import { createEffect, createMemo } from "solid-js"
import type { Accessor } from "solid-js"
import type { AssistantMessage } from "@arcana/sdk/v2"
import type { ShellProps } from "../types"
import { useThinkingMode } from "../../context/thinking"
import { useSync } from "../../context/sync"
import { useTuiConfig } from "../../config"
import { useGovernanceConfig } from "../../context/governance-config"
import { useKV } from "../../context/kv"
import { shouldShowGovernanceEvent } from "@arcana/core/governance-config"
import { spineProseWidth, spineGutterDigits, type SpineLayout, type SpineEntry } from "./spine-types"
import { messagesToSpineEntriesCached, type SpineEntriesCache } from "./spine-mapper"
import { buildStatusSegments } from "./spine-segments"
import {
  contextTokenCount,
  hasContextUsage,
  usableContextWindow,
} from "../../util/context-pressure"
import { isLocalPermissionRequest, pendingGateEntries } from "./spine-gates"
import {
  approvalIdFromEntryID,
  dedupeApprovalEntries,
} from "./approval-spine-adapter"
import { compareOrderingKeys, createOrderingKey, createDedupeKey, dedupeKeyToString } from "./spine-ordering"
import {
  governanceTraceToSpineEntry,
  productionInputToSpineEntry,
} from "./production-spine-input"
import { collapseGovernanceEntries } from "./spine-governance-group"
import { buildTrustStatus, eventGapFromTrace } from "./spine-trust"
import { projectGovernedTally, projectSessionCharter } from "./session-charter"
import { getSessionGoal } from "@arcana/core/session/goal"
import { attachProofContinuations } from "./spine-proof-attach"
import { deriveComposerRunState } from "./turn-lifecycle"

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
  const tuiConfig = useTuiConfig()
  const governanceConfig = useGovernanceConfig()
  const kv = useKV()
  const layout = input.layout
  const viewportWidth = input.viewportWidth

  // Durable operator dismissals for approval banners (the "×" affordance).
  // Keyed by stable id: governance event ids are engine-durable, and approval
  // ids drop the version suffix so terminal transitions stay hidden too.
  const [dismissedApprovalMap, setDismissedApprovalMap] = kv.signal<Record<string, boolean>>(
    "spineDismissedApprovalEntries",
    {},
  )
  const dismissKeyFor = (entry: SpineEntry): string =>
    entry.id.startsWith("approval:") ? `approval:${entry.id.split(":")[1] ?? ""}` : entry.id

  // Cross-session cache slot for the CURRENT session (memo, not const —
  // <Session /> no longer remounts on session switch).
  const sessionState = createMemo(() => getSessionCache(props.sessionID))

  // ── Header segments ──────────────────────────────────────────────
  const lastAssistant = createMemo(() => {
    const fromProps = props.lastAssistant()
    if (fromProps?.role === "assistant") return fromProps as AssistantMessage
    return props.messages().findLast((m): m is AssistantMessage => m.role === "assistant")
  })
  const lastUsageAssistant = createMemo(() => {
    const last = lastAssistant()
    if (last && hasContextUsage(last.tokens)) return last
    return props.messages().findLast((m): m is AssistantMessage => m.role === "assistant" && hasContextUsage(m.tokens))
  })
  const modelName = createMemo(() => {
    const last = lastAssistant()
    if (!last) return undefined
    const provider = sync.data.provider.find((p) => p.id === last.providerID)
    return provider?.models[last.modelID]?.name ?? last.modelID
  })
  // Canonical context usage — mirrors engine session/overflow (tokenCount +
  // usable ceiling). Percent is of the full advertised window; overBudget is
  // the engine's hard-ceiling breach, which compacts even below the percent
  // threshold. context === 0 (unlimited/unknown) hides the segment entirely.
  const ctxUsage = createMemo(() => {
    const last = lastUsageAssistant()
    if (!last) return undefined
    const provider = sync.data.provider.find((p) => p.id === last.providerID)
    const limit = provider?.models[last.modelID]?.limit
    if (!limit || limit.context <= 0) return undefined
    const tokens = contextTokenCount(last.tokens)
    const usable = usableContextWindow(limit)
    return {
      percent: Math.round((tokens / limit.context) * 100),
      overBudget: usable > 0 && tokens >= usable,
    }
  })
  const headerSegments = createMemo(() => {
    const session = sync.data.session.find((s) => s.id === props.sessionID)
    const goal = getSessionGoal(props.sessionID)
    const meta = (session as { metadata?: Record<string, unknown> } | undefined)?.metadata
    const used = typeof meta?.__arcana_drive_continuations === "number" ? meta.__arcana_drive_continuations : 0
    const pending = (props.questions?.().length ?? 0) + (props.permissions?.().length ?? 0)
    const busy = props.sessionStatus?.()?.type === "busy"
    let drive: string | undefined
    if (goal.status === "complete_pending_verify") {
      drive = "verifying"
    } else if (goal.status === "complete" || goal.status === "complete_unverified") {
      drive = "done"
    } else if (goal.status === "in_progress") {
      if (goal.verification?.verdict === "rejected") drive = "rework"
      else if (pending > 0) drive = "paused"
      else if (busy) drive = used > 0 ? `${used}/6` : "on"
      else drive = "open"
    }
    return buildStatusSegments({
      sessionID: props.sessionID,
      branch: sync.data.vcs?.branch,
      model: modelName(),
      ctxPercent: ctxUsage()?.percent ?? null,
      ctxOverBudget: ctxUsage()?.overBudget,
      state: props.sessionStatus?.()?.type,
      path: session?.directory,
      drive,
    })
  })

  // ── Message entries (S6: pure memo, cache persisted outside) ─────
  const entries = createMemo(() => {
    const state = sessionState()
    const sessionStatusType = props.sessionStatus?.()?.type
    const result = messagesToSpineEntriesCached({
      messages: props.messages(),
      getParts: props.getParts,
      getPartRevision: props.getPartRevision,
      assistantDuration: props.assistantDuration(),
      cache: state.cache,
      previousEntries: state.previousEntries,
      expandThinking: thinking.mode() === "show",
      sessionStatusType,
    })
    return { entries: result.entries, cache: result.cache }
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
  // Running subagents: the tool metadata has no sessionId yet, but the child
  // session exists in sync (parentID). Stamp it so Enter / click-to-dive and
  // the open-subagent button all resolve the child context reliably.
  const fallbackChildSessionID = createMemo(() => {
    const parentID = props.sessionID
    let newest: string | undefined
    let newestCreated = -1
    for (const session of sync.data.session) {
      if (session.parentID !== parentID) continue
      const created = session.time?.created ?? 0
      if (created >= newestCreated) {
        newestCreated = created
        newest = session.id
      }
    }
    return newest
  })
  const entriesWithChildSessions = createMemo(() =>
    stampAgentChildSessions({
      entries: entries().entries,
      sessions: sync.data.session,
      parentSessionID: props.sessionID,
    })
  )
  const visibleEntries = createMemo(() => [...entriesWithChildSessions(), ...gateEntries()])

  // Child sessions are created by the engine but may not yet appear in the
  // local session list. When an agent entry has no linked sessionID and no
  // child session is known for this parent, refresh the session list once so
  // the fallback linker (stampAgentChildSessions) can resolve the dive target.
  const childRefreshRequested = new Set<string>()
  createEffect(() => {
    const parentID = props.sessionID
    const needLink = entries().entries.some((e) => e.kind === "agent" && !e.source?.sessionID)
    if (!needLink) return
    const hasChild = sync.data.session.some((s) => s.parentID === parentID)
    if (hasChild) return
    if (childRefreshRequested.has(parentID)) return
    childRefreshRequested.add(parentID)
    void sync.session.refresh()
  })

  // ── TUI-2.1: Approval integration ────────────────────────────────
  const approvals = createMemo(() => props.approvals?.() ?? [])

  const approvalEntries = createMemo(() => dedupeApprovalEntries(approvals()))

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
      selfGovernance: tuiConfig.self_governance,
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
      // Operator-dismissed approval banners ("×") never render again — the
      // dismissal is durable (KV), so restarts keep them hidden too.
      if (entry.kind === "approve" && dismissedApprovalMap()[dismissKeyFor(entry)]) continue
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
  const gutterWidth = createMemo(() => {
    if (props.showGutter && !props.showGutter()) return 0
    return spineGutterDigits(displayRows().reduce((max, entry) => Math.max(max, entry.index), 0))
  })
  const proseWidth = createMemo(() => spineProseWidth(viewportWidth(), layout(), "chat", gutterWidth()))
  const thinkWidth = createMemo(() => spineProseWidth(viewportWidth(), layout(), "think", gutterWidth()))
  const thinkContentWidth = createMemo(() => thinkWidth())

  // ── Run state for the composer ───────────────────────────────────
  const runState = createMemo(() => deriveComposerRunState({
    hasQuestions: props.questions().length > 0,
    hasLocalPermissions: props.permissions().some(isLocalPermissionRequest),
    hasPermissions: props.permissions().length > 0,
    pending: !!props.pending(),
    sessionStatusType: props.sessionStatus?.()?.type,
  }))

  // ── Approval lookup helpers (shared by projection consumers) ─────
  const getApprovalForEntry = (entry: SpineEntry) => {
    const id = approvalIdFromEntryID(entry.id)
    if (!id) return undefined
    return approvals().find(a => a.approvalId === id)
  }

  // Operator "×" on an approval banner: hide the row durably (survives
  // restarts). Cancelling the underlying live approval is the shell's job —
  // it owns the approval controller.
  const dismissSpineEntry = (entry: SpineEntry) => {
    setDismissedApprovalMap((prev) => ({ ...prev, [dismissKeyFor(entry)]: true }))
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
    dismissSpineEntry,
    fallbackChildSessionID,
  }
}

/**
 * Running subagent rows carry no child sessionID in the tool metadata until the
 * engine records it. The child session is already visible in sync (parentID), so
 * stamp a matching child onto agent entries without one. Matching prefers the
 * child whose title names the entry's actor (`@agent subagent`), with a fallback
 * to the newest child — this is what Enter-to-dive, the open-subagent button,
 * and the inline working panel all rely on.
 */
export function stampAgentChildSessions(input: {
  entries: SpineEntry[]
  sessions: Array<{ id: string; parentID?: string | null; title?: string | null; time?: { created?: number } }>
  parentSessionID: string
}): SpineEntry[] {
  const { entries, sessions, parentSessionID } = input
  let needsStamp = false
  for (const entry of entries) {
    if (entry.kind === "agent" && !entry.source?.sessionID && entry.actor) {
      needsStamp = true
      break
    }
  }
  if (!needsStamp) return entries

  const children = sessions.filter((s) => s.parentID === parentSessionID)
  if (children.length === 0) return entries

  const newestChild = children.reduce((max, s) =>
    (s.time?.created ?? 0) > (max.time?.created ?? 0) ? s : max,
  )
  const newestChildID = newestChild.id

  const childByAgent = new Map<string, { id: string; created: number }>()
  for (const child of children) {
    const agentName = child.title?.match(/@([\w-]+)\s+subagent/i)?.[1]
    if (!agentName) continue
    const created = child.time?.created ?? 0
    const existing = childByAgent.get(agentName)
    if (!existing || created > existing.created) {
      childByAgent.set(agentName, { id: child.id, created })
    }
  }

  return entries.map((entry): SpineEntry => {
    if (entry.kind !== "agent" || entry.source?.sessionID || !entry.actor) return entry
    const matched = entry.actor ? childByAgent.get(entry.actor) : undefined
    return {
      ...entry,
      source: { ...entry.source, sessionID: matched?.id ?? newestChildID } as SpineEntry["source"],
    }
  })
}
