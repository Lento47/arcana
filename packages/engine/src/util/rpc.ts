type Definition = {
  [method: string]: (input: any) => any
}

export function listen(rpc: Definition) {
  onmessage = async (evt) => {
    let parsed: { type?: string; method?: string; input?: unknown; id?: number }
    try {
      parsed = JSON.parse(evt.data)
    } catch {
      console.error("[arcana] rpc: ignoring malformed frame", evt.data)
      return
    }
    if (parsed.type === "rpc.request") {
      const method = rpc[parsed.method ?? ""]
      if (typeof method !== "function") {
        console.error(`[arcana] rpc: unknown method ${String(parsed.method)}`)
        return
      }
      try {
        const result = await method(parsed.input)
        postMessage(JSON.stringify({ type: "rpc.result", result, id: parsed.id }))
      } catch (error) {
        console.error(`[arcana] rpc: method ${String(parsed.method)} failed`, error)
      }
    }
  }
}

export function emit(event: string, data: unknown) {
  try { postMessage(JSON.stringify({ type: "rpc.event", event, data })) } catch {}
}

export function client<T extends Definition>(target: {
  postMessage: (data: string) => void | null
  onmessage: ((this: Worker, ev: MessageEvent<any>) => any) | null
}) {
  const pending = new Map<number, (result: any) => void>()
  const listeners = new Map<string, Set<(data: any) => void>>()
  let id = 0
  target.onmessage = async (evt) => {
    let parsed: { type?: string; id?: number; result?: unknown; event?: string; data?: unknown }
    try {
      parsed = JSON.parse(evt.data)
    } catch {
      console.error("[arcana] rpc: ignoring malformed frame", evt.data)
      return
    }
    if (parsed.type === "rpc.result") {
      const id = parsed.id
      if (id === undefined) return
      const resolve = pending.get(id)
      if (resolve) {
        resolve(parsed.result)
        pending.delete(id)
      }
    }
    if (parsed.type === "rpc.event") {
      const handlers = listeners.get(parsed.event ?? "")
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(parsed.data)
          } catch (error) {
            console.error("[arcana] rpc: event handler threw", error)
          }
        }
      }
    }
  }
  return {
    call<Method extends keyof T>(method: Method, input: Parameters<T[Method]>[0]): Promise<ReturnType<T[Method]>> {
      const requestId = id++
      return new Promise((resolve, reject) => {
        pending.set(requestId, resolve)
        try {
          target.postMessage(JSON.stringify({ type: "rpc.request", method, input, id: requestId }))
        } catch {
          pending.delete(requestId)
          reject(new Error("Worker terminated"))
        }
      })
    },
    on<Data>(event: string, handler: (data: Data) => void) {
      let handlers = listeners.get(event)
      if (!handlers) {
        handlers = new Set()
        listeners.set(event, handlers)
      }
      handlers.add(handler)
      return () => {
        handlers!.delete(handler)
      }
    },
  }
}

export * as Rpc from "./rpc"
