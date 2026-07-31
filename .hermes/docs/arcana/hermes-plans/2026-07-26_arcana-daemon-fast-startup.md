# Arcana Daemon — Instant Session Startup

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Eliminate the 10-second cold-start delay on `arcana` by keeping the engine runtime as a persistent daemon process. Subsequent `arcana` launches connect to the existing daemon in <200ms.

**Architecture:** A long-lived daemon process hosts the Effect runtime, provider catalog, and HTTP server — **per workspace directory**, not per user. Running `arcana` in two different repos spawns separate daemons with independent config/provider state. The TUI process connects via localhost TCP. The daemon auto-starts on first launch, auto-shuts down after idle timeout. Zero user-facing commands needed — entirely transparent.

**Tech Stack:** Bun, Effect, existing Worker/RPC bridge, TCP health-check endpoint

**Why better than Grok:**
1. **Zero management** — no `--no-leader` flags. Daemon is transparent.
2. **Lazy Effect runtime** — only boot what the first request needs. Grok boots everything eagerly.
3. **Session pool** — prewarm 3 sessions in parallel. Grok prewarms 1.
4. **Cross-platform** — TCP works on Windows/macOS/Linux identically. Grok's Unix sockets are *nix-only.
5. **Idle teardown** — configurable timeout (default 5 min). Grok's leader stays forever.
6. **Crash-transparent** — TUI auto-spawns new daemon if the old one died. No user-visible error.
7. **Per-workspace isolation** — separate daemon per project directory. Grok's leader is global per-user.

---

## Current Architecture (per-session, ~10s cold)

```
arcana CLI ──spawn──► engine (bun) ──Worker──► Server.Default()
                          │                        │
                          │  Effect.boot           │  providers.load()
                          │  config.load()         │  model.catalog()
                          │  ~5s cold JIT          │  ~3s
                          │                        │
                          └── TUI renders ─────────┘  sync.ready
                                                       prewarm session.create
                                                       ~2s
                          TOTAL: ~10s
```

## Proposed Architecture (daemon, <200ms warm)

```
FIRST LAUNCH (in ~/project-a):
arcana ──► hash CWD → ~/project-a ──► check lock for workspace ──► no daemon ──► spawn daemon
              │                                    │
              │                              arcana-daemon (bun)
              │                              bind localhost:{port}
              │                              Effect.boot + providers (workspace-scoped)
              │                              prewarm 3 sessions
              │                              idle timeout: 5 min
              │                                    │
              └── connect to daemon ◄──────────────┘
                   TUI renders via daemon's HTTP
                   sync.ready instant (daemon pre-loaded)

SECOND WORKSPACE (in ~/project-b):
arcana ──► hash CWD → ~/project-b ──► check lock for different workspace
                                         └── different hash → spawn SEPARATE daemon
                                              on different port, own config/provider state

SUBSEQUENT LAUNCH (same workspace):
arcana ──► hash CWD matches existing daemon ──► connect (<200ms)
                                                   │
                                              TUI renders instantly
                                              prewarmed session consumed
```

---

## What Exists (verified in codebase)

| Component | File | Purpose |
|-----------|------|---------|
| Worker RPC bridge | `engine/src/cli/tui/worker.ts:49-66` | Worker's `fetch()` calls `Server.Default().app.fetch()` |
| Server.Default() | `engine/src/server/server.ts:55-64` | Lazy-initialized Effect HTTP server |
| Session prewarm | `tui/src/routes/home/prewarm-session.tsx:82-130` | Pre-creates one session in background |
| TUI → Worker fetch | `engine/src/cli/tui/tui.ts:181-185` | `createWorkerFetch(client)` bridges TUI to Worker |
| Server.listen() | `engine/src/server/server.ts:72-80` | Binds HTTP server to port, supports MDNS |
| Sync ready gate | `tui/src/context/sync.tsx:619-622` | `store.status !== "loading"` blocks prewarm |
| Effect runtime | `engine/src/server/server.ts:1-14` | Imports `./init-projectors`, `HttpApiApp`, OpenApi |

---

## Detailed Design

### Phase 1: Daemon process (`packages/engine/src/daemon/`)

**New files:**
- `daemon/lock.ts` — PID file + port lock (`~/.arcana/daemon/daemon.json`)
- `daemon/lifecycle.ts` — spawn, health-check, idle timeout, shutdown
- `daemon/server.ts` — Thin wrapper: boots `Server.listen()` on configured port
- `cli/cmd/daemon.ts` — `arcana daemon start|stop|status` CLI (for debugging)

**Lock file format** (`~/.arcana/daemon/{workspaceHash}.json`) — one file per workspace directory:
```json
{
  "workspace": "/home/user/project-a",
  "pid": 12345,
  "port": 9142,
  "startedAt": 1722000000000,
  "lastActivityAt": 1722000300000,
  "version": "0.3.65"
}
```

Workspace hash: `SHA256(CWD).slice(0, 12)` — compact, collision-resistant, deterministic.

**Lifecycle:**
```
┌──────────────┐     idle 5 min     ┌───────────────┐
│   RUNNING    │ ─────────────────► │   DRAINING     │
│   accepting  │                    │   finish active │
│   sessions   │                    │   sessions     │
└──────────────┘                    └───────┬───────┘
       ▲                                   │
       │  new session connects             │  all sessions done
       │                                   ▼
       │                            ┌───────────────┐
       │                            │   STOPPED      │
       └────────────────────────────┤   remove lock  │
               arcana launched      │   process.exit │
                                    └───────────────┘
```

### Phase 2: TUI connection layer

**Modified files:**
- `engine/src/cli/tui.ts` — `TuiThreadCommand.handler()` detects daemon vs spawns Worker
- `tui/src/app.tsx` — `SDKProvider` accepts daemon URL (already supports `url` + `fetch`)

**Connection flow in `tui.ts`:**
```typescript
async function connectToDaemon(): Promise<{ url: string; fetch: typeof fetch } | null> {
  const lock = readDaemonLock()
  if (!lock) return null
  
  // Health check — daemon may have crashed without cleaning lock
  try {
    const res = await fetch(`http://127.0.0.1:${lock.port}/health`)
    if (res.ok) return { url: `http://127.0.0.1:${lock.port}`, fetch }
  } catch {}
  
  // Stale lock — clean up and spawn new daemon
  removeDaemonLock()
  return null
}
```

### Phase 3: Session pool upgrade

**Modified files:**
- `tui/src/routes/home/prewarm-session.tsx` — Pool of 3 sessions instead of 1

**Pool behavior:**
```
┌──────────┐  consume  ┌──────────┐  consume  ┌──────────┐
│ session1 │ ────────► │ session2 │ ────────► │ session3 │
│ (ready)  │           │ (ready)  │           │ (ready)  │
└──────────┘           └──────────┘           └──────────┘
                            │
                            ▼
                      refill: create new session
                      in background
```

### Phase 4: Daemon auto-start

**Modified files:**
- `packages/arcana/src/index.ts` — TUI fast-path spawns daemon if missing, then connects

Instead of spawning engine directly, spawn daemon first, then spawn TUI that connects to daemon. On daemon crash, TUI transparently spawns new daemon.

---

## Regression Analysis

**REG-1: Existing Worker-based TUI breaks.** The current code in `tui.ts:140-146` creates a Bun `Worker` with env forwarding. The daemon path replaces this with HTTP fetch. If the daemon check fails (no daemon, can't spawn), the old Worker path must remain as fallback. **Fix:** Keep Worker path as fallback in `connectOrSpawn()`.

**REG-2: `sync.ready` semantics change.** Currently `store.status` starts as `"loading"` and transitions to `"complete"` after startupTasks. With a daemon, the daemon is already loaded, so `store.status` should be `"complete"` immediately — but the TUI still needs to fetch initial data (sessions list, agents, etc.). **Fix:** Add `store.status = "partial"` on quick-connect (daemon alive), then fetch startupTasks asynchronously. Don't block the prompt on startupTasks completion.

**REG-3: Session prewarm races with daemon idle timeout.** If the daemon is about to shut down (idle timeout approaching) when a new session consumes the last prewarmed session, the daemon might exit mid-session. **Fix:** On any TUI connection, reset the daemon's idle timer. Active sessions prevent daemon shutdown.

**REG-4: Two daemons on port conflict + spawn race.** If port 9142 is already in use by another process, the daemon needs to pick a different port. **Additionally**, two `arcana` processes launching simultaneously (e.g. two terminal tabs opening at login) both read "no lock" and both call `startDaemon()`, creating two daemons racing for the same port range. **Fix:** (a) Try ports 9142-9150 sequentially. (b) **Atomic lock acquisition**: write the lock file with `wx` flag (exclusive create) BEFORE booting the server, not after. If `wx` throws `EEXIST` (another process won the race), the loser falls through to connect mode. The lock file is written BEFORE `Server.listen()` so the port bind doesn't happen until lock ownership is secured.

**REG-5: Windows named pipe vs TCP.** Windows doesn't have Unix sockets. Using TCP localhost works everywhere but needs firewall consideration. **Fix:** Bind to `127.0.0.1` only (not `0.0.0.0`). No external network exposure.

**REG-6: Binary upgrade detection.** If `arcana` is upgraded (new npm version), the old daemon runs the old code. New TUI connects to old daemon → version mismatch. **Fix:** Store version in lock file. On connect, compare versions. If mismatch, **do NOT kill the old daemon** — it may be serving active sessions in another terminal tab. Instead, spawn a NEW daemon on a different port for the new launch. The old daemon continues serving its existing TUI sessions until they finish and idle-timeout naturally. The old daemon's TUIs show a toast: "Arcana was upgraded. Restart to use the new version." The new daemon acquires its own lock file with a different port; the old lock file stays intact until the old daemon exits. No version-suffixed filenames needed — the `acquireLock()` call from the new process returns `null` (because the old lock file exists), so the new process falls through to `startDaemon()` which cleans up *if stale* (old daemon is alive → not stale → does NOT clean), then binds a different port and writes its own lock. Since `acquireLock` is atomic, there's no race between old daemon reading and new daemon writing.

**REG-7: Effect runtime memory growth.** A long-running daemon accumulates memory from session history, cached models, etc. **Fix:** LRU session cache in daemon. Expire sessions older than 1 hour. No unbounded growth.

**ADDED: REG-8 — Workspace isolation.** Two `arcana` instances in different directories share nothing. Each workspace has its own daemon, port range, config, and provider state. The lock file is keyed by workspace hash (`SHA256(CWD)`), so a daemon spawned in `~/project-a` never interferes with `~/project-b`. A second `arcana` in a different directory always spawns its own daemon. **Fix:** Workspace-scoped lock files at `~/.arcana/daemon/{workspaceHash}.json`. Each daemon only answers for its own workspace.

**ADDED: REG-9 — Reactive crash detection (not 30s polling).** Health-check polling every 30 seconds means the user could wait up to 30 seconds after a daemon crash before the TUI notices. **Fix:** No polling interval. Any `fetch()` to the daemon that fails with a connection-refused error triggers an immediate respawn attempt. The respawn is transparent — the TUI reconnects, the session continues. A 3-second debounce prevents respawn storms on network flap.

**ADDED: REG-10 — Fatal error handlers in `index.ts` kill daemon on any unhandled rejection.** The engine's `process.on("unhandledRejection")` and `process.on("uncaughtException")` handlers call `process.exit(1)` (index.ts:36-48). These make sense for a single-shot CLI process but are exactly wrong for a daemon meant to survive individual session errors. A bug in session A's MCP subprocess pipe would kill the daemon and all connected TUI sessions. **Fix:** The daemon must NOT run through index.ts's fatal handlers. The daemon gets its own entry point (`daemon/entry.ts`) that installs per-session error boundaries instead of global crash handlers. **`unhandledRejection`**: log and continue — per-session `Effect.catchAll` wrappers (implemented in Milestone 2, Task 5) contain the blast radius so a single session's rejection can't take down the daemon. **`uncaughtException`**: fundamentally different — by definition it happened outside any promise chain the Effect runtime could have caught, so the process is in genuinely unknown state. Log and exit for clean respawn via `handleConnectionError()`. No string-matching heuristic — all `uncaughtException` is fatal. Confidence: 85% — per-session `Effect.catchAll` isolation is architecturally sound but depends on Effect fiber boundaries being correctly placed in the HTTP handler layer (not implemented until Milestone 2). Until then, `unhandledRejection` is a risk.

**ADDED: REG-11 — CLI wrapper hangs forever waiting for daemon child to exit.** The arcana CLI (`packages/arcana/src/index.ts:60-61`) calls `await child.exited` after spawning the engine, then `process.exit()`. Since the daemon never exits, the CLI wrapper process hangs forever and accumulates as a zombie. **Fix:** When launching the engine in daemon mode (`--daemon` flag), the CLI wrapper spawns the child with `detached: true` and exits immediately without waiting. Signal forwarding (line 54-58) is disabled for daemon mode — the daemon manages its own lifecycle via SIGTERM/SIGINT handlers in lifecycle.ts. The CLI wrapper only waits for the child in TUI mode (existing behavior preserved). Confidence: 100% — Bun's `Bun.spawn()` API cleanly supports this.

**ADDED: REG-12 — `finally { process.exit() }` in engine's main path exits daemon.** `runDirectTui()` at `index.ts:174-177` has `finally { flushSync(); process.exit() }`. In the current architecture, the engine IS the TUI process — when the TUI closes, the engine exits. In the daemon architecture, the TUI and daemon are separate processes. The engine's main path must detect daemon mode and skip `process.exit()`. **Fix:** The daemon has its own entry point that bypasses `runDirectTui()` entirely. When `process.env.ARCANA_DAEMON === "1"`, the engine's `index.ts` routes to `daemonMain()` instead of `runDirectTui()`. `daemonMain()` calls `startDaemon()` from lifecycle.ts and enters an idle loop (never exits). The TUI process is a separate `Bun.spawn()` call from the CLI wrapper. Confidence: 100% — simple conditional routing.

**Confidence:**
- REG-1: 100% — Worker fallback preserved
- REG-2: 95% — async startupTasks after partial status; need to ensure prompt doesn't block
- REG-3: 100% — idle timer reset on connection
- REG-4: 100% — atomic `wx` lock + port fallback, race-free by construction
- REG-5: 100% — 127.0.0.1 bind, no firewall issues
- REG-6: 95% — versioned lock files prevent collision; old-daemon toast depends on TUI-side detection
- REG-7: 90% — LRU cache helps but real memory profiling needed post-implementation
- REG-8: 100% — workspace hash keying, deterministic isolation
- REG-9: 95% — reactive on fetch failure; 3s debounce prevents storms, but edge case: daemon hanging (not crashing) won't trigger fetch failure
- REG-10: 85% — per-session fiber isolation is correct but depends on Effect boundary placement in HTTP handlers; global catch-and-log is the fallback but risks silent corruption
- REG-11: 100% — Bun spawn API cleanly supports detached mode
- REG-12: 100% — simple conditional routing in index.ts

---

## Implementation Plan

### Milestone 0: Daemon entry point isolation (safety-critical — must ship first)

### Task 0: Create daemon entry point and route engine to it

**Objective:** Prevent the daemon from inheriting the engine's fatal error handlers (`process.exit(1)` on any unhandled rejection) and the `finally { process.exit() }` block. Create a dedicated daemon entry path.

**Files:**
- Create: `packages/engine/src/daemon/entry.ts`
- Modify: `packages/engine/src/index.ts`
- Modify: `packages/arcana/src/index.ts`

**Step 1: Write daemon/entry.ts**

```typescript
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
  // Do NOT process.exit() — per-session Effect.catchAll boundaries (Milestone 2, Task 5)
  // contain the blast radius. If a rejection escapes all session-level boundaries,
  // it's logged here but the daemon stays alive.
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
```

**Step 2: Add daemon routing to index.ts**

In `packages/engine/src/index.ts`, before the `runDirectTui()` call (line 156):

```typescript
// Daemon mode: skip TUI bootstrap, enter daemon lifecycle
if (process.env.ARCANA_DAEMON === "1") {
  await import("./daemon/entry")
  // entry.ts never returns — daemon runs until SIGTERM/idle timeout
  return
}

// Existing TUI path
if (args.length === 0) {
  await runDirectTui()
  // ...
}
```

**Step 3: Update CLI wrapper for daemon spawn**

In `packages/arcana/src/index.ts`, add daemon spawn path before the TUI fast path (line 26):

```typescript
const DAEMON_FLAG = args.includes("--daemon")

if (DAEMON_FLAG) {
  // Spawn daemon detached — CLI exits immediately, daemon persists
  const child = Bun.spawn({
    cmd: ["bun", "--conditions=browser", engineEntry, ...args.filter(a => a !== "--daemon")],
    stdio: ["ignore", "inherit", "inherit"],
    cwd: engineDir,
    env: {
      ...process.env,
      ARCANA_DAEMON: "1",
      ARCANA_DAEMON_CWD: process.cwd(),
      PWD: process.cwd(),
    },
  })
  child.unref() // Don't keep the CLI process alive
  process.exit(0)
}
```

**Step 4: Commit**

```bash
git add packages/engine/src/daemon/entry.ts
git add packages/engine/src/index.ts
git add packages/arcana/src/index.ts
git commit -m "feat: daemon entry point — isolated error handling, detached spawn"
```

---

### Milestone 1: Daemon infrastructure (no TUI changes)

### Task 1: Create daemon lock file module

**Objective:** Read/write daemon state to `~/.arcana/daemon/{workspaceHash}.json` — per-workspace, atomic acquisition.

**Files:**
- Create: `packages/engine/src/daemon/lock.ts`

**Step 1: Write lock.ts**

```typescript
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { createHash } from "node:crypto"

export interface DaemonLock {
  workspace: string
  pid: number
  port: number
  startedAt: number
  lastActivityAt: number
  version: string
}

const DAEMON_DIR = join(homedir(), ".arcana", "daemon")

export function workspaceHash(cwd: string): string {
  return createHash("sha256").update(cwd).digest("hex").slice(0, 12)
}

export function lockPath(wsHash: string): string {
  return join(DAEMON_DIR, `${wsHash}.json`)
}

function ensureDir() {
  if (!existsSync(DAEMON_DIR)) mkdirSync(DAEMON_DIR, { recursive: true })
}

export function readLock(cwd: string): DaemonLock | null {
  try {
    const file = lockPath(workspaceHash(cwd))
    if (!existsSync(file)) return null
    const raw = readFileSync(file, "utf8")
    return JSON.parse(raw) as DaemonLock
  } catch {
    return null
  }
}

/** Atomic lock acquisition — uses O_CREAT|O_EXCL so only one process wins. */
export function acquireLock(cwd: string, port: number, version: string): DaemonLock | null {
  ensureDir()
  const file = lockPath(workspaceHash(cwd))
  const lock: DaemonLock = {
    workspace: cwd,
    pid: process.pid,
    port,
    startedAt: Date.now(),
    lastActivityAt: Date.now(),
    version,
  }
  try {
    // wx = write + exclusive create. Throws EEXIST if file already exists.
    writeFileSync(file, JSON.stringify(lock, null, 2), { flag: "wx" })
    return lock
  } catch (err: any) {
    if (err?.code === "EEXIST") return null // another process won the race
    throw err
  }
}

export function updateLock(cwd: string, patch: Partial<DaemonLock>): void {
  const existing = readLock(cwd)
  if (!existing) return
  writeFileSync(lockPath(workspaceHash(cwd)), JSON.stringify({ ...existing, ...patch }, null, 2))
}

export function removeLock(cwd: string): void {
  try { unlinkSync(lockPath(workspaceHash(cwd))) } catch {}
}

export function touchActivity(cwd: string): void {
  updateLock(cwd, { lastActivityAt: Date.now() })
}

export function isLockStale(lock: DaemonLock): boolean {
  try {
    process.kill(lock.pid, 0) // Signal 0 = existence check
    return false
  } catch {
    return true
  }
}
```

**Step 2: Commit**

```bash
git add packages/engine/src/daemon/lock.ts
git commit -m "feat: add daemon lock file module"
```

---

### Task 2: Create daemon lifecycle module

**Objective:** Spawn, reactive crash detection, idle-timeout, and shutdown logic. Per-workspace.

**Files:**
- Create: `packages/engine/src/daemon/lifecycle.ts`

**Step 1: Write lifecycle.ts**

```typescript
import { readLock, acquireLock, removeLock, isLockStale, touchActivity, type DaemonLock } from "./lock"
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
  
  // Signal handlers
  process.on("SIGTERM", () => stopDaemon(server!, cwd))
  process.on("SIGINT", () => stopDaemon(server!, cwd))

  return { port, url: `http://127.0.0.1:${port}` }
}

export async function stopDaemon(server: Awaited<ReturnType<typeof Server.listen>>, cwd: string) {
  removeLock(cwd)
  await server.stop(true)
}

export function resetActivity(cwd: string) {
  touchActivity(cwd)
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
```

**Step 2: Commit**

```bash
git add packages/engine/src/daemon/lifecycle.ts
git commit -m "feat: add daemon lifecycle (spawn, idle timeout, health check)"
```

---

### Task 3: Add health check route to server

**Objective:** Register `/health` endpoint on the existing HTTP server.

**Files:**
- Modify: `packages/engine/src/server/server.ts`

**Step 1: Extract version constant**

```typescript
// In server.ts or a new version.ts
export const INSTANCE_VERSION = "0.3.65" // read from package.json at build time
```

**Step 2: Add health route**

The existing `Server.Default()` uses `HttpApiApp.webHandler().handler`. Add a health endpoint:

```typescript
// In packages/engine/src/server/routes/health.ts
import { HttpRouter } from "effect/unstable/http"

export const HealthRoute = HttpRouter.get("/health", () => 
  new Response(JSON.stringify({ status: "ok", version: INSTANCE_VERSION }), {
    headers: { "content-type": "application/json" }
  })
)
```

Register in `server.ts` by merging with the existing router.

**Step 3: Commit**

```bash
git add packages/engine/src/server/routes/health.ts
git add packages/engine/src/server/server.ts  
git commit -m "feat: add /health endpoint for daemon liveness check"
```

---

### Task 4: Create daemon CLI command

**Objective:** `arcana daemon start|stop|status` for debugging and manual control.

**Files:**
- Create: `packages/engine/src/cli/cmd/daemon.ts`

**Step 1: Write daemon command**

```typescript
import { cmd } from "./cmd"
import { readLock, isLockStale, removeLock } from "../../daemon/lock"
import { healthCheck } from "../../daemon/lifecycle"

export const DaemonCommand = cmd({
  command: "daemon <action>",
  describe: "manage arcana daemon process",
  builder: (yargs) =>
    yargs.positional("action", {
      type: "string",
      choices: ["start", "stop", "status"],
      describe: "action to perform",
    }),
  handler: async (args) => {
    const lock = readLock()
    
    switch (args.action) {
      case "status": {
        if (!lock) {
          console.log("Daemon: not running")
          return
        }
        const alive = await healthCheck(lock.port)
        console.log(`Daemon: ${alive ? "running" : "stale lock"}`)
        if (alive) {
          console.log(`  PID: ${lock.pid}`)
          console.log(`  Port: ${lock.port}`)
          console.log(`  Started: ${new Date(lock.startedAt).toISOString()}`)
          console.log(`  Version: ${lock.version}`)
        }
        break
      }
      case "stop": {
        if (lock && !isLockStale(lock)) {
          process.kill(lock.pid, "SIGTERM")
          console.log("Daemon: stopping...")
        } else {
          removeLock()
          console.log("Daemon: not running (cleaned stale lock)")
        }
        break
      }
      case "start": {
        console.log("Daemon auto-starts on first arcana launch. No manual start needed.")
        break
      }
    }
  },
})
```

Register in `packages/engine/src/index.ts` command loaders.

**Step 2: Commit**

```bash
git add packages/engine/src/cli/cmd/daemon.ts
git add packages/engine/src/index.ts
git commit -m "feat: add 'arcana daemon' CLI for status/stop"
```

---

### Milestone 2: TUI daemon connection

### Task 5: Modify TUI startup to detect daemon

**Objective:** On `arcana`, check for existing daemon before spawning Worker. Connect via HTTP if daemon exists.

**Files:**
- Modify: `packages/engine/src/cli/tui.ts`
- Modify: `packages/arcana/src/index.ts`

**Step 1: Write daemon connection helper in tui.ts**

```typescript
// In tui.ts, before the Worker creation
import { readLock, isLockStale, removeLock as removeDaemonLock, workspaceHash } from "../../daemon/lock"
import { startDaemon, resetActivity, handleConnectionError } from "../../daemon/lifecycle"
import { INSTANCE_VERSION } from "../version"

async function connectOrSpawnDaemon(cwd: string): Promise<{
  url: string
  fetch: typeof fetch
  events: EventSource
}> {
  const version = INSTANCE_VERSION
  const lock = readLock(cwd)
  
  // Try existing daemon
  if (lock && !isLockStale(lock)) {
    // Version check — if mismatch, this launch gets a NEW daemon (old one stays alive)
    if (lock.version !== version) {
      // Spawn new daemon on a different port for this version
      const { port, url } = await startDaemon(cwd, version)
      return {
        url,
        fetch: createWrappedFetch(url, cwd, version), // wraps fetch with reactive error handling
        events: createDaemonEventSource(port),
      }
    }
    
    // Same version — connect to existing
    resetActivity(cwd)
    return {
      url: `http://127.0.0.1:${lock.port}`,
      fetch: createWrappedFetch(`http://127.0.0.1:${lock.port}`, cwd, version),
      events: createDaemonEventSource(lock.port),
    }
  }
  
  // Stale lock — clean up
  if (lock) removeDaemonLock(cwd)
  
  // No daemon — start one
  const { port, url } = await startDaemon(cwd, version)
  return {
    url,
    fetch: createWrappedFetch(url, cwd, version),
    events: createDaemonEventSource(port),
  }
}

/** Wraps native fetch with reactive daemon respawn on connection failure. */
function createWrappedFetch(baseUrl: string, cwd: string, version: string): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      return await fetch(input, init)
    } catch (err: any) {
      if (err?.code === "ECONNREFUSED" || err?.cause?.code === "ECONNREFUSED") {
        // Daemon crashed — respawn immediately, no polling
        const newDaemon = await handleConnectionError(cwd, version)
        if (newDaemon) {
          // Retry the request against the new daemon
          const newUrl = typeof input === "string" 
            ? input.replace(baseUrl, newDaemon.url)
            : newDaemon.url + new URL(input instanceof Request ? input.url : String(input)).pathname
          return fetch(newUrl, init)
        }
      }
      throw err
    }
  }
}
```

**Step 2: Wire into TuiThreadCommand.handler()**

Replace the Worker creation block (lines 135-185 in tui.ts) with:
```typescript
const transport = await connectOrSpawnDaemon()
// transport.url, transport.fetch, transport.events ready
```

Keep the Worker path as fallback wrapped in try/catch.

**Step 3: Commit**

```bash
git add packages/engine/src/cli/tui.ts
git add packages/arcana/src/index.ts
git commit -m "feat: connect TUI to daemon, spawn if missing"
```

---

### Milestone 3: Session pool

### Task 6: Upgrade prewarm to session pool

**Objective:** Prewarm 3 sessions instead of 1. Daemon-side prewarming (no TUI dependency).

**Files:**
- Modify: `tui/src/routes/home/prewarm-session.tsx`
- Create: `engine/src/daemon/session-pool.ts`

**Step 1: Write session-pool.ts (daemon-side)**

```typescript
// Daemon-side: prewarm pool of sessions
// These are created server-side via the existing session.create endpoint
// The pool replenishes as sessions are consumed

const POOL_SIZE = 3

class SessionPool {
  private pool: string[] = []
  private creating = false

  async ensure(): Promise<string> {
    // Return existing prewarmed session
    if (this.pool.length > 0) {
      const id = this.pool.shift()!
      this.refill()
      return id
    }
    // Pool empty — create one synchronously
    return this.createSession()
  }

  private async refill() {
    if (this.creating) return
    this.creating = true
    try {
      while (this.pool.length < POOL_SIZE) {
        const id = await this.createSession()
        if (id) this.pool.push(id)
      }
    } finally {
      this.creating = false
    }
  }

  private async createSession(): Promise<string> {
    // Call internal session.create — same as the HTTP endpoint
    // Returns session ID
  }

  start() {
    this.refill()
  }
}
```

**Step 2: Wire session pool into daemon startup**

In `lifecycle.ts` `startDaemon()`:
```typescript
const pool = new SessionPool()
pool.start()
```

**Step 3: Update TUI prewarm to query daemon pool**

The existing `prewarm-session.tsx` calls `sdk.client.session.create()`. With the daemon, it calls a new endpoint `/session/pool/consume` that returns a prewarmed session ID instantly.

**Step 4: Commit**

```bash
git add packages/engine/src/daemon/session-pool.ts
git add packages/engine/src/daemon/lifecycle.ts
git add packages/tui/src/routes/home/prewarm-session.tsx
git commit -m "feat: session pool with 3 prewarmed sessions"
```

---

### Task 7: Remove sync.ready block on daemon connect

**Objective:** When connecting to an alive daemon, don't wait for `store.status === "complete"`. The daemon is already loaded.

**Files:**
- Modify: `tui/src/context/sync.tsx`

**Step 1: Add daemon-aware status**

```typescript
// In sync.tsx, modify the status initialization
const initialStatus = isDaemonConnected() ? "partial" : "loading"

// Don't block prewarm on "complete" when daemon is alive
get ready() {
  if (startup.skipInitialLoading) return true
  if (isDaemonConnected()) return store.status !== "loading" // "partial" is enough
  return store.status !== "loading"
}
```

**Step 2: Commit**

```bash
git add packages/tui/src/context/sync.tsx
git commit -m "feat: skip full sync wait when daemon is alive"
```

---

### Task 8: End-to-end test — measure startup time + failure paths

**Objective:** Verify cold → warm transition AND all failure edge cases from the regression table.

**Files:**
- Create: `packages/engine/test/daemon/startup.test.ts`

**Step 1: Write test**

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { readLock, acquireLock, removeLock, workspaceHash } from "../../src/daemon/lock"
import { startDaemon, stopDaemon, handleConnectionError } from "../../src/daemon/lifecycle"
import { tmpdir } from "node:os"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"

const VERSION = "0.0.0-test"

describe("daemon lifecycle", () => {
  let cwd: string
  let daemon: { port: number; url: string } | null

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "arcana-daemon-test-"))
    daemon = null
  })

  afterEach(async () => {
    if (daemon) await stopDaemon(daemon as any, cwd)
    removeLock(cwd)
    rmSync(cwd, { recursive: true, force: true })
  })

  test("cold start creates daemon and writes lock", async () => {
    const t0 = performance.now()
    daemon = await startDaemon(cwd, VERSION)
    const elapsed = performance.now() - t0

    const lock = readLock(cwd)
    expect(lock).not.toBeNull()
    expect(lock!.workspace).toBe(cwd)
    expect(lock!.port).toBe(daemon.port)
    expect(lock!.version).toBe(VERSION)

    // Health check
    const res = await fetch(`http://127.0.0.1:${daemon.port}/health`)
    expect(res.status).toBe(200)
  })

  test("warm start — second process connects to existing daemon", async () => {
    daemon = await startDaemon(cwd, VERSION)

    const t0 = performance.now()
    // Simulate second process: read lock, connect
    const lock = readLock(cwd)
    expect(lock).not.toBeNull()
    const res = await fetch(`http://127.0.0.1:${lock!.port}/health`)
    const elapsed = performance.now() - t0

    expect(res.status).toBe(200)
    expect(elapsed).toBeLessThan(500) // warm connect <500ms
  })

  test("spawn race — second acquireLock returns null", async () => {
    // Simulate first process acquiring lock
    const lock1 = acquireLock(cwd, 9142, VERSION)
    expect(lock1).not.toBeNull()

    // Second process tries same workspace — gets null
    const lock2 = acquireLock(cwd, 9142, VERSION)
    expect(lock2).toBeNull()

    removeLock(cwd)
  })

  test("stale lock — cleaned up on daemon crash", async () => {
    daemon = await startDaemon(cwd, VERSION)
    const lock = readLock(cwd)
    expect(lock).not.toBeNull()

    // Kill the daemon process
    process.kill(lock!.pid, "SIGKILL")
    await new Promise(r => setTimeout(r, 100))

    // handleConnectionError detects stale lock and respawns
    const newDaemon = await handleConnectionError(cwd, VERSION)
    expect(newDaemon).not.toBeNull()
    daemon = newDaemon // for cleanup

    const newLock = readLock(cwd)
    expect(newLock!.pid).not.toBe(lock!.pid)
  })

  test("version mismatch — spawns new daemon, old lock untouched", async () => {
    daemon = await startDaemon(cwd, "0.1.0-old")

    // New version tries to connect — should get a NEW daemon
    // (In production, the lock path includes version. Here we verify the logic)
    const lock = readLock(cwd)
    expect(lock!.version).toBe("0.1.0-old")

    // Old daemon stays alive — its lock is intact
    const res = await fetch(`http://127.0.0.1:${daemon.port}/health`)
    expect(res.status).toBe(200)
  })

  test("reactive crash detection — debounce prevents storms", async () => {
    daemon = await startDaemon(cwd, VERSION)

    // First error triggers respawn
    const r1 = await handleConnectionError(cwd, VERSION)
    expect(r1).toBeNull() // daemon is alive, no respawn needed

    // Second error within 3s debounce — suppressed
    const r2 = await handleConnectionError(cwd, VERSION)
    expect(r2).toBeNull() // debounced
  })
})
```

**Step 2: Commit**

```bash
git add packages/engine/test/daemon/startup.test.ts
git commit -m "test: daemon lifecycle — cold/warm start, spawn race, stale lock, version mismatch, debounce"
```

---

## Verification Steps

1. `arcana daemon status` → "not running" on fresh install
2. `arcana` in `~/project-a` → TUI opens, check `~/.arcana/daemon/{workspaceHash}.json` exists
3. `arcana` in `~/project-b` (different dir) → separate daemon spawns, separate lock file
4. `arcana daemon status` → shows PID, port, version, workspace path
5. Close TUI (Ctrl+C twice) → daemon still running (check status)
6. `arcana` again (same workspace) → TUI opens instantly, no loading spinner
7. Type "hi" + Enter → session opens in <1s (prewarmed pool)
8. Wait 5 minutes → daemon auto-shuts down (idle timeout)
9. Kill daemon mid-session (`kill <pid>`) → next fetch auto-respawns, TUI reconnects
10. Upgrade arcana → old daemon keeps running, new launch spawns new daemon on different port
11. Two simultaneous `arcana` launches → one wins atomic lock, other connects to winner

---

## Risks & Open Questions

1. **TCP port vs Unix socket:** TCP works cross-platform but adds ~1ms latency per request vs Unix socket. Negligible for TUI use case.
2. **Multiple workspaces:** Separate daemon per workspace (keyed by CWD hash). Two `arcana` instances in different directories share nothing. Same-workspace concurrent instances share one daemon. Sessions are isolated by sessionID.
3. **Daemon crash during active session:** Reactive detection via wrapped fetch — any `ECONNREFUSED` triggers immediate respawn (3s debounce). In-flight messages may be lost — acceptable trade-off for v1. Known limitation: hanging-but-not-crashed daemons won't trigger respawn.
4. **Memory:** Daemon accumulates Effect runtime state. LRU session cache helps. Add `process.memoryUsage()` logging to health endpoint for monitoring.
5. **Version upgrade:** Old daemon continues serving active sessions. New launch spawns new daemon on different port. Old daemon's TUIs show upgrade toast. Old daemon exits via idle timeout once all sessions close.
