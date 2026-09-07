// Resumable SSE fetch for the arcana proxy.
//
// When the proxy's SSE stream drops mid-way (network blip, proxy restart,
// Cloudflare edge hiccup), the engine re-issues the whole request today —
// which re-runs the upstream call, double-charges, and trips the proxy's own
// rate limiter. Instead, the proxy returns an `X-Arcana-Turn-ID` header and
// buffers the streamed output keyed by that id. This wrapper captures the
// header and wraps the response body in a TransformStream that, on a mid-stream
// error, reconnects to the proxy's resume endpoint with the turn_id plus the
// character offset of the last complete SSE event. The proxy replays the
// buffered tail and continues the live stream — the upstream call is not
// re-run. If the resume fails (buffer expired / instance evicted), the stream
// errors and the caller falls back to the existing retry path.

const MAX_RESUMES = 2

const headerObject = (headers?: HeadersInit): Record<string, string> => {
  if (!headers) return {}
  if (headers instanceof Headers) {
    const out: Record<string, string> = {}
    headers.forEach((value, key) => {
      out[key] = value
    })
    return out
  }
  if (Array.isArray(headers)) return Object.fromEntries(headers)
  return headers as Record<string, string>
}

const requestUrl = (input: RequestInfo | URL): string =>
  typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url

/**
 * Drop-in `fetch` for `streamText({ fetch })`. Passes non-proxy responses
 * through untouched; wraps proxy SSE responses in a resumable body.
 */
export function resumableFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init).then((response) => {
    const turnId = response.headers.get("x-arcana-turn-id")
    if (!turnId || !response.body) return response
    const body = resumableBody(response.body, {
      turnId,
      url: requestUrl(input),
      headers: init?.headers,
    })
    return new Response(body, response)
  })
}

function resumableBody(
  original: ReadableStream<Uint8Array>,
  opts: { turnId: string; url: string; headers?: HeadersInit },
): ReadableStream<Uint8Array> {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  let decoder = new TextDecoder()
  // Partial SSE event not yet passed through (no trailing \n\n yet).
  let buffer = ""
  // Character offset of the last complete event passed to the model SDK.
  // Aligns with the proxy's buffered text, which is decoded from the same bytes.
  let passedChars = 0
  let resumeAttempts = 0

  const pump = async () => {
    let reader = original.getReader()
    try {
      while (true) {
        let result: Awaited<ReturnType<typeof reader.read>>
        try {
          result = await reader.read()
        } catch (error) {
          if (resumeAttempts >= MAX_RESUMES) throw error
          resumeAttempts++
          const resumed = await fetchResume(opts, passedChars)
          if (!resumed.ok || !resumed.body) throw error
          // Discard the partial event — the proxy replays it from the offset.
          buffer = ""
          decoder = new TextDecoder()
          reader = resumed.body.getReader()
          continue
        }
        if (result.done) break
        const text = decoder.decode(result.value, { stream: true })
        buffer += text
        // Pass complete SSE events (terminated by \n\n) through to the SDK.
        let boundary
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const event = buffer.slice(0, boundary + 2)
          buffer = buffer.slice(boundary + 2)
          passedChars += event.length
          await writer.write(new TextEncoder().encode(event))
        }
      }
      // Final event may lack a trailing \n\n — flush it.
      if (buffer) await writer.write(new TextEncoder().encode(buffer))
      await writer.close()
    } catch (error) {
      await writer.abort(error)
    }
  }
  pump()
  return readable
}

async function fetchResume(
  opts: { turnId: string; url: string; headers?: HeadersInit },
  offset: number,
): Promise<Response> {
  const url = new URL(opts.url)
  url.pathname = "/v1/chat/completions/resume"
  return fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headerObject(opts.headers),
    },
    body: JSON.stringify({ turn_id: opts.turnId, offset }),
  })
}
