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
    const cwd = process.cwd()
    const lock = readLock(cwd)

    switch (args.action) {
      case "status": {
        if (!lock) {
          console.log("Daemon: not running")
          return
        }
        const alive = await healthCheck(lock.port)
        console.log(`Daemon: ${alive ? "running" : "stale lock"}`)
        if (alive) {
          console.log(`  Workspace: ${lock.workspace}`)
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
          removeLock(cwd)
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
