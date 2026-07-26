import { cmd } from "./cmd"
import { readLock, isLockStale, removeLock, listAllLocks } from "../../daemon/lock"
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

    switch (args.action) {
      case "status": {
        const locks = listAllLocks()
        if (locks.length === 0) {
          console.log("Daemon: not running (no lock files)")
          return
        }
        let found = false
        for (const lock of locks) {
          const alive = await healthCheck(lock.port)
          if (alive) {
            console.log(`Daemon: running`)
            console.log(`  Workspace: ${lock.workspace}`)
            console.log(`  PID: ${lock.pid}`)
            console.log(`  Port: ${lock.port}`)
            console.log(`  Started: ${new Date(lock.startedAt).toISOString()}`)
            console.log(`  Version: ${lock.version}`)
            found = true
          } else {
            removeLock(lock.workspace)
          }
        }
        if (!found) console.log("Daemon: not running (cleaned stale locks)")
        break
      }
      case "stop": {
        // Try CWD lock first, then fall back to scanning all locks
        const lock = readLock(cwd)
        const targets = lock ? [lock] : listAllLocks()
        let stopped = false
        for (const l of targets) {
          if (!isLockStale(l)) {
            process.kill(l.pid, "SIGTERM")
            console.log(`Daemon: stopping (pid ${l.pid}, workspace ${l.workspace})...`)
            stopped = true
          }
        }
        if (!stopped) console.log("Daemon: not running")
        break
      }
      case "start": {
        console.log("Daemon auto-starts on first arcana launch. No manual start needed.")
        break
      }
    }
  },
})
