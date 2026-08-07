import { cmd } from "./cmd"
import { readLock, isLockStale, removeLock, listAllLocks } from "../../daemon/lock"
import { healthCheck } from "../../daemon/lifecycle"
import { outputJson, isJsonMode, jsonOption } from "../json-output"

/** Format a lock timestamp safely; legacy locks may miss the field entirely. */
function lockStartedAt(lock: { startedAt?: number; started_at?: number }): string | null {
  const ts = lock.startedAt ?? lock.started_at
  if (typeof ts !== "number" || !Number.isFinite(ts)) return null
  const date = new Date(ts)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export const DaemonCommand = cmd({
  command: "daemon <action>",
  describe: "manage arcana daemon process",
  builder: (yargs) =>
    yargs.positional("action", {
      type: "string",
      choices: ["start", "stop", "status"],
      describe: "action to perform",
    }).option("json", {
      type: "boolean",
      default: false,
      describe: "output machine-readable JSON to stdout",
    }),
  handler: async (args) => {
    const cwd = process.cwd()
    const json = isJsonMode(args)

    switch (args.action) {
      case "status": {
        const locks = listAllLocks()
        if (locks.length === 0) {
          if (json) outputJson({ running: false, daemons: [] })
          else console.log("Daemon: not running (no lock files)")
          return
        }
        let found = false
        const daemons: Array<Record<string, unknown>> = []
        for (const lock of locks) {
          const alive = await healthCheck(lock.port)
          if (alive) {
            const startedAt = lockStartedAt(lock)
            const daemon = {
              workspace: lock.workspace,
              pid: lock.pid,
              port: lock.port,
              startedAt,
              version: lock.version,
            }
            daemons.push(daemon)
            if (!json) {
              console.log(`Daemon: running`)
              console.log(`  Workspace: ${lock.workspace}`)
              console.log(`  PID: ${lock.pid}`)
              console.log(`  Port: ${lock.port}`)
              console.log(`  Started: ${startedAt ?? "unknown"}`)
              console.log(`  Version: ${lock.version}`)
            }
            found = true
          } else {
            removeLock(lock.workspace)
          }
        }
        if (json) outputJson({ running: found, daemons })
        else if (!found) console.log("Daemon: not running (cleaned stale locks)")
        break
      }
      case "stop": {
        // Try CWD lock first, then fall back to scanning all locks
        const lock = readLock(cwd)
        const targets = lock ? [lock] : listAllLocks()
        let stopped = false
        const stoppedIds: number[] = []
        for (const l of targets) {
          if (!isLockStale(l)) {
            process.kill(l.pid, "SIGTERM")
            stoppedIds.push(l.pid)
            if (!json) console.log(`Daemon: stopping (pid ${l.pid}, workspace ${l.workspace})...`)
            stopped = true
          }
        }
        if (json) outputJson({ stopping: stoppedIds })
        else if (!stopped) console.log("Daemon: not running")
        break
      }
      case "start": {
        if (json) outputJson({ started: false, message: "Daemon auto-starts on first arcana launch. No manual start needed." })
        else console.log("Daemon auto-starts on first arcana launch. No manual start needed.")
        break
      }
    }
  },
})
