/** @jsxImportSource @opentui/solid */
import { RGBA } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { afterEach, describe, expect, test } from "bun:test"
import { KVContext } from "../src/context/kv"
import { ThemeProvider } from "../src/context/theme"
import { ToastProvider } from "../src/ui/toast"
import { TuiConfigProvider } from "../src/config"
import {
  buildHomeDitherChunks,
  HomeBackdropDither,
  homeDitherCells,
  homeDitherRowStrength,
} from "../src/component/home-backdrop-dither"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"

const kv = {
  ready: true,
  store: {},
  get(key: string, fallback?: unknown) {
    return key === "animations_enabled" ? true : fallback
  },
  set() {},
  signal<T>(_name: string, fallback: T) {
    return [() => fallback, () => {}] as const
  },
}

let app: Awaited<ReturnType<typeof testRender>> | undefined
const DITHER_GLYPHS = ["·", ":", "+", "-", "x"] as const

function stripDitherGlyphs(value: string) {
  return DITHER_GLYPHS.reduce((result, glyph) => result.replaceAll(glyph, " "), value)
}

afterEach(() => {
  app?.renderer.destroy()
  app = undefined
})

function Harness() {
  return (
    <TestTuiContexts>
      <TuiConfigProvider config={createTuiResolvedConfig()}>
        <KVContext.Provider value={kv as any}>
          <ToastProvider>
            <ThemeProvider mode="dark">
              <box width="100%" height="100%" position="relative">
                <HomeBackdropDither />
                <text>stable Home content</text>
              </box>
            </ThemeProvider>
          </ToastProvider>
        </KVContext.Provider>
      </TuiConfigProvider>
    </TestTuiContexts>
  )
}

describe("Home backdrop dither", () => {
  test("is static and fades monotonically from top to bottom", () => {
    const first = homeDitherCells(80, 24)
    const second = homeDitherCells(80, 24)

    expect(homeDitherRowStrength(24, 0)).toBe(1)
    expect(homeDitherRowStrength(24, 0)).toBeGreaterThan(homeDitherRowStrength(24, 12))
    expect(homeDitherRowStrength(24, 12)).toBeGreaterThan(homeDitherRowStrength(24, 23))
    expect(first).toEqual(second)
  })

  test("keeps the mesh deterministic and bounded", () => {
    const first = homeDitherCells(160, 50)
    const second = homeDitherCells(160, 50)

    expect(first).toEqual(second)
    expect(first.length).toBeLessThanOrEqual(2048)
    expect(first.every((cell) => cell.x >= 0 && cell.x < 160 && cell.y >= 0 && cell.y < 50)).toBe(true)
    expect(first.every((cell) => cell.strength > 0 && cell.strength <= 1)).toBe(true)
  })

  test("emits only low-contrast background mesh glyphs", () => {
    const chunks = buildHomeDitherChunks(80, 24)
    const text = chunks.map((chunk) => chunk.text).join("")
    const glyphs = chunks.filter((chunk) => chunk.fg).map((chunk) => chunk.text)

    expect(
      text
        .replaceAll(" ", "")
        .replaceAll("\n", "")
        .split("")
        .every((char) => DITHER_GLYPHS.includes(char as (typeof DITHER_GLYPHS)[number])),
    ).toBe(true)
    expect(glyphs.length).toBeGreaterThan(0)
    expect(new Set(glyphs)).toEqual(new Set(DITHER_GLYPHS))
    expect(
      chunks
        .filter((chunk) => chunk.fg)
        .every((chunk) => chunk.fg instanceof RGBA && chunk.fg.a > 0 && chunk.fg.a <= 0.27),
    ).toBe(true)
    expect(chunks.filter((chunk) => chunk.fg).every((chunk) => !chunk.bg)).toBe(true)
  })

  test("stays behind Home content and settles without leaving visible text", async () => {
    app = await testRender(() => <Harness />, { width: 80, height: 24 })
    for (let attempt = 0; attempt < 40; attempt++) {
      await app.renderOnce()
      if (stripDitherGlyphs(app.captureCharFrame()).includes("stable Home content")) break
      await Bun.sleep(10)
    }
    expect(stripDitherGlyphs(app.captureCharFrame())).toContain("stable Home content")

    // The dither renderable is behind the route content, so its glyphs never
    // replace Home text. A second render is byte-for-byte stable.
    const firstFrame = app.captureCharFrame()
    const firstSpans = app.captureSpans().lines
      .map((line) => line.spans.map((span) => `${span.text}|${span.fg.toString()}|${span.bg.toString()}`).join(""))
      .join("\n")
    const hasDitherInk = app.captureSpans().lines
      .flatMap((line) => line.spans)
      .some((span) => DITHER_GLYPHS.some((glyph) => span.text.includes(glyph)))
    await app.renderOnce()
    const secondFrame = app.captureCharFrame()
    const secondSpans = app.captureSpans().lines
      .map((line) => line.spans.map((span) => `${span.text}|${span.fg.toString()}|${span.bg.toString()}`).join(""))
      .join("\n")
    expect(stripDitherGlyphs(app.captureCharFrame())).toContain("stable Home content")
    expect(hasDitherInk).toBe(true)
    expect(secondFrame).toBe(firstFrame)
    expect(secondSpans).toBe(firstSpans)
  })
})
