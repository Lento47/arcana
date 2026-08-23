/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { CodeRenderable, RGBA, SyntaxStyle, type Renderable } from "@opentui/core"
import { MockTreeSitterClient } from "@opentui/core/testing"
import { testRender } from "@opentui/solid"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createSignal } from "solid-js"

const SOURCE = [
  "export function answer(): number {",
  "  return 42",
  "}",
].join("\n")

const syntaxStyle = SyntaxStyle.fromStyles({
  default: { fg: RGBA.fromHex("#ffffff") },
})

const spineProseSource = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/spine-prose.tsx"),
  "utf8",
)
const openTuiPatchSource = readFileSync(
  join(import.meta.dir, "../../../script/patch-opentui.ts"),
  "utf8",
)

function findCodeRenderable(root: Renderable, filetype: string): CodeRenderable | undefined {
  if (root instanceof CodeRenderable && root.filetype === filetype) return root
  return root.getChildren().map((child) => findCodeRenderable(child, filetype)).find(Boolean)
}

let app: Awaited<ReturnType<typeof testRender>> | undefined
let treeSitter: MockTreeSitterClient | undefined

afterEach(() => {
  treeSitter?.resolveAllHighlightOnce()
  treeSitter = undefined
  app?.renderer.destroy()
  app = undefined
})

test("read preview remains visible while Tree-sitter highlighting is pending", async () => {
  treeSitter = new MockTreeSitterClient()

  app = await testRender(
    () => (
      <code
        content={SOURCE}
        filetype="typescript"
        syntaxStyle={syntaxStyle}
        treeSitterClient={treeSitter}
        drawUnstyledText={true}
        width={72}
      />
    ),
    { width: 80, height: 12 },
  )
  await app.renderOnce()

  await app.waitFor(() => treeSitter?.isHighlighting() === true)
  expect(treeSitter.isHighlighting()).toBe(true)
  const pendingFrame = app.captureCharFrame()
  expect(pendingFrame).toContain("export function answer")
  expect(pendingFrame.split("export function answer")).toHaveLength(2)
  expect(spineProseSource).toMatch(
    /filetype=\{ft\(\)\}[\s\S]{0,300}drawUnstyledText=\{true\}/,
  )
})

test("streaming fenced code keeps its visible fallback across review updates", async () => {
  const initial = [
    "Reviewing the change:",
    "",
    "```typescript",
    SOURCE,
    "```",
    "",
    "Checking the first caller…",
    "",
    "Checking the second caller…",
    "",
    "Review still running…",
  ].join("\n")
  const completed = [
    "Reviewing the change:",
    "",
    "```typescript",
    SOURCE,
    "export const reviewed = true",
    "```",
    "",
    "Checking callers…",
    "",
    "Checking tests…",
    "",
    "Review still running…",
  ].join("\n")
  const [content, setContent] = createSignal(initial)
  treeSitter = new MockTreeSitterClient()

  app = await testRender(
    () => (
      <box width={72} height={16} flexDirection="column">
        <markdown
          content={content()}
          syntaxStyle={syntaxStyle}
          treeSitterClient={treeSitter}
          streaming={true}
          internalBlockMode="top-level"
          width={72}
        />
      </box>
    ),
    { width: 80, height: 16 },
  )
  await app.renderOnce()

  const code = findCodeRenderable(app.renderer.root, "typescript")
  expect(code).toBeDefined()
  expect(code?.drawUnstyledText).toBe(true)
  expect(code?.content).toContain("export function answer")

  setContent(completed)
  await app.renderOnce()

  expect(findCodeRenderable(app.renderer.root, "typescript")).toBe(code)
  expect(code?.drawUnstyledText).toBe(true)
  expect(code?.content).toContain("export const reviewed")
  expect(openTuiPatchSource).toContain("drawUnstyledText: true")
  expect(openTuiPatchSource).toContain("renderable.drawUnstyledText = true")
})
