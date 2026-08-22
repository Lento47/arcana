import { expect, mock, test } from "bun:test"
import { normalize } from "../../src/voice/normalizer"

test("replaces {text} in the prompt template", async () => {
  const fetchMock = mock((input: string | Request, init?: RequestInit) => {
    const body = JSON.parse((init?.body as string) ?? "{}")
    expect(body.prompt).toBe("Clean this: hello world")
    return Promise.resolve(
      new Response(JSON.stringify({ response: "Hello world." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
  })
  globalThis.fetch = fetchMock as unknown as typeof fetch

  const result = await normalize("hello world", {
    provider: "ollama",
    host: "http://localhost:11434",
    model: "superwhisper/s1-mini",
    prompt: "Clean this: {text}",
  })

  expect(result).toBe("Hello world.")
  expect(fetchMock).toHaveBeenCalled()
})

test("throws when the model is missing", async () => {
  await expect(
    normalize("hello", {
      provider: "ollama",
      host: "http://localhost:11434",
      model: "",
      prompt: "{text}",
    }),
  ).rejects.toThrow()
})

test("throws on empty response", async () => {
  globalThis.fetch = mock(() =>
    Promise.resolve(
      new Response(JSON.stringify({ response: "" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  ) as unknown as typeof fetch

  await expect(
    normalize("hello", {
      provider: "ollama",
      host: "http://localhost:11434",
      model: "superwhisper/s1-mini",
      prompt: "{text}",
    }),
  ).rejects.toThrow("empty text")
})
