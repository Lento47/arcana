import { describe, expect, test } from "bun:test"
import { createOpencodeClient } from "@arcana/sdk/v2"
import {
  assertEngineHealthy,
  createDaemonTransport,
  createRecoveringDaemonFetch,
  DaemonRequestOutcomeUnknownError,
} from "@/cli/tui/daemon-transport"
import type { DaemonLock } from "@/daemon/lock"

const INITIAL_URL = "http://127.0.0.1:9142"
const RECOVERED_URL = "http://127.0.0.1:9143"

function connectionError(code: "ECONNREFUSED" | "ECONNRESET") {
  const cause = Object.assign(new Error(code), { code })
  return new TypeError("fetch failed", { cause })
}

describe("daemon TUI transport", () => {
  test("preserves the generated SDK session.create request", async () => {
    let received: Request | undefined
    const transport = createRecoveringDaemonFetch({
      initialUrl: INITIAL_URL,
      recover: async () => undefined,
      fetch: (async (input: RequestInfo | URL) => {
        received = new Request(input)
        return Response.json({ id: "ses_transport_regression" })
      }) as unknown as typeof fetch,
    })
    const client = createOpencodeClient({ baseUrl: INITIAL_URL, fetch: transport })

    const result = await client.session.create({
      directory: "L:/PROJECTS/arcana",
      agent: "build",
      title: "transport regression",
    })

    expect(result.error).toBeUndefined()
    expect(result.data?.id).toBe("ses_transport_regression")
    expect(received?.method).toBe("POST")
    expect(new URL(received!.url).pathname).toBe("/session")
    expect(new URL(received!.url).searchParams.get("directory")).toBe("L:/PROJECTS/arcana")
    expect(received?.headers.get("content-type")).toContain("application/json")
    expect(await received!.json()).toMatchObject({ agent: "build", title: "transport regression" })
  })

  test("rebases a proven-unstarted mutation without losing request semantics", async () => {
    const controller = new AbortController()
    const attempts: Request[] = []
    const wrapped = createRecoveringDaemonFetch({
      initialUrl: INITIAL_URL,
      recover: async () => RECOVERED_URL,
      fetch: (async (input: RequestInfo | URL) => {
        const request = new Request(input)
        attempts.push(request)
        if (attempts.length === 1) throw connectionError("ECONNREFUSED")
        return Response.json({ ok: true })
      }) as unknown as typeof fetch,
    })

    const response = await wrapped(`${INITIAL_URL}/session?directory=arcana`, {
      method: "POST",
      headers: { authorization: "Bearer local", "content-type": "application/json" },
      body: JSON.stringify({ title: "preserved" }),
      signal: controller.signal,
    })

    expect(response.ok).toBe(true)
    expect(attempts).toHaveLength(2)
    expect(attempts[1]?.method).toBe("POST")
    expect(attempts[1]?.headers.get("authorization")).toBe("Bearer local")
    expect(new URL(attempts[1]!.url).origin).toBe(RECOVERED_URL)
    expect(new URL(attempts[1]!.url).pathname).toBe("/session")
    expect(new URL(attempts[1]!.url).search).toBe("?directory=arcana")
    expect(await attempts[1]!.json()).toEqual({ title: "preserved" })
  })

  test("never replays a mutation with uncertain delivery", async () => {
    let calls = 0
    const wrapped = createRecoveringDaemonFetch({
      initialUrl: INITIAL_URL,
      recover: async () => RECOVERED_URL,
      fetch: (async () => {
        calls += 1
        throw connectionError("ECONNRESET")
      }) as unknown as typeof fetch,
    })

    await expect(wrapped(`${INITIAL_URL}/session`, { method: "POST", body: "{}" })).rejects.toBeInstanceOf(
      DaemonRequestOutcomeUnknownError,
    )
    expect(calls).toBe(1)
  })

  test("retries read-only requests and shares one concurrent recovery", async () => {
    let recoveries = 0
    let releaseRecovery: ((url: string) => void) | undefined
    const recovery = new Promise<string>((resolve) => {
      releaseRecovery = resolve
    })
    const wrapped = createRecoveringDaemonFetch({
      initialUrl: INITIAL_URL,
      recover: async () => {
        recoveries += 1
        return recovery
      },
      fetch: (async (input: RequestInfo | URL) => {
        const request = new Request(input)
        if (new URL(request.url).origin === INITIAL_URL) throw connectionError("ECONNRESET")
        return Response.json({ ok: true })
      }) as unknown as typeof fetch,
    })

    const first = wrapped(`${INITIAL_URL}/session/one`)
    const second = wrapped(`${INITIAL_URL}/session/two`)
    await Promise.resolve()
    expect(recoveries).toBe(1)
    releaseRecovery!(RECOVERED_URL)

    const responses = await Promise.all([first, second])
    expect(responses.every((response) => response.ok)).toBe(true)
    expect(recoveries).toBe(1)
  })

  test("rejects requests for a different origin before forwarding data", async () => {
    let forwarded = false
    const wrapped = createRecoveringDaemonFetch({
      initialUrl: INITIAL_URL,
      recover: async () => RECOVERED_URL,
      fetch: (async () => {
        forwarded = true
        return new Response()
      }) as unknown as typeof fetch,
    })

    await expect(
      wrapped("https://example.com/session", {
        method: "POST",
        headers: { authorization: "Bearer secret" },
        body: "secret",
      }),
    ).rejects.toThrow("rejected non-daemon origin")
    expect(forwarded).toBe(false)
  })

  test("accepts only the exact workspace lock", async () => {
    const directory = process.cwd()
    const lock: DaemonLock = {
      workspace: directory,
      pid: process.pid,
      port: 9142,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
      version: "test",
    }
    let spawned = 0
    const transport = await createDaemonTransport({
      directory,
      command: ["arcana", "--daemon"],
      dependencies: {
        readLock: () => lock,
        isLockStale: () => false,
        health: async () => true,
        spawn: () => {
          spawned += 1
          return {}
        },
      },
    })

    expect(transport.status).toBe("connected")
    if (transport.status !== "connected") throw new Error("expected daemon transport")
    expect(transport.transport.url).toBe(INITIAL_URL)
    expect(spawned).toBe(0)

    const rejected = await createDaemonTransport({
      directory,
      command: ["arcana", "--daemon"],
      dependencies: {
        readLock: () => ({ ...lock, workspace: directory + "-other" }),
        isLockStale: () => false,
        health: async () => {
          throw new Error("wrong-workspace health must not be queried")
        },
        spawn: () => {
          throw new Error("wrong-workspace daemon must not be spawned")
        },
      },
    })
    expect(rejected).toEqual({ status: "unavailable", reason: "invalid_lock" })
  })

  test("validates transport health before the renderer starts", async () => {
    const healthyFetch = (async () => Response.json({ status: "ok", version: "test" })) as unknown as typeof fetch
    await expect(assertEngineHealthy({ url: INITIAL_URL, fetch: healthyFetch })).resolves.toBeUndefined()

    const unavailableFetch = (async () =>
      Response.json({ error: "Worker unavailable" }, { status: 503 })) as unknown as typeof fetch
    await expect(assertEngineHealthy({ url: INITIAL_URL, fetch: unavailableFetch })).rejects.toThrow("HTTP 503")

    const malformedFetch = (async () => Response.json({ status: "ok" })) as unknown as typeof fetch
    await expect(assertEngineHealthy({ url: INITIAL_URL, fetch: malformedFetch })).rejects.toThrow("invalid response")
  })
})
