import { afterEach, describe, expect, mock } from "bun:test"
import { Context, Effect, Layer } from "effect"
import { Flag } from "@arcana/core/flag/flag"
import { ExecutionPaths } from "../../src/server/routes/instance/httpapi/groups/executions"
import { Session } from "@/session/session"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { httpApiLayer, requestInDirectory } from "./httpapi-layer"

const originalWorkspaces = Flag.ARCANA_EXPERIMENTAL_WORKSPACES

const context = Context.empty() as Context.Context<unknown>
const it = testEffect(Layer.mergeAll(Session.defaultLayer, httpApiLayer))

afterEach(async () => {
  mock.restore()
  Flag.ARCANA_EXPERIMENTAL_WORKSPACES = originalWorkspaces
  await disposeAllInstances()
  await resetDatabase()
})

const KEY = {
  executionId: "exec-http-1",
  nodeId: "node-alpha",
  sessionId: "ses-1",
  requestHash: "hash-1",
  grantId: "grant-1",
  nonce: "nonce-1",
}

describe("executions HttpApi (D-6)", () => {
  it.instance(
    "claims exactly once, completes, deduplicates, and conflicts on identity change",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }

        const claim = yield* requestInDirectory(ExecutionPaths.claim, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({ key: KEY }),
        })
        expect(((yield* claim.json) as { kind?: string }).kind).toBe("CLAIMED")

        const dup = yield* requestInDirectory(ExecutionPaths.claim, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({ key: KEY }),
        })
        expect(((yield* dup.json) as { kind?: string }).kind).toBe("DUPLICATE")

        const complete = yield* requestInDirectory(
          ExecutionPaths.complete.replace(":executionId", KEY.executionId),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ outcome: JSON.stringify({ ok: true }) }),
          },
        )
        expect(complete.status).toBe(200)

        const afterComplete = yield* requestInDirectory(ExecutionPaths.claim, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({ key: KEY }),
        })
        const afterBody = (yield* afterComplete.json) as { kind: string; record?: { status: string } }
        expect(afterBody.kind).toBe("DUPLICATE")
        expect(afterBody.record?.status).toBe("COMPLETED")

        const conflict = yield* requestInDirectory(ExecutionPaths.claim, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({ key: { ...KEY, requestHash: "hash-2" } }),
        })
        expect(((yield* conflict.json) as { kind?: string }).kind).toBe("CONFLICT")
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "forbids replay of irreversible effects after network ambiguity",
    () =>
      Effect.gen(function* () {
        Flag.ARCANA_EXPERIMENTAL_WORKSPACES = true
        const tmp = yield* TestInstance
        const headers = { "x-opencode-directory": tmp.directory, "content-type": "application/json" }

        const claim = yield* requestInDirectory(ExecutionPaths.claim, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({ key: KEY }),
        })
        expect(((yield* claim.json) as { kind?: string }).kind).toBe("CLAIMED")

        const unknown = yield* requestInDirectory(
          ExecutionPaths.unknown.replace(":executionId", KEY.executionId),
          tmp.directory,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ reason: "NETWORK" }),
          },
        )
        expect(unknown.status).toBe(200)

        const replay = yield* requestInDirectory(ExecutionPaths.claim, tmp.directory, {
          method: "POST",
          headers,
          body: JSON.stringify({ key: KEY, irreversible: true }),
        })
        expect(((yield* replay.json) as { kind?: string }).kind).toBe("REPLAY_FORBIDDEN")
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )
})
