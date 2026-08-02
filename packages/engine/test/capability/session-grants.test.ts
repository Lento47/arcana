import { expect, test } from "bun:test"
import { InMemoryGrantStore } from "@arcana/core/capability/grant-store"
import { ensureSessionAgentGrants } from "@arcana/core/capability/session-grants"
import type { CapabilityGrant } from "@arcana/core/capability/types"
import { Effect } from "effect"

test("session grant bootstrap emits post-commit creation evidence exactly once", async () => {
  const store = new InMemoryGrantStore()
  const observed: CapabilityGrant[] = []
  const input = { agentName: "build", sessionId: "session-capability-evidence" }
  const observer = (grant: CapabilityGrant) =>
    Effect.sync(() => {
      observed.push(grant)
    })

  const first = await Effect.runPromise(ensureSessionAgentGrants(store, input, observer))
  const second = await Effect.runPromise(ensureSessionAgentGrants(store, input, observer))

  expect(first).toHaveLength(1)
  expect(second).toHaveLength(1)
  expect(observed).toHaveLength(1)
  expect(observed[0]!.id).toBe(first[0]!.id)
  expect(observed[0]!.constraints.sessionId).toBe(input.sessionId)
})

test("session grant bootstrap does not emit creation evidence when persistence fails", async () => {
  const store = new InMemoryGrantStore()
  store.putGrant = () => Effect.fail({ _tag: "CapabilityGrantStoreError", cause: "simulated write failure" })
  let observed = false

  await Effect.runPromise(
    ensureSessionAgentGrants(
      store,
      { agentName: "build", sessionId: "session-store-failure" },
      () => Effect.sync(() => { observed = true }),
    ),
  )

  expect(observed).toBe(false)
})
