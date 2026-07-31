import { describe, expect, test } from "bun:test"
import { detectLocalOllama } from "../../src/providers/ollama"

function mockFetch(status: number, body: unknown): typeof fetch {
  return ((async () => {
    if (status === 0) throw new Error("network down")
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response
  }) as unknown) as typeof fetch
}

describe("detectLocalOllama", () => {
  test("detects a running daemon with models", async () => {
    const result = await detectLocalOllama({
      port: "11434",
      fetch: mockFetch(200, { models: [{ name: "llama3.2" }, { name: "qwen2.5" }] }),
    })
    expect(result).toEqual({ port: "11434", models: ["llama3.2", "qwen2.5"] })
  })

  test("detects a running daemon with an empty catalog", async () => {
    const result = await detectLocalOllama({
      port: "11434",
      fetch: mockFetch(200, { models: [] }),
    })
    expect(result).toEqual({ port: "11434", models: [] })
  })

  test("returns null when the daemon answers non-OK", async () => {
    const result = await detectLocalOllama({
      port: "11434",
      fetch: mockFetch(500, { error: "boom" }),
    })
    expect(result).toBeNull()
  })

  test("returns null on network failure", async () => {
    const result = await detectLocalOllama({
      port: "11434",
      fetch: mockFetch(0, null),
    })
    expect(result).toBeNull()
  })

  test("returns null on malformed payload", async () => {
    const result = await detectLocalOllama({
      port: "11434",
      fetch: mockFetch(200, { unexpected: true }),
    })
    expect(result).toBeNull()
  })

  test("filters malformed model entries", async () => {
    const result = await detectLocalOllama({
      port: "11434",
      fetch: mockFetch(200, { models: [{ name: "ok" }, { name: 42 }, null, {}] }),
    })
    expect(result?.models).toEqual(["ok"])
  })

  test("defaults to port 11434", async () => {
    const result = await detectLocalOllama({
      fetch: mockFetch(200, { models: [{ name: "llama3.2" }] }),
    })
    expect(result?.port).toBe("11434")
  })
})
