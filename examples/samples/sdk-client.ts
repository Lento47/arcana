/**
 * Sample: typed SDK client against a running `arcana serve` instance.
 *
 * Start the server first (any of):
 *   arcana serve --hostname 127.0.0.1 --port 4096
 *   arcana serve
 *
 * Run with:
 *   bun run sdk-client.ts
 *
 * API traced to real exports:
 *   createOpencodeClient           -> @arcana/sdk/v2/client
 *   client.session.create/list     -> @arcana/sdk/v2/gen/sdk.gen.ts (Session2)
 *   client.session.prompt          -> Session2.prompt (sdk.gen.ts:8447)
 *   client.permission.list/reply   -> Permission (sdk.gen.ts:7790)
 *   client.approval.list           -> Approval (sdk.gen.ts:1699)
 *   client.event.subscribe         -> Event (sdk.gen.ts:1667)
 */

import { createOpencodeClient } from "@arcana/sdk/v2/client"
import type { ApprovalRecordWire } from "@arcana/engine/approval/events"

const client = createOpencodeClient({ baseUrl: "http://127.0.0.1:4096", timeoutMs: 30_000 })

async function main() {
  // List existing sessions (sorted by most recently updated).
  const sessions = await client.session.list({ limit: 5 })
  console.log("existing sessions:", sessions.data?.length ?? 0)

  // Create a fresh session with an empty permission ruleset.
  const created = await client.session.create({ title: "sdk-client sample", permission: [] })
  const sessionID = created.data?.id
  if (!sessionID) throw new Error("session.create returned no id")

  // Prompt the session. `parts` carries text (and optionally file) parts.
  const prompt = await client.session.prompt({
    sessionID,
    parts: [{ type: "text", text: "Say hello in exactly one line." }],
  })
  if (prompt.error) {
    console.error("prompt error:", prompt.error)
  }

  // Answer any `ask` permission gates raised while the agent ran.
  const pending = await client.permission.list()
  for (const request of pending.data ?? []) {
    await client.permission.reply({ requestID: request.requestID, reply: "once" })
  }

  // Durable approvals for this session, typed with the wire schema (engine/approval/events.ts).
  const approvals = await client.approval.list({ sessionID })
  const records = Object.entries(approvals.data ?? {}) as Array<[string, ApprovalRecordWire]>
  console.log(`session ${sessionID}: ${records.length} durable approvals`)
  for (const [approvalID, record] of records) {
    console.log(`  ${approvalID} -> ${record.state} (${record.requestHash.slice(0, 12)}…)`)
  }

  // Stream live events over SSE until Ctrl+C.
  const events = await client.event.subscribe()
  for await (const event of events.stream) {
    console.log("event:", JSON.stringify(event))
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
