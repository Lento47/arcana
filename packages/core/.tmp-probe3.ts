// .tmp-probe3.ts
import { Effect } from "effect"
import { authorizeProcess } from "./src/capability/process-gate"
import { TransportLedger } from "./src/capability/replay-transport"
import { existsSync, rmSync } from "node:fs"
import { join } from "node:path"

const dir = import.meta.dir
const marker = join(dir, ".tmp-marker.txt")
rmSync(marker, { force: true })
const argv = [process.execPath, "-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`]
const req = {
  toolName: "shell",
  argv,
  nonce: "n-p",
  requestedAt: "2026-08-23T00:00:00Z",
  requestId: "req-p",
}
const ledger = new TransportLedger()
const dbp = join(dir, ".tmp-probe.db")
const rec = await authorizeProcess(
  { dbPath: dbp, principalId: "t", sessionId: "s", transport: { mode: "record", ledger } },
  { ...req },
)
console.log("rec:", JSON.stringify(rec))
console.log("ledgerSize:", ledger.size, "markerExists:", existsSync(marker))

const rep = await authorizeProcess(
  { dbPath: dbp, principalId: "t", sessionId: "s", transport: { mode: "replay", ledger } },
  { ...req },
)
console.log("rep:", JSON.stringify(rep).slice(0, 200))
console.log("markerAfterReplay:", existsSync(marker))
