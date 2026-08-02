import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import type { SessionID } from "../../src/session/schema"
import {
  CONTRACT_ACCEPT,
  CONTRACT_DECLINE,
  contractAdmissionQuestion,
  ensureContractAdmission,
  type ContractAdmissionDeps,
} from "@arcana/engine/session/contract-admission"

function makeDeps(overrides: Partial<ContractAdmissionDeps> = {}) {
  const calls = {
    hasActive: 0,
    declined: 0,
    proposes: 0,
    asks: 0,
    activations: 0,
    declines: 0,
  }
  const track = <A extends unknown[], B>(
    counter: () => void,
    fn: (...args: A) => Effect.Effect<B>,
  ) =>
    (...args: A): Effect.Effect<B> => {
      counter()
      return fn(...args)
    }
  const deps: ContractAdmissionDeps = {
    hasActiveContract: track(
      () => calls.hasActive++,
      overrides.hasActiveContract ?? (() => Effect.succeed(false)),
    ),
    wasDeclined: track(
      () => calls.declined++,
      overrides.wasDeclined ?? (() => Effect.succeed(false)),
    ),
    propose: track(
      () => calls.proposes++,
      overrides.propose ??
        (() =>
          Effect.succeed({
            id: "contract-admission-1",
            objective: "Fix authorization replay",
            revision: 1,
            criteria: ["Task completed as described"],
          })),
    ),
    ask: track(
      () => calls.asks++,
      overrides.ask ?? (() => Effect.succeed(true)),
    ),
    activate: track(
      () => calls.activations++,
      overrides.activate ?? (() => Effect.void),
    ),
    markDeclined: track(
      () => calls.declines++,
      overrides.markDeclined ?? (() => Effect.void),
    ),
  }
  return { deps, calls }
}

const input = {
  sessionID: "session-admission" as SessionID,
  userRequest: "fix authorization replay",
  sourceEventId: "user-1",
}

describe("contract admission", () => {
  test("proposes, asks, and activates on acceptance", async () => {
    const { deps, calls } = makeDeps()
    const activated = await Effect.runPromise(ensureContractAdmission(deps, input))
    expect(activated).toBe(true)
    expect(calls.hasActive).toBe(1)
    expect(calls.declined).toBe(1)
    expect(calls.proposes).toBe(1)
    expect(calls.asks).toBe(1)
    expect(calls.activations).toBe(1)
    expect(calls.declines).toBe(0)
  })

  test("records decline and never activates when the operator declines", async () => {
    const { deps, calls } = makeDeps({ ask: () => Effect.succeed(false) })
    const activated = await Effect.runPromise(ensureContractAdmission(deps, input))
    expect(activated).toBe(false)
    expect(calls.proposes).toBe(1)
    expect(calls.asks).toBe(1)
    expect(calls.declines).toBe(1)
    expect(calls.activations).toBe(0)
  })

  test("skips everything when an active contract already exists", async () => {
    const { deps, calls } = makeDeps({ hasActiveContract: () => Effect.succeed(true) })
    const activated = await Effect.runPromise(ensureContractAdmission(deps, input))
    expect(activated).toBe(false)
    expect(calls.proposes).toBe(0)
    expect(calls.asks).toBe(0)
    expect(calls.declines).toBe(0)
  })

  test("skips everything when the operator already declined this session", async () => {
    const { deps, calls } = makeDeps({ wasDeclined: () => Effect.succeed(true) })
    const activated = await Effect.runPromise(ensureContractAdmission(deps, input))
    expect(activated).toBe(false)
    expect(calls.proposes).toBe(0)
    expect(calls.asks).toBe(0)
    expect(calls.declines).toBe(0)
  })

  test("does nothing for an empty user request", async () => {
    const { deps, calls } = makeDeps()
    const activated = await Effect.runPromise(
      ensureContractAdmission(deps, { ...input, userRequest: "   " }),
    )
    expect(activated).toBe(false)
    expect(calls.proposes).toBe(0)
    expect(calls.asks).toBe(0)
  })

  test("admission question exposes Accept and Decline with exact labels", () => {
    const question = contractAdmissionQuestion({
      id: "c-1",
      objective: "Fix replay",
      revision: 1,
      criteria: ["Task completed as described"],
    })
    expect(question.header).toBe("completion contract")
    expect(question.options.map((option) => option.label)).toEqual([
      CONTRACT_ACCEPT,
      CONTRACT_DECLINE,
    ])
    expect(question.multiple).toBe(false)
    expect(question.custom).toBe(false)
  })
})
