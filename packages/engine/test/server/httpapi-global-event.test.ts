import { afterEach, describe, expect, test } from "bun:test"
import { GlobalBus } from "../../src/bus/global"
import { Server } from "../../src/server/server"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

function app() {
  return Server.Default().app
}

function createFrameReader(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder()
  let buffer = ""
  return async function readFrame() {
    while (true) {
      const match = buffer.match(/\r?\n\r?\n/)
      if (match && match.index !== undefined) {
        const frame = buffer.slice(0, match.index)
        buffer = buffer.slice(match.index + match[0].length)
        const dataLine = frame.split(/\r?\n/).find((line) => line.startsWith("data:"))
        if (dataLine) return { data: JSON.parse(dataLine.replace(/^data:\s*/, "")) as any, frame }
        continue
      }

      const { done, value } = await reader.read()
      if (done) throw new Error("SSE stream ended before a frame arrived")
      buffer += decoder.decode(value, { stream: true })
    }
  }
}

async function readUntil(read: () => Promise<{ data: any; frame: string }>, predicate: (data: any) => boolean) {
  while (true) {
    const frame = await read()
    if (predicate(frame.data)) return frame
  }
}

describe("global event SSE routing", () => {
  test("filters instance events and emits bounded transport metadata", async () => {
    await using target = await tmpdir({ config: { formatter: false, lsp: false } })
    await using foreign = await tmpdir({ config: { formatter: false, lsp: false } })
    const controller = new AbortController()
    const response = await app().request(`/global/event?directory=${encodeURIComponent(target.path)}`, {
      signal: controller.signal,
    })
    const reader = response.body!.getReader()
    const read = createFrameReader(reader)

    try {
      // Publish before the consumer reads the initial frame. Eager listener
      // registration must retain this event instead of racing response setup.
      GlobalBus.emit("event", {
        directory: foreign.path,
        payload: { id: "foreign", type: "session.updated", properties: {} },
      })
      GlobalBus.emit("event", {
        directory: target.path,
        payload: { id: "target", type: "session.updated", properties: {} },
      })

      const connected = await read()
      expect(response.status).toBe(200)
      expect(connected.data.directory).toBe(target.path)
      expect(connected.data.transport).toMatchObject({ sequence: 0 })
      expect(connected.frame).toMatch(/id: stm_.+:0/)

      GlobalBus.emit("event", {
        directory: foreign.path,
        payload: { id: "foreign-after-connect", type: "session.updated", properties: {} },
      })
      GlobalBus.emit("event", {
        directory: target.path,
        payload: { id: "target-after-connect", type: "session.updated", properties: {} },
      })

      const event = await readUntil(read, (data) => data.payload?.id === "target-after-connect")
      expect(event.data.directory).toBe(target.path)
      expect(event.data.payload.id).toBe("target-after-connect")
      expect(event.data.transport).toMatchObject({ sequence: 2 })
      expect(event.frame).toMatch(/id: stm_.+:2/)
    } finally {
      controller.abort()
      await reader.cancel().catch(() => {})
    }
  })

  test("keeps locationless lifecycle events visible to filtered clients", async () => {
    await using target = await tmpdir({ config: { formatter: false, lsp: false } })
    const controller = new AbortController()
    const response = await app().request(`/global/event?directory=${encodeURIComponent(target.path)}`, {
      signal: controller.signal,
    })
    const reader = response.body!.getReader()
    const read = createFrameReader(reader)

    try {
      await read()
      GlobalBus.emit("event", {
        directory: "global",
        payload: { id: "global-event", type: "global.disposed", properties: {} },
      })
      const event = await readUntil(read, (data) => data.payload?.id === "global-event")
      expect(event.data.directory).toBe("global")
      expect(event.data.payload.id).toBe("global-event")
    } finally {
      controller.abort()
      await reader.cancel().catch(() => {})
    }
  })

  test("honors workspace filters for workspace-scoped control-plane events", async () => {
    await using target = await tmpdir({ config: { formatter: false, lsp: false } })
    const controller = new AbortController()
    const response = await app().request(
      `/global/event?directory=${encodeURIComponent(target.path)}&workspace=wrk_target`,
      { signal: controller.signal },
    )
    const reader = response.body!.getReader()
    const read = createFrameReader(reader)

    try {
      await read()
      GlobalBus.emit("event", {
        directory: "global",
        workspace: "wrk_foreign",
        payload: { id: "foreign-workspace", type: "workspace.status", properties: { status: "connected" } },
      })
      GlobalBus.emit("event", {
        directory: "global",
        workspace: "wrk_target",
        payload: { id: "target-workspace", type: "workspace.status", properties: { status: "connected" } },
      })

      const event = await readUntil(read, (data) => data.payload?.id === "target-workspace")
      expect(event.data.workspace).toBe("wrk_target")
      expect(event.data.payload.id).toBe("target-workspace")
    } finally {
      controller.abort()
      await reader.cancel().catch(() => {})
    }
  })
})
