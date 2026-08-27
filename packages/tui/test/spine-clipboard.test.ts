import { describe, expect, test } from "bun:test"
import type { SpineEntry } from "../src/shell/command-spine/spine-types"
import { spineEntryCopyText } from "../src/shell/command-spine/spine-clipboard"

function entry(overrides: Partial<SpineEntry> = {}): SpineEntry {
  return {
    id: "copy-1",
    index: 1,
    elapsed: "+0s",
    kind: "patch",
    actor: "arcana",
    glyph: "├",
    summary: "files changed 1",
    ...overrides,
  }
}

describe("command-spine clipboard", () => {
  test("copies compact entry receipt text", () => {
    const text = spineEntryCopyText(entry({ body: "short body" }))
    expect(text).toContain("patch · arcana · files changed 1")
    expect(text).toContain("short body")
  })

  test("includes receipt files and diff artifact", () => {
    const text = spineEntryCopyText(entry({
      receipt: {
        label: "patch",
        status: "ok",
        files: [{ path: "src/app.tsx", added: 3, removed: 1 }],
      },
      diff: {
        files: "src/app.tsx",
        stats: "+3 -1",
        body: "diff --git a/src/app.tsx b/src/app.tsx",
      },
    }))

    expect(text).toContain("src/app.tsx +3 -1")
    expect(text).toContain("diff --git")
  })

  test("activity reels copy every original child in order", () => {
    const text = spineEntryCopyText(entry({
      id: "activity:turn-1",
      kind: "think",
      label: "work",
      summary: "3 steps · 2 tools · 1 thought",
      activity: { type: "work", turnID: "turn-1", childCount: 3 },
      children: [
        entry({ id: "think-1", kind: "think", summary: "Planning", body: "reasoning" }),
        entry({ id: "run-1", kind: "run", summary: "bun test", receipt: { label: "run", status: "ok" } }),
        entry({ id: "patch-1", kind: "patch", summary: "src/app.tsx", diff: { files: "src/app.tsx", stats: "+1 -1", body: "@@ patch" } }),
      ],
    }))

    expect(text.indexOf("think · arcana · Planning")).toBeGreaterThanOrEqual(0)
    expect(text.indexOf("run · arcana · bun test")).toBeGreaterThan(text.indexOf("Planning"))
    expect(text.indexOf("patch · arcana · src/app.tsx")).toBeGreaterThan(text.indexOf("bun test"))
    expect(text).toContain("reasoning")
    expect(text).toContain("@@ patch")
  })
})
