import { readLock, acquireLock, removeLock, isLockStale, touchActivity } from "./lock"
import { Server } from "../server/server"

const DAEMON_PORT_START = 9142
const DAEMON_PORT_END = 9150
const IDLE_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
const RESPAWN_DEBOUNCE_MS = 3_000 // prevent storms on network flap

export async function startDaemon(cwd: string, version: string): Promise<{ port: number; url: string }> {
  // Clean up any stale lock for this workspace
  const existing = readLock(cwd)
  if (existing && isLockStale(existing)) {
    removeLock(cwd)
  }

  // Find available port
  let port = DAEMON_PORT_START
  let server: Awaited<ReturnType<typeof Server.listen>> | null = null

  for (; port <= DAEMON_PORT_END; port++) {
    try {
      server = await Server.listen({ port, hostname: "127.0.0.1" })
      break
    } catch {
      continue
    }
  }

  if (!server) throw new Error("No available port for daemon")

  // Atomic lock acquisition — wins the race or fails fast
  const lock = acquireLock(cwd, port, version)
  if (!lock) {
    // Another process won the race — stop our server, connect to theirs
    await server.stop(true)
    const theirs = readLock(cwd)
    if (theirs) return { port: theirs.port, url: `http://127.0.0.1:${theirs.port}` }
    throw new Error("Lock race lost but no winner lock found")
  }

  // Idle timeout — shut down after inactivity
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(async () => {
      await stopDaemon(server!, cwd)
    }, IDLE_TIMEOUT_MS)
    touchActivity(cwd)
  }

  resetIdleTimer()

  // Signal handlers — clean up and exit so Ctrl+C kills the process
  process.on("SIGTERM", async () => {
    await stopDaemon(server!, cwd)
    process.exit(0)
  })
  process.on("SIGINT", async () => {
    await stopDaemon(server!, cwd)
    process.exit(0)
  })

  return { port, url: `http://127.0.0.1:${port}` }
}

export async function stopDaemon(server: Awaited<ReturnType<typeof Server.listen>>, cwd: string) {
  removeLock(cwd)
  await server.stop(true)
}

export function resetActivity(cwd: string) {
  touchActivity(cwd)
}

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
