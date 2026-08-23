/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import type { GlobalEvent } from "@arcana/sdk/v2"
import { tmpdir } from "../../../fixture/fixture"
import { json, mount, wait } from "./sync-fixture"

const sessionA = "ses_prefetch_a"
const sessionB = "ses_prefetch_b"
const messageA = "msg_prefetch_a"
const messageB = "msg_prefetch_b"
const partA = "prt_prefetch_a"
const partB = "prt_prefetch_b"

function sessionInfo(id: string) {
  return {
    id,
    title: id,
    time: { created: 0, updated: 0 },
    version: "1.15.13",
    directory: "/tmp/opencode/packages/opencode",
  }
}

function assistant(sessionID: string, messageID: string) {
  return {
    id: messageID,
    sessionID,
    role: "assistant" as const,
    agent: "build",
    modelID: "model",
    providerID: "test",
    mode: "build",
    parentID: "msg_user",
    path: { cwd: "/tmp/opencode", root: "/tmp/opencode" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, completed: 2 },
  }
}

function global(payload: GlobalEvent["payload"]): GlobalEvent {
  return { directory: "/tmp/other", project: "proj_test", payload }
}

test("warm session.sync does not re-fetch messages", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")

  let messageHits = 0
  const { app, sync } = await mount((url) => {
    if (url.pathname === `/session/${sessionA}`) return json(sessionInfo(sessionA))
    if (url.pathname === `/session/${sessionA}/message`) {
      messageHits++
      return json([
        {
          info: assistant(sessionA, messageA),
          parts: [{ id: partA, sessionID: sessionA, messageID: messageA, type: "text", text: "cached" }],
        },
      ])
    }
    if (url.pathname === `/session/${sessionA}/todo` || url.pathname === `/session/${sessionA}/diff`) return json([])
    return undefined
  }, tmp.path)

  try {
    expect(sync.session.isSynced(sessionA)).toBe(false)
    await sync.session.sync(sessionA)
    expect(sync.session.isSynced(sessionA)).toBe(true)
    expect(messageHits).toBe(1)

    await sync.session.sync(sessionA)
    await sync.session.sync(sessionA)
    expect(messageHits).toBe(1)
  } finally {
    app.renderer.destroy()
  }
})

test("prefetch hydrates a session via the same sync path", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")

  let messageHits = 0
  const { app, sync } = await mount((url) => {
    if (url.pathname === `/session/${sessionB}`) return json(sessionInfo(sessionB))
    if (url.pathname === `/session/${sessionB}/message`) {
      messageHits++
      return json([
        {
          info: assistant(sessionB, messageB),
          parts: [{ id: partB, sessionID: sessionB, messageID: messageB, type: "text", text: "prefetched" }],
        },
      ])
    }
    if (url.pathname === `/session/${sessionB}/todo` || url.pathname === `/session/${sessionB}/diff`) return json([])
    return undefined
  }, tmp.path)

  try {
    sync.session.prefetch([sessionB])
    await wait(() => sync.session.isHistoryReady(sessionB))
    expect(messageHits).toBe(1)
    expect(sync.data.message[sessionB]?.[0]?.id).toBe(messageB)
    expect(sync.data.part[messageB]?.[0]).toMatchObject({ text: "prefetched" })

    // Second prefetch / sync is a no-op for network
    sync.session.prefetch([sessionB])
    await sync.session.sync(sessionB)
    expect(messageHits).toBe(1)
  } finally {
    app.renderer.destroy()
  }
})

test("prefetch of session B does not overwrite live parts of session A", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")

  let resolveB!: (response: Response) => void
  const messagesB = new Promise<Response>((resolve) => {
    resolveB = resolve
  })

  const { app, emit, sync } = await mount((url) => {
    if (url.pathname === `/session/${sessionA}`) return json(sessionInfo(sessionA))
    if (url.pathname === `/session/${sessionA}/message`) {
      return json([
        {
          info: assistant(sessionA, messageA),
          parts: [{ id: partA, sessionID: sessionA, messageID: messageA, type: "text", text: "seed-a" }],
        },
      ])
    }
    if (url.pathname === `/session/${sessionA}/todo` || url.pathname === `/session/${sessionA}/diff`) return json([])

    if (url.pathname === `/session/${sessionB}`) return json(sessionInfo(sessionB))
    if (url.pathname === `/session/${sessionB}/message`) return messagesB
    if (url.pathname === `/session/${sessionB}/todo` || url.pathname === `/session/${sessionB}/diff`) return json([])
    return undefined
  }, tmp.path)

  try {
    await sync.session.sync(sessionA)
    expect(sync.data.part[messageA]?.[0]).toMatchObject({ text: "seed-a" })

    // Start prefetch B (held open), then push live updates to A
    sync.session.prefetch([sessionB])
    await wait(() => true) // yield once so fetch can start

    emit(
      global({
        id: "evt_a_part",
        type: "message.part.updated",
        properties: {
          sessionID: sessionA,
          time: 3,
          part: { id: partA, sessionID: sessionA, messageID: messageA, type: "text", text: "live-a" },
        },
      }),
    )
    await wait(() => sync.data.part[messageA]?.[0]?.type === "text" && (sync.data.part[messageA][0] as any).text === "live-a")

    resolveB(
      json([
        {
          info: assistant(sessionB, messageB),
          parts: [{ id: partB, sessionID: sessionB, messageID: messageB, type: "text", text: "from-b" }],
        },
      ]),
    )
    await wait(() => sync.session.isHistoryReady(sessionB))

    expect(sync.data.part[messageA]?.[0]).toMatchObject({ text: "live-a" })
    expect(sync.data.part[messageB]?.[0]).toMatchObject({ text: "from-b" })
  } finally {
    app.renderer.destroy()
  }
})

test("cold open starts metadata, history, and supplemental requests concurrently", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")

  let resolveMetadata!: (response: Response) => void
  const metadata = new Promise<Response>((resolve) => {
    resolveMetadata = resolve
  })
  const hits = new Set<string>()
  const { app, sync } = await mount((url) => {
    if (!url.pathname.startsWith(`/session/${sessionA}`)) return undefined
    hits.add(url.pathname)
    if (url.pathname === `/session/${sessionA}`) return metadata
    if (url.pathname === `/session/${sessionA}/message`) return json([])
    if (url.pathname === `/session/${sessionA}/todo` || url.pathname === `/session/${sessionA}/diff`) return json([])
    if (url.pathname === `/session/${sessionA}/governance`) return json({})
    return undefined
  }, tmp.path)

  try {
    const opening = sync.session.open(sessionA)
    await wait(() =>
      hits.has(`/session/${sessionA}`)
      && hits.has(`/session/${sessionA}/message`)
      && hits.has(`/session/${sessionA}/todo`)
      && hits.has(`/session/${sessionA}/diff`)
      && hits.has(`/session/${sessionA}/governance`),
    )
    expect(sync.session.loadState(sessionA).metadata).toBe("loading")
    expect(sync.session.loadState(sessionA).history).toBe("ready")

    resolveMetadata(json(sessionInfo(sessionA)))
    await opening
    expect(sync.session.loadState(sessionA).metadata).toBe("ready")
  } finally {
    app.renderer.destroy()
  }
})

test("open resolves at metadata readiness while history and governance remain progressive", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")

  let resolveMessages!: (response: Response) => void
  let resolveGovernance!: (response: Response) => void
  const delayedMessages = new Promise<Response>((resolve) => {
    resolveMessages = resolve
  })
  const delayedGovernance = new Promise<Response>((resolve) => {
    resolveGovernance = resolve
  })
  const { app, sync } = await mount((url) => {
    if (url.pathname === `/session/${sessionA}`) return json(sessionInfo(sessionA))
    if (url.pathname === `/session/${sessionA}/message`) return delayedMessages
    if (url.pathname === `/session/${sessionA}/todo` || url.pathname === `/session/${sessionA}/diff`) return json([])
    if (url.pathname === `/session/${sessionA}/governance`) return delayedGovernance
    return undefined
  }, tmp.path)

  try {
    await sync.session.open(sessionA)
    expect(sync.session.get(sessionA)?.id).toBe(sessionA)
    expect(sync.session.loadState(sessionA)).toMatchObject({
      metadata: "ready",
      history: "loading",
      supplemental: "loading",
    })

    resolveMessages(json([]))
    await sync.session.hydrateHistory(sessionA)
    expect(sync.session.loadState(sessionA)).toMatchObject({
      metadata: "ready",
      history: "ready",
      supplemental: "loading",
    })

    resolveGovernance(json({}))
    await sync.session.sync(sessionA)
    expect(sync.session.isSynced(sessionA)).toBe(true)
    expect(sync.session.loadState(sessionA).completedAt).toBeNumber()
  } finally {
    app.renderer.destroy()
  }
})
