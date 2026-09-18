import { describe, expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { RGBA, type TerminalColors } from "@opentui/core"
import {
  DEFAULT_THEMES,
  THEME_MONOCHROME,
  addTheme,
  allThemes,
  hasTheme,
  monochromeColor,
  resolveTheme,
  selectedForeground,
  terminalMode,
  type Theme,
} from "../src/theme"
import { rgbaToHsl } from "../src/theme/contrast"
import { discoverThemes } from "../src/context/theme"
import { tmpdir } from "./fixture/fixture"

test("addTheme writes into module theme store", () => {
  const name = `plugin-theme-${Date.now()}`
  expect(addTheme(name, DEFAULT_THEMES.arcana)).toBe(true)
  expect(allThemes()[name]).toBeDefined()
})

test("addTheme keeps first theme for duplicate names", () => {
  const name = `plugin-theme-keep-${Date.now()}`
  const one = structuredClone(DEFAULT_THEMES.arcana)
  const two = structuredClone(DEFAULT_THEMES.arcana)
  one.theme.primary = "#101010"
  two.theme.primary = "#fefefe"

  expect(addTheme(name, one)).toBe(true)
  expect(addTheme(name, two)).toBe(false)
  expect(allThemes()[name]!.theme.primary).toBe("#101010")
})

test("addTheme ignores entries without a theme object", () => {
  const name = `plugin-theme-invalid-${Date.now()}`
  expect(addTheme(name, { defs: { a: "#ffffff" } })).toBe(false)
  expect(allThemes()[name]).toBeUndefined()
})

test("hasTheme checks theme presence", () => {
  const name = `plugin-theme-has-${Date.now()}`
  expect(hasTheme(name)).toBe(false)
  expect(addTheme(name, DEFAULT_THEMES.arcana)).toBe(true)
  expect(hasTheme(name)).toBe(true)
})

test("resolveTheme rejects circular color refs", () => {
  const item = structuredClone(DEFAULT_THEMES.arcana)
  item.defs = { ...item.defs, one: "two", two: "one" }
  item.theme.primary = "one"
  expect(() => resolveTheme(item, "dark")).toThrow("Circular color reference")
})

function terminalColors(defaultBackground: string | null, palette: Array<string | null> = []): TerminalColors {
  return {
    palette,
    defaultForeground: null,
    defaultBackground,
    cursorColor: null,
    mouseForeground: null,
    mouseBackground: null,
    tekForeground: null,
    tekBackground: null,
    highlightBackground: null,
    highlightForeground: null,
  }
}

test("terminalMode derives mode from refreshed background", () => {
  expect(terminalMode(terminalColors("#fbf1c7"))).toBe("light")
  expect(terminalMode(terminalColors("#1a1b26"))).toBe("dark")
})

test("terminalMode does not derive mode from ANSI slot zero", () => {
  expect(terminalMode(terminalColors(null, ["#000000"]))).toBeUndefined()
})

test("custom theme precedence follows directory order", async () => {
  await using tmp = await tmpdir()
  const global = path.join(tmp.path, "global")
  const project = path.join(tmp.path, "project")
  await mkdir(path.join(global, "themes"), { recursive: true })
  await mkdir(path.join(project, "themes"), { recursive: true })
  await writeFile(path.join(global, "themes", "custom.json"), JSON.stringify({ source: "global" }))
  await writeFile(path.join(project, "themes", "custom.json"), JSON.stringify({ source: "project" }))

  await expect(discoverThemes([global, project])).resolves.toEqual({ custom: { source: "project" } })
})

const BRAND_THEMES: string[] = [
  "arcana",
  "bloodmoon",
  "coven",
  "crypt",
  "dragon",
  "grimoire",
  "jade",
  "lich",
  "oracle",
  "sakura",
  "wraith",
]

function linearChannel(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(color: { r: number; g: number; b: number }) {
  return 0.2126 * linearChannel(color.r) + 0.7152 * linearChannel(color.g) + 0.0722 * linearChannel(color.b)
}

function contrastRatio(
  foreground: { r: number; g: number; b: number },
  background: { r: number; g: number; b: number },
) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

const THEME_MODES = ["dark", "light"] as const
const BRAND_THEME_MODES = BRAND_THEMES.flatMap((name) => THEME_MODES.map((mode) => [name, mode] as const))

const SURFACE_TEXT_TOKENS: Array<[keyof Theme, number]> = [
  ["primary", 4.5],
  ["secondary", 4.5],
  ["accent", 4.5],
  ["highlight", 4.5],
  ["info", 4.5],
  ["success", 4.5],
  ["warning", 4.5],
  ["error", 4.8],
  ["diffAdded", 4.5],
  ["diffRemoved", 4.5],
  ["diffContext", 4.5],
  ["diffHunkHeader", 4.5],
  ["diffHighlightAdded", 4.5],
  ["diffHighlightRemoved", 4.5],
  ["diffLineNumber", 3.8],
  ["markdownText", 7],
  ["markdownHeading", 4.8],
  ["markdownLink", 4.5],
  ["markdownLinkText", 4.5],
  ["markdownCode", 4.5],
  ["markdownBlockQuote", 4.5],
  ["markdownEmph", 4.5],
  ["markdownStrong", 4.8],
  ["markdownHorizontalRule", 3.8],
  ["markdownListItem", 4.5],
  ["markdownListEnumeration", 4.5],
  ["markdownImage", 4.5],
  ["markdownImageText", 4.5],
  ["markdownCodeBlock", 7],
  ["syntaxComment", 3.8],
  ["syntaxKeyword", 4.5],
  ["syntaxFunction", 4.5],
  ["syntaxVariable", 7],
  ["syntaxString", 4.5],
  ["syntaxNumber", 4.5],
  ["syntaxType", 4.5],
  ["syntaxOperator", 4.5],
  ["syntaxPunctuation", 7],
  ["spineBrand", 7],
  ["spineContext", 4.7],
  ["spineActor", 4.5],
  ["spineAsk", 4.5],
  ["spineThink", 4.5],
  ["spineInspect", 4.5],
  ["spinePlan", 4.5],
  ["spinePatch", 4.5],
  ["spineRun", 4.5],
  ["spineFail", 4.8],
  ["spineFix", 4.5],
  ["spineOk", 4.5],
  ["spinePrompt", 4.8],
  ["spineDiffAdd", 4.5],
  ["spineDiffRemove", 4.5],
  ["spineDiffMuted", 4.5],
  ["spineGutterElapsed", 4.5],
  ["spineGutterTimestamp", 4.5],
  ["spineSubagent", 4.5],
]

function readableSurface(theme: Theme) {
  return theme.background.a === 0 ? theme.backgroundPanel : theme.background
}

function assertContrast(
  theme: Theme,
  token: keyof Theme,
  surface: { r: number; g: number; b: number },
  minRatio: number,
) {
  const value = theme[token]
  if (typeof value === "number" || typeof value === "boolean") throw new Error(`${String(token)} is not a color token`)
  const ratio = contrastRatio(value, surface)
  if (ratio < minRatio) throw new Error(`${String(token)} contrast ${ratio.toFixed(2)} < ${minRatio}`)
}
/**
 * RGB distance so spine kinds don't all collapse to the same fallback color.
 *
 * Monochrome palettes differ by LIGHTNESS only: the hue that used to carry a
 * 25+ distance is gone, and the role ladder guarantees ~17 at its tightest
 * (the contrast-safe band bounds the step). The assertion still catches the
 * real defect it was written for — several kinds collapsing onto one fallback
 * shade — while accepting the monochrome step.
 */
function colorDistance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
) {
  const dr = (a.r - b.r) * 255
  const dg = (a.g - b.g) * 255
  const db = (a.b - b.b) * 255
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

/** Minimum sRGB step the monochrome role ladder must leave between paired kinds. */
const MONO_ROLE_MIN_DISTANCE = 14

test.each(BRAND_THEMES)("%s dark spine kinds stay visually distinct", (name: string) => {
  const theme = resolveTheme(DEFAULT_THEMES[name]!, "dark")
  // These pairs used to share one fallback (ask/run/prompt → accent, plan/patch → secondary).
  const pairs: Array<[keyof Theme, keyof Theme]> = [
    ["spineAsk", "spineRun"],
    ["spineAsk", "spinePrompt"],
    ["spineRun", "spinePrompt"],
    ["spinePlan", "spinePatch"],
    ["spineBrand", "spineAsk"],
    ["spineInspect", "spinePatch"],
  ]
  for (const [left, right] of pairs) {
    const a = theme[left] as { r: number; g: number; b: number }
    const b = theme[right] as { r: number; g: number; b: number }
    const d = colorDistance(a, b)
    expect(d, `${name}: ${String(left)} vs ${String(right)} distance ${d.toFixed(1)}`).toBeGreaterThan(
      MONO_ROLE_MIN_DISTANCE,
    )
  }
})

test("spine fallbacks do not collapse ask/run/prompt when tokens omitted", () => {
  const bare = structuredClone(DEFAULT_THEMES.arcana!)
  // Strip all optional spine* keys so resolveTheme uses fallbacks only.
  for (const key of Object.keys(bare.theme)) {
    if (key.startsWith("spine")) delete (bare.theme as Record<string, unknown>)[key]
  }
  const theme = resolveTheme(bare, "dark")
  expect(colorDistance(theme.spineAsk, theme.spineRun)).toBeGreaterThan(MONO_ROLE_MIN_DISTANCE)
  expect(colorDistance(theme.spinePlan, theme.spinePatch)).toBeGreaterThan(MONO_ROLE_MIN_DISTANCE)
  // Brand sits a margin clear of the body text so it never reads as prose ink.
  expect(colorDistance(theme.spineBrand, theme.text)).toBeGreaterThan(15)
})

test.each(BRAND_THEMES)("%s theme defines a brand-surface accent token", (name: string) => {
  const json = DEFAULT_THEMES[name]
  expect(json).toBeDefined()
  expect(json.theme.accent).toBeDefined()
})

test.each(BRAND_THEMES)("%s theme resolves to a visible accent color in dark mode", (name: string) => {
  const resolved = resolveTheme(structuredClone(DEFAULT_THEMES[name]!), "dark")
  expect(resolved.accent).toBeDefined()
  // accent must be opaque and have non-zero RGB so the sigil glyphs render
  const { r, g, b, a } = resolved.accent
  expect(a).toBeGreaterThan(0)
  expect(r + g + b).toBeGreaterThan(0)
})

test.each(BRAND_THEMES)("%s theme resolves to a visible accent color in light mode", (name: string) => {
  const resolved = resolveTheme(structuredClone(DEFAULT_THEMES[name]!), "light")
  const { r, g, b, a } = resolved.accent
  expect(a).toBeGreaterThan(0)
  expect(r + g + b).toBeGreaterThan(0)
})

test("brand themes all share the same accent token name (sigils stay theme-correct)", () => {
  for (const name of BRAND_THEMES) {
    const json = DEFAULT_THEMES[name]!
    expect(json.theme.accent).toBeDefined()
  }
})

test.each(BRAND_THEMES)("%s theme keeps critical text readable in dark mode", (name: string) => {
  const resolved = resolveTheme(structuredClone(DEFAULT_THEMES[name]!), "dark")
  expect(contrastRatio(resolved.text, resolved.background)).toBeGreaterThanOrEqual(7)
  expect(contrastRatio(resolved.textMuted, resolved.background)).toBeGreaterThanOrEqual(4.5)
  expect(contrastRatio(resolved.spineContext, resolved.background)).toBeGreaterThanOrEqual(4.5)
  expect(contrastRatio(resolved.diffLineNumber, resolved.background)).toBeGreaterThanOrEqual(3.5)
  expect(contrastRatio(resolved.syntaxComment, resolved.background)).toBeGreaterThanOrEqual(3.5)
})

test.each(BRAND_THEMES)("%s theme keeps critical text readable in light mode", (name: string) => {
  const resolved = resolveTheme(structuredClone(DEFAULT_THEMES[name]!), "light")
  expect(contrastRatio(resolved.text, resolved.background)).toBeGreaterThanOrEqual(7)
  expect(contrastRatio(resolved.textMuted, resolved.background)).toBeGreaterThanOrEqual(4.5)
  expect(contrastRatio(resolved.spineContext, resolved.background)).toBeGreaterThanOrEqual(4.5)
  expect(contrastRatio(resolved.diffLineNumber, resolved.background)).toBeGreaterThanOrEqual(3.5)
  expect(contrastRatio(resolved.syntaxComment, resolved.background)).toBeGreaterThanOrEqual(3.5)
})
test.each(BRAND_THEME_MODES)(
  "%s theme keeps TUI surface tokens readable in %s mode",
  (name: string, mode: "dark" | "light") => {
    const resolved = resolveTheme(structuredClone(DEFAULT_THEMES[name]!), mode)
    const surface = readableSurface(resolved)
    for (const [token, minRatio] of SURFACE_TEXT_TOKENS) {
      assertContrast(resolved, token, surface, minRatio)
    }
    assertContrast(resolved, "spineRail", resolved.backgroundPanel, 2.4)
    assertContrast(resolved, "spineRailActive", resolved.backgroundPanel, 3.2)
    assertContrast(resolved, "spinePrompt", resolved.backgroundMenu, 4.5)
    expect(contrastRatio(selectedForeground(resolved, resolved.primary), resolved.primary)).toBeGreaterThanOrEqual(4.5)
  },
)

test.each(BRAND_THEME_MODES)(
  "%s theme keeps native diff renderer tokens readable in %s mode",
  (name: string, mode: "dark" | "light") => {
    const resolved = resolveTheme(structuredClone(DEFAULT_THEMES[name]!), mode)
    expect(contrastRatio(resolved.diffHighlightAdded, resolved.diffAddedBg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(resolved.diffHighlightRemoved, resolved.diffRemovedBg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(resolved.diffLineNumber, resolved.diffContextBg)).toBeGreaterThanOrEqual(3.8)
  },
)

describe("monochrome palette", () => {
  test("monochromeColor scales HSL saturation, keeping lightness and alpha", () => {
    const color = RGBA.fromInts(0, 0, 255, 128)
    const before = rgbaToHsl(color)
    const after = rgbaToHsl(monochromeColor(color, THEME_MONOCHROME))
    expect(after.s).toBeCloseTo(before.s * (1 - THEME_MONOCHROME), 2)
    expect(after.l).toBeCloseTo(before.l, 2)
    expect(monochromeColor(color, THEME_MONOCHROME).a).toBeCloseTo(color.a, 2)
  })

  test("amount 1 is pure gray, amount 0 is identity", () => {
    const color = RGBA.fromInts(200, 60, 20)
    const gray = monochromeColor(color, 1)
    expect(gray.r).toBeCloseTo(gray.g, 5)
    expect(gray.g).toBeCloseTo(gray.b, 5)
    expect(monochromeColor(color, 0)).toBe(color)
  })

  test.each(Object.keys(DEFAULT_THEMES))("%s resolves near-monochrome in both modes", (name: string) => {
    for (const mode of THEME_MODES) {
      const theme = resolveTheme(DEFAULT_THEMES[name]!, mode)
      for (const [token, value] of Object.entries(theme)) {
        if (!value || typeof value !== "object" || typeof (value as RGBA).r !== "number") continue
        const color = value as RGBA
        if (color.a === 0) continue
        const spread = Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b)
        expect(spread, `${name}/${mode}/${String(token)} spread ${spread.toFixed(3)}`).toBeLessThanOrEqual(0.17)
      }
    }
  })

  test.each(Object.keys(DEFAULT_THEMES))("%s keeps surfaces and prose ink neutral", (name: string) => {
    for (const mode of THEME_MODES) {
      const theme = resolveTheme(DEFAULT_THEMES[name]!, mode)
      for (const token of [
        "background",
        "backgroundPanel",
        "backgroundElement",
        "backgroundMenu",
        "text",
        "textMuted",
      ] as const) {
        const color = theme[token]
        const spread = Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b)
        expect(spread, `${name}/${mode}/${token} spread ${spread.toFixed(3)}`).toBeLessThanOrEqual(0.06)
      }
    }
  })
})
