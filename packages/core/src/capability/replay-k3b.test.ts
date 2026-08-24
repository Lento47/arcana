// packages/core/src/capability/replay-k3b.test.ts
// Authority Kernel K3b — transport/execution replay suite.
//
// Proves: after ONE recorded run, identical captured-input requests replay
// the recorded observations with ZERO real dispatches (no spawn, no write,
// no egress), and any uncovered hash is a hard REPLAY_GAP failure.

import { describe, expect, it, afterAll } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { TransportLedger } from "./replay-transport"
import { authorizeProcess } from "./process-gate"
import { authorizeFileMutation } from "./fs-gate"
import { authorizeNetwork } from "./network-gate"

const dir = join(import.meta.dir, ".tmp-replay-k3b")
function dbPath(n: string): string {
  mkdirSync(dir, { recursive: true })
  return join(dir, n)
}

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* Windows file-lock lag */
  }
})

describe("K3b transport replay", () => {
  it("process: replay substitutes output — zero spawns, marker never created", async () => {
    const marker = join(dir, "marker-process.txt")
    rmSync(marker, { force: true })
    const argv = [process.execPath, "-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`]
    const req = {
      toolName: "shell",
      argv,
      nonce: "n-k3b-p",
      requestedAt: "2026-08-23T00:00:00.000Z",
      requestId: "req-k3b-p",
      instanceId: "inst-recorder",
    }
    const opts = { dbPath: dbPath("k3b-p.db"), principalId: "test-agent", sessionId: "s-k3b" }

    // RECORD: real run creates the marker.
    const ledger = new TransportLedger()
    const rec = await authorizeProcess({ ...opts, transport: { mode: "record", ledger } }, { ...req })
    expect(rec.status).toBe("EXECUTED")
    expect(existsSync(marker)).toBe(true)
    expect(ledger.size).toBe(1)

    // REPLAY: delete the artifact; the recorded output is substituted.
    rmSync(marker, { force: true })
    const rep = await authorizeProcess(
      { ...opts, transport: { mode: "replay", ledger } },
      { ...req },
    )
    expect(rep.status).toBe("EXECUTED")
    if (rep.status === "EXECUTED") expect(rep.exitCode).toBe(0)
    expect(existsSync(marker)).toBe(false) // zero dispatch in replay mode

    // GAP: a request missing from the ledger surfaces as EXECUTION_FAILED
    // whose detail carries the REPLAY_GAP marker (PEP wraps thrown errors).
    let gap = false
    const gapResult = await authorizeProcess(
      { ...opts, transport: { mode: "replay", ledger } },
      {
        ...req,
        requestId: "req-unknown",
        nonce: "n-unknown",
      },
    )
    if (gapResult.status === "EXECUTION_FAILED" && gapResult.detail.startsWith("REPLAY_GAP")) gap = true
    expect(gap).toBe(true)
  })

  it("fs: replay substitutes the mutation result without rewriting bytes", async () => {
    const p = join(dir, "fs-replay.txt")
    const opts = { dbPath: dbPath("k3b-fs.db"), principalId: "test-agent", sessionId: "s-k3b" }
    const req = {
      toolName: "write",
      filePath: p,
      content: "recorded-content",
      nonce: "n-k3b-f",
      requestedAt: "2026-08-23T00:00:00.000Z",
      requestId: "req-k3b-f",
    }
    const ledger = new TransportLedger()
    const rec = await authorizeFileMutation({ ...opts, transport: { mode: "record", ledger } }, req, () => {
      mkdirSync(dir, { recursive: true })
      writeFileSync(p, "recorded-content", "utf8")
      return `Written ${p}`
    })
    if (rec.status !== "EXECUTED") console.log("REC_DEBUG:", JSON.stringify(rec))
    expect(rec.status).toBe("EXECUTED")

    // Rewind the file to prove replay does NOT rewrite it.
    rmSync(p, { force: true })

    const rep = await authorizeFileMutation({ ...opts, transport: { mode: "replay", ledger } }, req, () => {
      writeFileSync(p, "SHOULD-NOT-RUN", "utf8")
      return "should not happen"
    })
    expect(rep.status).toBe("EXECUTED")
    if (rep.status === "EXECUTED") expect(rep.output).toContain("Written")
    expect(existsSync(p)).toBe(false) // zero-touch replay
  })

  it("network: replay substitutes the observation without egress (server counter stays 0)", async () => {
    let hits = 0
    const server = Bun.serve({
      port: 0,
      fetch() {
        hits++
        return new Response("live-body")
      },
    })
    try {
      const url = `http://127.0.0.1:${server.port}/k3b`
      const opts = { dbPath: dbPath("k3b-n.db"), principalId: "test-agent", sessionId: "s-k3b" }
      const req = {
        toolName: "web_fetch",
        url,
        nonce: "n-k3b-n",
        requestedAt: "2026-08-23T00:00:00.000Z",
        requestId: "req-k3b-n",
      }
      const ledger = new TransportLedger()
      // Record against the live local server.
      const rec = await authorizeNetwork({ ...opts, transport: { mode: "record", ledger } }, req, async () => {
        const res = await fetch(url)
        return { httpStatus: res.status, summary: await res.text() }
      })
      expect(rec.status).toBe("EXECUTED")
      const afterRecord = hits
      expect(afterRecord).toBe(1)

      // Replay: zero additional requests, identical observation.
      const rep = await authorizeNetwork({ ...opts, transport: { mode: "replay", ledger } }, req, async () => {
        const res = await fetch(url)
        return { httpStatus: res.status, summary: await res.text() }
      })
      expect(hits).toBe(afterRecord) // no new egress
      if (rep.status === "EXECUTED") expect(rep.summary).toBe("live-body")
    } finally {
      server.stop(true)
    }
  })
})
