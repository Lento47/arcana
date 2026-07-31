/**
 * SSE liveness watchdog.
 *
 * The engine emits a `server.heartbeat` event every 10 seconds while the SSE
 * stream is open (see packages/engine/src/server/routes/instance/httpapi/
 * handlers/event.ts). If the daemon dies without closing the socket (half-open
 * TCP: no FIN/RST delivered), the client's `for await` never ends on its own
 * and no further events arrive. This watchdog trips after `timeoutMs` of total
 * silence so the caller can abort the dead attempt and reconnect.
 */

export type SseWatchdog = {
  /** (Re)start the silence window. Call on every received event. */
  arm: () => void
  /** Cancel the window. Call on loop exit / unmount. */
  stop: () => void
}

export function createSseWatchdog(opts: {
  timeoutMs: number
  onTrip: () => void
}): SseWatchdog {
  let timer: Timer | undefined

  const arm = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      opts.onTrip()
    }, opts.timeoutMs)
  }

  const stop = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
  }

  return { arm, stop }
}
