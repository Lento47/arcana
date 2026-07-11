import { expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import type { TerminalColors } from "@opentui/core"
import { DEFAULT_THEMES, addTheme, allThemes, hasTheme, resolveTheme, terminalMode } from "../src/theme"
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

const BRAND_THEMES: string[] = ["arcana", "bloodmoon", "coven", "crypt", "dragon", "lich", "wraith"]

function linearChannel(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(color: { r: number; g: number; b: number }) {
  return 0.2126 * linearChannel(color.r) + 0.7152 * linearChannel(color.g) + 0.0722 * linearChannel(color.b)
}

function contrastRatio(foreground: { r: number; g: number; b: number }, background: { r: number; g: number; b: number }) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

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
