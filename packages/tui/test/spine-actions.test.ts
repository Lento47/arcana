import { describe, expect, test } from "bun:test"
import type { SpineEntry } from "../src/shell/command-spine/spine-types"
import { spineFooterSelection } from "../src/shell/command-spine/spine-actions"

function entry(overrides: Partial<SpineEntry> = {}): SpineEntry {
  return {
    id: "entry-1",
    index: 3,
    elapsed: "+0s",
    kind: "patch",
    glyph: "├",
    summary: "files changed",
    ...overrides,
  }
}

describe("command-spine action hints", () => {
  test("shows base navigation actions when no entry is focused", () => {
    expect(spineFooterSelection(undefined)).toEqual({
      label: "spine",
      actions: ["j/k focus", "tab next", "enter toggle", "y copy"],
    })
  })

  test("builds focused patch action hints from entry capabilities", () => {
    const selected = spineFooterSelection(entry({
      diff: { files: "src/app.tsx", stats: "+1 -1", body: "diff --git" },
      source: { kind: "patch", messageID: "msg-1" },
    }))

    expect(selected.label).toBe("03 patch")
    expect(selected.actions).toEqual(["enter toggle", "d diff", "o details", "y copy"])
  })

  test("adds related session action for agent rows", () => {
    const selected = spineFooterSelection(entry({
      kind: "agent",
      index: 12,
      source: { kind: "agent", messageID: "msg-agent", sessionID: "child-session" },
    }))

    expect(selected.label).toBe("12 agent")
    expect(selected.actions).toContain("g session")
  })
})