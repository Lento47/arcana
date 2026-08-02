import { afterEach, describe, expect } from "bun:test"
import { Effect, Queue, Schema, Stream } from "effect"
import { Flag } from "@arcana/core/flag/flag"
import { ed25519 } from "@noble/curves/ed25519.js"
import { encodeBase64url } from "@arcana/core/crypto/canonical-serializer"
import { REVOCATION_DOMAIN } from "@arcana/core/crypto/signed-envelopes"
import { signEnvelope } from "@arcana/core/crypto/node-enrollment"
import { SyncNodePaths } from "../../src/server/routes/instance/httpapi/groups/sync-node"
import { RevocationPaths } from "../../src/server/routes/instance/httpapi/groups/revocations"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { httpApiLayer, requestInDirectory } from "./httpapi-layer"

const originalWorkspaces = Flag.ARCANA_EXPERIMENTAL_WORKSPACES
const originalTrustDomain = process.env.ARCANA_CONTROL_TRUST_DOMAIN
const originalIssuerSeed = process.env.ARCANA_CONTROL_ISSUER_SEED

const issuerSeed = new Uint8Array(32).fill(0x71)
const issuerKey = ed25519.keygen(issuerSeed)

const StreamEvent = Schema.Struct({
  type: Schema.String,
  statement: Schema.optional(
    Schema.Record(Schema.String, Schema.Unknown),
  ),
  transport: Schema.optional(Schema.Record(Schema.String, Schema.Any)),
})

const readEvent = (reader: Queue.Dequeue<Uint8Array>) =>
  Effect.gen(function* () {
    const value = yield* Queue.take(reader).pipe(
      Effect.timeoutOrElse({
        duration: "5 seconds",
        orElse: () => Effect.fail(new Error("timed out waiting for event")),
      }),
    )
    const text = new TextDecoder().decode(value)
    const dataLine = text.split("\n").find((line) => line.startsWith("data:"))
    if (!dataLine) throw new Error(`SSE chunk missing data line: ${text}`)
    return Schema.decodeUnknownSync(StreamEvent)(JSON.parse(dataLine.slice(5).trim()))
  })

const openStream = (directory: string) =>
  Effect.gen(function* () {
    const response = yield* requestInDirectory(SyncNodePaths.revocationStream, directory)
    const reader = yield* Queue.unbounded<Uint8Array>()
    yield* response.stream.pipe(
      Stream.runForEach((value) => Queue.offer(reader, value)),
      Effect.forkScoped,
    )
    return { response, reader }
  })

afterEach(async () => {
  Flag.ARCANA_EXPERIMENTAL_WORKSPACES = originalWorkspaces
  if (originalTrustDomain === undefined) delete process.env.ARCANA_CONTROL_TRUST_DOMAIN
  else process.env.ARCANA_CONTROL_TRUST_DOMAIN = originalTrustDomain
  if (originalIssuerSeed === undefined) delete process.env.ARCANA_CONTROL_ISSUER_SEED
  else process.env.ARCANA_CONTROL_ISSUER_SEED = originalIssuerSeed
  await disposeAllInstances()
  await resetDatabase()
})

function configure() {
  process.env.ARCANA_CONTROL_TRUST_DOMAIN = "arcana.test"
  process.env.ARCANA_CONTROL_ISSUER_SEED = encodeBase64url(issuerSeed)
  process.env.ARCANA_CONTROL_ISSUER_ID = "issuer-arcana"
  process.env.ARCANA_CONTROL_ORGANIZATION_ID = "org-arcana"
}

function revocationStatement(sequence: number) {
  const payload = {
    schemaVersion: 1,
    issuerId: "issuer-arcana",
    issuerEpoch: 1,
    sequence,
    subjectType: "GRANT",
    subjectId: "grant-revoked",
    reason: "compromised",
    effectiveAt: new Date().toISOString(),
    issuedAt: new Date().toISOString(),
  }
  return signEnvelope(REVOCATION_DOMAIN, payload, issuerKey.secretKey)
}

const it = testEffect(httpApiLayer)

describe("D-5 revocation push channel", () => {
  it.instance(
    "streams published revocation statements to subscribers",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        configure()
        const { directory } = yield* TestInstance
        const { response, reader } = yield* openStream(directory)

        expect(response.status).toBe(200)
        expect(response.headers["content-type"]).toContain("text/event-stream")
        expect(yield* readEvent(reader)).toMatchObject({ type: "server.connected" })

        const headers = { "x-opencode-directory": directory, "content-type": "application/json" }
        const published = yield* requestInDirectory(RevocationPaths.publish, directory, {
          method: "POST",
          headers,
          body: JSON.stringify({ statement: revocationStatement(1) }),
        })
        expect(((yield* published.json) as { kind?: string }).kind).toBe("PUBLISHED")

        const event = yield* readEvent(reader)
        expect(event.type).toBe("revocation.statement")
        expect(event.statement?.sequence).toBe(1)
        expect(event.statement?.subjectId).toBe("grant-revoked")
        expect(event.transport?.sequence).toBe(1)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )
})
