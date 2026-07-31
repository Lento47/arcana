/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { tmpdir } from "../../../fixture/fixture"
import { json, mount, wait } from "./sync-fixture"

const sessionID = "ses_resync"
const messageID = "msg_resync"
const partID = "prt_resync"
const session = {
  id: sessionID,
  title: "resync",
  time: { created: 0, updated: 0 },
  version: "1.15.13",
  directory: "/tmp/opencode/packages/opencode",
}
const assistant = {
  id: messageID,
  sessionID,
  role: "assistant" as const,
  agent: "build",
  modelID: "model",
  providerID: "test",
  mode: "build",
  parentID: "msg_user",
  path: { cwd: session.directory, root: session.directory },
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, completed: 2 },
}

test("resync clears the full-sync guard and heals a stale partial part from REST", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")

  // The store holds the last snapshot delivered over SSE before the stream
  // dropped mid-exchange ("Hello. How"). The engine store (ground truth)
  // already has the complete reply — the next REST read returns it.
  let messagesResponse: Response = json([
    { info: assistant, parts: [{ id: partID, sessionID, messageID, type: "text", text: "Hello. How" }] },
  ])
  let messageRequests = 0
  const { app, sync } = await mount((url) => {
    if (url.pathname === `/session/${sessionID}`) return json(session)
    if (url.pathname === `/session/${sessionID}/message`) {
      messageRequests += 1
      return messagesResponse
    }
    if (url.pathname === `/session/${sessionID}/todo` || url.pathname === `/session/${sessionID}/diff`) return json([])
    return undefined
  }, tmp.path)

  try {
    await sync.session.sync(sessionID)
    expect(sync.data.part[messageID]?.[0]).toMatchObject({ text: "Hello. How" })
    expect(sync.session.isSynced(sessionID)).toBe(true)
    expect(messageRequests).toBe(1)

    // Guarded sync is a no-op — the stale snapshot would stick forever.
    await sync.session.sync(sessionID)
    expect(messageRequests).toBe(1)

    // SSE gap-closer: the engine store has the complete reply now.
    messagesResponse = json([
      {
        info: assistant,
        parts: [{ id: partID, sessionID, messageID, type: "text", text: "Hello. How can I help?" }],
      },
    ])
    await sync.session.resync(sessionID)

    expect(messageRequests).toBe(2)
    expect(sync.data.part[messageID]?.[0]).toMatchObject({ text: "Hello. How can I help?" })
    expect(sync.session.isSynced(sessionID)).toBe(true)
  } finally {
    app.renderer.destroy()
  }
})

test("resync preserves live deltas arriving while the REST hydrate is in flight", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")

  let resolveMessages!: (response: Response) => void
  const messages = new Promise<Response>((resolve) => {
    resolveMessages = resolve
  })
  let defer = false
  let requested = false
  const { app, emit, sync } = await mount((url) => {
    if (url.pathname === `/session/${sessionID}`) return json(session)
    if (url.pathname === `/session/${sessionID}/message`) {
      if (defer) {
        requested = true
        return messages
      }
      return json([{ info: assistant, parts: [{ id: partID, sessionID, messageID, type: "text", text: "base" }] }])
    }
    if (url.pathname === `/session/${sessionID}/todo` || url.pathname === `/session/${sessionID}/diff`) return json([])
    return undefined
  }, tmp.path)

  try {
    await sync.session.sync(sessionID)
    expect(sync.session.isSynced(sessionID)).toBe(true)

    defer = true
    const resync = sync.session.resync(sessionID)
    await wait(() => requested)
    emit({
      directory: session.directory,
      payload: {
        id: "evt_part",
        type: "message.part.updated",
        properties: {
          sessionID,
          time: 2,
          part: { id: partID, sessionID, messageID, type: "text", text: "visible live content" },
        },
      },
    })
    resolveMessages(
      json([
        {
          info: assistant,
          parts: [{ id: partID, sessionID, messageID, type: "text", text: "" }],
        },
      ]),
    )
    await resync

    expect(sync.data.part[messageID]?.[0]).toMatchObject({ text: "visible live content" })
    expect(sync.session.isSynced(sessionID)).toBe(true)
  } finally {
    app.renderer.destroy()
  }
})

test("resync failure keeps the guard cleared so the next sync attempt retries", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")

  let failAll = false
  const { app, sync } = await mount((url) => {
    if (failAll && url.pathname.startsWith(`/session/${sessionID}`)) return undefined // "unexpected request" throw
    if (url.pathname === `/session/${sessionID}`) return json(session)
    if (url.pathname === `/session/${sessionID}/message`) {
      return json([{ info: assistant, parts: [{ id: partID, sessionID, messageID, type: "text", text: "ok" }] }])
    }
    if (url.pathname === `/session/${sessionID}/todo` || url.pathname === `/session/${sessionID}/diff`) return json([])
    return undefined
  }, tmp.path)

  try {
    await sync.session.sync(sessionID)
    expect(sync.session.isSynced(sessionID)).toBe(true)

    // Engine down: every REST call rejects. session.get uses throwOnError,
    // so Promise.all rejects and resync propagates the failure. (A partial
    // failure — only the messages call — is swallowed by sync() by design:
    // messages() has no throwOnError. The real tripwire is session.get.)
    failAll = true
    await expect(sync.session.resync(sessionID)).rejects.toThrow()

    // Fail-closed: the guard is cleared, so a later attempt re-fetches.
    expect(sync.session.isSynced(sessionID)).toBe(false)

    failAll = false
    await sync.session.resync(sessionID)
    expect(sync.session.isSynced(sessionID)).toBe(true)
  } finally {
    app.renderer.destroy()
  }
})
