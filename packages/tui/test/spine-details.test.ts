import { describe, expect, test } from "bun:test"
import type { SpineEntry } from "../src/shell/command-spine/spine-types"
import { spineEntryDetailMessageID, spineEntryDiffMessageID, spineEntrySessionID } from "../src/shell/command-spine/spine-details"

function entry(overrides: Partial<SpineEntry> = {}): SpineEntry {
  return {
    id: "detail-1",
    index: 1,
    elapsed: "+0s",
    kind: "plan",
    glyph: "├",
    summary: "inspect details",
    ...overrides,
  }
}

describe("command-spine details", () => {
  test("uses the source message id when present", () => {
    expect(spineEntryDetailMessageID(entry({ source: { kind: "tool", messageID: "msg_123", partID: "part_1" } }))).toBe("msg_123")
  })

  test("returns undefined when no message source exists", () => {
    expect(spineEntryDetailMessageID(entry())).toBeUndefined()
    expect(spineEntryDetailMessageID(undefined)).toBeUndefined()
  })

  test("diff detail requires both a diff artifact and message source", () => {
    const diff = { files: "src/app.tsx", stats: "+1 -1", body: "diff --git" }
    expect(spineEntryDiffMessageID(entry({ diff, source: { kind: "patch", messageID: "msg_diff" } }))).toBe("msg_diff")
    expect(spineEntryDiffMessageID(entry({ source: { kind: "patch", messageID: "msg_no_diff" } }))).toBeUndefined()
    expect(spineEntryDiffMessageID(entry({ diff }))).toBeUndefined()
  })

  test("session jump uses source session id when present", () => {
    expect(spineEntrySessionID(entry({ source: { kind: "agent", messageID: "msg_agent", sessionID: "child-session" } }))).toBe("child-session")
    expect(spineEntrySessionID(entry({ source: { kind: "agent", messageID: "msg_agent", sessionID: "" } }))).toBeUndefined()
    expect(spineEntrySessionID(entry())).toBeUndefined()
  })
})