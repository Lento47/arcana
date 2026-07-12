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
})