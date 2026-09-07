import { describe, expect, test } from "bun:test"
import { resumableFetch } from "../../src/session/resumable-fetch"

/** Build a ReadableStream that emits chunks then either closes or errors.
 *  The error fires on a macrotask so the reader consumes the queued chunks
 *  first — mirroring a real network drop mid-stream. */
function streamWith(
  chunks: string[],
  opts: { failAfter?: boolean } = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      if (opts.failAfter) {
        setTimeout(() => controller.error(new Error("stream dropped")), 0)
      } else {
        controller.close()
      }
    },
  })
}

function sseResponse(body: ReadableStream<Uint8Array>, turnId?: string): Response {
  const headers = new Headers()
  if (turnId) headers.set("x-arcana-turn-id", turnId)
  return new Response(body, { status: 200, headers })
}

async function collect(response: Response): Promise<string> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let out = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    out += decoder.decode(value, { stream: true })
  }
  return out
}

describe("resumableFetch", () => {
  test("passes non-proxy responses through untouched", async () => {
    const body = streamWith(["data: A\n\n"])
    const response = sseResponse(body) // no turn-id header
    const mockFetch = async (): Promise<Response> => response
    const original = globalThis.fetch
    globalThis.fetch = mockFetch as typeof fetch
    try {
      const result = await resumableFetch("https://proxy.test/v1/chat/completions", {
        headers: { Authorization: "Bearer x" },
      })
      expect(result).toBe(response)
      expect(await collect(result)).toBe("data: A\n\n")
    } finally {
      globalThis.fetch = original
    }
  })

  test("resumes seamlessly when the stream drops mid-way", async () => {
    let calls = 0
    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls++
      const url = String(input)
      if (url.endsWith("/v1/chat/completions/resume")) {
        // Proxy replays the tail from the client's offset, then continues live.
        return sseResponse(streamWith(["data: B\n\n"]))
      }
      // Original request: emit one complete event, then drop the connection.
      return sseResponse(streamWith(["data: A\n\n"], { failAfter: true }), "turn-1")
    }
    const original = globalThis.fetch
    globalThis.fetch = mockFetch as typeof fetch
    try {
      const response = await resumableFetch("https://proxy.test/v1/chat/completions", {
        headers: { Authorization: "Bearer x" },
      })
      expect(await collect(response)).toBe("data: A\n\ndata: B\n\n")
      expect(calls).toBe(2)
    } finally {
      globalThis.fetch = original
    }
  })

  test("resume request carries turn_id and the character offset", async () => {
    let resumeBody: string | null = null
    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input)
      if (url.endsWith("/v1/chat/completions/resume")) {
        resumeBody = String(init?.body)
        return sseResponse(streamWith(["data: B\n\n"]))
      }
      return sseResponse(streamWith(["data: A\n\n"], { failAfter: true }), "turn-1")
    }
    const original = globalThis.fetch
    globalThis.fetch = mockFetch as typeof fetch
    try {
      const response = await resumableFetch("https://proxy.test/v1/chat/completions", {
        headers: { Authorization: "Bearer x" },
      })
      await collect(response)
      expect(resumeBody).toBe(JSON.stringify({ turn_id: "turn-1", offset: 9 }))
    } finally {
      globalThis.fetch = original
    }
  })

  test("falls back to the retry path when the resume 404s", async () => {
    const mockFetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input)
      if (url.endsWith("/v1/chat/completions/resume")) {
        return new Response(JSON.stringify({ error: "turn_not_found" }), { status: 404 })
      }
      return sseResponse(streamWith(["data: A\n\n"], { failAfter: true }), "turn-1")
    }
    const original = globalThis.fetch
    globalThis.fetch = mockFetch as typeof fetch
    try {
      const response = await resumableFetch("https://proxy.test/v1/chat/completions")
      await expect(collect(response)).rejects.toThrow("stream dropped")
    } finally {
      globalThis.fetch = original
    }
  })

  test("gives up after MAX_RESUMES consecutive drops", async () => {
    let resumeCalls = 0
    const mockFetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input)
      if (url.endsWith("/v1/chat/completions/resume")) {
        resumeCalls++
        return sseResponse(streamWith(["data: X\n\n"], { failAfter: true }))
      }
      return sseResponse(streamWith(["data: A\n\n"], { failAfter: true }), "turn-1")
    }
    const original = globalThis.fetch
    globalThis.fetch = mockFetch as typeof fetch
    try {
      const response = await resumableFetch("https://proxy.test/v1/chat/completions")
      await expect(collect(response)).rejects.toThrow("stream dropped")
      expect(resumeCalls).toBe(2) // MAX_RESUMES
    } finally {
      globalThis.fetch = original
    }
  })
})
