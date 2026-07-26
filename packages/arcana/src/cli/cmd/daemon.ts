// Daemon management CLI — reads lock files directly, no engine imports needed.
import { existsSync, readFileSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { createHash } from "node:crypto"

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

export const DaemonCommand = {
  command: "daemon <action>",
  describe: "manage arcana daemon process",
  builder: (yargs: any) =>
    yargs.positional("action", {
      type: "string",
      choices: ["start", "stop", "status"],
      describe: "action to perform",
    }),
  handler: async (args: any) => {
    const cwd = process.cwd()
    const lock = readLock(cwd)

    switch (args.action) {
      case "status": {
        if (!lock) {
          console.log("Daemon: not running")
          return
        }
        const alive = await healthCheck(lock.port as number)
        console.log(`Daemon: ${alive ? "running" : "stale lock"}`)
        if (alive) {
          console.log(`  Workspace: ${lock.workspace}`)
          console.log(`  PID: ${lock.pid}`)
          console.log(`  Port: ${lock.port}`)
          console.log(`  Started: ${new Date(lock.startedAt as number).toISOString()}`)
          console.log(`  Version: ${lock.version}`)
        }
        break
      }
      case "stop": {
        if (lock) {
          try {
            process.kill(lock.pid as number, "SIGTERM")
            console.log("Daemon: stopping...")
          } catch {
            unlinkSync(lockPath(cwd))
            console.log("Daemon: not running (cleaned stale lock)")
          }
        } else {
          console.log("Daemon: not running")
        }
        break
      }
      case "start": {
        console.log("Daemon auto-starts on first arcana launch. No manual start needed.")
        break
      }
    }
  },
}
