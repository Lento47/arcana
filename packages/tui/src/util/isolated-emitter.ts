/**
 * Event emitter with per-subscriber exception isolation (P12.2).
 *
 * One throwing subscriber must not prevent later subscribers from seeing the
 * same event, and must not abort the caller's batch loop. Without this, a
 * single rendering/dialog subscriber failure would starve the central sync
 * store subscriber of events and force the SSE loop into a reconnect cycle.
 */
export function createIsolatedEmitter<T>() {
  const handlers = new Set<(event: T) => void>()
  return {
    emit(event: T) {
      for (const handler of handlers) {
        try {
          handler(event)
        } catch (error) {
          console.error("[arcana] event subscriber failed:", error)
        }
      }
    },
    on(handler: (event: T) => void) {
      handlers.add(handler)
      return () => {
        handlers.delete(handler)
      }
    },
    clear() {
      handlers.clear()
    },
    listenerCount() {
      return handlers.size
    },
  }
}

export type IsolatedEmitter<T> = ReturnType<typeof createIsolatedEmitter<T>>
