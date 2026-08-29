/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { CodeRenderable, RGBA, SyntaxStyle, type CapturedFrame, type Renderable } from "@opentui/core"
import { MockTreeSitterClient } from "@opentui/core/testing"
import { testRender } from "@opentui/solid"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createSignal } from "solid-js"
import { resolveProseMode } from "../src/shell/command-spine/spine-prose"

const SOURCE = ["export function answer(): number {", "  return 42", "}"].join("\n")

const syntaxStyle = SyntaxStyle.fromStyles({
  default: { fg: RGBA.fromHex("#ffffff") },
})
const highlightedSyntaxStyle = SyntaxStyle.fromStyles({
  default: { fg: RGBA.fromHex("#ffffff") },
  keyword: { fg: RGBA.fromHex("#ff5f87") },
})
const recoloredSyntaxStyle = SyntaxStyle.fromStyles({
  default: { fg: RGBA.fromHex("#ffffff") },
  keyword: { fg: RGBA.fromHex("#5fd7ff") },
})

const spineProseSource = readFileSync(join(import.meta.dir, "../src/shell/command-spine/spine-prose.tsx"), "utf8")
const openTuiPatchSource = readFileSync(join(import.meta.dir, "../../../script/patch-opentui.ts"), "utf8")

function findCodeRenderable(root: Renderable, filetype: string): CodeRenderable | undefined {
  if (root instanceof CodeRenderable && root.filetype === filetype) return root
  return root
    .getChildren()
    .map((child) => findCodeRenderable(child, filetype))
    .find(Boolean)
}

function findSpanContaining(frame: CapturedFrame, needle: string) {
  for (const line of frame.lines) {
    const span = line.spans.find((candidate) => candidate.text.includes(needle))
    if (span) return span
  }
  return undefined
}

function colorOf(span: ReturnType<typeof findSpanContaining>) {
  return span?.fg.toString()
}

let app: Awaited<ReturnType<typeof testRender>> | undefined
let treeSitter: MockTreeSitterClient | undefined

afterEach(() => {
  treeSitter?.resolveAllHighlightOnce()
  treeSitter = undefined
  app?.renderer.destroy()
  app = undefined
})

test("thought prose bypasses syntax highlighting and stays plain", () => {
  expect(resolveProseMode({ kind: "think", text: "**muted reasoning**" })).toBe("plain")
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
        drawUnstyledText={false}
        width={72}
      />
    ),
    { width: 80, height: 12 },
  )
  await app.renderOnce()

  // With drawUnstyledText={false}, the first frame is still visible
  // (Arcana's OpenTUI patch retains the last styled frame).
  const pendingFrame = app.captureCharFrame()
  expect(pendingFrame).toContain("export function answer")
  expect(pendingFrame.split("export function answer")).toHaveLength(2)
  expect(spineProseSource).toMatch(/filetype=\{ft\(\)\}[\s\S]{0,300}drawUnstyledText=\{false\}/)
})

test("retains the last styled frame while content and theme colors re-highlight", async () => {
  const initial = "export function answer(): number {"
  const next = "export const answer = 42"
  const [content, setContent] = createSignal(initial)
  const [style, setStyle] = createSignal(highlightedSyntaxStyle)
  treeSitter = new MockTreeSitterClient()
  treeSitter.setMockResult({ highlights: [[0, 6, "keyword"]] })

  app = await testRender(
    () => (
      <code
        content={content()}
        filetype="typescript"
        syntaxStyle={style()}
        treeSitterClient={treeSitter}
        drawUnstyledText={false}
        width={72}
      />
    ),
    { width: 80, height: 8 },
  )

  // The first frame is visible even when a caller opts out of the upstream
  // unstyled gate; Arcana only uses that gate as a first-frame fallback.
  await app.renderOnce()
  expect(app.captureCharFrame()).toContain(initial)
  await app.waitFor(() => treeSitter?.isHighlighting() === true)
  treeSitter.resolveHighlightOnce()
  await app.flush()
  await app.renderOnce()

  const styled = app.captureSpans()
  const styledSpan = findSpanContaining(styled, "export")
  expect(styledSpan).toBeDefined()
  const initialColor = colorOf(styledSpan)
  expect(initialColor).toBeDefined()

  // Content and syntax style updates happen before their asynchronous
  // highlight completes. The old text/color frame must remain intact.
  setContent(next)
  setStyle(recoloredSyntaxStyle)
  await app.renderOnce()
  const pending = app.captureSpans()
  expect(app.captureCharFrame()).toContain(initial)
  expect(colorOf(findSpanContaining(pending, "export"))).toBe(initialColor)

  await app.waitFor(() => treeSitter?.isHighlighting() === true)
  treeSitter.resolveHighlightOnce()
  await app.flush()
  await app.renderOnce()
  const recolored = app.captureSpans()
  expect(app.captureCharFrame()).toContain(next)
  const recoloredColor = colorOf(findSpanContaining(recolored, "export"))
  expect(recoloredColor).toBeDefined()
  expect(recoloredColor).not.toBe(initialColor)
})

test("retains the last styled frame when a refresh fails", async () => {
  const initial = "const stable = true"
  const next = "const changed = false"
  const pending: Array<{
    resolve: (value: { highlights: any[] }) => void
    reject: (error: Error) => void
  }> = []
  const treeSitterClient = {
    highlightOnce: () => new Promise<{ highlights: any[] }>((resolve, reject) => pending.push({ resolve, reject })),
  }
  const [content, setContent] = createSignal(initial)

  app = await testRender(
    () => (
      <code
        content={content()}
        filetype="typescript"
        syntaxStyle={highlightedSyntaxStyle}
        treeSitterClient={treeSitterClient as any}
        drawUnstyledText={true}
        width={72}
      />
    ),
    { width: 80, height: 8 },
  )
  await app.renderOnce()
  pending.shift()?.resolve({ highlights: [[0, 5, "keyword"]] })
  await app.flush()
  await app.renderOnce()
  const styled = app.captureSpans()
  const styledColor = colorOf(findSpanContaining(styled, "const"))
  expect(styledColor).toBeDefined()

  setContent(next)
  await app.renderOnce()
  expect(app.captureCharFrame()).toContain(initial)
  expect(colorOf(findSpanContaining(app.captureSpans(), "const"))).toBe(styledColor)

  pending.shift()?.reject(new Error("synthetic highlight failure"))
  await app.flush()
  await app.renderOnce()
  expect(app.captureCharFrame()).toContain(initial)
  expect(colorOf(findSpanContaining(app.captureSpans(), "const"))).toBe(styledColor)
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
  expect(code?.drawUnstyledText).toBe(false)
  expect(code?.content).toContain("export function answer")

  setContent(completed)
  await app.renderOnce()

  expect(findCodeRenderable(app.renderer.root, "typescript")).toBe(code)
  expect(code?.drawUnstyledText).toBe(false)
  expect(code?.content).toContain("export const reviewed")
  expect(openTuiPatchSource).toContain("retain last styled code frame")
  expect(openTuiPatchSource).toContain("chunk-node-")
  expect(openTuiPatchSource).toContain("drawUnstyledText: false")
  expect(openTuiPatchSource).toContain("renderable.drawUnstyledText = false")
  expect(openTuiPatchSource).toContain("stale highlight result does not schedule a redundant render")
  expect(openTuiPatchSource).toContain("this._highlightSnapshotId")
})
