/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { afterEach, describe, expect, test } from "bun:test"
import { KVContext } from "../src/context/kv"
import { ThemeProvider } from "../src/context/theme"
import { ToastProvider } from "../src/ui/toast"
import { TuiConfigProvider } from "../src/config"
import {
  HOME_BACKDROP_SCENES,
  HOME_DITHER_GLYPHS,
  buildHomeDitherChunks,
  HomeBackdropDither,
  homeDitherCells,
  homeDitherRowStrength,
  selectHomeScene,
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
const DITHER_GLYPHS = HOME_DITHER_GLYPHS

function stripDitherGlyphs(value: string) {
  return DITHER_GLYPHS.reduce((result, glyph) => result.replaceAll(glyph, " "), value)
}

function brailleDots(chunks: ReturnType<typeof buildHomeDitherChunks>) {
  return chunks.reduce((total, chunk) => {
    const codePoint = chunk.fg ? (chunk.text.codePointAt(0) ?? 0) : 0
    if (codePoint < 0x2800 || codePoint > 0x28ff) return total
    let mask = codePoint - 0x2800
    let dots = 0
    while (mask > 0) {
      dots += mask & 1
      mask >>>= 1
    }
    return total + dots
  }, 0)
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
                <HomeBackdropDither seed={0x13579bdf} scene="fortress" />
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

  test("keeps the dot raster deterministic and bounded", () => {
    const first = homeDitherCells(160, 50, { seed: 0x13579bdf, scene: "fortress" })
    const second = homeDitherCells(160, 50, { seed: 0x13579bdf, scene: "fortress" })

    expect(first).toEqual(second)
    // One cell can emit at most once, and the dithered scene is far denser
    // than the old hashed watermark.
    expect(first.length).toBeLessThanOrEqual(160 * 50)
    expect(first.length).toBeGreaterThan(600)
    expect(first.every((cell) => cell.x >= 0 && cell.x < 160 && cell.y >= 0 && cell.y < 50)).toBe(true)
    expect(first.every((cell) => cell.mask > 0 && cell.mask < 256)).toBe(true)
    expect(first.every((cell) => cell.strength > 0 && cell.strength <= 1)).toBe(true)
    expect(first.every((cell) => cell.tone > 0 && cell.tone <= 1)).toBe(true)
    expect(first.every((cell) => cell.shade > 0 && cell.shade <= 1)).toBe(true)
    expect(first.every((cell) => cell.definition >= 0 && cell.definition <= 1)).toBe(true)
    expect(first.some((cell) => cell.definition > 0.18)).toBe(true)
    expect(first.every((cell) => cell.variant >= 0 && cell.variant < 1)).toBe(true)
    // The scene lives in the upper band; the faded prompt rows stay sparse.
    expect(first.filter((cell) => cell.y < 12).length).toBeGreaterThan(first.filter((cell) => cell.y >= 30).length)
    expect(first).not.toEqual(homeDitherCells(160, 50, { seed: 0x2468ace0, scene: "fortress" }))
  })

  test("keeps the logo and prompt quiet zones clear", () => {
    for (const scene of HOME_BACKDROP_SCENES) {
      const cells = homeDitherCells(160, 50, { seed: 0x13579bdf, scene: scene.id })
      const insideLogo = cells.filter((cell) => {
        const x = (cell.x + 0.5) / 160
        const y = (cell.y + 0.5) / 50
        return x > 0.31 && x < 0.69 && y > 0.27 && y < 0.64
      })
      const insidePrompt = cells.filter((cell) => {
        const x = (cell.x + 0.5) / 160
        const y = (cell.y + 0.5) / 50
        return x > 0.19 && x < 0.81 && y > 0.71 && y < 0.97
      })
      expect(insideLogo).toHaveLength(0)
      expect(insidePrompt).toHaveLength(0)
    }
  })

  test("selects only authored environments and changes by seed", () => {
    expect(HOME_BACKDROP_SCENES).toHaveLength(6)
    expect(new Set(HOME_BACKDROP_SCENES.map((scene) => scene.id)).size).toBe(HOME_BACKDROP_SCENES.length)
    expect(selectHomeScene(0).id).toBe(HOME_BACKDROP_SCENES[0]?.id)
    expect(selectHomeScene(1).id).toBe(HOME_BACKDROP_SCENES[1]?.id)
    expect(selectHomeScene(0xffffffff).id).toBe(HOME_BACKDROP_SCENES[0xffffffff % HOME_BACKDROP_SCENES.length]?.id)
    expect(selectHomeScene(0x13579bdf)).not.toEqual(selectHomeScene(0x2468ace0))
  })

  test("emits only low-contrast background mesh glyphs", () => {
    const chunks = buildHomeDitherChunks(80, 24, undefined, undefined, {
      seed: 0x13579bdf,
      scene: "fortress",
    })
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
    expect(new Set(glyphs).size).toBeGreaterThanOrEqual(3)
    // The raster is dithered at braille dot resolution, so a cell carries
    // several independent halftone dots instead of a single hashed glyph.
    expect(brailleDots(chunks)).toBeGreaterThan(glyphs.length * 2)
    expect(
      chunks
        .filter((chunk) => chunk.fg)
        // OpenTUI stores channel values as bytes, so 0.3 may round to 77/255.
        .every((chunk) => typeof chunk.fg?.a === "number" && chunk.fg.a > 0 && chunk.fg.a <= 0.31),
    ).toBe(true)
    expect(chunks.filter((chunk) => chunk.fg).every((chunk) => !chunk.bg)).toBe(true)

    const allSceneGlyphs = new Set(
      HOME_BACKDROP_SCENES.flatMap((scene) =>
        buildHomeDitherChunks(80, 24, undefined, undefined, { seed: 0x13579bdf, scene: scene.id })
          .filter((chunk) => chunk.fg)
          .map((chunk) => chunk.text),
      ),
    )
    expect(allSceneGlyphs.has("-")).toBe(true)
    expect(allSceneGlyphs.has("+")).toBe(true)
    expect(allSceneGlyphs.has("x")).toBe(true)
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
