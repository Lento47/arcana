/**
 * Arcana reference app — a minimal governed-agent program.
 *
 * Walks the full loop of the governed autonomy runtime through the REAL
 * exported types (no invented APIs):
 *
 *   1. createArcana()                                  -> typed HTTP client (+ managed `arcana serve`)
 *   2. client.session.create / prompt                  -> run an agent
 *   3. client.permission.reply                         -> answer `ask` gates
 *   4. client.approval.* and client.runtime.approvals.* -> durable operator
 *      approval commands, typed against the real wire schemas
 *      (packages/engine/src/server/routes/instance/httpapi/groups/{approval,runtime}.ts)
 *   5. client.policy.publish                           -> stage/activate a signed policy bundle
 *   6. client.runtime.proofs.get + verifyRunProofExport -> proof verification
 *
 * Types used here are the actual exports of:
 *   - @arcana/sdk     -> createArcana, verifyRunProofExport
 *   - @arcana/engine  -> ApprovalCommandPayload, RuntimeApprovalCommandPayload,
 *                        ApprovalRecordWire (wire schemas)
 *   - @arcana/core    -> ApprovalRecord, AuthenticatedOperator (domain types)
 *
 * Compile in-repo with:  bunx tsc --noEmit        (tsconfig maps workspace packages)
 */

import { createArcana } from "@arcana/sdk"
import { proofFingerprint, verifyRunProofExport, type RunProofLike } from "@arcana/sdk/v2/proof"
import { Schema } from "effect"
import { ApprovalCommandPayload } from "@arcana/engine/server/routes/instance/httpapi/groups/approval"
import { RuntimeApprovalCommandPayload } from "@arcana/engine/server/routes/instance/httpapi/groups/runtime"
import type { ApprovalRecordWire } from "@arcana/engine/approval/events"
import type { ApprovalRecord, AuthenticatedOperator } from "@arcana/core/crypto/approval-lifecycle"

/**
 * The REAL payload types of the wire endpoints.
 * `Schema.Schema.Type<typeof ApprovalCommandPayload>` is the decoded Type of the
 * Effect Schema exported by groups/approval.ts.
 */
type SessionApprovalCommand = Schema.Schema.Type<typeof ApprovalCommandPayload>
type RuntimeApprovalCommand = Schema.Schema.Type<typeof RuntimeApprovalCommandPayload>

/** Core (domain) approval type from packages/core/src/crypto/approval-lifecycle.ts. */
function describeRecord(record: ApprovalRecord): string {
  return `${record.approvalId} [${record.state}] hash=${record.requestHash.slice(0, 12)}… v${record.version}`
}

/** Core operator identity type; the engine derives this from auth context, never from the client. */
function describeOperator(operator: AuthenticatedOperator): string {
  return `${operator.operatorId} roles=${operator.roles.join(",")}`
}

async function main() {
  // 1. Connect. createArcana spawns `arcana serve` and returns a typed client.
  const { client, server } = await createArcana({ hostname: "127.0.0.1", port: 4096, timeout: 5000 })
  try {
    // 2. Create a session and prompt it.
    const created = await client.session.create({ title: "reference-app", permission: [] })
    const sessionID = created.data?.id
    if (!sessionID) throw new Error("session.create returned no session id")

    const promptResult = await client.session.prompt({
      sessionID,
      parts: [{ type: "text", text: "List the files in this repository root." }],
    })
    if (promptResult.error) {
      console.error("prompt failed:", promptResult.error)
    }

    // 3. Answer any `ask` permission gates the agent ran into.
    const pending = await client.permission.list()
    for (const request of pending.data ?? []) {
      await client.permission.reply({ requestID: request.requestID, reply: "once" })
    }

    // 4. Durable approval commands.
    // Session-scoped surface: POST /api/session/:sessionID/approval/:approvalID/command
    const approvals = await client.approval.list({ sessionID })
    for (const [approvalID, record] of Object.entries(approvals.data ?? {})) {
      const wire = record satisfies ApprovalRecordWire
      // Typed against the real ApprovalCommandPayload schema (groups/approval.ts).
      const sessionCommand: SessionApprovalCommand = {
        command: "APPROVE_ONCE",
        expectedVersion: wire.version,
        expectedRequestHash: wire.requestHash,
        expectedContractRevision: wire.contractRevision,
      }
      await client.approval.command({ sessionID, approvalID, ...sessionCommand })
    }

    // Workspace-scoped surface: client.runtime.approvals
    const runtimeApprovals = await client.runtime.approvals.list({ directory: "." })
    for (const record of runtimeApprovals.data ?? []) {
      // Typed against the real RuntimeApprovalCommandPayload schema (groups/runtime.ts).
      const runtimeCommand: RuntimeApprovalCommand = {
        expectedVersion: record.version,
        expectedRequestHash: record.requestHash,
        expectedContractRevision: record.contractRevision,
      }
      await client.runtime.approvals.approve({ approvalID: record.approvalId, ...runtimeCommand })
    }

    // 5. Publish a signed policy bundle (client.policy.publish). The envelope must be
    //    issued by the node's Ed25519 key — the engine rejects unsigned envelopes.
    await client.policy.publish({
      envelope: {
        schemaVersion: 1,
        issuerId: "<node-id>",
        issuerEpoch: 1,
        sequence: 1,
        policyId: "policy:default",
        policyVersion: "1.0.0",
        policyDigest: "<sha256 of canonicalized policy statement>",
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        signatureAlgorithm: "Ed25519",
        signature: "<base64url signature over the canonicalized envelope>",
      },
    })

    // 6. Proofs: fetch the engine's RunProof snapshot, then verify a portable export.
    const snapshot = await client.runtime.proofs.get({ sessionID })
    console.log("proof snapshot:", JSON.stringify(snapshot.data, null, 2))

    const sampleProof: RunProofLike = {
      id: "proof:sample",
      schema_version: "0.2",
      timestamp: "2026-08-05T00:00:00.000Z",
      lifecycle: {
        status: "completed",
        started_at: "2026-08-05T00:00:00.000Z",
        ended_at: "2026-08-05T00:00:00.500Z",
      },
      contract: { version: 1 },
      events: [
        { id: "evt:1", timestamp: "2026-08-05T00:00:00.000Z", type: "session.started" },
        { id: "evt:2", timestamp: "2026-08-05T00:00:00.500Z", type: "proof.exported" },
      ],
    }
    const fingerprint = proofFingerprint(sampleProof)
    const verification = verifyRunProofExport({ ...sampleProof, fingerprint })
    if (verification.valid) {
      console.log("proof valid:", verification.checks.join(", "))
    } else {
      console.error("proof invalid:", verification.reason)
    }

    // Domain types (core) used for local bookkeeping — distinct from the wire schema,
    // which additionally carries REJECTED / RECOVERY_REQUIRED states.
    const localOperator: AuthenticatedOperator = {
      operatorId: "operator:local-cli",
      authenticatedAt: new Date().toISOString(),
      roles: ["operator"],
      workspaceScope: ["."],
    }
    const domainRecord: ApprovalRecord = {
      approvalId: "apr_example",
      version: 1,
      sessionId: sessionID,
      workspaceId: "default",
      requestHash: "0".repeat(64),
      contractRevision: 1,
      state: "PENDING",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }
    console.log(describeOperator(localOperator))
    console.log(describeRecord(domainRecord))
  } finally {
    server?.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
