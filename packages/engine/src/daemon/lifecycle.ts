import { readLock, acquireLock, removeLock, isLockStale } from "./lock"
import { armIdle, clearIdle, resetActivity } from "./activity"
import { daemonLog } from "./log"
import { Server } from "../server/server"

const DAEMON_PORT_START = 9142
const DAEMON_PORT_END = 9150
const RESPAWN_DEBOUNCE_MS = 3_000 // prevent storms on network flap

export async function startDaemon(cwd: string, version: string): Promise<{ port: number; url: string }> {
  // Singleton guard: a live daemon already owns this workspace, so a
  // duplicate process must never linger or waste a port. Stale locks are
  // removed; live locks short-circuit before any bind attempt.
  const existing = readLock(cwd)
  if (existing) {
    if (isLockStale(existing)) {
      removeLock(cwd)
    } else {
      if (process.env.ARCANA_DAEMON === "1") {
        daemonLog(
          `[daemon] duplicate-start rejected pid=${process.pid} existing-pid=${existing.pid} port=${existing.port}`,
        )
        process.exit(0)
      }
      return { port: existing.port, url: `http://127.0.0.1:${existing.port}` }
    }
  }

  // Find available port
  let port = DAEMON_PORT_START
  let server: Awaited<ReturnType<typeof Server.listen>> | null = null

  const listenErrors: string[] = []
  for (; port <= DAEMON_PORT_END; port++) {
    try {
      server = await Server.listen({ port, hostname: "127.0.0.1" })
      break
    } catch (err) {
      // Do not treat layer/bootstrap failures as "port busy". Log and keep trying
      // so a transient bind conflict can still recover on the next port.
      const message = err instanceof Error ? err.message : String(err)
      listenErrors.push(`${port}: ${message}`)
      console.error(`[daemon] Server.listen failed on 127.0.0.1:${port}: ${message}`)
      continue
    }
  }

  if (!server) {
    throw new Error(
      `No available port for daemon (${DAEMON_PORT_START}-${DAEMON_PORT_END}). Last errors:\n${listenErrors.join("\n")}`,
    )
  }

  // Atomic lock acquisition — wins the race or fails fast
  const lock = acquireLock(cwd, port, version)
  if (!lock) {
    // Another process won the race — stop our server, connect to theirs
    await server.stop(true)
    const theirs = readLock(cwd)
    if (theirs) {
      // In daemon mode the process exists only to serve this workspace;
      // losing the race means there is nothing left to do.
      if (process.env.ARCANA_DAEMON === "1") {
        daemonLog(
          `[daemon] lock-race lost pid=${process.pid} winner-pid=${theirs.pid} port=${theirs.port}`,
        )
        process.exit(0)
      }
      return { port: theirs.port, url: `http://127.0.0.1:${theirs.port}` }
    }
    throw new Error("Lock race lost but no winner lock found")
  }

  // Idle timeout — shut down after inactivity. The timer lives in
  // daemon/activity.ts and is reset by any HTTP request, any SSE heartbeat,
  // and suspended while an SSE client is connected (see activity.ts).
  armIdle(cwd, () => {
    void stopDaemon(server!, cwd, "idle").then(() => {
      // stopDaemon closes the listener but lingering stream fibers (SSE
      // heartbeat ticks) can keep the event loop alive, leaving a zombie
      // process that consumes memory and confuses health checks. The daemon
      // process must exit explicitly. Discriminator: entry.ts sets
      // ARCANA_DAEMON=1; the TUI process never does.
      if (process.env.ARCANA_DAEMON === "1") process.exit(0)
    })
  })

  // Signal handlers — clean up and exit so Ctrl+C kills the process
  process.on("SIGTERM", async () => {
    await stopDaemon(server!, cwd, "signal")
    process.exit(0)
  })
  process.on("SIGINT", async () => {
    await stopDaemon(server!, cwd, "signal")
    process.exit(0)
  })

  return { port, url: `http://127.0.0.1:${port}` }
}

export async function stopDaemon(
  server: Awaited<ReturnType<typeof Server.listen>>,
  cwd: string,
  reason: "idle" | "signal" | "manual" = "manual",
) {
  clearIdle()
  const lock = readLock(cwd)
  const uptimeSec = lock ? Math.round((Date.now() - lock.startedAt) / 1000) : 0
  removeLock(cwd)
  daemonLog(`[daemon] stop reason=${reason} uptime=${uptimeSec}s pid=${process.pid}`)
  await server.stop(true)
}

/** Kept for API compatibility; real resets come from activity.ts. */
export { resetActivity }

export async function healthCheck(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`)
    return res.ok
  } catch {
    return false
  }
}

let lastRespawnAttempt = 0

/** Reactive — no polling. Called on any fetch failure. Debounced to prevent storms. */
export async function handleConnectionError(cwd: string, version: string): Promise<{ port: number; url: string } | null> {
  const now = Date.now()
  if (now - lastRespawnAttempt < RESPAWN_DEBOUNCE_MS) return null
  lastRespawnAttempt = now

  const existing = readLock(cwd)
  if (existing && !isLockStale(existing)) return null // still alive, transient error

  // Daemon is dead — clean up and respawn
  if (existing) removeLock(cwd)
  return startDaemon(cwd, version)
}
