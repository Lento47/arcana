/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { RGBA, SyntaxStyle, getTreeSitterClient, type CapturedFrame, type TreeSitterClient } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { createSignal } from "solid-js"
import { SpineProse } from "../src/shell/command-spine/spine-prose"
import { TestTuiProviders } from "./fixture/tui-providers"

/**
 * Real-parser style stability. The audit that produced these tests measured the
 * flicker frame by frame: a markdown heading painted white on its first frame
 * and flipped to bold+colour 1-2 frames later when the worker commit landed
 * (same for blockquotes, and code leaves flashed plain -> coloured). The patch
 * suite now paints block styles synchronously and holds a warm code leaf's
 * first paint until its commit, so an element is styled the first time it
 * becomes visible and never restyles afterwards.
 */
const headingColor = "#5fd7ff"
const quoteColor = "#808080"
const keywordColor = "#ff5f87"

const syntax = SyntaxStyle.fromStyles({
  default: { fg: RGBA.fromHex("#ffffff") },
  "markup.heading.1": { fg: RGBA.fromHex(headingColor), bold: true },
  "markup.quote": { fg: RGBA.fromHex(quoteColor), italic: true },
  "markup.raw": { fg: RGBA.fromHex("#ffd75f") },
  keyword: { fg: RGBA.fromHex(keywordColor) },
})

const WARM_SAMPLE: Record<string, string> = {
  markdown: "# warm\n\ntext with `code`",
  typescript: "const warm = 1",
}

function realClient(): TreeSitterClient {
  const bag = ((globalThis as any)[Symbol.for("@opentui/core/singleton")] ??= {})
  delete bag["tree-sitter-client"]
  return getTreeSitterClient()
}

async function prepare(filetypes: string[]) {
  const client = realClient()
  await client.initialize()
  const warm = ((client as unknown as { _arcanaWarmFiletypes?: Set<string> })._arcanaWarmFiletypes ??= new Set())
  for (const filetype of filetypes) {
    if (await client.preloadParser(filetype)) {
      warm.add(filetype)
      // Compile once so the first real request in a test is a warm round-trip.
      await client.highlightOnce(WARM_SAMPLE[filetype] ?? "warm", filetype).catch(() => {})
    }
  }
  return client
}

function findSpan(frame: CapturedFrame, needle: string) {
  for (const line of frame.lines) {
    const span = line.spans.find((candidate) => candidate.text.includes(needle))
    if (span) return span
  }
  return undefined
}

const colorOf = (frame: CapturedFrame, needle: string) => findSpan(frame, needle)?.fg?.toString()
const attrsOf = (frame: CapturedFrame, needle: string) => findSpan(frame, needle)?.attributes

/** Render until `needle` is on screen, then return that frame. */
async function firstFrameWith(needle: string, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    await app!.renderOnce()
    const frame = app!.captureSpans()
    if (findSpan(frame, needle)) return frame
    await Bun.sleep(5)
  }
  return undefined
}

let app: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  app?.renderer.destroy()
  app = undefined
})

test("headings and blockquotes paint their block styles before any worker result", async () => {
  // A worker that never answers: the frame under test is exactly the
  // synchronous one, so a missing block style cannot be masked by a later
  // highlight commit.
  const stub = { highlightOnce: () => new Promise<never>(() => {}) }
  app = await testRender(
    () => (
      <markdown
        width={56}
        content={"# Heading one\n\n> quoted line here\n\nDone."}
        syntaxStyle={syntax}
        treeSitterClient={stub as never}
        streaming={true}
        internalBlockMode="top-level"
        conceal={true}
      />
    ),
    { width: 60, height: 12 },
  )

  const first = await firstFrameWith("Heading one")
  expect(first).toBeDefined()
  expect(colorOf(first!, "Heading one")).toBe(RGBA.fromHex(headingColor).toString())
  expect(attrsOf(first!, "Heading one")).toBe(1)
  expect(colorOf(first!, "quoted line")).toBe(RGBA.fromHex(quoteColor).toString())
  expect(attrsOf(first!, "quoted line")).toBe(4)
})

test("block styles stay identical once the real parser commits", async () => {
  const client = await prepare(["markdown"])
  app = await testRender(
    () => (
      <markdown
        width={56}
        content={"# Heading one\n\n> quoted line here\n\nDone."}
        syntaxStyle={syntax}
        treeSitterClient={client}
        streaming={true}
        internalBlockMode="top-level"
        conceal={true}
      />
    ),
    { width: 60, height: 12 },
  )

  const sample = () => {
    const frame = app!.captureSpans()
    return {
      head: `${colorOf(frame, "Heading one")}|${attrsOf(frame, "Heading one")}`,
      quote: `${colorOf(frame, "quoted line")}|${attrsOf(frame, "quoted line")}`,
    }
  }

  const baselineFrame = await firstFrameWith("Heading one")
  expect(baselineFrame).toBeDefined()
  const baseline = sample()
  expect(baseline.head).toBe(`${RGBA.fromHex(headingColor).toString()}|1`)
  expect(baseline.quote).toBe(`${RGBA.fromHex(quoteColor).toString()}|4`)

  // Let the worker commit (and re-commit) land; nothing may change.
  for (let i = 0; i < 25; i++) {
    await app.renderOnce()
    await Bun.sleep(15)
    expect(sample(), `frame ${i}`).toEqual(baseline)
  }
})

test("a warm code leaf's first visible frame is already styled", async () => {
  const client = await prepare(["typescript"])
  const source = "export function answer(): number {\n  return 42\n}"
  app = await testRender(
    () => (
      <code
        content={source}
        filetype="typescript"
        syntaxStyle={syntax}
        treeSitterClient={client}
        drawUnstyledText={false}
        width={56}
      />
    ),
    { width: 60, height: 10 },
  )

  // The body's FIRST appearance must be the styled one. A plain white frame
  // here is the flash this test exists to stop.
  const first = await firstFrameWith("export")
  expect(first).toBeDefined()
  expect(colorOf(first!, "export")).toBe(RGBA.fromHex(keywordColor).toString())
})

test("updates after the first styled frame stay visible on every frame", async () => {
  const client = await prepare(["typescript"])
  const [content, setContent] = createSignal("export const first = 1")
  app = await testRender(
    () => (
      <code
        content={content()}
        filetype="typescript"
        syntaxStyle={syntax}
        treeSitterClient={client}
        drawUnstyledText={false}
        width={56}
      />
    ),
    { width: 60, height: 10 },
  )

  const keyword = RGBA.fromHex(keywordColor).toString()
  const styled = await firstFrameWith("export")
  expect(styled).toBeDefined()
  expect(colorOf(styled!, "export")).toBe(keyword)

  for (const next of ["export const second = 2", "export const third = 3", "export const fourth = 4"]) {
    setContent(next)
    for (let frame = 0; frame < 8; frame++) {
      await app.renderOnce()
      // Retention keeps the previous styled frame until the commit lands; the
      // body is never blank and never drops back to the plain text buffer.
      expect(colorOf(app.captureSpans(), "export"), `${next} frame ${frame}`).toBe(keyword)
      await Bun.sleep(10)
    }
  }
})

test("a filetype without a parser keeps the plain first frame (no hold, no blank)", async () => {
  const client = await prepare([])
  app = await testRender(
    () => (
      <code
        content={'fn main() { println!("hi"); }'}
        filetype="rust"
        syntaxStyle={syntax}
        treeSitterClient={client}
        drawUnstyledText={false}
        width={56}
      />
    ),
    { width: 60, height: 10 },
  )
  const first = await firstFrameWith("fn main")
  expect(first).toBeDefined()
})

/**
 * Emphasis is parser syntax, not Arcana's to flatten: the markdown source must
 * reach the renderable with its `**`/`*`/`~~` pairs intact so bold, italic and
 * strikethrough render for real. Both frames (synchronous first paint and the
 * worker commit) conceal the delimiters and apply the same markup groups, so
 * restoring the semantics must not reintroduce a style flip.
 */
const EMPHASIS = "plain **bold** and *italic* and ~~strike~~ tail"

test("complete emphasis is styled and concealed on the first frame", async () => {
  // A worker that never answers: the frame under test is exactly the
  // synchronous one, so a missing emphasis style cannot be masked by a commit.
  const bag = ((globalThis as any)[Symbol.for("@opentui/core/singleton")] ??= {})
  bag["tree-sitter-client"] = {
    highlightOnce: () => new Promise<never>(() => {}),
    // The renderer's teardown destroys the singleton; the stub must survive it.
    destroy: async () => {},
    initialize: async () => {},
  }
  app = await testRender(
    () => (
      <TestTuiProviders>
        <box width="100%" height="100%">
          <SpineProse kind="ok" text={EMPHASIS} bodyLabel="arcana" contentWidth={110} />
        </box>
      </TestTuiProviders>
    ),
    { width: 120, height: 12 },
  )

  const first = await firstFrameWith("bold")
  expect(first).toBeDefined()
  const frame = app.captureCharFrame()
  // Markers are concealed by the synchronous frame, never rendered as text.
  expect(frame).not.toContain("**")
  expect(frame).not.toContain("~~")
  // And the styles are real: bold + italic attributes, strikethrough present.
  expect(attrsOf(first!, "bold")).toBe(1)
  expect(attrsOf(first!, "italic")).toBe(4)
  expect(findSpan(first!, "strike")).toBeDefined()
})

test("emphasis styles are identical before and after the real worker commit", async () => {
  await prepare(["markdown"])
  app = await testRender(
    () => (
      <TestTuiProviders>
        <box width="100%" height="100%">
          <SpineProse kind="ok" text={EMPHASIS} bodyLabel="arcana" contentWidth={110} />
        </box>
      </TestTuiProviders>
    ),
    { width: 120, height: 12 },
  )

  const baselineFrame = await firstFrameWith("bold")
  expect(baselineFrame).toBeDefined()
  const sample = () => {
    const frame = app!.captureSpans()
    return [
      `${colorOf(frame, "bold")}|${attrsOf(frame, "bold")}`,
      `${colorOf(frame, "italic")}|${attrsOf(frame, "italic")}`,
      `${colorOf(frame, "strike")}|${attrsOf(frame, "strike")}`,
    ].join("~")
  }
  const baseline = sample()

  // The commit must not restyle what the synchronous frame painted.
  for (let i = 0; i < 25; i++) {
    await app.renderOnce()
    await Bun.sleep(15)
    expect(sample(), `frame ${i}`).toBe(baseline)
  }
  const settled = app.captureCharFrame()
  expect(settled).not.toContain("**")
  expect(settled).not.toContain("~~")
})
