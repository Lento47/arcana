import type { ServerSentEventsOptions, ServerSentEventsResult, StreamEvent } from "./gen/core/serverSentEvents.gen.js"

/**
 * Incremental SSE client used by generated endpoints.
 *
 * A stream can split a UTF-8-decoded event at any character boundary. Keep
 * line fragments as slices and emit complete frames only at a blank line.
 * This avoids repeatedly replacing/splitting the entire partial buffer, which
 * made large tool outputs quadratic when the transport delivered tiny chunks.
 */
export function createIncrementalSseClient<TData = unknown>({
  onRequest,
  onSseError,
  onSseEvent,
  responseTransformer,
  responseValidator,
  sseDefaultRetryDelay,
  sseMaxRetryAttempts,
  sseMaxRetryDelay,
  sseSleepFn,
  url,
  ...options
}: ServerSentEventsOptions<TData>): ServerSentEventsResult<TData> {
  let lastEventId: string | undefined

  const sleep = sseSleepFn ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))

  const createStream = async function* () {
    let retryDelay: number = sseDefaultRetryDelay ?? 3000
    let attempt = 0
    const signal = options.signal ?? new AbortController().signal

    while (true) {
      if (signal.aborted) break

      attempt++

      const headers =
        options.headers instanceof Headers
          ? new Headers(options.headers)
          : new Headers(options.headers as Record<string, string> | undefined)

      if (lastEventId !== undefined) headers.set("Last-Event-ID", lastEventId)

      try {
        const requestInit: RequestInit = {
          redirect: "follow",
          ...options,
          body: options.serializedBody,
          headers,
          signal,
        }
        let request = new Request(url, requestInit)
        if (onRequest) request = await onRequest(url, requestInit)

        // fetch must be assigned here, otherwise it throws:
        // TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation
        const _fetch = options.fetch ?? globalThis.fetch
        const response = await _fetch(request)

        if (!response.ok) throw new Error(`SSE failed: ${response.status} ${response.statusText}`)
        if (!response.body) throw new Error("No body in SSE response")

        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
        let lineParts: string[] = []
        let eventLines: string[] = []
        let pendingCR = false

        const feed = (value: string): string[][] => {
          const frames: string[][] = []
          let start = 0

          const emitLine = (line: string) => {
            if (line.length === 0) {
              if (eventLines.length > 0) {
                frames.push(eventLines)
                eventLines = []
              }
              return
            }
            eventLines.push(line)
          }

          for (let i = 0; i < value.length; i++) {
            const code = value.charCodeAt(i)

            if (pendingCR) {
              pendingCR = false
              // The CR already terminated the previous line. Consume the LF
              // when this chunk is the second half of a CRLF pair.
              if (code === 10) {
                start = i + 1
                continue
              }
            }

            if (code !== 10 && code !== 13) continue

            if (i > start) lineParts.push(value.slice(start, i))
            emitLine(lineParts.join(""))
            lineParts = []
            start = i + 1
            if (code === 13) pendingCR = true
          }

          if (start < value.length) lineParts.push(value.slice(start))
          return frames
        }

        const parseFrame = async (lines: string[]) => {
          const dataLines: Array<string> = []
          let eventName: string | undefined

          for (const line of lines) {
            if (line.startsWith("data:")) {
              dataLines.push(line.replace(/^data:\s*/, ""))
            } else if (line.startsWith("event:")) {
              eventName = line.replace(/^event:\s*/, "")
            } else if (line.startsWith("id:")) {
              lastEventId = line.replace(/^id:\s*/, "")
            } else if (line.startsWith("retry:")) {
              const parsed = Number.parseInt(line.replace(/^retry:\s*/, ""), 10)
              if (!Number.isNaN(parsed)) retryDelay = parsed
            }
          }

          let data: unknown
          let parsedJson = false

          if (dataLines.length) {
            const rawData = dataLines.join("\n")
            try {
              data = JSON.parse(rawData)
              parsedJson = true
            } catch {
              data = rawData
            }
          }

          if (parsedJson) {
            if (responseValidator) await responseValidator(data)
            if (responseTransformer) data = await responseTransformer(data)
          }

          onSseEvent?.({
            data: data as TData,
            event: eventName,
            id: lastEventId,
            retry: retryDelay,
          } satisfies StreamEvent<TData>)

          return dataLines.length ? (data as TData) : undefined
        }

        const abortHandler = () => {
          try {
            reader.cancel()
          } catch {
            // noop
          }
        }

        signal.addEventListener("abort", abortHandler)
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            for (const frame of feed(value)) {
              const data = await parseFrame(frame)
              if (data !== undefined) yield data as any
            }
          }
        } finally {
          signal.removeEventListener("abort", abortHandler)
          reader.releaseLock()
        }

        break
      } catch (error) {
        onSseError?.(error)

        if (sseMaxRetryAttempts !== undefined && attempt >= sseMaxRetryAttempts) break

        const backoff = Math.min(retryDelay * 2 ** (attempt - 1), sseMaxRetryDelay ?? 30000)
        await sleep(backoff)
      }
    }
  }

  return { stream: createStream() as ServerSentEventsResult<TData>["stream"] }
}
