import type {
  Message,
  Agent,
  Provider,
  Session,
  Part,
  Config,
  Todo,
  Command,
  PermissionRequest,
  QuestionRequest,
  LspStatus,
  McpStatus,
  McpResource,
  FormatterStatus,
  SessionStatus,
  ProviderListResponse,
  ProviderAuthMethod,
  VcsInfo,
  SnapshotFileDiff,
  ConsoleState,
  SessionGovernanceResponse,
} from "@arcana/sdk/v2"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import { detectLocalOllama } from "@arcana/core/providers/ollama"
import { createStore, produce, reconcile } from "solid-js/store"
import { useProject } from "./project"
import { useEvent } from "./event"
import { useSDK, SSE_SILENT_DEATH_MS } from "./sdk"
import { shouldKeepLocalPart, shouldKeepLocalAuthoritative } from "../util/part-merge"
import { streamState, type TransportEnvelope } from "./stream-state"
import { createMissingDeltaTracker } from "../util/missing-delta-tracker"
import { useTuiStartup } from "./runtime"
import { createSimpleContext } from "./helper"
import { useExit } from "./exit"
import { useArgs } from "./args"
import { batch, onMount } from "solid-js"
import path from "path"
import { useKV } from "./kv"

export type ReconcileReason = "heartbeat-gap" | "missing-part" | "reconnect" | "stream-reset" | "manual" | "turn-end"

/**
 * Part liveness window for hydration merges. An actively-streaming part
 * receives deltas far more often than every 5s, so live text stays
 * protected; a part whose events stopped (missed event, consumer stall,
 * silent freeze) converges to the REST ground truth on the next heartbeat
 * resync (10s cadence). The 30s SSE_SILENT_DEATH_MS stays for watchdog
 * bookkeeping; this 5s window is the merge's convergence bound.
 */
const SSE_PART_LIVENESS_MS = 5_000

const emptyConsoleState: ConsoleState = {
  consoleManagedProviders: [],
  switchableOrgCount: 0,
}

/**
 * Merge a fetched session list into the local store.
 * A stale list fetch started before session.create must not delete the
 * session the user just opened (Solid reconcile of the whole array would).
 */
export function mergeSessionList(current: Session[], incoming: Session[]): Session[] {
  const byId = new Map<string, Session>()
  for (const session of current) byId.set(session.id, session)
  for (const session of incoming) byId.set(session.id, session)
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

function search<T>(items: T[], target: string, key: (item: T) => string) {
  let left = 0
  let right = items.length - 1
  while (left <= right) {
    const middle = Math.floor((left + right) / 2)
    const value = key(items[middle])
    if (value === target) return { found: true, index: middle }
    if (value < target) left = middle + 1
    else right = middle - 1
  }
  return { found: false, index: left }
}

export const {
  context: SyncContext,
  use: useSync,
  provider: SyncProvider,
} = createSimpleContext({
  name: "Sync",
  init: () => {
    const startup = useTuiStartup()
    const kv = useKV()
    const [store, setStore] = createStore<{
      status: "loading" | "partial" | "complete"
      provider: Provider[]
      provider_default: Record<string, string>
      provider_next: ProviderListResponse
      console_state: ConsoleState
      provider_auth: Record<string, ProviderAuthMethod[]>
      agent: Agent[]
      command: Command[]
      permission: {
        [sessionID: string]: PermissionRequest[]
      }
      question: {
        [sessionID: string]: QuestionRequest[]
      }
      config: Config
      session: Session[]
      session_status: {
        [sessionID: string]: SessionStatus
      }
      session_compacting: {
        [sessionID: string]: boolean
      }
      session_diff: {
        [sessionID: string]: SnapshotFileDiff[]
      }
      todo: {
        [sessionID: string]: Todo[]
      }
      message: {
        [sessionID: string]: Message[]
      }
      part: {
        [messageID: string]: Part[]
      }
      /** Monotonic semantic revision for each message's part collection. */
      part_revision: {
        [messageID: string]: number
      }
      lsp: LspStatus[]
      mcp: {
        [key: string]: McpStatus
      }
      mcp_resource: {
        [key: string]: McpResource
      }
      formatter: FormatterStatus[]
      vcs: VcsInfo | undefined
      /** Durable approval records, keyed by approvalId (RB-01 D4 sync channel). */
      approvals: {
        [approvalId: string]: ApprovalRecord
      }
      /** Durable Phase C governance projection, keyed by session ID. */
      governance: {
        [sessionID: string]: SessionGovernanceResponse
      }
    }>({
      provider_next: {
        all: [],
        default: {},
        connected: [],
      },
      console_state: emptyConsoleState,
      provider_auth: {},
      config: {},
      status: "loading",
      agent: [],
      permission: {},
      question: {},
      command: [],
      provider: [],
      provider_default: {},
      session: [],
      session_status: {},
      session_compacting: {},
      session_diff: {},
      todo: {},
      message: {},
      part: {},
      part_revision: {},
      lsp: [],
      mcp: {},
      mcp_resource: {},
      formatter: [],
      vcs: undefined,
      approvals: {},
      governance: {},
    })

    const event = useEvent()
    const project = useProject()
    const sdk = useSDK()

    const unavailableGovernance = (sessionID: string): SessionGovernanceResponse => ({
      sessionId: sessionID,
      trace: {
        status: "UNAVAILABLE",
        expectedCriticalEvents: 0,
        recordedCriticalEvents: 0,
        recordingErrors: [],
      },
      events: [],
      proof: {
        proofHash: "",
        runRoot: "",
        derivedAt: "1970-01-01T00:00:00.000Z",
        eventCount: 0,
        lastSequence: 0,
        proofLevel: "P0",
        traceHealth: "UNAVAILABLE",
        integrityStatus: "UNVERIFIED",
        lifecycleStatus: "INCOMPLETE",
        assuranceProfile: {
          trace: "NONE",
          integrity: "UNVERIFIED",
          verification: "UNVERIFIED",
          reproducibility: "NONE",
        },
        claimsByStatus: {},
        obligationsByStatus: {},
        gaps: ["Governance projection unavailable"],
        authorizationProfile: {
          policyVersions: [],
          requests: 0,
          allowed: 0,
          denied: 0,
          approvalsRequired: 0,
          staleDecisions: 0,
          executed: 0,
          executionFailures: 0,
          unauthorizedExecutions: 0,
          capabilityViolations: 0,
          authorizationTraceHealth: "UNAVAILABLE",
          orphanExecutions: 0,
          unmatchedAllows: 0,
          unmatchedRequests: 0,
          intentEnforcementMode: "UNAVAILABLE",
          intentBindingsCreated: 0,
          intentTraceHealth: "UNAVAILABLE",
        },
      },
    })

    const loadGovernance = async (sessionID: string, signal?: AbortSignal): Promise<SessionGovernanceResponse> => {
      try {
        const response = await sdk.client.session.governance(
          { sessionID },
          signal ? ({ throwOnError: true, signal } as never) : { throwOnError: true },
        )
        return response.data ?? unavailableGovernance(sessionID)
      } catch (error) {
        // Governance evidence is fail-visible, but an unavailable projection
        // must never make the underlying session or message history unusable.
        if (signal?.aborted) throw error
        return unavailableGovernance(sessionID)
      }
    }

    const bumpPartRevision = (messageID: string) => {
      setStore("part_revision", messageID, (revision) => (revision ?? 0) + 1)
    }

    const fullSyncedSessions = new Set<string>()
    const syncingSessions = new Map<string, Promise<void>>()
    const hydratingSessions = new Map<string, { messages: Set<string>; parts: Set<string> }>()
    const olderCursors = new Map<string, string | undefined>()
    const loadingOlderSessions = new Set<string>()
    const exhaustedOlderSessions = new Set<string>()
    /**
     * Authoritative reconcile state (P12.4). Separate from syncingSessions so
     * a heartbeat-gap repair can never be mistaken for (or deduped into) the
     * initial hydration, and vice versa.
     */
    const reconcilingSessions = new Map<string, Promise<void>>()
    const reconcileGeneration = new Map<string, number>()
    const governanceRefreshGeneration = new Map<string, number>()
    const RECONCILE_TIMEOUT_MS = 15_000

    const mergeGovernanceEvents = (
      current: readonly SessionGovernanceResponse["events"][number][],
      authoritative: readonly SessionGovernanceResponse["events"][number][],
    ): SessionGovernanceResponse["events"] => {
      const byID = new Map([...current, ...authoritative].map((event) => [event.id, event]))
      return [...byID.values()]
        .sort((a, b) => {
          const aSequence = typeof a.sequence === "number" ? a.sequence : Number.MAX_SAFE_INTEGER
          const bSequence = typeof b.sequence === "number" ? b.sequence : Number.MAX_SAFE_INTEGER
          return aSequence - bSequence || a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id)
        })
        .slice(-500)
    }

    const refreshGovernance = (sessionID: string) => {
      const generation = (governanceRefreshGeneration.get(sessionID) ?? 0) + 1
      governanceRefreshGeneration.set(sessionID, generation)
      void loadGovernance(sessionID).then((authoritative) => {
        if (governanceRefreshGeneration.get(sessionID) !== generation) return
        const current = store.governance[sessionID]
        setStore(
          "governance",
          sessionID,
          reconcile({
            ...authoritative,
            events: mergeGovernanceEvents(current?.events ?? [], authoritative.events),
          }),
        )
      })
    }
    /**
     * Missing-part delta diagnostics (P12.5). Deltas that arrive for a part
     * the store does not know are never replayed (authoritative REST content
     * is preferred; replay risks duplication). They are counted and bounded
     * by missing-delta-tracker.ts, and each occurrence triggers an
     * authoritative reconcile.
     */
    const missingDeltaTracker = createMissingDeltaTracker()
    function noteMissingPartDelta(event: { properties: { partID: string; delta?: string; sessionID?: string }; transport?: TransportEnvelope }) {
      const stats = missingDeltaTracker.note(event.properties.partID, event.properties.delta, event.transport?.sequence)
      if (missingDeltaTracker.overflowed(event.properties.partID)) {
        console.warn(
          `[arcana] missing-part delta buffer overflow session=${event.properties.sessionID ?? "?"} part=${event.properties.partID} count=${stats.count} bytes=${stats.bytes} seq=${stats.lastSequence} — reconciling`,
        )
      }
    }
    function clearMissingPartStats(partID: string) {
      missingDeltaTracker.clear(partID)
    }
    /**
     * Part-level liveness (part-merge.ts): last live part event (delta or
     * full update) per part. Lets the hydration merge tell "live stream"
     * (keep the locally-accumulated part) from "stream died" (REST is
     * authoritative, replace the truncated prefix).
     */
    const lastPartLiveAt = new Map<string, number>()
    /** Serial idle-prefetch queue (concurrency cap 1). */
    const prefetchQueue: string[] = []
    let prefetchDraining = false
    const touchMessage = (sessionID: string, messageID: string) => {
      hydratingSessions.get(sessionID)?.messages.add(messageID)
    }
    const touchPart = (sessionID: string, partID: string) => {
      hydratingSessions.get(sessionID)?.parts.add(partID)
    }

    function sessionListQuery(): { scope?: "project"; path?: string } {
      if (!kv.get("session_directory_filter_enabled", true)) return { scope: "project" }
      if (!project.data.instance.path.worktree || !project.data.instance.path.directory) return { scope: "project" }
      return {
        path: path
          .relative(path.resolve(project.data.instance.path.worktree), project.data.instance.path.directory)
          .replaceAll("\\", "/"),
      }
    }

    function listSessions() {
      return sdk.client.session
        .list({ start: Date.now() - 30 * 24 * 60 * 60 * 1000, ...sessionListQuery() })
        .then((x) => (x.data ?? []).toSorted((a, b) => a.id.localeCompare(b.id)))
    }

    event.subscribe((event, { workspace }) => {
      // P12 applied-tracking: this subscriber IS the store projection. The
      // transport sequence advances lastApplied only when the event was fully
      // processed without throwing; a failure leaves lastApplied behind so the
      // heartbeat gap check triggers an authoritative reconcile.
      const __eventTransport = (event as { transport?: TransportEnvelope }).transport
      const __appliedSeq = __eventTransport?.headSequence === undefined ? __eventTransport?.sequence : undefined
      try {
      switch (event.type) {
        case "server.instance.disposed":
          void bootstrap()
          break
        case "permission.replied": {
          const requests = store.permission[event.properties.sessionID]
          if (!requests) break
          const match = search(requests, event.properties.requestID, (r) => r.id)
          if (!match.found) break
          setStore(
            "permission",
            event.properties.sessionID,
            produce((draft) => {
              draft.splice(match.index, 1)
            }),
          )
          break
        }

        case "permission.asked": {
          const request = event.properties
          const requests = store.permission[request.sessionID]
          if (!requests) {
            setStore("permission", request.sessionID, [request])
            break
          }
          const match = search(requests, request.id, (r) => r.id)
          if (match.found) {
            setStore("permission", request.sessionID, match.index, reconcile(request))
            break
          }
          setStore(
            "permission",
            request.sessionID,
            produce((draft) => {
              draft.splice(match.index, 0, request)
            }),
          )
          break
        }

        case "question.replied":
        case "question.rejected": {
          const requests = store.question[event.properties.sessionID]
          if (!requests) break
          const match = search(requests, event.properties.requestID, (r) => r.id)
          if (!match.found) break
          setStore(
            "question",
            event.properties.sessionID,
            produce((draft) => {
              draft.splice(match.index, 1)
            }),
          )
          break
        }

        case "question.asked": {
          const request = event.properties
          const requests = store.question[request.sessionID]
          if (!requests) {
            setStore("question", request.sessionID, [request])
            break
          }
          const match = search(requests, request.id, (r) => r.id)
          if (match.found) {
            setStore("question", request.sessionID, match.index, reconcile(request))
            break
          }
          setStore(
            "question",
            request.sessionID,
            produce((draft) => {
              draft.splice(match.index, 0, request)
            }),
          )
          break
        }

        case "todo.updated":
          setStore("todo", event.properties.sessionID, event.properties.todos)
          break

        case "session.diff":
          setStore("session_diff", event.properties.sessionID, event.properties.diff)
          break

        case "session.deleted": {
          const result = search(store.session, event.properties.info.id, (s) => s.id)
          if (result.found) {
            setStore(
              "session",
              produce((draft) => {
                draft.splice(result.index, 1)
              }),
            )
          }
          setStore(
            "governance",
            produce((draft) => {
              delete draft[event.properties.info.id]
            }),
          )
          break
        }
        case "governance.recorded": {
          const sessionID = event.properties.sessionID
          const snapshot = store.governance[sessionID]
          if (!snapshot) {
            setStore(
              "governance",
              sessionID,
              reconcile({ ...unavailableGovernance(sessionID), events: [event.properties.event] }),
            )
          } else {
            const next = event.properties.event
            const existing = snapshot.events.findIndex((item) => item.id === next.id)
            if (existing >= 0) {
              setStore("governance", sessionID, "events", existing, reconcile(next))
            } else {
              setStore(
                "governance",
                sessionID,
                "events",
                reconcile(mergeGovernanceEvents(snapshot.events, [next])),
              )
            }
          }
          // Refresh trace health after the post-commit event. The generation
          // guard prevents an older request from overwriting a newer status;
          // durable-ID merging prevents any response from erasing live proof.
          refreshGovernance(sessionID)
          break
        }
        case "session.created":
        case "session.updated": {
          const result = search(store.session, event.properties.info.id, (s) => s.id)
          if (result.found) {
            setStore("session", result.index, reconcile(event.properties.info))
            break
          }
          setStore(
            "session",
            produce((draft) => {
              draft.splice(result.index, 0, event.properties.info)
            }),
          )
          break
        }

        case "session.next.moved": {
          const result = search(store.session, event.properties.sessionID, (s) => s.id)
          if (!result.found) break
          setStore(
            "session",
            result.index,
            produce((session) => {
              session.directory = event.properties.location.directory
              session.path = event.properties.subdirectory
              session.workspaceID = event.properties.location.workspaceID
              session.time.updated = event.properties.timestamp
            }),
          )
          break
        }

        case "session.status": {
          setStore("session_status", event.properties.sessionID, event.properties.status)
          // Turn-end converge (F2): the engine transitioned to idle, so the
          // projection must converge to the durable outcome. Generation-
          // guarded + deduped by reconcile(); a concurrent turn-end
          // reconcile (from the message.updated trigger) is a no-op here.
          if (event.properties.status?.type === "idle") {
            void result.session.reconcile(event.properties.sessionID, "turn-end").catch(() => {})
          }
          break
        }

        case "session.next.compaction.started": {
          setStore("session_compacting", event.properties.sessionID, true)
          break
        }

        case "session.next.compaction.ended": {
          setStore("session_compacting", event.properties.sessionID, false)
          break
        }

        // Always published on successful apply (even without experimental event system)
        case "session.compacted": {
          setStore("session_compacting", event.properties.sessionID, false)
          break
        }

        case "message.updated": {
          touchMessage(event.properties.info.sessionID, event.properties.info.id)
          const info = event.properties.info
          // Turn-end converge (F2): a terminal finish on the wire must be
          // reflected in the projection — live deltas can lag the durable
          // terminal state. Any non-empty finish is terminal (matches
          // turn-lifecycle.ts messageFinished semantics; covers stop /
          // tool-calls / length / content-filter / error / unknown).
          if (info.role === "assistant" && typeof info.finish === "string" && info.finish.length > 0) {
            void result.session.reconcile(info.sessionID, "turn-end").catch(() => {})
          }
          const messages = store.message[event.properties.info.sessionID]
          if (!messages) {
            setStore("message", event.properties.info.sessionID, [event.properties.info])
            break
          }
          const match = search(messages, event.properties.info.id, (m) => m.id)
          if (match.found) {
            const info = event.properties.info
            setStore("message", event.properties.info.sessionID, match.index, reconcile(info))
            break
          }
          setStore(
            "message",
            event.properties.info.sessionID,
            produce((draft) => {
              draft.splice(match.index, 0, event.properties.info)
            }),
          )
          const updated = store.message[event.properties.info.sessionID]
          if (updated.length > 100) {
            const oldest = updated[0]
            batch(() => {
              setStore(
                "message",
                event.properties.info.sessionID,
                produce((draft) => {
                  draft.shift()
                }),
              )
              setStore(
                "part",
                produce((draft) => {
                  delete draft[oldest.id]
                }),
              )
              setStore(
                "part_revision",
                produce((draft) => {
                  delete draft[oldest.id]
                }),
              )
            })
          }
          break
        }
        case "message.removed": {
          touchMessage(event.properties.sessionID, event.properties.messageID)
          const messages = store.message[event.properties.sessionID]
          const result = search(messages, event.properties.messageID, (m) => m.id)
          if (result.found) {
            setStore(
              "message",
              event.properties.sessionID,
              produce((draft) => {
                draft.splice(result.index, 1)
              }),
            )
          }
          break
        }
        case "message.part.updated": {
          touchPart(event.properties.part.sessionID, event.properties.part.id)
          clearMissingPartStats(event.properties.part.id)
          lastPartLiveAt.set(event.properties.part.id, Date.now())
          const parts = store.part[event.properties.part.messageID]
          if (!parts) {
            batch(() => {
              setStore("part", event.properties.part.messageID, [event.properties.part])
              bumpPartRevision(event.properties.part.messageID)
            })
            break
          }
          const result = search(parts, event.properties.part.id, (p) => p.id)
          if (result.found) {
            batch(() => {
              setStore("part", event.properties.part.messageID, result.index, reconcile(event.properties.part))
              bumpPartRevision(event.properties.part.messageID)
            })
            break
          }
          batch(() => {
            setStore(
              "part",
              event.properties.part.messageID,
              produce((draft) => {
                draft.splice(result.index, 0, event.properties.part)
              }),
            )
            bumpPartRevision(event.properties.part.messageID)
          })
          break
        }

        case "message.part.delta": {
          const parts = store.part[event.properties.messageID]
          if (!parts) {
            // P12.5: delta for a message the store does not know. Never replay
            // (duplication risk); record diagnostics and reconcile from REST.
            noteMissingPartDelta(event as { properties: { partID: string; delta?: string; sessionID?: string }; transport?: TransportEnvelope })
            void result.session.reconcile(event.properties.sessionID, "missing-part").catch(() => {})
            break
          }
          const hit = search(parts, event.properties.partID, (p) => p.id)
          if (!hit.found) {
            // P12.5: delta for a part the store does not know (its creation
            // event was dropped or reordered). The part will be repaired by
            // the authoritative reconcile; the deltas are diagnostics only.
            noteMissingPartDelta(event as { properties: { partID: string; delta?: string; sessionID?: string }; transport?: TransportEnvelope })
            void result.session.reconcile(event.properties.sessionID, "missing-part").catch(() => {})
            break
          }
          touchPart(event.properties.sessionID, event.properties.partID)
          lastPartLiveAt.set(event.properties.partID, Date.now())
          // Opportunistic prune: keep the map bounded, drop stale entries.
          if (lastPartLiveAt.size > 1000) {
            const cutoff = Date.now() - SSE_SILENT_DEATH_MS * 6
            for (const [id, at] of lastPartLiveAt) {
              if (at < cutoff) lastPartLiveAt.delete(id)
            }
          }
          batch(() => {
            setStore(
              "part",
              event.properties.messageID,
              produce((draft) => {
                const part = draft[hit.index]
                const field = event.properties.field as keyof typeof part
                const existing = part[field] as string | undefined
                ;(part[field] as string) = (existing ?? "") + event.properties.delta
              }),
            )
            bumpPartRevision(event.properties.messageID)
          })
          break
        }

        case "message.part.removed": {
          touchPart(event.properties.sessionID, event.properties.partID)
          const parts = store.part[event.properties.messageID]
          const result = search(parts, event.properties.partID, (p) => p.id)
          if (result.found) {
            batch(() => {
              setStore(
                "part",
                event.properties.messageID,
                produce((draft) => {
                  draft.splice(result.index, 1)
                }),
              )
              bumpPartRevision(event.properties.messageID)
            })
          }
          break
        }

        case "lsp.updated": {
          const workspace = project.workspace.current()
          void sdk.client.lsp.status({ workspace }).then((x) => setStore("lsp", x.data ?? []))
          break
        }

        case "vcs.branch.updated": {
          if (workspace === project.workspace.current()) {
            setStore("vcs", { branch: event.properties.branch })
          }
          break
        }
      }
      if (__appliedSeq !== undefined) {
        streamState.lastApplied = Math.max(streamState.lastApplied, __appliedSeq)
      }
      } catch (__applyError) {
        const __props = (event as { properties?: { partID?: string; messageID?: string; part?: { id?: string } } }).properties
        console.error(
          `[arcana] sync subscriber failed on ${event.type} seq=${__appliedSeq ?? "?"} part=${__props?.partID ?? __props?.part?.id ?? "?"} msg=${__props?.messageID ?? "?"}`,
          __applyError,
        )
      }
    })

    // TUI-2.1C (RB-01 §D4): durable approval records are pushed on create and
    // every transition over the same SSE channel as messages/parts. The event
    // is not yet part of the generated SDK union — match defensively by name.
    // Contract: { type: "approval.updated", properties: { sessionID, approval } }
    event.subscribe((event) => {
      if ((event as { type: string }).type !== "approval.updated") return
      const approval = (event as unknown as { properties?: { approval?: ApprovalRecord } }).properties?.approval
      if (!approval?.approvalId) return
      setStore("approvals", approval.approvalId, approval)
    })

    const exit = useExit()
    const args = useArgs()

    async function bootstrap(input: { fatal?: boolean } = {}) {
      const fatal = input.fatal ?? true
      const workspace = project.workspace.current()
      const projectPromise = project.sync()

      // Fire session list in parallel with project sync — before project.sync
      // the path filter falls back to { scope: "project" }, which is functionally
      // correct (just broader). This saves ~1 RTT of sequential wait on bootstrap.
      const sessionListPromise = listSessions()

      // blocking — only the essentials needed before first paint.
      // agents and config are deferred to startupTasks (non-blocking before "complete").
      const providersPromise = sdk.client.config.providers({ workspace }, { throwOnError: true })
      const providerListPromise = sdk.client.provider.list({ workspace }, { throwOnError: true })
      const consoleStatePromise = sdk.client.experimental.console
        .get({ workspace }, { throwOnError: true })
        .then((x) => x.data)
        .catch(() => emptyConsoleState)
      await Promise.all([
        providersPromise,
        providerListPromise,
        projectPromise,
        ...(args.continue ? [sessionListPromise] : []),
      ])
        .then(async () => {
          const providersResponse = providersPromise.then((x) => x.data!)
          const providerListResponse = providerListPromise.then((x) => x.data!)
          const consoleStateResponse = consoleStatePromise
          const sessionListResponse = args.continue ? sessionListPromise : undefined

          return Promise.all([
            providersResponse,
            providerListResponse,
            consoleStateResponse,
            ...(sessionListResponse ? [sessionListResponse] : []),
          ]).then((responses) => {
            const providers = responses[0]
            const providerList = responses[1]
            const consoleState = responses[2]
            const sessions = responses[3]

            batch(() => {
              setStore("provider", reconcile(providers.providers))
              setStore("provider_default", reconcile(providers.default))
              setStore("provider_next", reconcile(providerList))
              setStore("console_state", reconcile(consoleState))
              if (sessions !== undefined) setStore("session", mergeSessionList(store.session, sessions))
            })

            // Local Ollama discovery follows the arcana doctor: both use the
            // shared detectLocalOllama probe (packages/core/src/providers/
            // ollama.ts). No detection -> no entry, no log. Detected but no
            // models -> nothing to switch to, stay silent. The active model
            // is never affected; the probe only adds an "Ollama (local)"
            // entry to the provider switcher when a daemon is actually
            // running.
            void detectLocalOllama().then((ollama) => {
              if (!ollama || ollama.models.length === 0) return
              const ollamaProvider = {
                id: "ollama",
                name: "Ollama (local)",
                status: "connected" as const,
                models: Object.fromEntries(
                  ollama.models.map((m) => [m, { id: m, name: m, providerID: "ollama" }]),
                ) as Record<string, { id: string; name: string; providerID: string }>,
              }
              // Inject into provider_next (new) and provider (legacy)
              setStore("provider_next", "all", (prev: any[]) => {
                const filtered = prev.filter((p: any) => p.id !== "ollama")
                return [...filtered, ollamaProvider]
              })
              setStore("provider_next", "connected", (prev: string[]) => {
                if (prev.includes("ollama")) return prev
                return [...prev, "ollama"]
              })
              setStore("provider", (prev: any[]) => {
                const filtered = prev.filter((p: any) => p.id !== "ollama")
                return [...filtered, ollamaProvider] as any
              })
            })
          })
        })
        .then(() => {
          if (store.status !== "complete") setStore("status", "partial")

          // Keep startup completion tied to data that affects the initial route
          // and command surface. Slower catalogs can settle after the TUI is usable.
          const startupTasks = [
            ...(args.continue ? [] : [sessionListPromise.then((sessions) => setStore("session", mergeSessionList(store.session, sessions)))]),
            consoleStatePromise.then((consoleState) => setStore("console_state", reconcile(consoleState))),
            sdk.client.app.agents({ workspace }).then((x) => setStore("agent", reconcile(x.data ?? []))),
            sdk.client.config.get({ workspace }).then((x) => setStore("config", reconcile(x.data!))),
            sdk.client.command.list({ workspace }).then((x) => setStore("command", reconcile(x.data ?? []))),
            sdk.client.session.status({ workspace }).then((x) => {
              setStore("session_status", reconcile(x.data ?? {}))
            }),
          ]

          const catalogTasks = [
            sdk.client.provider.auth({ workspace }).then((x) => setStore("provider_auth", reconcile(x.data ?? {}))),
            sdk.client.lsp.status({ workspace }).then((x) => setStore("lsp", reconcile(x.data ?? []))),
            sdk.client.mcp.status({ workspace }).then((x) => setStore("mcp", reconcile(x.data ?? {}))),
            sdk.client.experimental.resource
              .list({ workspace })
              .then((x) => setStore("mcp_resource", reconcile(x.data ?? {}))),
            sdk.client.formatter.status({ workspace }).then((x) => setStore("formatter", reconcile(x.data ?? []))),
            sdk.client.vcs.get({ workspace }).then((x) => setStore("vcs", reconcile(x.data))),
            project.workspace.sync(),
          ]

          void Promise.allSettled(startupTasks).then(() => {
            setStore("status", "complete")
            void Promise.allSettled(catalogTasks)
          })
        })
        .catch(async (e) => {
          console.error("tui bootstrap failed", {
            error: e instanceof Error ? e.message : String(e),
            name: e instanceof Error ? e.name : undefined,
            stack: e instanceof Error ? e.stack : undefined,
          })
          if (fatal) {
            exit(e)
          } else {
            throw e
          }
        })
    }

    onMount(() => {
      void bootstrap()
    })

    async function drainPrefetchQueue() {
      if (prefetchDraining) return
      prefetchDraining = true
      try {
        while (prefetchQueue.length > 0) {
          const id = prefetchQueue.shift()
          if (!id) continue
          if (fullSyncedSessions.has(id)) continue
          // Reuse sync() so live-hydration race guards stay identical.
          await result.session.sync(id).catch(() => undefined)
        }
      } finally {
        prefetchDraining = false
        if (prefetchQueue.length > 0) void drainPrefetchQueue()
      }
    }

    const result = {
      data: store,
      set: setStore,
      get status() {
        return store.status
      },
      get ready() {
        if (startup.skipInitialLoading) return true
        return store.status !== "loading"
      },
      get path() {
        return project.instance.path()
      },
      session: {
        get(sessionID: string) {
          const match = search(store.session, sessionID, (s) => s.id)
          if (match.found) return store.session[match.index]
          return undefined
        },
        /**
         * Insert or replace a session in the local store without a network round-trip.
         * Used after session.create / Home prewarm so navigate does not flash "not found".
         */
        upsert(info: Session) {
          setStore(
            "session",
            produce((draft) => {
              const match = search(draft, info.id, (s) => s.id)
              if (match.found) draft[match.index] = info
              else draft.splice(match.index, 0, info)
            }),
          )
        },
        /** Drop a local-only stub (pending-* ids) after the real session exists. */
        forget(sessionID: string) {
          setStore(
            "session",
            produce((draft) => {
              const match = search(draft, sessionID, (s) => s.id)
              if (match.found) draft.splice(match.index, 1)
            }),
          )
        },
        query() {
          return sessionListQuery()
        },
        async refresh() {
          const list = await listSessions()
          setStore("session", mergeSessionList(store.session, list))
        },
        status(sessionID: string) {
          const session = result.session.get(sessionID)
          if (!session) return "idle"
          if (session.time.compacting) return "compacting"
          const messages = store.message[sessionID] ?? []
          const last = messages.at(-1)
          if (!last) return "idle"
          if (last.role === "user") return "working"
          return last.time?.completed ? "idle" : "working"
        },
        /** True after a successful full hydrate (get+messages+todo+diff). Warm switches skip network. */
        isSynced(sessionID: string) {
          return fullSyncedSessions.has(sessionID)
        },
        /**
         * Idle prefetch for pinned / quick-switch slots.
         * Reuses `sync()` (same race guards). Concurrent work is serial (cap 1).
         * Skips already-synced and in-flight sessions.
         */
        prefetch(sessionIDs: string[]) {
          for (const id of sessionIDs) {
            if (!id) continue
            if (fullSyncedSessions.has(id)) continue
            if (syncingSessions.has(id)) continue
            if (prefetchQueue.includes(id)) continue
            prefetchQueue.push(id)
          }
          void drainPrefetchQueue()
        },
        async sync(sessionID: string) {
          if (fullSyncedSessions.has(sessionID)) return
          const syncing = syncingSessions.get(sessionID)
          if (syncing) return syncing
          const tracker = { messages: new Set<string>(), parts: new Set<string>() }
          hydratingSessions.set(sessionID, tracker)
          const task = (async () => {
            const [session, messages, todo, diff, governance] = await Promise.all([
              sdk.client.session.get({ sessionID }, { throwOnError: true }),
              sdk.client.session.messages({ sessionID, limit: 25 }),
              sdk.client.session.todo({ sessionID }),
              sdk.client.session.diff({ sessionID }),
              loadGovernance(sessionID),
            ])

            // Store cursor for lazy-loading older messages
            const responseData = (messages as any).data?.items ?? (messages as any).data ?? []
            const oldest = responseData[responseData.length - 1]
            olderCursors.set(sessionID, oldest?.info?.id ?? undefined)

            setStore(
              produce((draft) => {
                const match = search(draft.session, sessionID, (s) => s.id)
                if (match.found) draft.session[match.index] = session.data!
                if (!match.found) draft.session.splice(match.index, 0, session.data!)
                draft.todo[sessionID] = todo.data ?? []
                const currentMessages = draft.message[sessionID] ?? []
                const infos = responseData.flatMap((message: any) => {
                  if (!tracker.messages.has(message.info.id)) return [message.info]
                  const current = currentMessages.find((item) => item.id === message.info.id)
                  return current ? [current] : []
                })
                infos.push(
                  ...currentMessages.filter(
                    (message: any) => tracker.messages.has(message.id) && !infos.some((item: any) => item.id === message.id),
                  ),
                )
                const removed = infos.slice(0, -100)
                const visible: any[] = infos.slice(-100)
                const visibleIDs = new Set(visible.map((message: any) => message.id))
                for (const message of responseData) {
                  if (!visibleIDs.has(message.info.id)) {
                    delete draft.part[message.info.id]
                    delete draft.part_revision[message.info.id]
                    continue
                  }
                  const currentParts = draft.part[message.info.id] ?? []
                  const now = Date.now()
                  const parts = message.parts.flatMap((part: any) => {
                    const current = currentParts.find((item) => item.id === part.id)
                    if (
                      shouldKeepLocalPart({
                        rest: part,
                        current,
                        tracked: tracker.parts.has(part.id),
                        lastEventAt: lastPartLiveAt.get(part.id) ?? 0,
                        now,
                        silenceMs: SSE_PART_LIVENESS_MS,
                      })
                    ) {
                      return current ? [current] : []
                    }
                    return [part]
                  })
                  parts.push(
                    ...currentParts.filter(
                      (part: any) => tracker.parts.has(part.id) && !parts.some((item: any) => item.id === part.id),
                    ),
                  )
                  draft.part[message.info.id] = parts
                  draft.part_revision[message.info.id] = (draft.part_revision[message.info.id] ?? 0) + 1
                }
                for (const message of removed) {
                  delete draft.part[message.id]
                  delete draft.part_revision[message.id]
                }
                draft.message[sessionID] = visible
                draft.session_diff[sessionID] = diff.data ?? []
                draft.governance[sessionID] = governance
              }),
            )
            fullSyncedSessions.add(sessionID)
          })().finally(() => {
            syncingSessions.delete(sessionID)
            hydratingSessions.delete(sessionID)
          })
          syncingSessions.set(sessionID, task)
          return task
        },
        /**
         * Authoritative reconciliation (P12.4). Repairs a live projection
         * from durable REST state after a detected divergence: heartbeat gap,
         * missing-part delta, reconnect, or stream reset.
         *
         * Distinct from sync() (initial hydration, tracker-protected): this
         * bypasses fullSyncedSessions, dedupes via reconcilingSessions,
         * guards against stale late commits with a generation token, aborts
         * after RECONCILE_TIMEOUT_MS, and merges with deterministic
         * authoritative precedence (terminal tool state, prefix-aware text).
         * On full convergence it acks streamState.lastApplied so the next
         * heartbeat does not re-trigger.
         */
        async reconcile(sessionID: string, reason: ReconcileReason, head?: number) {
          const generation = (reconcileGeneration.get(sessionID) ?? 0) + 1
          reconcileGeneration.set(sessionID, generation)
          const running = reconcilingSessions.get(sessionID)
          if (running) return running
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), RECONCILE_TIMEOUT_MS)
          const task = (async () => {
            try {
              const converged = await result.session.reconcileImpl(sessionID, reason, generation, controller.signal)
              if (reconcileGeneration.get(sessionID) !== generation) return // stale response: never commit
              // The projection was just rebuilt from REST: it is as fresh as a
              // full hydrate, so warm-switch sync() calls may skip the network.
              fullSyncedSessions.add(sessionID)
              const ackTo = head ?? streamState.lastReceived
              if (converged) {
                streamState.lastApplied = Math.max(streamState.lastApplied, ackTo)
              } else {
                console.warn(
                  `[arcana] reconcile partial session=${sessionID} reason=${reason} head=${head ?? "?"} applied=${streamState.lastApplied}`,
                )
              }
            } catch (error) {
              console.error(`[arcana] reconcile failed session=${sessionID} reason=${reason}`, error)
            } finally {
              clearTimeout(timeout)
              reconcilingSessions.delete(sessionID)
            }
          })()
          reconcilingSessions.set(sessionID, task)
          return task
        },
        /**
         * Internal: fetch the durable snapshot and apply it with authoritative
         * merge precedence. Exposed on the API for tests.
         */
        async reconcileImpl(sessionID: string, reason: ReconcileReason, generation: number, signal: AbortSignal) {
          const [session, messages, todo, diff, governance] = await Promise.all([
            sdk.client.session.get({ sessionID }, { throwOnError: true, signal } as never),
            sdk.client.session.messages({ sessionID, limit: 25, signal } as never),
            sdk.client.session.todo({ sessionID, signal } as never),
            sdk.client.session.diff({ sessionID, signal } as never),
            loadGovernance(sessionID, signal),
          ])
          const responseData = (messages as any).data?.items ?? (messages as any).data ?? []
          const oldest = responseData[responseData.length - 1]
          olderCursors.set(sessionID, oldest?.info?.id ?? undefined)
          let converged = true
          // What CHANGED, not just that a reconcile ran: per-part decisions
          // with the before/after state, logged after the apply.
          const changes: Array<{
            partID: string
            type: string
            action: "replaced" | "added" | "kept-live" | "kept-identical"
            from: string
            to: string
          }> = []
          const summarize = (part: any) => {
            if (part?.type === "tool") return `tool:${part?.state?.status ?? "?"}`
            if (part?.type === "text" || part?.type === "reasoning") return `${part?.type}:${(part?.text ?? "").length}`
            return `${part?.type ?? "?"}`
          }
          setStore(
            produce((draft) => {
              const match = search(draft.session, sessionID, (s) => s.id)
              if (match.found) draft.session[match.index] = session.data!
              if (!match.found) draft.session.splice(match.index, 0, session.data!)
              draft.todo[sessionID] = todo.data ?? []
              const infos = responseData.map((message: any) => message.info)
              const removed = infos.slice(0, -100)
              const visible: any[] = infos.slice(-100)
              const visibleIDs = new Set(visible.map((message: any) => message.id))
              for (const message of responseData) {
                if (!visibleIDs.has(message.info.id)) continue
                const currentParts = draft.part[message.info.id] ?? []
                let messagePartsChanged = false
                const now = Date.now()
                const restParts = message.parts ?? []
                const restIDs = new Set(restParts.map((p: any) => p.id))
                const merged: any[] = []
                for (const part of restParts) {
                  const current = currentParts.find((item: any) => item.id === part.id)
                  const decision = shouldKeepLocalAuthoritative({
                    rest: part,
                    current,
                    lastEventAt: lastPartLiveAt.get(part.id) ?? 0,
                    now,
                    silenceMs: SSE_PART_LIVENESS_MS,
                  })
                  if (decision.keepLocal) {
                    if (!decision.converged) converged = false
                    if (current) {
                      merged.push(current)
                      changes.push({
                        partID: part.id,
                        type: part.type ?? "?",
                        action: decision.converged ? "kept-identical" : "kept-live",
                        from: summarize(current),
                        to: summarize(current),
                      })
                    }
                  } else {
                    if (!decision.converged) converged = false
                    merged.push(part)
                    messagePartsChanged = true
                    changes.push({
                      partID: part.id,
                      type: part.type ?? "?",
                      action: current ? "replaced" : "added",
                      from: current ? summarize(current) : "-",
                      to: summarize(part),
                    })
                  }
                }
                // Local parts absent from REST: keep only live-streaming ones
                // (REST snapshot may lag a part created moments ago).
                const liveExtras = currentParts.filter(
                  (p: any) => !restIDs.has(p.id) && now - (lastPartLiveAt.get(p.id) ?? 0) < SSE_PART_LIVENESS_MS,
                )
                if (liveExtras.length > 0) converged = false
                for (const extra of liveExtras) {
                  changes.push({
                    partID: extra.id,
                    type: extra.type ?? "?",
                    action: "kept-live",
                    from: summarize(extra),
                    to: summarize(extra),
                  })
                }
                merged.push(...liveExtras)
                if (merged.length !== currentParts.length) messagePartsChanged = true
                draft.part[message.info.id] = merged
                if (messagePartsChanged) {
                  draft.part_revision[message.info.id] = (draft.part_revision[message.info.id] ?? 0) + 1
                }
              }
              for (const message of removed) {
                delete draft.part[message.id]
                delete draft.part_revision[message.id]
              }
              draft.message[sessionID] = visible
              draft.session_diff[sessionID] = diff.data ?? []
              draft.governance[sessionID] = governance
            }),
          )
          const changed = changes.filter((c) => c.action === "replaced" || c.action === "added")
          console.log(
            `[arcana] reconcile applied session=${sessionID} reason=${reason} converged=${converged} changed=${changed.length}${
              changed.length > 0 ? ` [${changed.map((c) => `${c.partID} ${c.action} ${c.from}->${c.to}`).join(" | ")}]` : ""
            }`,
          )
          return converged
        },
        /**
         * Force a full REST re-hydration of a session after an SSE reconnect.
         * Now an alias of the authoritative reconcile: reconnects repair the
         * projection from durable state, not from the tracker merge.
         */
        async resync(sessionID: string) {
          fullSyncedSessions.delete(sessionID)
          // The fresh hydrate resets the older-messages cursor; un-exhaust so
          // scrolled-up history stays reachable after the reconnect trim.
          exhaustedOlderSessions.delete(sessionID)
          return result.session.reconcile(sessionID, "reconnect")
        },
        async loadOlder(sessionID: string) {
          const messages = store.message[sessionID]
          if (!messages || messages.length === 0) return false

          // No more pages to load
          if (exhaustedOlderSessions.has(sessionID)) return false

          // Get the cursor for pagination — the oldest message ID
          const cursor = olderCursors.get(sessionID)
          if (cursor === undefined) {
            exhaustedOlderSessions.add(sessionID)
            return false
          }

          // Prevent concurrent loads
          if (loadingOlderSessions.has(sessionID)) return false
          loadingOlderSessions.add(sessionID)

          const count = await sdk.client.session
            .messages({ sessionID, limit: 25, before: cursor }, { throwOnError: true })
            .then((res) => {
              const data: any[] = (res as any).data ?? []
              if (data.length === 0) {
                exhaustedOlderSessions.add(sessionID)
                return 0
              }

              // Update cursor: oldest msg ID from this page becomes the new cursor
              const oldest = data[data.length - 1]
              olderCursors.set(sessionID, oldest?.info?.id ?? undefined)

              setStore(
                produce((draft) => {
                  const existing = draft.message[sessionID] ?? []
                  const existingIDs = new Set(existing.map((m) => m.id))

                  // Only prepend messages we don't already have
                  const newInfos: any[] = []
                  const newParts: { messageID: string; parts: any[] }[] = []
                  for (const item of data) {
                    if (!existingIDs.has(item.info.id)) {
                      newInfos.push(item.info)
                      newParts.push({ messageID: item.info.id, parts: item.parts ?? [] })
                    }
                  }

                  if (newInfos.length > 0) {
                    // Prepend older messages
                    draft.message[sessionID] = [...newInfos, ...existing]

                    // Add parts for new messages
                    for (const { messageID, parts } of newParts) {
                      draft.part[messageID] = parts
                      draft.part_revision[messageID] = (draft.part_revision[messageID] ?? 0) + 1
                    }
                  }
                }),
              )

              return data.length
            })
            .catch(() => 0)

          loadingOlderSessions.delete(sessionID)
          return count >= 25
        },
      },
      /**
       * Load messages for a child session not in the current route.
       * Used by agent spine entries to show subagent activity inline.
       */
      ensureChildMessages(sessionID: string) {
        if (hydratingSessions.has(sessionID)) return
        const tracker = { messages: new Set<string>(), parts: new Set<string>() }
        hydratingSessions.set(sessionID, tracker)
        sdk.client.session.messages({ sessionID, limit: 25 })
          .then((result: any) => {
            const data: any[] = result.data?.items ?? result.data ?? []
            setStore(
              produce((draft) => {
                const existing = draft.message[sessionID] ?? []
                const newInfos = data.map((m) => m.info).filter((info) => !tracker.messages.has(info.id))
                const merged = [...existing, ...newInfos].slice(-100)
                draft.message[sessionID] = merged
                // Hydrate parts for each message
                for (const message of data) {
                  const parts = message.parts ?? []
                  const currentParts = draft.part[message.info.id] ?? []
                  const mergedParts = parts.flatMap((part: any) => {
                    const current = currentParts.find((item) => item.id === part.id)
                    if (
                      shouldKeepLocalPart({
                        rest: part,
                        current,
                        tracked: tracker.parts.has(part.id),
                        lastEventAt: lastPartLiveAt.get(part.id) ?? 0,
                        now: Date.now(),
                        silenceMs: SSE_PART_LIVENESS_MS,
                      })
                    ) {
                      return current ? [current] : []
                    }
                    return [part]
                  })
                  draft.part[message.info.id] = [...currentParts.filter((p) => tracker.parts.has(p.id)), ...mergedParts]
                  draft.part_revision[message.info.id] = (draft.part_revision[message.info.id] ?? 0) + 1
                }
              }),
            )
            hydratingSessions.delete(sessionID)
          })
          .catch(() => {
            hydratingSessions.delete(sessionID)
          })
      },
      bootstrap,
    }
    return result
  },
})
