import { describe, expect, test } from "bun:test"
import type { SpineEntry } from "../src/shell/command-spine/spine-types"
import { spineEntryDetailMessageID } from "../src/shell/command-spine/spine-details"

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
})