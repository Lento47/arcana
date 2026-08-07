// Daemon management CLI — reads lock files directly, no engine imports needed.
import { existsSync, readFileSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { createHash } from "node:crypto"
import { outputJson, isJsonMode, jsonOption } from "../json-output.js"

function workspaceHash(cwd: string): string {
  return createHash("sha256").update(cwd).digest("hex").slice(0, 12)
}

function lockPath(cwd: string): string {
  return join(homedir(), ".arcana", "daemon", `${workspaceHash(cwd)}.json`)
}

function readLock(cwd: string): Record<string, unknown> | null {
  try {
    const file = lockPath(cwd)
    if (!existsSync(file)) return null
    return JSON.parse(readFileSync(file, "utf8"))
  } catch {
    return null
  }
}

async function healthCheck(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`)
    return res.ok
  } catch {
    return false
  }
}

/** Format a lock timestamp safely; legacy locks may miss the field entirely. */
function lockStartedAt(lock: Record<string, unknown>): string | null {
  const ts = lock.startedAt ?? lock.started_at
  if (typeof ts !== "number" || !Number.isFinite(ts)) return null
  const date = new Date(ts)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export const DaemonCommand = {
  command: "daemon <action>",
  describe: "manage arcana daemon process",
  builder: (yargs: any) =>
    yargs
      .positional("action", {
        type: "string",
        choices: ["start", "stop", "status"],
        describe: "action to perform",
      })
      .option("json", {
        type: "boolean",
        default: false,
        describe: "output machine-readable JSON to stdout",
      }),
  handler: async (args: any) => {
    const cwd = process.cwd()
    const lock = readLock(cwd)
    const json = isJsonMode(args)

    switch (args.action) {
      case "status": {
        if (!lock) {
          if (json) outputJson({ running: false })
          else console.log("Daemon: not running")
          return
        }
        const alive = await healthCheck(lock.port as number)
        if (alive) {
          const startedAt = lockStartedAt(lock)
          if (json) {
            outputJson({
              running: true,
              workspace: lock.workspace,
              pid: lock.pid,
              port: lock.port,
              startedAt,
              version: lock.version,
            })
          } else {
            console.log("Daemon: running")
            console.log(`  Workspace: ${lock.workspace}`)
            console.log(`  PID: ${lock.pid}`)
            console.log(`  Port: ${lock.port}`)
            console.log(`  Started: ${startedAt ?? "unknown"}`)
            console.log(`  Version: ${lock.version}`)
          }
        } else if (json) {
          outputJson({ running: false, staleLock: true })
        } else {
          console.log("Daemon: stale lock")
        }
        break
      }
      case "stop": {
        if (lock) {
          try {
            process.kill(lock.pid as number, "SIGTERM")
            if (json) outputJson({ stopping: [lock.pid] })
            else console.log("Daemon: stopping...")
          } catch {
            unlinkSync(lockPath(cwd))
            if (json) outputJson({ running: false, staleLock: true })
            else console.log("Daemon: not running (cleaned stale lock)")
          }
        } else {
          if (json) outputJson({ running: false })
          else console.log("Daemon: not running")
        }
        break
      }
      case "start": {
        if (json) outputJson({ started: false, message: "Daemon auto-starts on first arcana launch. No manual start needed." })
        else console.log("Daemon auto-starts on first arcana launch. No manual start needed.")
        break
      }
    }
  },
}
