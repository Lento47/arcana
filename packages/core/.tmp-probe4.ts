// .tmp-probe4.ts
import { Effect } from "effect"
import { authorizeFileMutation } from "./src/capability/fs-gate"
import { TransportLedger } from "./src/capability/replay-transport"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const dir = import.meta.dir
const p = join(dir, ".tmp-fs-probe.txt")
mkdirSync(dir, { recursive: true })
const dbp = join(dir, ".tmp-fs-probe.db")

const result = await authorizeFileMutation(
  { dbPath: dbp, principalId: "test-agent", sessionId: "s-x", transport: { mode: "record", ledger: new TransportLedger() } },
  { toolName: "write", filePath: p, content: "x" },
  () => {
    writeFileSync(p, "x", "utf8")
    return `Written ${p}`
  },
)
console.log(JSON.stringify(result, null, 2).slice(0, 800))
