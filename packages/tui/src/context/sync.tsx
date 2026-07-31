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
} from "@arcana/sdk/v2"
import { createStore, produce, reconcile } from "solid-js/store"
import { useProject } from "./project"
import { useEvent } from "./event"
import { useSDK } from "./sdk"
import { useTuiStartup } from "./runtime"
import { createSimpleContext } from "./helper"
import { useExit } from "./exit"
import { useArgs } from "./args"
import { batch, onMount } from "solid-js"
import path from "path"
import { useKV } from "./kv"

const emptyConsoleState: ConsoleState = {
  consoleManagedProviders: [],
  switchableOrgCount: 0,
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
      lsp: LspStatus[]
      mcp: {
        [key: string]: McpStatus
      }
      mcp_resource: {
        [key: string]: McpResource
      }
      formatter: FormatterStatus[]
      vcs: VcsInfo | undefined
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
      lsp: [],
      mcp: {},
      mcp_resource: {},
      formatter: [],
      vcs: undefined,
    })

    const event = useEvent()
    const project = useProject()
    const sdk = useSDK()

    const fullSyncedSessions = new Set<string>()
    const syncingSessions = new Map<string, Promise<void>>()
    const hydratingSessions = new Map<string, { messages: Set<string>; parts: Set<string> }>()
    const olderCursors = new Map<string, string | undefined>()
    const loadingOlderSessions = new Set<string>()
    const exhaustedOlderSessions = new Set<string>()
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
          break
        }
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
          const ss = event.properties.status as any
          console.error(`[sync] session.status: ${event.properties.sessionID} type=${ss.type}`)
          setStore("session_status", event.properties.sessionID, event.properties.status)
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
          const messages = store.message[event.properties.info.sessionID]
          if (!messages) {
            setStore("message", event.properties.info.sessionID, [event.properties.info])
            break
          }
          const result = search(messages, event.properties.info.id, (m) => m.id)
          if (result.found) {
            const info = event.properties.info
            if (info.time?.completed) {
              console.error(`[sync] message.updated: ${info.id} completed=${info.time.completed}`)
            }
            setStore("message", event.properties.info.sessionID, result.index, reconcile(info))
            break
          }
          setStore(
            "message",
            event.properties.info.sessionID,
            produce((draft) => {
              draft.splice(result.index, 0, event.properties.info)
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
          const _p = event.properties.part as any
          if (_p.type === "reasoning" || _p.time?.end) {
            console.error(`[sync] part.updated: type=${_p.type} id=${_p.id} time.end=${_p.time?.end ?? "none"}`)
          }
          touchPart(event.properties.part.sessionID, event.properties.part.id)
          const parts = store.part[event.properties.part.messageID]
          if (!parts) {
            setStore("part", event.properties.part.messageID, [event.properties.part])
            break
          }
          const result = search(parts, event.properties.part.id, (p) => p.id)
          if (result.found) {
            setStore("part", event.properties.part.messageID, result.index, reconcile(event.properties.part))
            break
          }
          setStore(
            "part",
            event.properties.part.messageID,
            produce((draft) => {
              draft.splice(result.index, 0, event.properties.part)
            }),
          )
          break
        }

        case "message.part.delta": {
          const parts = store.part[event.properties.messageID]
          if (!parts) break
          const result = search(parts, event.properties.partID, (p) => p.id)
          if (!result.found) break
          touchPart(event.properties.sessionID, event.properties.partID)
          setStore(
            "part",
            event.properties.messageID,
            produce((draft) => {
              const part = draft[result.index]
              const field = event.properties.field as keyof typeof part
              const existing = part[field] as string | undefined
              ;(part[field] as string) = (existing ?? "") + event.properties.delta
            }),
          )
          break
        }

        case "message.part.removed": {
          touchPart(event.properties.sessionID, event.properties.partID)
          const parts = store.part[event.properties.messageID]
          const result = search(parts, event.properties.partID, (p) => p.id)
          if (result.found) {
            setStore(
              "part",
              event.properties.messageID,
              produce((draft) => {
                draft.splice(result.index, 1)
              }),
            )
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
              if (sessions !== undefined) setStore("session", reconcile(sessions))
            })

            const ollamaPort = (typeof process !== "undefined" && process.env?.OLLAMA_PORT) || "11434"
            const ollamaProvider = {
              id: "ollama",
              name: "Ollama (local)",
              status: "connected" as const,
              models: {} as Record<string, { id: string; name: string; providerID: string }>,
            }
            fetch(`http://localhost:${ollamaPort}/api/tags`)
              .then((r) => {
                if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`)
                return r.json()
              })
              .then((data: any) => {
                const models = data.models ?? []
                if (models.length === 0) return
                const modelMap: Record<string, { id: string; name: string; providerID: string }> = {}
                for (const m of models) modelMap[m.name] = { id: m.name, name: m.name, providerID: "ollama" }
                ollamaProvider.models = modelMap
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
              .catch((err) => {
                // Still add empty provider so user knows Ollama option exists
                setStore("provider_next", "all", (prev: any[]) => {
                  const filtered = prev.filter((p: any) => p.id !== "ollama")
                  return [...filtered, { ...ollamaProvider, status: "disconnected" as const }] as any
                })
                console.log(`[ollama] Failed to fetch models from localhost:${ollamaPort}: ${err.message}`)
              })
          })
        })
        .then(() => {
          if (store.status !== "complete") setStore("status", "partial")

          // Keep startup completion tied to data that affects the initial route
          // and command surface. Slower catalogs can settle after the TUI is usable.
          const startupTasks = [
            ...(args.continue ? [] : [sessionListPromise.then((sessions) => setStore("session", reconcile(sessions)))]),
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
        query() {
          return sessionListQuery()
        },
        async refresh() {
          const list = await listSessions()
          setStore("session", reconcile(list))
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
            const [session, messages, todo, diff] = await Promise.all([
              sdk.client.session.get({ sessionID }, { throwOnError: true }),
              sdk.client.session.messages({ sessionID, limit: 25 }),
              sdk.client.session.todo({ sessionID }),
              sdk.client.session.diff({ sessionID }),
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
                    continue
                  }
                  const currentParts = draft.part[message.info.id] ?? []
                  const parts = message.parts.flatMap((part: any) => {
                    const current = currentParts.find((item) => item.id === part.id)
                    if (tracker.parts.has(part.id)) return current ? [current] : []
                    if (
                      current &&
                      (part.type === "text" || part.type === "reasoning") &&
                      (current.type === "text" || current.type === "reasoning") &&
                      part.text.length === 0 &&
                      current.text.length > 0
                    ) {
                      return [current]
                    }
                    return [part]
                  })
                  parts.push(
                    ...currentParts.filter(
                      (part: any) => tracker.parts.has(part.id) && !parts.some((item: any) => item.id === part.id),
                    ),
                  )
                  draft.part[message.info.id] = parts
                }
                for (const message of removed) delete draft.part[message.id]
                draft.message[sessionID] = visible
                draft.session_diff[sessionID] = diff.data ?? []
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
                    if (tracker.parts.has(part.id)) return current ? [current] : []
                    return [part]
                  })
                  draft.part[message.info.id] = [...currentParts.filter((p) => tracker.parts.has(p.id)), ...mergedParts]
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
