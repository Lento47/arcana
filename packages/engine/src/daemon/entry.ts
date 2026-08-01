// Daemon entry point — does NOT inherit index.ts's process.exit() handlers.
// Per-session errors are caught in the HTTP handler layer.
// Only unrecoverable Effect runtime crashes kill the process.
import { startDaemon } from "./lifecycle"
import { daemonLog } from "./log"

const cwd = process.env.ARCANA_DAEMON_CWD || process.cwd()
const version = process.env.ARCANA_VERSION || "0.0.0-dev"

// Remove fatal handlers that index.ts installs (they kill the daemon on any error)
process.removeAllListeners("unhandledRejection")
process.removeAllListeners("uncaughtException")

// Install daemon-safe handlers
process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.stack : String(reason)
  console.error("[daemon] unhandled rejection (non-fatal):", msg)
  daemonLog(`[daemon] unhandled-rejection pid=${process.pid}\n${msg}`)
  // Do NOT process.exit() — per-session Effect.catchAll boundaries
  // contain the blast radius. If a rejection escapes all session-level
  // boundaries, it's logged here but the daemon stays alive.
})

process.on("uncaughtException", (err) => {
  // uncaughtException is fundamentally different from unhandledRejection:
  // by definition it happened OUTSIDE any promise chain the Effect runtime
  // could have caught, so the process is in genuinely unknown state.
  // Log and exit for clean respawn — handleConnectionError() will spawn a new daemon.
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err)
  console.error("[daemon] uncaught exception (fatal — respawning):", msg)
  daemonLog(`[daemon] crash uncaughtException pid=${process.pid}\n${msg}`)
  process.exit(1)
})

process.on("exit", (code) => {
  daemonLog(`[daemon] exit code=${code} pid=${process.pid}`)
})

async function daemonMain() {
  // Discriminator for the idle-stop exit path in lifecycle.ts: the daemon
  // process must exit after an idle stop (stream fibers keep the loop alive),
  // while a TUI process that shares lifecycle must not.
  process.env.ARCANA_DAEMON = "1"
  const { port, url } = await startDaemon(cwd, version)
  // Daemon stays alive until SIGTERM/idle timeout
  // The TUI process connects via this port
  console.log(`[daemon] ready on ${url} (pid ${process.pid})`)
  daemonLog(`[daemon] boot pid=${process.pid} port=${port} url=${url} cwd=${cwd}`)
}

daemonMain().catch((err) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err)
  console.error("[daemon] bootstrap failed:", msg)
  daemonLog(`[daemon] boot-failed pid=${process.pid}\n${msg}`)
  process.exit(1)
})
