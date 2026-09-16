/** @jsxImportSource @opentui/solid */
/**
 * The workspace recovery dialogs, rendered.
 *
 * Both are reached from the same broken path in `dialog-move-session.tsx`: the
 * server refuses a delete with `forceRequired`, and the operator is asked how to
 * proceed. Two contracts are pinned here.
 *
 * The action verbs belong to the brand layer — these two dialogs had kept a
 * private literal map, so a copy change would have skipped them.
 *
 * And the diff pane must never render as a blank box. `vcs.status` is allowed
 * to fail there (`status?.data ?? []`), so the dialog can be opened with zero
 * rows on a force-required delete: an empty pane reads as "still loading" when
 * the truth is "there is nothing to list", so the empty state names it.
 */
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { onMount } from "solid-js"
import { testRender } from "@opentui/solid"
import type { VcsFileStatus } from "@arcana/sdk/v2"
import { useDialog } from "../src/ui/dialog"
import { DialogWorkspaceUnavailable } from "../src/component/dialog-workspace-unavailable"
import { DialogWorkspaceFileChanges } from "../src/component/dialog-workspace-file-changes"
import { COPY } from "../src/branding"
import { TestTuiProviders } from "./fixture/tui-providers"

const FILES: VcsFileStatus[] = [
  { file: "src/index.ts", additions: 12, deletions: 3, status: "modified" },
  { file: "src/new.ts", additions: 5, deletions: 0, status: "added" },
]

function UnavailableOpener() {
  const dialog = useDialog()
  onMount(() => {
    dialog.replace(() => <DialogWorkspaceUnavailable onRestore={() => true} />)
  })
  return null
}

function FileChangesOpener(props: { files: VcsFileStatus[] }) {
  const dialog = useDialog()
  onMount(() => {
    dialog.replace(() => (
      <DialogWorkspaceFileChanges
        files={props.files}
        title="Delete working copy?"
        message="This working copy has file changes. Do you want to delete it anyway?"
        onSelect={() => {}}
      />
    ))
  })
  return null
}

/** Render a dialog through the real provider chain and return its settled frame. */
async function capture(node: () => unknown, marker: string): Promise<string[]> {
  const app = await testRender(() => <TestTuiProviders>{node() as never}</TestTuiProviders>, {
    width: 100,
    height: 40,
  })
  try {
    let lines: string[] = []
    for (let attempt = 0; attempt < 80; attempt++) {
      await Bun.sleep(15)
      await app.renderOnce()
      await app.flush()
      await app.renderOnce()
      lines = app.captureCharFrame().split("\n")
      if (lines.some((line) => line.includes(marker))) break
    }
    return lines.map((line) => line.replace(/\s+$/, ""))
  } finally {
    app.renderer.destroy()
  }
}

test("the unavailable-workspace dialog takes both verbs from the brand layer", async () => {
  const lines = await capture(() => <UnavailableOpener />, "Workspace Unavailable")
  const frame = lines.join("\n")
  expect(frame).toContain("Workspace Unavailable")
  expect(frame).toContain(COPY.dialog.cancel)
  expect(frame).toContain(COPY.dialog.restore)
})

test("the file-changes dialog labels its choice with the brand layer's yes/no", async () => {
  const lines = await capture(() => <FileChangesOpener files={FILES} />, "Delete working copy?")
  const frame = lines.join("\n")
  expect(frame).toContain(COPY.dialog.yes)
  expect(frame).toContain(COPY.dialog.no)
  // The rows are present, so the empty state must not have taken over.
  expect(frame).not.toContain(COPY.dialog.noFileChanges)
})

test("a force-required delete with no rows says so instead of rendering a blank pane", async () => {
  const lines = await capture(() => <FileChangesOpener files={[]} />, COPY.dialog.noFileChanges)
  const frame = lines.join("\n")
  // The prompt still renders — the operator can still answer it.
  expect(frame).toContain("Delete working copy?")
  expect(frame).toContain(COPY.dialog.noFileChanges)
  expect(frame).toContain(COPY.dialog.yes)
  // The empty state is the pane's only content: no stray file rows.
  expect(lines.filter((line) => line.includes(COPY.dialog.noFileChanges))).toHaveLength(1)
})

test("the workspace dialogs read their verbs from branding, not from literals", () => {
  const read = (rel: string) => readFileSync(join(import.meta.dir, "../src/component", rel), "utf8")
  const unavailable = read("dialog-workspace-unavailable.tsx")
  const fileChanges = read("dialog-workspace-file-changes.tsx")
  for (const [source, key] of [
    [unavailable, "COPY.dialog.cancel"],
    [unavailable, "COPY.dialog.restore"],
    [fileChanges, "COPY.dialog.no"],
    [fileChanges, "COPY.dialog.yes"],
    [fileChanges, "COPY.dialog.noFileChanges"],
  ] as const) {
    expect(source).toContain(key)
  }
})
