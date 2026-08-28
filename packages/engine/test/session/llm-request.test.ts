import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { LLMRequestPrep } from "@/session/llm/request"
import { provideInstance, testInstanceStoreLayer } from "../fixture/fixture"

const model = {
  id: "test/test-model",
  providerID: "test",
  api: {
    id: "test-model",
    url: "https://api.test.invalid",
    npm: "@ai-sdk/openai",
  },
  name: "Test model",
  capabilities: {
    temperature: true,
    reasoning: false,
    attachment: false,
    toolcall: true,
    input: { text: true, audio: false, image: false, video: false, pdf: false },
    output: { text: true, audio: false, image: false, video: false, pdf: false },
    interleaved: false,
  },
  cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
  limit: { context: 16_000, output: 2_000 },
  status: "active",
  options: {},
  headers: {},
} as any

const plugin = {
  trigger: (_name: string, _input: unknown, output: unknown) => Effect.succeed(output),
  list: () => Effect.succeed([]),
  init: () => Effect.void,
} as any

async function prepare(overrides: Record<string, unknown> = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "arcana-llm-request-"))
  try {
    return await Effect.runPromise(
      provideInstance(directory)(
        LLMRequestPrep.prepare({
          user: {
            id: "msg_test",
            sessionID: "ses_test",
            role: "user",
            time: { created: Date.now() },
            agent: "test",
            model: { providerID: "test", modelID: "test-model" },
          } as any,
          sessionID: "ses_test",
          model,
          agent: {
            name: "test",
            mode: "primary",
            prompt: "You are a test agent.",
            options: {},
            permission: [],
          } as any,
          permission: [],
          system: ["Engine-owned context."],
          messages: [
            { role: "user", content: "Hello" },
            { role: "assistant", content: "Hi" },
          ],
          tools: {},
          provider: { id: "test", options: {} } as any,
          auth: undefined,
          plugin,
          flags: { outputTokenMax: 2_000, client: "test" } as any,
          isWorkflow: false,
          ...overrides,
        }),
      ).pipe(Effect.provide(testInstanceStoreLayer)),
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

describe("LLMRequestPrep system channel", () => {
  test("keeps engine instructions out of model messages", async () => {
    const result = await prepare()
    expect(result.messages.every((message) => message.role !== "system")).toBe(true)
    expect(result.messages).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ])
    expect(result.systemOption).toContain("You are a test agent.")
    expect(result.systemOption).toContain("Engine-owned context.")
  })

  test("keeps native instruction paths out of the generic system option", async () => {
    const result = await prepare({
      model: { ...model, id: "openai/gpt-test", providerID: "openai" },
      provider: { id: "openai", options: {} } as any,
      auth: { type: "oauth" } as any,
      user: {
        id: "msg_test",
        sessionID: "ses_test",
        role: "user",
        time: { created: Date.now() },
        agent: "test",
        model: { providerID: "openai", modelID: "gpt-test" },
      } as any,
    })
    expect(result.systemOption).toBeUndefined()
    expect(result.params.options.instructions).toContain("You are a test agent.")
    expect(result.messages.every((message) => message.role !== "system")).toBe(true)
  })

  test("keeps workflow instructions on the workflow-native path", async () => {
    const result = await prepare({ isWorkflow: true })
    expect(result.systemOption).toBeUndefined()
    expect(result.messages.every((message) => message.role !== "system")).toBe(true)
  })
})

