import { describe, expect, test } from "bun:test"
import type { WithParts } from "@arcana/core/v1/session"
import { MessageID } from "../../src/session/schema"
import { latest } from "../../src/session/message-v2"

type Role = "user" | "assistant"

const id = (value: string) => value as MessageID

function msg(
  role: Role,
  messageID: string,
  created: number,
  opts: { finish?: string; parts?: Array<{ type: string }> } = {},
) {
  return {
    info: {
      role,
      id: id(messageID),
      time: { created },
      ...(opts.finish ? { finish: opts.finish } : {}),
    },
    parts: opts.parts ?? [],
  } as unknown as WithParts
}

describe("MessageV2.latest", () => {
  test("picks latest user/assistant by creation time, not id ordering", () => {
    const uuidUser = msg("user", "msg_bf98bc69bc03408caf6b2e05d24ab8bb", 1000)
    const assistant = msg("assistant", "msg_00c183739001", 2000, { finish: "stop" })
    const { user, assistant: latestAssistant, finished, tasks } = latest([uuidUser, assistant])
    expect(user?.id).toBe(uuidUser.info.id)
    expect(latestAssistant?.id).toBe(assistant.info.id)
    expect(finished?.id).toBe(assistant.info.id)
    expect(tasks).toEqual([])
  })

  test("the old exit check was broken: uuid user ids sort after time-based assistant ids", () => {
    expect("msg_bf98bc69bc03408caf6b2e05d24ab8bb" < "msg_00c183739001").toBe(false)
  })

  test("a new user message newer than the terminal assistant wins the user slot", () => {
    const first = msg("user", "msg_aaa", 1000)
    const assistant = msg("assistant", "msg_00c183739001", 2000, { finish: "stop" })
    const second = msg("user", "msg_bbb", 2500)
    const { user, assistant: latestAssistant } = latest([first, assistant, second])
    expect(user?.id).toBe(id("msg_bbb"))
    expect(latestAssistant?.id).toBe(assistant.info.id)
  })

  test("latest finished assistant is the newest finished one", () => {
    const tool = msg("assistant", "msg_01", 1000, { finish: "tool-calls" })
    const done = msg("assistant", "msg_02", 2000, { finish: "stop" })
    const { assistant: latestAssistant, finished } = latest([tool, done])
    expect(latestAssistant?.id).toBe(id("msg_02"))
    expect(finished?.id).toBe(id("msg_02"))
  })

  test("same-millisecond ties fall back to id ordering", () => {
    const a = msg("user", "msg_aaa", 1000)
    const b = msg("user", "msg_bbb", 1000)
    const { user } = latest([a, b])
    expect(user?.id).toBe(id("msg_bbb"))
  })

  test("tasks only include parts on user messages newer than the finished assistant", () => {
    const older = msg("user", "msg_old", 500, { parts: [{ type: "subtask" }] })
    const assistant = msg("assistant", "msg_00c183739001", 2000, { finish: "stop" })
    const newer = msg("user", "msg_new", 3000, { parts: [{ type: "compaction" }] })
    const { tasks } = latest([older, assistant, newer])
    expect(tasks.map((t) => t.type)).toEqual(["compaction"])
  })
})
