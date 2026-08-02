import type { Argv } from "yargs"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { Effect } from "effect"
import { ed25519 } from "@noble/curves/ed25519.js"
import { decodeCanonicalBase64url, encodeBase64url } from "@arcana/core/crypto/canonical-serializer"
import { createProofUploadTransport } from "@/node/proof-upload-client"
import { SqliteProofOutbox } from "@arcana/core/crypto/proof-outbox-sqlite"
import {
  createProofOutboxRecord,
  processDueProofUploads,
} from "@arcana/core/crypto/proof-uploader"
import { createSyncClient } from "@/node/sync-client"
import {
  applyPolicySyncResponse,
  applyRevocationSyncResponse,
  SqliteSyncStateStore,
} from "@/node/sync-state"
import { buildOutboxRecords, listLocalProofs } from "@/node/local-proof-source"
import { loadNodeIdentity, saveNodeIdentity, type NodeIdentityFile } from "@/node/node-identity-file"
import { cmd } from "./cmd"
import { CliError, effectCmd, fail } from "../effect-cmd"

export const NodeCommand = cmd({
  command: "node",
  describe: "operate a local Arcana Node (enroll, proof upload, sync, status)",
  builder: (yargs: Argv) =>
    yargs
      .command(NodeEnrollCommand)
      .command(NodeProofUploadCommand)
      .command(NodeSyncCommand)
      .command(NodeStatusCommand)
      .demandCommand(),
  async handler() {},
})

function directoryOption(yargs: Argv): Argv {
  return yargs.option("directory", {
    describe: "workspace directory holding node state",
    type: "string",
  })
}

function resolveDirectory(args: { directory?: string }): string {
  return args.directory ? join(process.cwd(), args.directory) : process.cwd()
}

// ─── enroll ─────────────────────────────────────────────────────────

export const NodeEnrollCommand = effectCmd({
  command: "enroll",
  describe: "enroll this node with a join token against a control plane",
  instance: false,
  builder: (yargs) =>
    directoryOption(yargs)
      .option("token", {
        describe: "join token JSON (as issued by the control plane)",
        type: "string",
        demandOption: true,
      })
      .option("key", {
        describe: "base64url 32-byte Ed25519 secret key seed",
        type: "string",
        demandOption: true,
      })
      .option("endpoint", {
        describe: "control-plane base URL",
        type: "string",
        demandOption: true,
      }),
  handler: Effect.fn("Cli.node.enroll")(function* (args) {
    const directory = resolveDirectory(args)
    const existing = loadNodeIdentity(directory)
    if (existing) {
      return yield* fail(`node already enrolled as ${existing.nodeId}; rotate via the control plane`)
    }

    const seed = decodeCanonicalBase64url(args.key)
    if (!seed || seed.length !== 32) {
      return yield* fail("--key must be a base64url 32-byte Ed25519 seed")
    }
    const keys = ed25519.keygen(seed)
    const token = JSON.parse(args.token) as Record<string, unknown>

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(`${args.endpoint.replace(/\/+$/, "")}/api/nodes/enroll`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            joinToken: token,
            publicKey: encodeBase64url(keys.publicKey),
          }),
        }),
      catch: (error) => new CliError({ message: `enrollment transport error: ${String(error)}` }),
    })
    if (response.status !== 200) {
      const text = yield* Effect.tryPromise({
        try: () => response.text().catch(() => ""),
        catch: (error) => new CliError({ message: `enrollment response error: ${String(error)}` }),
      })
      return yield* fail(`enrollment failed: HTTP ${response.status} ${text}`)
    }
    const body = (yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (error) => new CliError({ message: `enrollment response parse error: ${String(error)}` }),
    })) as {
      kind: string
      detail?: string
      record?: {
        nodeId: string
        trustDomain: string
        publicKey: string
        nodeKeyEpoch: number
        certificate: Record<string, unknown>
        enrolledAt: string
      }
    }
    if (body.kind !== "ENROLLED" || !body.record) {
      return yield* fail(`enrollment rejected: ${body.detail ?? body.kind}`)
    }

    const identity: NodeIdentityFile = {
      nodeId: body.record.nodeId,
      trustDomain: body.record.trustDomain,
      secretKeyB64: encodeBase64url(keys.secretKey),
      publicKeyB64: body.record.publicKey,
      nodeKeyEpoch: body.record.nodeKeyEpoch,
      certificate: body.record.certificate,
      enrolledAt: body.record.enrolledAt,
    }
    saveNodeIdentity(directory, identity)
    console.log(`node ${identity.nodeId} enrolled (epoch ${identity.nodeKeyEpoch})`)
  }),
})

// ─── proof upload ───────────────────────────────────────────────────

export const NodeProofUploadCommand = effectCmd({
  command: "proof upload",
  describe: "build due proof batches and upload them to the control plane",
  instance: false,
  builder: (yargs) =>
    directoryOption(yargs)
      .option("endpoint", {
        describe: "control-plane base URL",
        type: "string",
        demandOption: true,
      })
      .option("first-sequence", {
        describe: "first local proof sequence for the batch",
        type: "number",
        default: 1,
      }),
  handler: Effect.fn("Cli.node.proofUpload")(function* (args) {
    const directory = resolveDirectory(args)
    const identity = loadNodeIdentity(directory)
    if (!identity) {
      return yield* fail("node is not enrolled; run `arcana node enroll` first")
    }
    const secretKey = decodeCanonicalBase64url(identity.secretKeyB64)
    if (!secretKey) return yield* fail("invalid stored node secret key")

    const db = new Database(join(directory, ".arcana", "node.db"))
    const outbox = new SqliteProofOutbox(db)

    const localProofs = listLocalProofs(directory)
    if (localProofs.length === 0) {
      return yield* fail(`no local proofs found in ${join(directory, ".arcana", "proofs")}`)
    }
    const { records, sequences } = buildOutboxRecords(
      {
        directory,
        nodeId: identity.nodeId,
        trustDomain: identity.trustDomain,
        nodeKeyEpoch: identity.nodeKeyEpoch,
        policySequence: 1,
        policyDigest: "policy-local",
        revocationSequence: 0,
        revocationDigest: "revocation-local",
        emergencyEpoch: 0,
        firstSequence: args.firstSequence,
      },
      secretKey,
    )
    for (const record of records) {
      outbox.upsert(record)
    }
    if (records.length === 0) {
      return yield* fail("no proof batches could be built from local proofs")
    }
    console.log(`queued ${localProofs.length} local proof(s) across ${records.length} batch(es)`)
    for (const entry of sequences) {
      console.log(`  ${entry.localSequence} → ${entry.id}`)
    }

    const upload = createProofUploadTransport({ endpoint: args.endpoint })
    const summaries = yield* Effect.tryPromise({
      try: () => processDueProofUploads(outbox, identity.nodeId, upload),
      catch: (error) => new CliError({ message: `proof upload error: ${String(error)}` }),
    })
    db.close()

    for (const summary of summaries) {
      console.log(`${summary.batchRoot.slice(0, 12)}… → ${summary.outcome} (attempts ${summary.attempts})`)
    }
    if (summaries.some((s) => s.outcome === "POISONED")) {
      return yield* fail("one or more proof batches are poisoned")
    }
    console.log(`uploaded ${summaries.length} proof batch(es)`)
  }),
})

// ─── sync ───────────────────────────────────────────────────────────

export const NodeSyncCommand = effectCmd({
  command: "sync <kind>",
  describe: "run an authenticated policy/revocation sync against the control plane",
  instance: false,
  builder: (yargs) =>
    directoryOption(yargs)
      .positional("kind", {
        describe: "policy | revocation",
        type: "string",
        choices: ["policy", "revocation"],
        demandOption: true,
      })
      .option("endpoint", {
        describe: "control-plane base URL",
        type: "string",
        demandOption: true,
      })
      .option("server-key", {
        describe: "base64url control-plane issuer public key",
        type: "string",
        demandOption: true,
      }),
  handler: Effect.fn("Cli.node.sync")(function* (args) {
    const directory = resolveDirectory(args)
    const identity = loadNodeIdentity(directory)
    if (!identity) {
      return yield* fail("node is not enrolled; run `arcana node enroll` first")
    }
    const serverPublicKey = decodeCanonicalBase64url(args.serverKey)
    if (!serverPublicKey || serverPublicKey.length !== 32) {
      return yield* fail("--server-key must be a base64url 32-byte Ed25519 public key")
    }
    const secretKey = decodeCanonicalBase64url(identity.secretKeyB64)
    if (!secretKey) return yield* fail("invalid stored node secret key")

    const db = new Database(join(directory, ".arcana", "node.db"))
    const syncState = new SqliteSyncStateStore(db)
    const persistedPolicy = syncState.get("policy")
    const persistedRevocation = syncState.get("revocation")

    const client = createSyncClient({
      endpoint: args.endpoint,
      serverPublicKey,
    })
    const input = {
      nodeId: identity.nodeId,
      trustDomain: identity.trustDomain,
      nodeKeyEpoch: identity.nodeKeyEpoch,
      nodeCertificateFingerprint: String(identity.certificate.nodeId ?? identity.nodeId),
      secretKey,
      acceptedPolicySequence: persistedPolicy?.sequence ?? 0,
      acceptedPolicyDigest: persistedPolicy?.digest,
      acceptedRevocationSequence: persistedRevocation?.sequence ?? 0,
      acceptedRevocationDigest: persistedRevocation?.digest,
      acceptedEmergencyEpoch: 0,
    }
    const result = yield* Effect.tryPromise({
      try: () => (args.kind === "policy" ? client.syncPolicy(input) : client.syncRevocation(input)),
      catch: (error) => new CliError({ message: `sync error: ${String(error)}` }),
    })
    if (result.kind === "ERROR") {
      db.close()
      return yield* fail(`sync failed: ${result.message}`)
    }
    const applied =
      args.kind === "policy"
        ? applyPolicySyncResponse(result.context, syncState)
        : applyRevocationSyncResponse(result.context, syncState)
    db.close()
    console.log(
      `sync ${args.kind}: ${result.context.responseKind} → ${applied.applied} (sequence ${applied.sequence}, digest ${applied.digest.slice(0, 12)})`,
    )
  }),
})

// ─── status ─────────────────────────────────────────────────────────

export const NodeStatusCommand = effectCmd({
  command: "status",
  describe: "show node enrollment and proof outbox status",
  instance: false,
  builder: (yargs) => directoryOption(yargs),
  handler: Effect.fn("Cli.node.status")(function* (args) {
    const directory = resolveDirectory(args)
    const identity = loadNodeIdentity(directory)
    if (!identity) {
      console.log("node: not enrolled")
      return
    }
    const db = new Database(join(directory, ".arcana", "node.db"))
    const outbox = new SqliteProofOutbox(db)
    const syncState = new SqliteSyncStateStore(db)
    const stats = outbox.stats(identity.nodeId)
    const policy = syncState.get("policy")
    const revocation = syncState.get("revocation")
    db.close()
    console.log(`node:        ${identity.nodeId}`)
    console.log(`trustDomain: ${identity.trustDomain}`)
    console.log(`keyEpoch:    ${identity.nodeKeyEpoch}`)
    console.log(`enrolledAt:  ${identity.enrolledAt}`)
    console.log(`policy:      ${policy ? `seq ${policy.sequence} · ${policy.digest.slice(0, 12)}` : "none"}`)
    console.log(`revocation:  ${revocation ? `seq ${revocation.sequence} · ${revocation.digest.slice(0, 12)}` : "none"}`)
    console.log(`outbox:      ${stats.pending} pending · ${stats.registered} registered · ${stats.poisoned} poisoned`)
  }),
})
