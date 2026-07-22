import { createContext, createEffect, onCleanup, useContext, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { useSDK } from "../../context/sdk"
import { useSync } from "../../context/sync"
import { useLocal } from "../../context/local"
import type { Session } from "@arcana/sdk/v2"

/**
 * Grok-style session prewarm (NewAuto): keep one unused session ready so the
 * first Home Enter path is "send prompt", not "create session + send".
 *
 * - Starts as soon as sync is ready (model optional on create).
 * - Upserts the session into the sync store so navigate does not flash missing.
 * - Refills after consume so /new → Home is ready again.
 * - Retries once after a failed create (network blip).
 */

type PrewarmState = {
  sessionID: string | undefined
  creating: boolean
  /** Soft fail; will retry after RETRY_MS. */
  failedAt: number | undefined
}

type SessionPrewarmApi = {
  sessionID: () => string | undefined
  creating: () => boolean
  consume: () => string | undefined
  waitAndConsume: () => Promise<string | undefined>
  /** Kick create if idle (e.g. first keystroke on Home before auto-prewarm). */
  ensure: () => void
}

const SessionPrewarmContext = createContext<SessionPrewarmApi>()

const RETRY_MS = 2_000
/** After consume, wait a beat before refilling (avoid racing navigate/SSE). */
const REFILL_MS = 400

export function SessionPrewarmProvider(props: ParentProps) {
  const sdk = useSDK()
  const sync = useSync()
  const local = useLocal()
  const [state, setState] = createStore<PrewarmState>({
    sessionID: undefined,
    creating: false,
    failedAt: undefined,
  })

  let cancelled = false
  let waiters: Array<(id: string | undefined) => void> = []
  let refillTimer: ReturnType<typeof setTimeout> | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  /** Prevent overlapping create calls from ensure() + effect. */
  let inFlight = false

  function resolveWaiters(id: string | undefined) {
    const pending = waiters
    waiters = []
    for (const resolve of pending) resolve(id)
  }

  function scheduleRefill() {
    if (refillTimer) clearTimeout(refillTimer)
    refillTimer = setTimeout(() => {
      refillTimer = undefined
      if (cancelled) return
      startCreate()
    }, REFILL_MS)
  }

  function scheduleRetry() {
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = setTimeout(() => {
      retryTimer = undefined
      if (cancelled) return
      setState("failedAt", undefined)
      startCreate()
    }, RETRY_MS)
  }

  function startCreate() {
    if (cancelled || inFlight || state.sessionID || state.creating) return
    if (!sync.ready) return

    const agent = local.agent.current()
    const model = local.model.current()
    inFlight = true
    setState("creating", true)

    void sdk.client.session
      .create({
        agent: agent?.name,
        model:
          model?.providerID && model?.modelID
            ? {
                providerID: model.providerID,
                id: model.modelID,
                variant: local.model.variant.current(),
              }
            : undefined,
      })
      .then((res) => {
        inFlight = false
        if (cancelled) return
        if (res.error || !res.data?.id) {
          setState({ creating: false, failedAt: Date.now(), sessionID: undefined })
          resolveWaiters(undefined)
          scheduleRetry()
          return
        }
        const info = res.data as Session
        // Local store first so session route resolves immediately on navigate.
        sync.session.upsert(info)
        const id = info.id
        setState({ creating: false, failedAt: undefined, sessionID: id })
        if (waiters.length > 0) {
          setState("sessionID", undefined)
          resolveWaiters(id)
          scheduleRefill()
        }
      })
      .catch(() => {
        inFlight = false
        if (cancelled) return
        setState({ creating: false, failedAt: Date.now(), sessionID: undefined })
        resolveWaiters(undefined)
        scheduleRetry()
      })
  }

  onCleanup(() => {
    cancelled = true
    if (refillTimer) clearTimeout(refillTimer)
    if (retryTimer) clearTimeout(retryTimer)
    resolveWaiters(undefined)
  })

  // Auto-start when catalog is ready (Grok NewAuto-style, independent of Home mount).
  createEffect(() => {
    if (!sync.ready) return
    if (state.sessionID || state.creating || state.failedAt) return
    startCreate()
  })

  const api: SessionPrewarmApi = {
    sessionID: () => state.sessionID,
    creating: () => state.creating,
    consume: () => {
      const id = state.sessionID
      if (!id) return undefined
      setState("sessionID", undefined)
      scheduleRefill()
      return id
    },
    waitAndConsume: () => {
      const ready = state.sessionID
      if (ready) {
        setState("sessionID", undefined)
        scheduleRefill()
        return Promise.resolve(ready)
      }
      if (state.creating || inFlight) {
        return new Promise((resolve) => {
          waiters.push((id) => {
            if (id) scheduleRefill()
            resolve(id)
          })
        })
      }
      // Idle / failed — kick create and wait.
      startCreate()
      if (state.creating || inFlight) {
        return new Promise((resolve) => {
          waiters.push((id) => {
            if (id) scheduleRefill()
            resolve(id)
          })
        })
      }
      return Promise.resolve(undefined)
    },
    ensure: () => {
      if (state.sessionID || state.creating || inFlight) return
      setState("failedAt", undefined)
      startCreate()
    },
  }

  return (
    <SessionPrewarmContext.Provider value={api}>
      {props.children}
    </SessionPrewarmContext.Provider>
  )
}

/** @deprecated use useSessionPrewarm — kept for Home imports */
export const HomeSessionPrewarmProvider = SessionPrewarmProvider

export function useSessionPrewarm(): SessionPrewarmApi | undefined {
  return useContext(SessionPrewarmContext)
}

/** @deprecated alias */
export function useHomeSessionPrewarm(): SessionPrewarmApi | undefined {
  return useSessionPrewarm()
}
