import { describe, expect, test } from "bun:test"
import { PredictorController } from "../src/component/prompt/predictor/controller"
import type { PredictorContextMessage, PredictorSettings } from "../src/component/prompt/predictor/predict"

const SETTINGS: PredictorSettings = {
  enabled: true,
  // `custom` resolves without touching Ollama discovery.
  source: "custom",
  base_url: "http://127.0.0.1:9/v1",
  model: "predictor-test",
  debounce_ms: 1,
  max_tokens: 24,
}

interface RequestCall {
  prefix: string
  context: readonly PredictorContextMessage[]
}

function harness(response: string, calls: RequestCall[]) {
  const controller = new PredictorController(
    () => SETTINGS,
    async (_endpoint, prefix, _maxTokens, _signal, context) => {
      calls.push({ prefix, context: context ?? [] })
      return response
    },
  )
  return controller
}

const settle = () => Bun.sleep(25)

describe("PredictorController", () => {
  test("stores a prediction for the exact prefix and serves repeats from cache", async () => {
    const calls: RequestCall[] = []
    const controller = harness("restart the daemon now.", calls)
    const prefix = "if the engine hangs you should"

    controller.schedule({ text: prefix, cursorOffset: prefix.length, autocompleteVisible: false })
    await settle()
    expect(controller.peek(prefix)).toBe("restart the daemon now.")
    expect(calls).toHaveLength(1)

    // Typing one more character and deleting it again must not re-roll the ghost.
    const extended = `${prefix} n`
    controller.schedule({ text: extended, cursorOffset: extended.length, autocompleteVisible: false })
    await settle()
    const requestsAfterExtension = calls.length
    controller.schedule({ text: prefix, cursorOffset: prefix.length, autocompleteVisible: false })
    await settle()

    expect(controller.peek(prefix)).toBe("restart the daemon now.")
    expect(calls.length).toBe(requestsAfterExtension)
  })

  test("context is resolved lazily and only for a request that is actually sent", async () => {
    const calls: RequestCall[] = []
    const controller = harness("run the tests first.", calls)
    let resolved = 0
    const context = () => {
      resolved++
      return [{ role: "user", content: "we are fixing the predictor" }] as const
    }

    // Below the trigger length: nothing is sent, context is never built.
    controller.schedule({ text: "hello", cursorOffset: 5, autocompleteVisible: false, context })
    await settle()
    expect(calls).toHaveLength(0)
    expect(resolved).toBe(0)

    const prefix = "the ghost text keeps guessing wrong so"
    controller.schedule({ text: prefix, cursorOffset: prefix.length, autocompleteVisible: false, context })
    await settle()
    expect(resolved).toBe(1)
    expect(calls[0]!.prefix).toBe(prefix)
    expect(calls[0]!.context).toEqual([{ role: "user", content: "we are fixing the predictor" }])
  })

  test("a prediction is only visible for its own prefix", async () => {
    const calls: RequestCall[] = []
    const controller = harness("restart the daemon now.", calls)
    const prefix = "if the engine hangs you should"
    controller.schedule({ text: prefix, cursorOffset: prefix.length, autocompleteVisible: false })
    await settle()

    expect(controller.peek(`${prefix} n`)).toBeNull()
    expect(controller.peek(prefix)).toBe("restart the daemon now.")
  })

  test("busy sessions and open autocomplete never predict", async () => {
    const calls: RequestCall[] = []
    const controller = harness("restart the daemon now.", calls)
    const prefix = "if the engine hangs you should"

    controller.schedule({ text: prefix, cursorOffset: prefix.length, autocompleteVisible: true })
    controller.schedule({ text: prefix, cursorOffset: prefix.length, autocompleteVisible: false, busy: true })
    await settle()

    expect(calls).toHaveLength(0)
    expect(controller.peek(prefix)).toBeNull()
  })

  test("junk completions are dropped instead of shown as ghosts", async () => {
    const calls: RequestCall[] = []
    const controller = harness("Sure! I can help with that", calls)
    const prefix = "if the engine hangs you should"
    controller.schedule({ text: prefix, cursorOffset: prefix.length, autocompleteVisible: false })
    await settle()

    expect(calls).toHaveLength(1)
    expect(controller.peek(prefix)).toBeNull()
  })

  test("a failing backend disables the predictor once with the reason", async () => {
    const reasons: string[] = []
    const controller = new PredictorController(() => SETTINGS, async () => {
      throw new Error("predictor request failed (500): boom")
    })
    controller.onDisabled = (reason) => reasons.push(reason)

    const prefix = "if the engine hangs you should"
    controller.schedule({ text: prefix, cursorOffset: prefix.length, autocompleteVisible: false })
    await settle()
    controller.schedule({ text: prefix, cursorOffset: prefix.length, autocompleteVisible: false })
    await settle()

    expect(reasons).toEqual(["predictor request failed (500): boom"])
  })
})
