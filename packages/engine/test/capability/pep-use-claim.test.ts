import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { InMemoryGrantStore, SessionPolicyProvider } from "@arcana/core/capability/grant-store"
import {
  authorizeAndExecuteEffect,
  type AuthorizationEventEmitter,
} from "@arcana/core/capability/pep"
import { buildAuthorizationRequest } from "@arcana/core/capability/pep-integration"
import type { CapabilityGrant } from "@arcana/core/capability/types"

function makeGrant(overrides: Partial<CapabilityGrant> = {}): CapabilityGrant {
  return {
    id: "cap-use-claim",
    schemaVersion: "1",
    principal: { kind: "agent", id: "agent:main" },
    issuer: { kind: "policy", id: "test" },
    actions: ["filesystem.read"],
    resources: [{ kind: "file", pattern: "**" }],
    constraints: { sessionId: "sess-use-claim" },
    delegation: { allowed: false, maximumDepth: 0, currentDepth: 0 },
    status: "ACTIVE",
    createdEventId: "evt-use-claim",
    ...overrides,
  }
}

const request = buildAuthorizationRequest({
  toolName: "read",
  principalId: "agent:main",
  sessionId: "sess-use-claim",
  args: { path: "packages/core/src/index.ts" },
})

function makeProvider(store: InMemoryGrantStore) {
  return new SessionPolicyProvider(store, {
    principalId: "agent:main",
    sessionId: "sess-use-claim",
    workspaceTrust: "TRUSTED",
  })
}

function makeEmitter(events: Array<{ type: string }>) {
  const emitter: AuthorizationEventEmitter = {
    emit: (event) => {
      events.push({ type: event.type })
    },
  }
  return emitter
}

describe("PEP capability use claim", () => {
  test("use-limited grant executes once, then the next request is denied exhausted with zero executor calls", async () => {
    const store = new InMemoryGrantStore()
    await Effect.runPromise(
      store.putGrant(
        makeGrant({
          id: "cap-limited",
          constraints: { sessionId: "sess-use-claim", maxUses: 1 },
        }),
      ),
    )
    const provider = makeProvider(store)
    const events: Array<{ type: string }> = []
    const emitter = makeEmitter(events)
    let executorCalls = 0
    const execute = () => {
      executorCalls++
      return "ok"
    }

    const first = await Effect.runPromise(
      authorizeAndExecuteEffect({ request, executeExact: execute }, provider, emitter),
    )
    expect(first.status).toBe("EXECUTED")
    expect(executorCalls).toBe(1)
    expect(events.map((event) => event.type)).toContain("capability.exhausted")

    const second = await Effect.runPromise(
      authorizeAndExecuteEffect({ request, executeExact: execute }, provider, emitter),
    )
    if (second.status !== "DENIED") throw new Error("expected denied")
    expect(second.status).toBe("DENIED")
    expect(second.decision.decision).toBe("DENY")
    expect(second.decision.reasons.map((reason) => reason.code)).toContain(
      "DENY_CAPABILITY_EXHAUSTED",
    )
    expect(executorCalls).toBe(1)
    expect(events.map((event) => event.type)).toContain("authorization.denied")
  })

  test("unlimited grant executes repeatedly without denial", async () => {
    const store = new InMemoryGrantStore()
    await Effect.runPromise(store.putGrant(makeGrant({ id: "cap-unlimited" })))
    const provider = makeProvider(store)

    for (let i = 0; i < 3; i++) {
      const result = await Effect.runPromise(
        authorizeAndExecuteEffect({ request, executeExact: () => "ok" }, provider),
      )
      expect(result.status).toBe("EXECUTED")
    }
  })

  test("maxUses=3 grant executes exactly three times and denies the fourth", async () => {
    const store = new InMemoryGrantStore()
    await Effect.runPromise(
      store.putGrant(
        makeGrant({
          id: "cap-three",
          constraints: { sessionId: "sess-use-claim", maxUses: 3 },
        }),
      ),
    )
    const provider = makeProvider(store)
    let executorCalls = 0
    const execute = () => {
      executorCalls++
      return "ok"
    }

    for (let i = 0; i < 3; i++) {
      const result = await Effect.runPromise(
        authorizeAndExecuteEffect({ request, executeExact: execute }, provider),
      )
      expect(result.status).toBe("EXECUTED")
    }

    const fourth = await Effect.runPromise(
      authorizeAndExecuteEffect({ request, executeExact: execute }, provider),
    )
    if (fourth.status !== "DENIED") throw new Error("expected denied")
    expect(fourth.status).toBe("DENIED")
    expect(fourth.decision.reasons.map((reason) => reason.code)).toContain(
      "DENY_CAPABILITY_EXHAUSTED",
    )
    expect(executorCalls).toBe(3)
  })
})
