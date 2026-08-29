import { describe, expect, test } from "bun:test"
import { createSseClient } from "../gen/core/serverSentEvents.gen.js"

/**
 * SDK SSE parser load test. The engine pipeline is verified clean by
 * httpapi-event-load.test.ts (engine side); this test isolates the client
 * parser against the byte stream shape the engine produces (one SSE frame per
 * event, 50KB tool-output payloads, arbitrary chunk boundaries).
 */

const frame = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`
const bigPayload = (size: number) => "x".repeat(size)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Build a Response whose body emits `events` in chunks that split frames mid-way. */
function streamResponse(events: unknown[], chunkSize: number, delayMs = 0): Response {
  const bytes = new TextEncoder().encode(events.map(frame).join(""))
  const reader = (async function* () {
    for (let i = 0; i < bytes.length; i += chunkSize) {
      if (delayMs > 0) await sleep(delayMs)
      yield bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
    }
  })()
  return new Response(
    new ReadableStream({
      async pull(controller) {
        const { value, done } = await reader.next()
        if (done) controller.close()
        else controller.enqueue(value)
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  )
}

function rawStreamResponse(body: string, chunkSize: number): Response {
  const bytes = new TextEncoder().encode(body)
  const reader = (async function* () {
    for (let i = 0; i < bytes.length; i += chunkSize) yield bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
  })()
  return new Response(
    new ReadableStream({
      async pull(controller) {
        const { value, done } = await reader.next()
        if (done) controller.close()
        else controller.enqueue(value)
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  )
}

const fakeFetch = (response: Response) => (async () => response) as unknown as typeof fetch

describe("SDK SSE parser — large payloads", () => {
  test("yields all events when frames are split across tiny chunks", async () => {
    const events = Array.from({ length: 25 }, (_, n) => ({
      id: `evt-${n}`,
      type: "message",
      properties: { n, payload: bigPayload(n < 15 ? 50_000 : 8_000) },
    }))
    const client = createSseClient({
      url: "http://test/event",
      fetch: fakeFetch(streamResponse(events, 1_024)),
    })

    const received: any[] = []
    const deadline = Date.now() + 15_000
    for await (const event of client.stream) {
      received.push(event)
      if (received.length === events.length) break
      if (Date.now() > deadline) break
    }
    expect(received).toHaveLength(25)
    for (let i = 0; i < 25; i++) {
      expect(received[i].properties.n).toBe(i)
      if (i < 15) expect((received[i].properties.payload as string).length).toBe(50_000)
    }
  })

  test("one 100KB event split across 512-byte chunks yields intact", async () => {
    const client = createSseClient({
      url: "http://test/event",
      fetch: fakeFetch(
        streamResponse([{ id: "big", type: "message", properties: { payload: bigPayload(100_000) } }], 512),
      ),
    })

    const received: any[] = []
    for await (const event of client.stream) {
      received.push(event)
      break
    }
    expect(received).toHaveLength(1)
    expect((received[0].properties.payload as string).length).toBe(100_000)
  })

  test("a paused consumer resumes without losing buffered events", async () => {
    const events = Array.from({ length: 10 }, (_, n) => ({
      id: `evt-${n}`,
      type: "message",
      properties: { n, payload: bigPayload(50_000) },
    }))
    const client = createSseClient({
      url: "http://test/event",
      fetch: fakeFetch(streamResponse(events, 64_000, 10)),
    })

    const received: any[] = []
    const iterator = client.stream[Symbol.asyncIterator]()
    const first = await iterator.next()
    received.push(first.value)
    await sleep(200) // consumer pause — the body keeps producing
    for (let i = 1; i < 10; i++) {
      const { value } = await iterator.next()
      received.push(value)
    }
    expect(received).toHaveLength(10)
    for (let i = 0; i < 10; i++) {
      expect(received[i].properties.n).toBe(i)
    }
  })

  test("handles CRLF split across chunks and preserves SSE metadata", async () => {
    const seen: Array<{ id?: string; retry?: number; event?: string }> = []
    const client = createSseClient({
      url: "http://test/event",
      fetch: fakeFetch(rawStreamResponse('id: evt-1\r\nevent: delta\r\nretry: 250\r\ndata: {"ok":true}\r\n\r\n', 1)),
      onSseEvent: (event) => seen.push({ id: event.id, retry: event.retry, event: event.event }),
      sseMaxRetryAttempts: 0,
    })

    const received: any[] = []
    for await (const event of client.stream) received.push(event)
    expect(received).toEqual([{ ok: true }])
    expect(seen).toEqual([{ id: "evt-1", retry: 250, event: "delta" }])
  })

  test("scales for a large frame delivered one byte at a time", async () => {
    const payload = "x".repeat(100_000)
    const started = performance.now()
    const client = createSseClient({
      url: "http://test/event",
      fetch: fakeFetch(rawStreamResponse(`data: ${JSON.stringify({ payload })}\n\n`, 1)),
      sseMaxRetryAttempts: 0,
    })

    const received: any[] = []
    for await (const event of client.stream) received.push(event)
    expect(received).toHaveLength(1)
    expect(received[0].payload).toHaveLength(payload.length)
    // This is a guard against the old quadratic buffer algorithm, not a tight
    // latency SLA; leave headroom for slower CI hosts.
    expect(performance.now() - started).toBeLessThan(5_000)
  })

  test("forwards the last event id when a stream reconnects", async () => {
    const requests: Request[] = []
    let attempt = 0
    const fetch = (async (input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input)
      requests.push(request)
      attempt += 1

      if (attempt === 1) {
        let sent = false
        const body = new ReadableStream<Uint8Array>({
          pull(controller) {
            if (sent) {
              controller.error(new Error("synthetic disconnect"))
              return
            }
            sent = true
            controller.enqueue(new TextEncoder().encode('id: evt-1\ndata: {"part":1}\n\n'))
          },
        })
        return new Response(body, { headers: { "content-type": "text/event-stream" } })
      }

      return new Response(new TextEncoder().encode('id: evt-2\ndata: {"part":2}\n\n'), {
        headers: { "content-type": "text/event-stream" },
      })
    }) as typeof globalThis.fetch

    const client = createSseClient({
      url: "http://test/event",
      fetch,
      sseDefaultRetryDelay: 0,
      sseMaxRetryDelay: 0,
      sseMaxRetryAttempts: 2,
      sseSleepFn: async () => {},
    })
    const received: any[] = []
    for await (const event of client.stream) received.push(event)

    expect(received).toEqual([{ part: 1 }, { part: 2 }])
    expect(requests).toHaveLength(2)
    expect(requests[1]?.headers.get("Last-Event-ID")).toBe("evt-1")
  })
})
