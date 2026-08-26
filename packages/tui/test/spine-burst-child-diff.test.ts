import { expect, test } from "bun:test"
import { toSpineEntryView } from "../src/shell/command-spine/spine-entry-view"
import type { SpineEntry } from "../src/shell/command-spine/spine-types"

function patchEntry(overrides: Partial<SpineEntry> = {}): SpineEntry {
  return {
    id: "m1:p1",
    index: 0,
    elapsed: "+1ms",
    kind: "patch",
    label: "edit",
    glyph: "e",
    summary: "1 file · +4 -0 · diff",
    diff: { files: "src/foo.ts", stats: "+4 -0", body: "--- a\n+++ b\n@@ -1,2 +1,3 @@\n+line" },
    source: { messageID: "m1", partID: "p1", kind: "tool" },
    ...overrides,
  }
}

// Regression: burst parents flatten children through childView(), which mapped
// only entry.body — patch entries keep their text in entry.diff.body, so every
// edit after the first rendered stats-only and looked unexpandable.
test("burst children keep their diff body through the view projection", () => {
  const parent: SpineEntry = {
    id: "m1:burst",
    index: 0,
    elapsed: "+9ms",
    kind: "patch",
    label: "edit",
    glyph: "e",
    summary: "1 file · +40 -0 · diff · 3 actions",
    receipt: { label: "edit", status: "ok", summary: "3 actions" },
    collapsible: true,
    expandedByDefault: false,
    children: [
      patchEntry({ id: "m1:c1", diff: { files: "a.ts", stats: "+1 -0", body: "+one" } }),
      patchEntry({ id: "m1:c2", body: "plain output only", diff: undefined }),
      patchEntry({ id: "m1:c3", diff: undefined }),
    ],
  }
  const view = toSpineEntryView(parent, { layout: { width: 100 } as never })
  const children = (view as { children?: Array<{ body?: string; bodyLabel?: string }> }).children ?? []
  expect(children).toHaveLength(3)
  // Diff-only child falls back to diff.body so expanded bursts render it inline.
  expect(children[0]!.body).toBe("+one")
  expect(children[0]!.bodyLabel).toBe("diff")
  // Plain-body child passes through untouched; empty child fabricates nothing.
  expect(children[1]!.body).toBe("plain output only")
  expect(children[2]!.body).toBeUndefined()
})
