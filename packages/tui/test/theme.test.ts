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
  inspectTheme,
  lintTheme,
  monochromeColor,
  resolveTheme,
  selectedForeground,
  terminalMode,
  themeCharacter,
  type Theme,
  type ThemeJson,
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

describe("theme inheritance and the monochrome layer", () => {
  test("a partial theme inherits every missing token and defs entry", () => {
    const child = { extends: "arcana", theme: { accent: "#ff0000" } } as unknown as (typeof DEFAULT_THEMES)[string]
    const resolved = resolveTheme(child, "dark", { mono: "off" })
    // The override wins…
    expect(resolved.accent.toInts().slice(0, 3)).toEqual([255, 0, 0])
    // …and nothing falls back to the gray FALLBACK: every token the child never
    // declared equals the base theme's authored value.
    const base = resolveTheme(DEFAULT_THEMES.arcana!, "dark", { mono: "off" })
    expect(resolved.background.toInts()).toEqual(base.background.toInts())
    expect(resolved.text.toInts()).toEqual(base.text.toInts())
    expect(resolved.spineBrand.toInts()).toEqual(base.spineBrand.toInts())
  })

  test("defs are inherited so a child can reference the base palette", () => {
    const child = { extends: "arcana", theme: { primary: "darkStep9" } } as unknown as (typeof DEFAULT_THEMES)[string]
    const resolved = resolveTheme(child, "dark", { mono: "off" })
    const base = resolveTheme(DEFAULT_THEMES.arcana!, "dark", { mono: "off" })
    expect(resolved.primary.toInts()).toEqual(base.primary.toInts())
  })

  test("an unknown or cyclic base is ignored instead of crashing", () => {
    const unknown = { extends: "definitely-not-a-theme", theme: { ...DEFAULT_THEMES.arcana!.theme } }
    expect(() => resolveTheme(unknown as never, "dark")).not.toThrow()
    const a = `cycle-a-${Date.now()}`
    const b = `cycle-b-${Date.now()}`
    expect(addTheme(a, { extends: b, theme: {} })).toBe(true)
    expect(addTheme(b, { extends: a, theme: {} })).toBe(true)
    expect(() => resolveTheme(allThemes()[a]!, "dark")).not.toThrow()
  })

  test("off keeps authored palettes, soft desaturates, full re-draws", () => {
    const spread = (c: RGBA) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)
    const raw = DEFAULT_THEMES.arcana!
    const off = resolveTheme(raw, "dark", { mono: "off" })
    const soft = resolveTheme(raw, "dark", { mono: "soft" })
    const full = resolveTheme(raw, "dark", { mono: "full" })
    // `off` is the authored palette (its accent is genuinely saturated);
    // `soft` cuts the saturation; `full` re-draws at the identity strength,
    // which can sit above `soft` when a palette was never very saturated.
    expect(spread(off.accent)).toBeGreaterThan(0.2)
    expect(spread(soft.accent)).toBeLessThan(spread(off.accent))
    expect(spread(full.accent)).toBeLessThan(0.2)
  })

  test("a theme opts out with mono: false, whatever the config says", () => {
    const optOut = { ...DEFAULT_THEMES.arcana!, mono: false }
    const resolved = resolveTheme(optOut, "dark", { mono: "full" })
    const authored = resolveTheme(DEFAULT_THEMES.arcana!, "dark", { mono: "off" })
    expect(resolved.accent.toInts()).toEqual(authored.accent.toInts())
  })

  test("a theme can declare its own cast character", () => {
    const themed = { ...DEFAULT_THEMES.arcana!, mono: { hue: 120, identity: 0.4 } }
    const resolved = resolveTheme(themed, "dark", { mono: "full" })
    const hsl = rgbaToHsl(resolved.accent)
    expect(hsl.h).toBeGreaterThan(100)
    expect(hsl.h).toBeLessThan(140)
  })

  test("themes keep distinct hue identities rather than collapsing to one gray", () => {
    const buckets = new Set<number>()
    for (const name of Object.keys(DEFAULT_THEMES)) {
      const hsl = rgbaToHsl(resolveTheme(DEFAULT_THEMES[name]!, "dark", { mono: "full" }).accent)
      buckets.add(Math.round(hsl.h / 20))
    }
    expect(buckets.size).toBeGreaterThan(3)
  })

  test.each(Object.keys(DEFAULT_THEMES))("%s keeps its semantics on distinct rungs (dark)", (name: string) => {
    const theme = resolveTheme(DEFAULT_THEMES[name]!, "dark", { mono: "full" })
    const tokens = ["primary", "secondary", "accent", "info", "success", "warning", "error"] as const
    const luminances = tokens.map((token) => relativeLuminance(theme[token]))
    for (let i = 0; i < luminances.length; i++) {
      for (let j = i + 1; j < luminances.length; j++) {
        expect(Math.abs(luminances[i]! - luminances[j]!), `${name}: ${tokens[i]} vs ${tokens[j]}`).toBeGreaterThan(
          0.01,
        )
      }
    }
  })
})

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

describe("designed ramp and the readability floor", () => {
  test.each(Object.keys(DEFAULT_THEMES))("%s ships its designed ramp without floor lifts", (name: string) => {
    for (const mode of THEME_MODES) {
      const { adjustments } = inspectTheme(DEFAULT_THEMES[name]!, mode, { mono: "full" })
      expect(adjustments, `${name}/${mode}: ${adjustments.map((a) => a.token).join(", ")}`).toEqual([])
    }
  })

  test("a strong custom cast still lands on floor-clean steps", () => {
    // The cast tint is luminance-preserving, so even an aggressive hue/sat
    // cannot push a designed step below its floor (out-of-gamut tints fall back
    // to the neutral step instead of shipping a lower contrast).
    const themed = { ...DEFAULT_THEMES.arcana!, mono: { hue: 220, structure: 0.4, identity: 0.5 } }
    for (const mode of THEME_MODES) {
      const { adjustments } = inspectTheme(themed, mode, { mono: "full" })
      expect(adjustments, `${mode}: ${adjustments.map((a) => a.token).join(", ")}`).toEqual([])
    }
  })

  test("the floor reports what it lifts from an authored palette", () => {
    // `mono: "off"` keeps the palette exactly as authored, so the quiet end of
    // arcana's borders needs the floor: the report names each lifted token and
    // the ratio that forced it.
    const { adjustments } = inspectTheme(DEFAULT_THEMES.arcana!, "dark", { mono: "off" })
    const lifted = new Map(adjustments.map((a) => [a.token, a]))
    expect(lifted.has("borderSubtle")).toBe(true)
    for (const adjustment of adjustments) {
      expect(adjustment.required).toBeGreaterThan(1)
      expect(adjustment.after).not.toEqual(adjustment.before)
      // Dark surface: every lift walks the token brighter.
      expect(relativeLuminance(adjustment.after)).toBeGreaterThan(relativeLuminance(adjustment.before))
    }
  })
})

describe("theme lint and picker character", () => {
  test.each(Object.keys(DEFAULT_THEMES))("%s lints clean", (name: string) => {
    expect(lintTheme(name, DEFAULT_THEMES[name]!)).toEqual([])
  })

  test("lint names unknown tokens, dangling refs and malformed colors", () => {
    const base = DEFAULT_THEMES.arcana!
    const broken = {
      ...base,
      theme: {
        ...base.theme,
        sparkle: "#ffffff",
        accent: "definitelyNotDefined",
        primary: "#zzz",
      },
    } as unknown as ThemeJson
    const messages = lintTheme("broken", broken).map((issue) => issue.message)
    expect(messages.some((message) => message.includes('unknown token "sparkle"'))).toBe(true)
    expect(messages.some((message) => message.includes('unknown reference "definitelyNotDefined"'))).toBe(true)
    expect(messages.some((message) => message.includes("not a valid hex"))).toBe(true)
  })

  test("lint reports an unresolvable extends and missing required tokens", () => {
    const orphan = { extends: "no-such-theme", theme: {} } as unknown as ThemeJson
    const issues = lintTheme("orphan", orphan)
    expect(issues.some((issue) => issue.level === "warning" && issue.message.includes("unknown theme"))).toBe(true)
    expect(issues.some((issue) => issue.level === "error" && issue.message.includes('missing token "background"'))).toBe(
      true,
    )
  })

  test("lint survives a circular reference and reports it as an error", () => {
    const base = DEFAULT_THEMES.arcana!
    const cyclic = {
      ...base,
      theme: { ...base.theme, accent: "loopA", loopA: "loopB", loopB: "loopA" },
    } as unknown as ThemeJson
    const issues = lintTheme("cyclic", cyclic)
    expect(issues.some((issue) => issue.level === "error" && issue.message.includes("resolution failed"))).toBe(true)
  })

  test("lint flags an out-of-range mono declaration", () => {
    const themed = { ...DEFAULT_THEMES.arcana!, mono: { hue: 400, identity: 2 } }
    const messages = lintTheme("themed", themed).map((issue) => issue.message)
    expect(messages.some((message) => message.includes("mono.hue"))).toBe(true)
    expect(messages.some((message) => message.includes("mono.identity"))).toBe(true)
  })

  test("theme character names the hue family and the declarations that matter", () => {
    const base = DEFAULT_THEMES.arcana!
    const warm = { ...base, mono: false, theme: { ...base.theme, accent: "#ff8800" } } as unknown as ThemeJson
    expect(themeCharacter("arcana", warm)).toBe("warm amber · keeps its palette")
    const gray = { ...base, theme: { ...base.theme, accent: "#808080" } } as unknown as ThemeJson
    expect(themeCharacter("arcana", gray)).toBe("neutral")
    expect(themeCharacter("my-custom", base)).toContain("custom")
  })
})