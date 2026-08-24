// .tmp-probe5.ts
import { Effect } from "effect"
import { authorizeFileMutation } from "./src/capability/fs-gate"
import { TransportLedger } from "./src/capability/replay-transport"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const dir = join(import.meta.dir, ".tmp-replay-k3b")
mkdirSync(dir, { recursive: true })
const DB = join(dir, "k3b-fs.db")
const p = join(dir, "fs-replay.txt")
const ledger = new TransportLedger()
const opts = { dbPath: DB, principalId: "test-agent", sessionId: "s-k3b", transport: { mode: "record" as const, ledger } }
const req = {
  toolName: "write",
  filePath: p,
  content: "recorded-content",
  nonce: "n-k3b-f",
  requestedAt: "2026-08-23T00:00:00.000Z",
  requestId: "req-k3b-f",
}
const rec = await authorizeFileMutation(opts, req, () => {
  writeFileSync(p, "recorded-content", "utf8")
  return `Written ${p}`
})
console.log("REC:", rec.status, "|", ("detail" in rec ? rec.detail : "").slice(0, 160))
