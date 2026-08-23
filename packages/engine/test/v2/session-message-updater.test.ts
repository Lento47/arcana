import { expect, test } from "bun:test"
import { Effect } from "effect"
import * as DateTime from "effect/DateTime"
import { SessionID } from "../../src/session/schema"
import { EventV2 } from "@arcana/core/event"
import { ModelV2 } from "@arcana/core/model"
import { ProviderV2 } from "@arcana/core/provider"
import { SessionEvent } from "@arcana/core/session/event"
import { SessionMessageUpdater } from "@arcana/core/session/message-updater"
import { SessionMessage } from "@arcana/core/session/message"

test.skip("step snapshots carry over to assistant messages", () => {
  const state: SessionMessageUpdater.MemoryState = { messages: [] }
  const sessionID = SessionID.make("session")
  const assistantMessageID = SessionMessage.ID.create()

  Effect.runSync(
    SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
      id: EventV2.ID.create(),
      type: "session.next.step.started",
      data: {
        sessionID,
        assistantMessageID,
        timestamp: DateTime.makeUnsafe(1),
        agent: "build",
        model: {
          id: ModelV2.ID.make("model"),
          providerID: ProviderV2.ID.make("provider"),
          variant: ModelV2.VariantID.make("default"),
        },
        snapshot: "before",
      },
    } satisfies SessionEvent.Event),
  )

  expect(state.messages).toEqual([])

  Effect.runSync(
    SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
      id: EventV2.ID.create(),
      type: "session.next.step.ended",
      data: {
        sessionID,
        assistantMessageID,
        timestamp: DateTime.makeUnsafe(2),
        finish: "stop",
        cost: 0,
        tokens: {
          input: 1,
          output: 2,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
        snapshot: "after",
      },
    } satisfies SessionEvent.Event),
  )

  expect(state.messages[0]?.type).toBe("assistant")
  if (state.messages[0]?.type !== "assistant") return
  expect(state.messages[0].snapshot).toEqual({ start: "before", end: "after" })
  expect(state.messages[0].finish).toBe("stop")
})

test.skip("text ended populates assistant text content", () => {
  const state: SessionMessageUpdater.MemoryState = { messages: [] }
  const sessionID = SessionID.make("session")
  const assistantMessageID = SessionMessage.ID.create()

  Effect.runSync(
    SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
      id: EventV2.ID.create(),
      type: "session.next.step.started",
      data: {
        sessionID,
        assistantMessageID,
        timestamp: DateTime.makeUnsafe(1),
        agent: "build",
        model: {
          id: ModelV2.ID.make("model"),
          providerID: ProviderV2.ID.make("provider"),
          variant: ModelV2.VariantID.make("default"),
        },
      },
    } satisfies SessionEvent.Event),
  )

  Effect.runSync(
    SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
      id: EventV2.ID.create(),
      type: "session.next.text.started",
      data: {
        sessionID,
        assistantMessageID,
        timestamp: DateTime.makeUnsafe(2),
        textID: "text-1",
      },
    } satisfies SessionEvent.Event),
  )

  Effect.runSync(
    SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
      id: EventV2.ID.create(),
      type: "session.next.text.ended",
      data: {
        sessionID,
        assistantMessageID,
        timestamp: DateTime.makeUnsafe(3),
        textID: "text-1",
        text: "hello assistant",
      },
    } satisfies SessionEvent.Event),
  )

  expect(state.messages[0]?.type).toBe("assistant")
  if (state.messages[0]?.type !== "assistant") return
  expect(state.messages[0].content).toEqual([{ type: "text", id: "text-1", text: "hello assistant" }])
})

test.skip("tool completion stores completed timestamp", () => {
  const state: SessionMessageUpdater.MemoryState = { messages: [] }
  const sessionID = SessionID.make("session")
  const callID = "call"
  const assistantMessageID = SessionMessage.ID.create()

  Effect.runSync(
    SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
      id: EventV2.ID.create(),
      type: "session.next.step.started",
      data: {
        sessionID,
        assistantMessageID,
        timestamp: DateTime.makeUnsafe(1),
        agent: "build",
        model: {
          id: ModelV2.ID.make("model"),
          providerID: ProviderV2.ID.make("provider"),
          variant: ModelV2.VariantID.make("default"),
        },
      },
    } satisfies SessionEvent.Event),
  )

  Effect.runSync(
    SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
      id: EventV2.ID.create(),
      type: "session.next.tool.input.started",
      data: {
        sessionID,
        assistantMessageID,
        timestamp: DateTime.makeUnsafe(2),
        callID,
        name: "bash",
      },
    } satisfies SessionEvent.Event),
  )

  Effect.runSync(
    SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
      id: EventV2.ID.create(),
      type: "session.next.tool.called",
      data: {
        sessionID,
        assistantMessageID,
        timestamp: DateTime.makeUnsafe(3),
        callID,
        tool: "bash",
        input: { command: "pwd" },
        provider: { executed: true, metadata: { fake: { source: "provider" } } },
      },
    } satisfies SessionEvent.Event),
  )

  Effect.runSync(
    SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
      id: EventV2.ID.create(),
      type: "session.next.tool.success",
      data: {
        sessionID,
        assistantMessageID,
        timestamp: DateTime.makeUnsafe(4),
        callID,
        structured: {},
        content: [{ type: "text", text: "/tmp" }],
        provider: { executed: true, metadata: { fake: { status: "done" } } },
      },
    } satisfies SessionEvent.Event),
  )

  expect(state.messages[0]?.type).toBe("assistant")
  if (state.messages[0]?.type !== "assistant") return
  expect(state.messages[0].content[0]?.type).toBe("tool")
  if (state.messages[0].content[0]?.type !== "tool") return
  expect(state.messages[0].content[0].time.completed).toEqual(DateTime.makeUnsafe(4))
  expect(state.messages[0].content[0].provider).toEqual({ executed: true, metadata: { fake: { status: "done" } } })
})

test("tool cancellation terminalizes the matching active tool", () => {
  const sessionID = SessionID.make("session")
  const assistantMessageID = SessionMessage.ID.create()
  const created = DateTime.makeUnsafe(1)
  const state: SessionMessageUpdater.MemoryState = {
    messages: [
      new SessionMessage.Assistant({
        id: assistantMessageID,
        type: "assistant",
        agent: "build",
        model: {
          id: ModelV2.ID.make("model"),
          providerID: ProviderV2.ID.make("provider"),
          variant: ModelV2.VariantID.make("default"),
        },
        content: [
          new SessionMessage.AssistantTool({
            type: "tool",
            id: "call",
            name: "bash",
            state: new SessionMessage.ToolStateRunning({
              status: "running",
              input: { command: "bun test" },
              structured: { progress: 1 },
              content: [{ type: "text", text: "partial" }],
            }),
            time: { created, ran: created },
          }),
        ],
        time: { created },
      }),
    ],
  }

  Effect.runSync(
    SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
      id: EventV2.ID.create(),
      type: "session.next.tool.cancelled",
      data: {
        sessionID,
        assistantMessageID,
        timestamp: DateTime.makeUnsafe(5),
        callID: "call",
        reason: "recovered_stale",
      },
    } satisfies SessionEvent.Event),
  )

  const message = state.messages[0]
  expect(message?.type).toBe("assistant")
  if (message?.type !== "assistant") return
  const tool = message.content[0]
  expect(tool?.type).toBe("tool")
  if (tool?.type !== "tool") return
  expect(tool.state).toMatchObject({
    status: "cancelled",
    reason: "recovered_stale",
    input: { command: "bun test" },
    structured: { progress: 1 },
    content: [{ type: "text", text: "partial" }],
  })
  expect(tool.time.completed).toEqual(DateTime.makeUnsafe(5))
})

test("compaction events reduce to compaction message only when completed", () => {
  const state: SessionMessageUpdater.MemoryState = { messages: [] }
  const sessionID = SessionID.make("session")
  const id = EventV2.ID.create()
  const compactionID = SessionMessage.ID.create()

  Effect.runSync(
    SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
      id,
      type: "session.next.compaction.started",
      data: {
        sessionID,
        messageID: compactionID,
        timestamp: DateTime.makeUnsafe(1),
        reason: "auto",
      },
    } satisfies SessionEvent.Event),
  )

  expect(state.messages).toEqual([])

  Effect.runSync(
    SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
      id: EventV2.ID.create(),
      type: "session.next.compaction.delta",
      data: {
        sessionID,
        messageID: compactionID,
        timestamp: DateTime.makeUnsafe(2),
        text: "hello ",
      },
    } satisfies SessionEvent.Event),
  )

  Effect.runSync(
    SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
      id: EventV2.ID.create(),
      type: "session.next.compaction.delta",
      data: {
        sessionID,
        messageID: compactionID,
        timestamp: DateTime.makeUnsafe(3),
        text: "summary",
      },
    } satisfies SessionEvent.Event),
  )

  Effect.runSync(
    SessionMessageUpdater.update(SessionMessageUpdater.memory(state), {
      id: EventV2.ID.create(),
      type: "session.next.compaction.ended",
      data: {
        sessionID,
        messageID: compactionID,
        timestamp: DateTime.makeUnsafe(4),
        reason: "auto",
        text: "final summary",
        recent: "recent context",
      },
    } satisfies SessionEvent.Event),
  )

  expect(state.messages).toHaveLength(1)
  expect(state.messages[0]).toMatchObject({
    id: compactionID,
    type: "compaction",
    reason: "auto",
    summary: "final summary",
    recent: "recent context",
    time: { created: DateTime.makeUnsafe(4) },
  })
})
