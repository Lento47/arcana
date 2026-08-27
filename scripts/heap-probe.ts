// One-off: boot the daemon server, wait for settle, dump a heap snapshot.
// Usage: bun run scripts/heap-probe.ts
import { writeHeapSnapshot } from "node:v8"

process.env.ARCANA_DAEMON = "1"
process.env.ARCANA_ENGINE = "1"
process.env.ARCANA_RUNTIME = "engine"

console.log("[probe] starting...")
const { startDaemon } = await import("../packages/engine/src/daemon/lifecycle")
console.log("[probe] lifecycle imported")
const { port, url } = await startDaemon(process.cwd(), "0.0.0-dev")
console.log(`[probe] daemon ready on ${url} (pid ${process.pid})`)

setTimeout(() => {
  try {
    const file = writeHeapSnapshot("daemon.heapsnapshot")
    console.log("heap dumped:", file)
  } catch (e) {
    console.error("heap dump failed:", e)
  }
  process.exit(0)
}, 6000)
