// Daemon entry point — does NOT inherit index.ts's process.exit() handlers.
// Per-session errors are caught in the HTTP handler layer.
// Only unrecoverable Effect runtime crashes kill the process.
import { startDaemon } from "./lifecycle"

const cwd = process.env.ARCANA_DAEMON_CWD || process.cwd()
const version = process.env.ARCANA_VERSION || "0.0.0-dev"

// Remove fatal handlers that index.ts installs (they kill the daemon on any error)
process.removeAllListeners("unhandledRejection")
process.removeAllListeners("uncaughtException")

// Install daemon-safe handlers
process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.stack : String(reason)
  console.error("[daemon] unhandled rejection (non-fatal):", msg)
  // Do NOT process.exit() — per-session Effect.catchAll boundaries
  // contain the blast radius. If a rejection escapes all session-level
  // boundaries, it's logged here but the daemon stays alive.
})

process.on("uncaughtException", (err) => {
  // uncaughtException is fundamentally different from unhandledRejection:
  // by definition it happened OUTSIDE any promise chain the Effect runtime
  // could have caught, so the process is in genuinely unknown state.
  // Log and exit for clean respawn — handleConnectionError() will spawn a new daemon.
  console.error("[daemon] uncaught exception (fatal — respawning):", err.stack ?? err.message)
  process.exit(1)
})

async function daemonMain() {
  const { port, url } = await startDaemon(cwd, version)
  // Daemon stays alive until SIGTERM/idle timeout
  // The TUI process connects via this port
  console.log(`[daemon] ready on ${url} (pid ${process.pid})`)
}

daemonMain().catch((err) => {
  console.error("[daemon] bootstrap failed:", err)
  process.exit(1)
})
