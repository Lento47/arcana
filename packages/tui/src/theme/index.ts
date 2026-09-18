import { SyntaxStyle, RGBA, type TerminalColors } from "@opentui/core"
import { contrastingInk, ensureMinContrast, hslToRgba, relativeLuminance, rgbaToHsl } from "./contrast"
import { bgLuminance, isLightBg, tint } from "./emphasis"
export { tint } from "./emphasis"
import arcana from "./assets/arcana.json" with { type: "json" }
import arctic from "./assets/arctic.json" with { type: "json" }
import bloodmoon from "./assets/bloodmoon.json" with { type: "json" }
import coven from "./assets/coven.json" with { type: "json" }
import crypt from "./assets/crypt.json" with { type: "json" }
import dracula from "./assets/dracula.json" with { type: "json" }
import dragon from "./assets/dragon.json" with { type: "json" }
import ember from "./assets/ember.json" with { type: "json" }
import grimoire from "./assets/grimoire.json" with { type: "json" }
import gruvbox from "./assets/gruvbox.json" with { type: "json" }
import jade from "./assets/jade.json" with { type: "json" }
import lich from "./assets/lich.json" with { type: "json" }
import monokai from "./assets/monokai.json" with { type: "json" }
import nord from "./assets/nord.json" with { type: "json" }
import oracle from "./assets/oracle.json" with { type: "json" }
import phosphor from "./assets/phosphor.json" with { type: "json" }
import sakura from "./assets/sakura.json" with { type: "json" }
import synthwave from "./assets/synthwave.json" with { type: "json" }
import tokyonight from "./assets/tokyonight.json" with { type: "json" }
import vercel from "./assets/vercel.json" with { type: "json" }
import void_ from "./assets/void.json" with { type: "json" }
import wraith from "./assets/wraith.json" with { type: "json" }

export type Theme = {
  readonly primary: RGBA
  readonly secondary: RGBA
  readonly accent: RGBA
  readonly highlight: RGBA
  readonly error: RGBA
  readonly warning: RGBA
  readonly success: RGBA
  readonly info: RGBA
  readonly text: RGBA
  readonly textMuted: RGBA
  readonly selectedListItemText: RGBA
  readonly background: RGBA
  readonly backgroundPanel: RGBA
  readonly backgroundElement: RGBA
  readonly backgroundMenu: RGBA
  readonly border: RGBA
  readonly borderActive: RGBA
  readonly borderSubtle: RGBA
  readonly borderThinking: RGBA
  readonly surfaceAlt: RGBA
  readonly diffAdded: RGBA
  readonly diffRemoved: RGBA
  readonly diffContext: RGBA
  readonly diffHunkHeader: RGBA
  readonly diffHighlightAdded: RGBA
  readonly diffHighlightRemoved: RGBA
  readonly diffAddedBg: RGBA
  readonly diffRemovedBg: RGBA
  readonly diffContextBg: RGBA
  readonly diffLineNumber: RGBA
  readonly diffAddedLineNumberBg: RGBA
  readonly diffRemovedLineNumberBg: RGBA
  readonly markdownText: RGBA
  readonly markdownHeading: RGBA
  readonly markdownLink: RGBA
  readonly markdownLinkText: RGBA
  readonly markdownCode: RGBA
  readonly markdownBlockQuote: RGBA
  readonly markdownEmph: RGBA
  readonly markdownStrong: RGBA
  readonly markdownHorizontalRule: RGBA
  readonly markdownListItem: RGBA
  readonly markdownListEnumeration: RGBA
  readonly markdownImage: RGBA
  readonly markdownImageText: RGBA
  readonly markdownCodeBlock: RGBA
  readonly syntaxComment: RGBA
  readonly syntaxKeyword: RGBA
  readonly syntaxFunction: RGBA
  readonly syntaxVariable: RGBA
  readonly syntaxString: RGBA
  readonly syntaxNumber: RGBA
  readonly syntaxType: RGBA
  readonly syntaxOperator: RGBA
  readonly syntaxPunctuation: RGBA
  readonly spineBrand: RGBA
  readonly spineContext: RGBA
  readonly spineRail: RGBA
  readonly spineRailActive: RGBA
  readonly spineActor: RGBA
  readonly spineAsk: RGBA
  readonly spineThink: RGBA
  readonly spineInspect: RGBA
  readonly spinePlan: RGBA
  readonly spinePatch: RGBA
  readonly spineRun: RGBA
  readonly spineFail: RGBA
  readonly spineFix: RGBA
  readonly spineOk: RGBA
  readonly spinePrompt: RGBA
  readonly spineDiffAdd: RGBA
  readonly spineDiffRemove: RGBA
  readonly spineDiffMuted: RGBA
  readonly spineGutterElapsed: RGBA
  readonly spineGutterTimestamp: RGBA
  readonly spineSubagent: RGBA
  readonly thinkingOpacity: number
  _hasSelectedListItemText: boolean
}
type ThemeColor = Exclude<keyof Theme, "thinkingOpacity" | "_hasSelectedListItemText">
export type SyntaxStyleOverrides = Record<string, { italic?: boolean }>

export function selectedForeground(
  theme: {
    readonly selectedListItemText?: RGBA
    readonly background: RGBA
    readonly primary: RGBA
  },
  bg?: RGBA,
): RGBA {
  // If theme explicitly defines selectedListItemText, use it
  if (theme.selectedListItemText) {
    return theme.selectedListItemText
  }

  // For transparent backgrounds, calculate contrast based on the actual bg (or fallback to primary)
  if (theme.background.a === 0) {
    const targetColor = bg ?? theme.primary
    return contrastingInk(targetColor)
  }

  // Fall back to background color
  return theme.background
}

type HexColor = `#${string}`
type RefName = string
type Variant = {
  dark: HexColor | RefName
  light: HexColor | RefName
}
type ColorValue = HexColor | RefName | Variant | RGBA
export type ThemeJson = {
  $schema?: string
  defs?: Record<string, HexColor | RefName>
  theme: Omit<
    Record<ThemeColor, ColorValue>,
    | "selectedListItemText"
    | "backgroundMenu"
    | "borderThinking"
    | "surfaceAlt"
    | "spineBrand"
    | "spineContext"
    | "spineRail"
    | "spineRailActive"
    | "spineActor"
    | "spineAsk"
    | "spineThink"
    | "spineInspect"
    | "spinePlan"
    | "spinePatch"
    | "spineRun"
    | "spineFail"
    | "spineFix"
    | "spineOk"
    | "spinePrompt"
    | "spineDiffAdd"
    | "spineDiffRemove"
    | "spineDiffMuted"
    | "spineGutterElapsed"
    | "spineGutterTimestamp"
    | "spineSubagent"
  > & {
    selectedListItemText?: ColorValue
    backgroundMenu?: ColorValue
    borderThinking?: ColorValue
    surfaceAlt?: ColorValue
    spineBrand?: ColorValue
    spineContext?: ColorValue
    spineRail?: ColorValue
    spineRailActive?: ColorValue
    spineActor?: ColorValue
    spineAsk?: ColorValue
    spineThink?: ColorValue
    spineInspect?: ColorValue
    spinePlan?: ColorValue
    spinePatch?: ColorValue
    spineRun?: ColorValue
    spineFail?: ColorValue
    spineFix?: ColorValue
    spineOk?: ColorValue
    spinePrompt?: ColorValue
    spineDiffAdd?: ColorValue
    spineDiffRemove?: ColorValue
    spineDiffMuted?: ColorValue
    spineGutterElapsed?: ColorValue
    spineGutterTimestamp?: ColorValue
    spineSubagent?: ColorValue
    thinkingOpacity?: number
  }
}

export const DEFAULT_THEMES: Record<string, ThemeJson> = {
  arcana,
  arctic,
  bloodmoon,
  coven,
  crypt,
  dracula,
  dragon,
  ember,
  grimoire,
  gruvbox,
  jade,
  lich,
  monokai,
  nord,
  oracle,
  phosphor,
  sakura,
  synthwave,
  tokyonight,
  vercel,
  void: void_,
  wraith,
}

/**
 * Shipped palettes are re-drawn on the designed monochrome ramp; anything the
 * user or a plugin supplies keeps its own design (desaturated only).
 */
const BUILTIN_THEMES = new Set<ThemeJson>(Object.values(DEFAULT_THEMES))

const pluginThemes: Record<string, ThemeJson> = {}
let customThemes: Record<string, ThemeJson> = {}
let systemTheme: ThemeJson | undefined
const listeners = new Set<(themes: Record<string, ThemeJson>) => void>()

function listThemes() {
  // Priority: defaults < plugin installs < custom files < generated system.
  const themes = {
    ...DEFAULT_THEMES,
    ...pluginThemes,
    ...customThemes,
  }
  if (!systemTheme) return themes
  return {
    ...themes,
    system: systemTheme,
  }
}

function syncThemes() {
  const themes = listThemes()
  for (const listener of listeners) listener(themes)
}

export function allThemes() {
  return listThemes()
}

export function isTheme(theme: unknown): theme is ThemeJson {
  if (typeof theme !== "object" || theme === null || Array.isArray(theme)) return false
  const value = Reflect.get(theme, "theme")
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function subscribeThemes(listener: (themes: Record<string, ThemeJson>) => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setCustomThemes(themes: Record<string, ThemeJson>) {
  customThemes = themes
  syncThemes()
}

export function setSystemTheme(theme: ThemeJson | undefined) {
  systemTheme = theme
  syncThemes()
}

export function hasTheme(name: string) {
  if (!name) return false
  return allThemes()[name] !== undefined
}

export function addTheme(name: string, theme: unknown) {
  if (!name) return false
  if (!isTheme(theme)) return false
  if (hasTheme(name)) return false
  pluginThemes[name] = theme
  syncThemes()
  return true
}

export function upsertTheme(name: string, theme: unknown) {
  if (!name) return false
  if (!isTheme(theme)) return false
  if (customThemes[name] !== undefined) {
    customThemes[name] = theme
  } else {
    pluginThemes[name] = theme
  }
  syncThemes()
  return true
}

/**
 * True when a theme name still resolves to its shipped palette (custom files
 * and plugin installs may shadow a name; those keep their own design).
 */
export function isBuiltinThemeName(name: string | undefined): boolean {
  if (!name) return false
  return listThemes()[name] === DEFAULT_THEMES[name]
}

export function resolveTheme(
  theme: ThemeJson,
  mode: "dark" | "light",
  options?: { designed?: boolean },
) {
  // OpenTUI 0.4.x may ship new theme keys not present in arcana's JSON.
  // resolveColor is now null-guarded — missing keys return black instead
  // of crashing with .startsWith(undefined).
  const merged = { ...theme.theme }
  const defs = theme.defs ?? {}
  // Hard-fallback gray — never return undefined. OpenTUI 0.4.x renderer
  // calls .startsWith("#") directly on color values; undefined is a crash.
  const FALLBACK = RGBA.fromInts(127, 127, 127)

  function resolveColor(c: ColorValue, chain: string[] = []): RGBA {
    // Nullish guard — covers missing theme keys, incomplete {dark,light}
    // objects, and any unexpected shape from a new OpenTUI minor version.
    if (c == null) return FALLBACK
    if (c instanceof RGBA) return c
    if (typeof c === "string") {
      if (c === "transparent" || c === "none") return RGBA.fromInts(0, 0, 0, 0)

      if (c.startsWith("#")) return RGBA.fromHex(c)

      if (chain.includes(c)) {
        throw new Error(`Circular color reference: ${[...chain, c].join(" -> ")}`)
      }

      const next = defs[c] ?? merged[c as ThemeColor]
      if (next == null) return FALLBACK
      return resolveColor(next, [...chain, c])
    }
    if (typeof c === "number") {
      return ansiToRgba(c)
    }
    // Object with dark/light sub-keys — pick the active mode.
    const variant = (c as Record<string, ColorValue>)[mode]
    if (variant != null) return resolveColor(variant, chain)
    // Fallback: try the other mode.
    const fallbackMode = mode === "dark" ? "light" : "dark"
    const fb = (c as Record<string, ColorValue>)[fallbackMode]
    if (fb != null) return resolveColor(fb, chain)
    return FALLBACK
  }

  const resolved = Object.fromEntries(
    Object.entries(merged)
      .filter(([key]) => key !== "selectedListItemText" && key !== "backgroundMenu" && key !== "thinkingOpacity")
      .map(([key, value]) => {
        return [key, resolveColor(value as ColorValue)]
      }),
  ) as Partial<Record<ThemeColor, RGBA>>

  // Near-monochrome design pass: shipped palettes are re-drawn on the designed
  // ramp (cast-tinted); custom themes are desaturated but never redesigned.
  // `options.designed` lets a caller that knows the theme's name keep the ramp
  // for clones of a shipped palette (the provider resolves by name). This runs
  // BEFORE the optional-token fallbacks so they follow the redrawn tokens
  // instead of snapshotting the pre-design colors.
  const designed = options?.designed ?? BUILTIN_THEMES.has(theme)
  if (designed) applyDesignedMonochrome(resolved, mode)
  else applyMonochrome(resolved, THEME_MONOCHROME)

  // Handle selectedListItemText separately since it's optional
  const hasSelectedListItemText = merged.selectedListItemText !== undefined
  if (hasSelectedListItemText) {
    resolved.selectedListItemText = resolveColor(merged.selectedListItemText!)
  } else {
    // Backward compatibility: if selectedListItemText is not defined, use background color
    // This preserves the current behavior for all existing themes
    resolved.selectedListItemText = resolved.background
  }

  // Handle backgroundMenu - optional with fallback to backgroundElement
  if (merged.backgroundMenu !== undefined) {
    resolved.backgroundMenu = resolveColor(merged.backgroundMenu)
  } else {
    resolved.backgroundMenu = resolved.backgroundElement
  }

  // Handle thinkingOpacity - optional with default of 0.6
  const thinkingOpacity = merged.thinkingOpacity ?? 0.6

  // New tokens — fallback to existing colors if not defined in theme JSON
  if (merged.borderThinking !== undefined) {
    resolved.borderThinking = resolveColor(merged.borderThinking)
  } else {
    resolved.borderThinking = resolved.borderSubtle
  }
  if (merged.surfaceAlt !== undefined) {
    resolved.surfaceAlt = resolveColor(merged.surfaceAlt)
  } else {
    resolved.surfaceAlt = resolved.backgroundPanel
  }

  // Explicit optional tokens above resolve straight from the palette JSON and
  // bypass the first design pass; re-apply the ramp so none of them can
  // reintroduce saturated chrome (backgroundMenu was the visible one).
  if (designed) applyDesignedMonochrome(resolved, mode)

  // Spine command-spine tokens — fallback-safe.
  // Do NOT collapse multiple kinds onto the same role (ask/run/prompt all → accent
  // and plan/patch both → secondary made every theme feel identical on the spine).
  // theme.theme is mostly ColorValue but mixes in `thinkingOpacity: number`; index
  // the raw record and treat anything that isn't a ColorValue as missing. Fallback
  // can be Partial (resolved is Partial<Record<ThemeColor, RGBA>>); we narrow with !.
  // Accepts strings/numbers (refs+ANSI) and objects (dark/light variants). RGBA
  // instances pass through; anything else falls back.
  const spineFB = (key: string, fallback: RGBA | undefined): RGBA => {
    const raw = (theme.theme as unknown as Record<string, unknown>)[key]
    if (raw === undefined || raw === null) return fallback!
    if (typeof raw === "object" || typeof raw === "string" || typeof raw === "number") {
      try {
        return resolveColor(raw as ColorValue)
      } catch {
        return fallback!
      }
    }
    return fallback!
  }
  resolved.spineBrand = spineFB("spineBrand", resolved.primary)
  resolved.spineContext = spineFB("spineContext", resolved.textMuted)
  resolved.spineRail = spineFB("spineRail", resolved.borderSubtle)
  resolved.spineRailActive = spineFB("spineRailActive", resolved.borderActive ?? resolved.border)
  resolved.spineActor = spineFB("spineActor", resolved.textMuted)
  resolved.spineAsk = spineFB("spineAsk", resolved.accent)
  resolved.spineThink = spineFB("spineThink", resolved.info)
  resolved.spineInspect = spineFB("spineInspect", resolved.info)
  resolved.spinePlan = spineFB("spinePlan", resolved.secondary)
  resolved.spinePatch = spineFB("spinePatch", resolved.warning)
  resolved.spineRun = spineFB("spineRun", resolved.primary)
  resolved.spineFail = spineFB("spineFail", resolved.error)
  resolved.spineFix = spineFB("spineFix", resolved.warning)
  resolved.spineOk = spineFB("spineOk", resolved.success)
  resolved.spinePrompt = spineFB("spinePrompt", resolved.highlight ?? resolved.primary)
  resolved.spineDiffAdd = spineFB("spineDiffAdd", resolved.diffAdded)
  resolved.spineDiffRemove = spineFB("spineDiffRemove", resolved.diffRemoved)
  resolved.spineDiffMuted = spineFB("spineDiffMuted", resolved.textMuted)
  resolved.spineGutterElapsed = spineFB("spineGutterElapsed", resolved.textMuted)
  resolved.spineGutterTimestamp = spineFB("spineGutterTimestamp", resolved.textMuted)
  resolved.spineSubagent = spineFB("spineSubagent", resolved.accent)
  // Monochrome: cap explicit tokens (palette-defined spine colors) at the cast,
  // re-space the spine signal roles by lightness, then guard contrast.
  if (designed) clampToCast(resolved, mode)
  spaceMonochromeRoles(resolved, mode)
  applyReadabilityFloor(resolved)

  return {
    ...resolved,
    _hasSelectedListItemText: hasSelectedListItemText,
    thinkingOpacity,
  } as Theme
}

/**
 * Fully-resolved `arcana` theme for surfaces that render outside a
 * ThemeProvider — isolated render tests, plugin routes mounted ahead of the
 * provider, and the fatal error screen.
 *
 * Derived from the shipped theme JSON through the same `resolveTheme` path as a
 * live theme, so the fallback can never drift from the real palette. Two
 * hand-maintained partial palettes used to live in `spine-tool-chip.tsx` and
 * `error-component.tsx`, and had already drifted from it.
 *
 * Cached per mode: `resolveTheme` resolves refs and runs the contrast floor,
 * and this sits on cold-start paths.
 */
const fallbackThemes = new Map<"dark" | "light", Theme>()

export function fallbackTheme(mode: "dark" | "light" = "dark"): Theme {
  const cached = fallbackThemes.get(mode)
  if (cached) return cached
  const resolved = resolveTheme(DEFAULT_THEMES.arcana!, mode)
  fallbackThemes.set(mode, resolved)
  return resolved
}

function ansiToRgba(code: number): RGBA {
  // Standard ANSI colors (0-15)
  if (code < 16) {
    const ansiColors = [
      "#000000", // Black
      "#800000", // Red
      "#008000", // Green
      "#808000", // Yellow
      "#000080", // Blue
      "#800080", // Magenta
      "#008080", // Cyan
      "#c0c0c0", // White
      "#808080", // Bright Black
      "#ff0000", // Bright Red
      "#00ff00", // Bright Green
      "#ffff00", // Bright Yellow
      "#0000ff", // Bright Blue
      "#ff00ff", // Bright Magenta
      "#00ffff", // Bright Cyan
      "#ffffff", // Bright White
    ]
    return RGBA.fromHex(ansiColors[code] ?? "#000000")
  }

  // 6x6x6 Color Cube (16-231)
  if (code < 232) {
    const index = code - 16
    const b = index % 6
    const g = Math.floor(index / 6) % 6
    const r = Math.floor(index / 36)

    const val = (x: number) => (x === 0 ? 0 : x * 40 + 55)
    return RGBA.fromInts(val(r), val(g), val(b))
  }

  // Grayscale Ramp (232-255)
  if (code < 256) {
    const gray = (code - 232) * 10 + 8
    return RGBA.fromInts(gray, gray, gray)
  }

  // Fallback for invalid codes
  return RGBA.fromInts(0, 0, 0)
}

/**
 * Global desaturation for every theme (0 = original palette, 1 = pure gray).
 * The user-facing look: near-monochrome — hue is gone from backgrounds, text,
 * syntax, statuses and chrome, while a whisper of the original tint survives.
 * HSL saturation is scaled by `1 - amount` at constant lightness, so each
 * color keeps its place in the hierarchy; the readability floor runs afterwards
 * and restores any contrast the chroma loss costs.
 */
export const THEME_MONOCHROME = 0.85

/** Linear light → sRGB channel (used by the role ladder's band math). */
function linearToSrgb(value: number) {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055
}

/** The sRGB gray whose WCAG relative luminance is `luminance`. */
function grayFromLuminance(luminance: number) {
  return linearToSrgb(Math.max(0, Math.min(1, luminance)))
}

/** Desaturate toward gray, keeping HSL lightness and alpha. */
export function monochromeColor(color: RGBA, amount: number): RGBA {
  if (amount <= 0 || color.a === 0) return color
  const { h, s, l } = rgbaToHsl(color)
  return hslToRgba(h, s * (1 - amount), l, color.a)
}

/** Apply the monochrome transform to every resolved color token. */
function applyMonochrome(theme: Partial<Record<ThemeColor, RGBA>>, amount: number) {
  if (amount <= 0) return
  for (const key of Object.keys(theme) as ThemeColor[]) {
    const value = theme[key]
    if (value) theme[key] = monochromeColor(value, amount)
  }
}

/**
 * Designed monochrome ramp for the built-in themes.
 *
 * A mechanical desaturation keeps each palette's arbitrary luminance
 * relationships, which reads as muddy: surfaces a few percent apart, ink levels
 * that wander. This pass re-draws the structural tokens — surfaces, borders,
 * ink, semantics, markdown and syntax — on fixed lightness ladders, so the
 * hierarchy is deliberate, while a whisper of the theme's own cast hue (from
 * its background) keeps warm themes warm and cool themes cool. Custom themes
 * keep the plain desaturation: a user's palette is never redesigned.
 *
 * Every step was chosen against the readability floor: surfaces separate
 * visibly, ink clears its ratio (text 7:1, muted 4.7:1, semantic 4.5:1), and
 * borders clear their 2.2/2.8 floors before the final floor pass validates.
 */
const MONO_DARK_STEPS = [
  0.05, 0.075, 0.1, 0.13, 0.16, 0.2, 0.26, 0.34, 0.44, 0.5, 0.56, 0.62, 0.68, 0.74, 0.8, 0.86, 0.92, 0.96,
] as const
const MONO_LIGHT_STEPS = [
  0.03, 0.07, 0.12, 0.17, 0.21, 0.25, 0.29, 0.33, 0.38, 0.42, 0.46, 0.5, 0.54, 0.62, 0.7, 0.78, 0.86, 0.92, 0.96,
] as const

/** Token → step index on the dark ladder. */
const MONO_DARK_MAP: Partial<Record<ThemeColor, number>> = {
  // Surfaces: one visible step each, never mud.
  background: 0,
  backgroundPanel: 1,
  surfaceAlt: 2,
  backgroundElement: 2,
  backgroundMenu: 3,
  diffContextBg: 1,
  diffRemovedBg: 1,
  diffAddedBg: 2,
  diffRemovedLineNumberBg: 1,
  diffAddedLineNumberBg: 2,
  // Borders: quiet but present (2.2 / 2.8 floors).
  borderThinking: 7,
  borderSubtle: 7,
  border: 8,
  borderActive: 12,
  // Ink: body, muted, and the quiet end.
  text: 17,
  textMuted: 9,
  // Semantics on distinct rungs (lightness is the only signal left).
  primary: 15,
  secondary: 10,
  accent: 13,
  highlight: 17,
  info: 12,
  success: 11,
  warning: 16,
  error: 14,
  // Markdown.
  markdownText: 17,
  markdownHeading: 16,
  markdownStrong: 17,
  markdownEmph: 16,
  markdownCode: 15,
  markdownCodeBlock: 17,
  markdownLink: 14,
  markdownLinkText: 14,
  markdownBlockQuote: 11,
  markdownListItem: 14,
  markdownListEnumeration: 14,
  markdownImage: 14,
  markdownImageText: 14,
  markdownHorizontalRule: 8,
  // Syntax.
  syntaxKeyword: 15,
  syntaxString: 11,
  syntaxNumber: 13,
  syntaxType: 15,
  syntaxOperator: 9,
  syntaxComment: 8,
  syntaxVariable: 17,
  syntaxPunctuation: 16,
  syntaxFunction: 17,
  // Diff.
  diffAdded: 11,
  diffRemoved: 11,
  diffContext: 9,
  diffHunkHeader: 11,
  diffHighlightAdded: 15,
  diffHighlightRemoved: 15,
  diffLineNumber: 8,
}

/** Token → step index on the light ladder. */
const MONO_LIGHT_MAP: Partial<Record<ThemeColor, number>> = {
  background: 18,
  backgroundPanel: 17,
  surfaceAlt: 16,
  backgroundElement: 16,
  backgroundMenu: 15,
  diffContextBg: 16,
  diffRemovedBg: 16,
  diffAddedBg: 15,
  diffRemovedLineNumberBg: 16,
  diffAddedLineNumberBg: 15,
  borderThinking: 13,
  borderSubtle: 13,
  border: 12,
  borderActive: 9,
  text: 4,
  textMuted: 9,
  primary: 5,
  secondary: 8,
  accent: 6,
  highlight: 3,
  info: 6,
  success: 9,
  warning: 7,
  error: 9,
  markdownText: 4,
  markdownHeading: 3,
  markdownStrong: 3,
  markdownEmph: 4,
  markdownCode: 4,
  markdownCodeBlock: 4,
  markdownLink: 6,
  markdownLinkText: 6,
  markdownBlockQuote: 8,
  markdownListItem: 6,
  markdownListEnumeration: 6,
  markdownImage: 6,
  markdownImageText: 6,
  markdownHorizontalRule: 12,
  syntaxKeyword: 5,
  syntaxString: 8,
  syntaxNumber: 6,
  syntaxType: 5,
  syntaxOperator: 7,
  syntaxComment: 11,
  syntaxVariable: 4,
  syntaxPunctuation: 5,
  syntaxFunction: 4,
  diffAdded: 6,
  diffRemoved: 6,
  diffContext: 7,
  diffHunkHeader: 6,
  diffHighlightAdded: 4,
  diffHighlightRemoved: 4,
  diffLineNumber: 11,
}

/**
 * The cast: the theme's own hue at two strengths. Structural tokens (surfaces,
 * borders, ink, markdown) take the quiet strength — they read as neutral grays.
 * Identity tokens (accents, semantics, spine roles, code keywords) take the
 * louder one, so switching themes visibly changes the mood while nothing
 * approaches the original saturation.
 */
const MONO_STRUCTURE_SAT = 0.05
const MONO_STRUCTURE_SAT_LIGHT = 0.035
const MONO_IDENTITY_SAT = 0.16
const MONO_IDENTITY_SAT_LIGHT = 0.14

/** Tokens that carry theme identity rather than structure. */
const MONO_IDENTITY_TOKENS = new Set<ThemeColor>([
  "primary",
  "secondary",
  "accent",
  "highlight",
  "info",
  "success",
  "warning",
  "error",
  "diffAdded",
  "diffRemoved",
  "diffHunkHeader",
  "diffHighlightAdded",
  "diffHighlightRemoved",
  "markdownHeading",
  "markdownLink",
  "markdownLinkText",
  "syntaxKeyword",
  "syntaxString",
  "syntaxNumber",
  "syntaxType",
  "syntaxOperator",
])

function monochromeCast(theme: Partial<Record<ThemeColor, RGBA>>, mode: "dark" | "light") {
  // The accent is the theme's declared identity; fall back to the primary and
  // only then to the background, which is often nearly neutral.
  const accent = theme.accent ? rgbaToHsl(theme.accent) : undefined
  const primary = theme.primary ? rgbaToHsl(theme.primary) : undefined
  const background = theme.background && theme.background.a > 0 ? rgbaToHsl(theme.background) : undefined
  const source = [accent, primary, background].find((hsl) => hsl && hsl.s > 0.05) ?? accent ?? primary ?? background
  return {
    hue: source?.h ?? 0,
    sat: mode === "dark" ? MONO_STRUCTURE_SAT : MONO_STRUCTURE_SAT_LIGHT,
    identitySat: mode === "dark" ? MONO_IDENTITY_SAT : MONO_IDENTITY_SAT_LIGHT,
  }
}

/** Re-draw every structural token on the designed ladder, cast-tinted. */
function applyDesignedMonochrome(theme: Partial<Record<ThemeColor, RGBA>>, mode: "dark" | "light") {
  const steps = mode === "dark" ? MONO_DARK_STEPS : MONO_LIGHT_STEPS
  const map = mode === "dark" ? MONO_DARK_MAP : MONO_LIGHT_MAP
  const cast = monochromeCast(theme, mode)
  for (const [key, step] of Object.entries(map) as Array<[ThemeColor, number]>) {
    const current = theme[key]
    if (!current) continue
    const sat = MONO_IDENTITY_TOKENS.has(key) ? cast.identitySat : cast.sat
    theme[key] = hslToRgba(cast.hue, sat, steps[step]!, current.a)
  }
}

/**
 * Cap every remaining token at the cast's saturation, keeping its lightness.
 * The design pass only re-draws the tokens it maps; an explicit `spine*` key in
 * the palette JSON (or any future token) otherwise stayed fully saturated and
 * rendered as a colored chip in an otherwise gray UI. Custom themes are exempt:
 * their desaturation is the 0.85 transform, not this cast.
 */
function clampToCast(theme: Partial<Record<ThemeColor, RGBA>>, mode: "dark" | "light") {
  const cast = monochromeCast(theme, mode)
  for (const key of Object.keys(theme) as ThemeColor[]) {
    const value = theme[key]
    if (!value || value.a === 0) continue
    const hsl = rgbaToHsl(value)
    if (hsl.s > cast.identitySat) theme[key] = hslToRgba(hsl.h, cast.identitySat, hsl.l, value.a)
  }
}

/**
 * Monochrome roles differ by LIGHTNESS, not hue. The pairs that share a row
 * (ask/run/prompt, plan/patch, brand/ask, inspect/patch) are re-spaced onto a
 * uniform gray ladder inside the contrast-safe band, preserving each theme's
 * relative prominence order, so a hue-less palette cannot collapse two chips
 * into one shade. The readability floor runs after this and is the final
 * contrast guard.
 */
const MONO_LADDER_KEYS = [
  "spineAsk",
  "spineRun",
  "spinePrompt",
  "spinePlan",
  "spinePatch",
  "spineInspect",
] as const
const MONO_ROLE_MAX_GAP = 0.09

function spaceMonochromeRoles(theme: Partial<Record<ThemeColor, RGBA>>, mode: "dark" | "light") {
  const surface = theme.background && theme.background.a === 0 ? theme.backgroundPanel : theme.background
  const text = theme.text
  if (!surface || !text) return
  const cast = monochromeCast(theme, mode)
  const lightBg = relativeLuminance(surface) > 0.5
  // The strictest surface these roles are checked against (menu/panel differ).
  const surfaces = [surface, theme.backgroundMenu, theme.backgroundPanel].filter(Boolean) as RGBA[]
  const surfaceLum = lightBg
    ? Math.max(...surfaces.map(relativeLuminance))
    : Math.min(...surfaces.map(relativeLuminance))
  // 4.5:1 bound for the ladder; spineBrand carries the stricter 7:1 floor and
  // therefore takes the band's prominent end, where it cannot collide with it.
  const boundLum = lightBg ? (surfaceLum + 0.05) / 4.5 - 0.05 : 4.5 * (surfaceLum + 0.05) - 0.05
  const boundGray = grayFromLuminance(boundLum)
  const textGray = grayFromLuminance(relativeLuminance(text))
  const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
  const margin = 0.07
  // Dark surfaces put body text at the bright end, so the ladder keeps clear of
  // it. Light surfaces put text in the middle of the usable band, so the ladder
  // may span the whole band — that is what keeps its steps wide.
  const band = lightBg
    ? { lo: 0, hi: clamp01(boundGray) }
    : (() => {
        const bands = [
          { lo: clamp01(boundGray), hi: clamp01(Math.min(1, textGray - margin)) },
          { lo: clamp01(Math.max(boundGray, textGray + margin)), hi: 1 },
        ]
        return bands.sort((a, b) => b.hi - b.lo - (a.hi - a.lo))[0]!
      })()
  const span = Math.max(0, band.hi - band.lo)
  const gap = Math.min(MONO_ROLE_MAX_GAP, span / MONO_LADDER_KEYS.length)
  // Prominent end of the band: brighter on a dark surface, darker on a light
  // one. Brand is pinned there; the six signal roles ladder away from it in
  // their original prominence order.
  const brandGray = clamp01(lightBg ? band.lo : band.hi)
  const brand = theme.spineBrand
  if (brand) theme.spineBrand = hslToRgba(cast.hue, cast.identitySat, brandGray, brand.a)
  const roles = MONO_LADDER_KEYS.map((key) => ({ key, lum: relativeLuminance(theme[key]!) })).sort((a, b) =>
    lightBg ? a.lum - b.lum : b.lum - a.lum,
  )
  roles.forEach((role, index) => {
    const offset = (index + 1) * gap
    const gray = clamp01(lightBg ? band.lo + offset : band.hi - offset)
    const current = theme[role.key]!
    theme[role.key] = hslToRgba(cast.hue, cast.identitySat, gray, current.a)
  })
}

function applyReadabilityFloor(theme: Partial<Record<ThemeColor, RGBA>>) {
  const baseSurface =
    theme.background && theme.background.a === 0 ? (theme.backgroundPanel ?? theme.background) : theme.background
  if (!baseSurface) return

  const panel = theme.backgroundPanel ?? baseSurface
  const menu = theme.backgroundMenu ?? panel
  const liftOn = (surface: RGBA, value: RGBA | undefined, minRatio: number) =>
    value ? ensureMinContrast(value, surface, minRatio) : value
  const lift = (value: RGBA | undefined, minRatio: number) => liftOn(baseSurface, value, minRatio)

  theme.text = lift(theme.text, 7)
  theme.textMuted = lift(theme.textMuted, 4.7)
  theme.primary = lift(theme.primary, 4.5)
  theme.secondary = lift(theme.secondary, 4.5)
  theme.accent = lift(theme.accent, 4.5)
  theme.highlight = lift(theme.highlight, 4.5)
  theme.info = lift(theme.info, 4.5)
  theme.success = lift(theme.success, 4.5)
  theme.warning = lift(theme.warning, 4.5)
  theme.error = lift(theme.error, 4.8)
  theme.borderSubtle = lift(theme.borderSubtle, 2.2)
  theme.border = lift(theme.border, 2.8)

  theme.diffAdded = lift(theme.diffAdded, 4.5)
  theme.diffRemoved = lift(theme.diffRemoved, 4.5)
  theme.diffContext = lift(theme.diffContext, 4.5)
  theme.diffHunkHeader = lift(theme.diffHunkHeader, 4.5)
  theme.diffHighlightAdded = lift(theme.diffHighlightAdded, 4.5)
  theme.diffHighlightRemoved = lift(theme.diffHighlightRemoved, 4.5)
  theme.diffLineNumber = lift(theme.diffLineNumber, 3.8)
  theme.diffHighlightAdded = liftOn(theme.diffAddedBg ?? baseSurface, theme.diffHighlightAdded, 4.5)
  theme.diffHighlightRemoved = liftOn(theme.diffRemovedBg ?? baseSurface, theme.diffHighlightRemoved, 4.5)
  theme.diffLineNumber = liftOn(theme.diffContextBg ?? baseSurface, theme.diffLineNumber, 3.8)

  theme.markdownText = lift(theme.markdownText, 7)
  theme.markdownHeading = lift(theme.markdownHeading, 4.8)
  theme.markdownLink = lift(theme.markdownLink, 4.5)
  theme.markdownLinkText = lift(theme.markdownLinkText, 4.5)
  theme.markdownCode = lift(theme.markdownCode, 4.5)
  theme.markdownBlockQuote = lift(theme.markdownBlockQuote, 4.5)
  theme.markdownEmph = lift(theme.markdownEmph, 4.5)
  theme.markdownStrong = lift(theme.markdownStrong, 4.8)
  theme.markdownHorizontalRule = lift(theme.markdownHorizontalRule, 3.8)
  theme.markdownListItem = lift(theme.markdownListItem, 4.5)
  theme.markdownListEnumeration = lift(theme.markdownListEnumeration, 4.5)
  theme.markdownImage = lift(theme.markdownImage, 4.5)
  theme.markdownImageText = lift(theme.markdownImageText, 4.5)
  theme.markdownCodeBlock = lift(theme.markdownCodeBlock, 7)

  theme.syntaxComment = lift(theme.syntaxComment, 3.8)
  theme.syntaxKeyword = lift(theme.syntaxKeyword, 4.5)
  theme.syntaxFunction = lift(theme.syntaxFunction, 4.5)
  theme.syntaxVariable = lift(theme.syntaxVariable, 7)
  theme.syntaxString = lift(theme.syntaxString, 4.5)
  theme.syntaxNumber = lift(theme.syntaxNumber, 4.5)
  theme.syntaxType = lift(theme.syntaxType, 4.5)
  theme.syntaxOperator = lift(theme.syntaxOperator, 4.5)
  theme.syntaxPunctuation = lift(theme.syntaxPunctuation, 7)

  theme.spineBrand = lift(theme.spineBrand, 7)
  theme.spineContext = lift(theme.spineContext, 4.7)
  theme.spineActor = lift(theme.spineActor, 4.5)
  theme.spineThink = lift(theme.spineThink, 4.5)
  theme.spineDiffMuted = lift(theme.spineDiffMuted, 4.5)
  theme.spineGutterElapsed = lift(theme.spineGutterElapsed, 4.5)
  theme.spineGutterTimestamp = lift(theme.spineGutterTimestamp, 4.5)
  theme.spineSubagent = lift(theme.spineSubagent, 4.5)
  theme.spineAsk = lift(theme.spineAsk, 4.5)
  theme.spinePlan = lift(theme.spinePlan, 4.5)
  theme.spineInspect = lift(theme.spineInspect, 4.5)
  theme.spinePatch = lift(theme.spinePatch, 4.5)
  theme.spineRun = lift(theme.spineRun, 4.5)
  theme.spineFail = lift(theme.spineFail, 4.8)
  theme.spineFix = lift(theme.spineFix, 4.5)
  theme.spineOk = lift(theme.spineOk, 4.5)
  theme.spinePrompt = lift(theme.spinePrompt, 4.8)
  theme.spineDiffAdd = lift(theme.spineDiffAdd, 4.5)
  theme.spineDiffRemove = lift(theme.spineDiffRemove, 4.5)
  theme.spineRail = liftOn(panel, theme.spineRail, 2.4)
  theme.spineRailActive = liftOn(panel, theme.spineRailActive, 3.2)

  if (theme.selectedListItemText && theme.primary) {
    theme.selectedListItemText = ensureMinContrast(theme.selectedListItemText, theme.primary, 4.5)
  }
  theme.spinePrompt = liftOn(menu, theme.spinePrompt, 4.5)
}

export function terminalMode(colors: TerminalColors): "dark" | "light" | undefined {
  const bg = colors.defaultBackground
  if (!bg) return
  return isLightBg(RGBA.fromHex(bg)) ? "light" : "dark"
}

export function generateSystem(colors: TerminalColors, mode: "dark" | "light"): ThemeJson {
  const bg = RGBA.fromHex(colors.defaultBackground ?? colors.palette[0]!)
  const fg = RGBA.fromHex(colors.defaultForeground ?? colors.palette[7]!)
  const transparent = RGBA.fromValues(bg.r, bg.g, bg.b, 0)
  const isDark = mode == "dark"

  const col = (i: number) => {
    const value = colors.palette[i]
    if (value) return RGBA.fromHex(value)
    return ansiToRgba(i)
  }

  // Generate gray scale based on terminal background
  const grays = generateGrayScale(bg, isDark)
  const textMuted = generateMutedTextColor(bg, isDark)

  // Desaturate an ANSI slot toward the terminal's own muted gray. The spine's
  // fail/ok/diff colors used to be fixed hex, so every `system` theme rendered
  // the same red and green no matter what palette the terminal reported.
  // `applyReadabilityFloor` still lifts the result to its contrast minimum,
  // so softening can never push these below legibility.
  const soften = (color: RGBA, amount = 0.45) => tint(color, textMuted, amount)

  // ANSI color references
  const ansiColors = {
    black: col(0),
    red: col(1),
    green: col(2),
    yellow: col(3),
    blue: col(4),
    magenta: col(5),
    cyan: col(6),
    white: col(7),
    redBright: col(9),
    greenBright: col(10),
  }

  const diffAlpha = isDark ? 0.22 : 0.14
  const diffAddedBg = tint(bg, ansiColors.green, diffAlpha)
  const diffRemovedBg = tint(bg, ansiColors.red, diffAlpha)
  const diffContextBg = grays[2]
  const diffAddedLineNumberBg = tint(diffContextBg, ansiColors.green, diffAlpha)
  const diffRemovedLineNumberBg = tint(diffContextBg, ansiColors.red, diffAlpha)
  const diffLineNumber = textMuted

  return {
    theme: {
      // Primary colors using ANSI
      primary: ansiColors.cyan,
      secondary: ansiColors.magenta,
      accent: ansiColors.cyan,
      highlight: ansiColors.cyan,

      // Status colors using ANSI
      error: ansiColors.red,
      warning: ansiColors.yellow,
      success: ansiColors.green,
      info: ansiColors.cyan,

      // Text colors
      text: fg,
      textMuted,
      selectedListItemText: bg,

      // Background colors - use transparent to respect terminal transparency
      background: transparent,
      backgroundPanel: grays[2],
      backgroundElement: grays[3],
      backgroundMenu: grays[3],

      // Border colors
      borderSubtle: grays[6],
      border: grays[7],
      borderActive: grays[8],

      // Diff colors
      diffAdded: ansiColors.green,
      diffRemoved: ansiColors.red,
      diffContext: grays[7],
      diffHunkHeader: grays[7],
      diffHighlightAdded: ansiColors.greenBright,
      diffHighlightRemoved: ansiColors.redBright,
      diffAddedBg,
      diffRemovedBg,
      diffContextBg,
      diffLineNumber,
      diffAddedLineNumberBg,
      diffRemovedLineNumberBg,

      // Markdown colors
      markdownText: fg,
      markdownHeading: fg,
      markdownLink: ansiColors.blue,
      markdownLinkText: ansiColors.cyan,
      markdownCode: ansiColors.green,
      markdownBlockQuote: ansiColors.yellow,
      markdownEmph: ansiColors.yellow,
      markdownStrong: fg,
      markdownHorizontalRule: grays[7],
      markdownListItem: ansiColors.blue,
      markdownListEnumeration: ansiColors.cyan,
      markdownImage: ansiColors.blue,
      markdownImageText: ansiColors.cyan,
      markdownCodeBlock: fg,

      // Arcane DNA tokens
      borderThinking: grays[5],
      surfaceAlt: grays[2],

      // Spine command-spine tokens — softened for premium feel
      spineBrand: fg,
      spineContext: textMuted,
      spineRail: grays[5],
      spineRailActive: grays[7],
      spineActor: textMuted,
      spineAsk: ansiColors.magenta,
      spineThink: textMuted,
      spineInspect: ansiColors.blue,
      spinePlan: ansiColors.magenta,
      spinePatch: ansiColors.magenta,
      spineRun: ansiColors.magenta,
      spineFail: soften(ansiColors.red),
      spineFix: ansiColors.yellow,
      spineOk: soften(ansiColors.green),
      spinePrompt: ansiColors.magenta,
      spineDiffAdd: soften(ansiColors.green, 0.3),
      spineDiffRemove: soften(ansiColors.red, 0.3),
      spineDiffMuted: textMuted,
      spineGutterElapsed: textMuted,
      spineGutterTimestamp: textMuted,

      // Syntax colors
      syntaxComment: textMuted,
      syntaxKeyword: ansiColors.magenta,
      syntaxFunction: ansiColors.blue,
      syntaxVariable: fg,
      syntaxString: ansiColors.green,
      syntaxNumber: ansiColors.yellow,
      syntaxType: ansiColors.cyan,
      syntaxOperator: ansiColors.cyan,
      syntaxPunctuation: fg,
    },
  }
}

function generateGrayScale(bg: RGBA, isDark: boolean): Record<number, RGBA> {
  const grays: Record<number, RGBA> = {}

  // RGBA stores floats in range 0-1, convert to 0-255
  const bgR = bg.r * 255
  const bgG = bg.g * 255
  const bgB = bg.b * 255

  const luminance = bgLuminance(bg) * 255

  for (let i = 1; i <= 12; i++) {
    const factor = i / 12.0

    let grayValue: number
    let newR: number
    let newG: number
    let newB: number

    if (isDark) {
      if (luminance < 10) {
        grayValue = Math.floor(factor * 0.4 * 255)
        newR = grayValue
        newG = grayValue
        newB = grayValue
      } else {
        const newLum = luminance + (255 - luminance) * factor * 0.4

        const ratio = newLum / luminance
        newR = Math.min(bgR * ratio, 255)
        newG = Math.min(bgG * ratio, 255)
        newB = Math.min(bgB * ratio, 255)
      }
    } else {
      if (luminance > 245) {
        grayValue = Math.floor(255 - factor * 0.4 * 255)
        newR = grayValue
        newG = grayValue
        newB = grayValue
      } else {
        const newLum = luminance * (1 - factor * 0.4)

        const ratio = newLum / luminance
        newR = Math.max(bgR * ratio, 0)
        newG = Math.max(bgG * ratio, 0)
        newB = Math.max(bgB * ratio, 0)
      }
    }

    grays[i] = RGBA.fromInts(Math.floor(newR), Math.floor(newG), Math.floor(newB))
  }

  return grays
}

function generateMutedTextColor(bg: RGBA, isDark: boolean): RGBA {
  // RGBA stores floats in range 0-1; the thresholds below are 8-bit.
  const bgLum = bgLuminance(bg) * 255

  let grayValue: number

  if (isDark) {
    if (bgLum < 10) {
      // Very dark/black background
      grayValue = 180 // #b4b4b4
    } else {
      // Scale up for lighter dark backgrounds
      grayValue = Math.min(Math.floor(160 + bgLum * 0.3), 200)
    }
  } else {
    if (bgLum > 245) {
      // Very light/white background
      grayValue = 75 // #4b4b4b
    } else {
      // Scale down for darker light backgrounds
      grayValue = Math.max(Math.floor(100 - (255 - bgLum) * 0.2), 60)
    }
  }

  return RGBA.fromInts(grayValue, grayValue, grayValue)
}

export function generateSyntax(theme: Theme) {
  return SyntaxStyle.fromTheme(getSyntaxRules(theme))
}

export function generateSubtleSyntax(theme: Theme, overrides?: SyntaxStyleOverrides) {
  const rules = getSyntaxRules(theme)
  return SyntaxStyle.fromTheme(
    rules.map((rule) => {
      const override = rule.scope.reduce((acc, scope) => ({ ...acc, ...overrides?.[scope] }), {})
      if (rule.style.foreground) {
        const fg = rule.style.foreground
        return {
          ...rule,
          style: {
            ...rule.style,
            ...override,
            foreground: RGBA.fromInts(
              Math.round(fg.r * 255),
              Math.round(fg.g * 255),
              Math.round(fg.b * 255),
              Math.round(theme.thinkingOpacity * 255),
            ),
          },
        }
      }
      return rule
    }),
  )
}

function getSyntaxRules(theme: Theme) {
  return [
    {
      scope: ["default"],
      style: {
        foreground: theme.text,
      },
    },
    {
      scope: ["prompt"],
      style: {
        foreground: theme.accent,
      },
    },
    {
      scope: ["extmark.file"],
      style: {
        foreground: theme.warning,
        bold: true,
      },
    },
    {
      scope: ["extmark.agent"],
      style: {
        foreground: theme.secondary,
        bold: true,
      },
    },
    {
      scope: ["extmark.paste"],
      style: {
        foreground: selectedForeground(theme, theme.warning),
        background: theme.warning,
        bold: true,
      },
    },
    {
      scope: ["comment"],
      style: {
        foreground: theme.syntaxComment,
        italic: true,
      },
    },
    {
      scope: ["comment.documentation"],
      style: {
        foreground: theme.syntaxComment,
        italic: true,
      },
    },
    {
      scope: ["string", "symbol"],
      style: {
        foreground: theme.syntaxString,
      },
    },
    {
      scope: ["number", "boolean"],
      style: {
        foreground: theme.syntaxNumber,
      },
    },
    {
      scope: ["character.special"],
      style: {
        foreground: theme.syntaxString,
      },
    },
    {
      scope: ["keyword.return", "keyword.conditional", "keyword.repeat", "keyword.coroutine"],
      style: {
        foreground: theme.syntaxKeyword,
        italic: true,
      },
    },
    {
      scope: ["keyword.type"],
      style: {
        foreground: theme.syntaxType,
        bold: true,
        italic: true,
      },
    },
    {
      scope: ["keyword.function", "function.method"],
      style: {
        foreground: theme.syntaxFunction,
      },
    },
    {
      scope: ["keyword"],
      style: {
        foreground: theme.syntaxKeyword,
        italic: true,
      },
    },
    {
      scope: ["keyword.import"],
      style: {
        foreground: theme.syntaxKeyword,
      },
    },
    {
      scope: ["operator", "keyword.operator", "punctuation.delimiter"],
      style: {
        foreground: theme.syntaxOperator,
      },
    },
    {
      scope: ["keyword.conditional.ternary"],
      style: {
        foreground: theme.syntaxOperator,
      },
    },
    {
      scope: ["variable", "variable.parameter", "function.method.call", "function.call"],
      style: {
        foreground: theme.syntaxVariable,
      },
    },
    {
      scope: ["variable.member", "function", "constructor"],
      style: {
        foreground: theme.syntaxFunction,
      },
    },
    {
      scope: ["type", "module"],
      style: {
        foreground: theme.syntaxType,
      },
    },
    {
      scope: ["constant"],
      style: {
        foreground: theme.syntaxNumber,
      },
    },
    {
      scope: ["property"],
      style: {
        foreground: theme.syntaxVariable,
      },
    },
    {
      scope: ["class"],
      style: {
        foreground: theme.syntaxType,
      },
    },
    {
      scope: ["parameter"],
      style: {
        foreground: theme.syntaxVariable,
      },
    },
    {
      scope: ["punctuation", "punctuation.bracket"],
      style: {
        foreground: theme.syntaxPunctuation,
      },
    },
    {
      scope: ["variable.builtin", "type.builtin", "function.builtin", "module.builtin", "constant.builtin"],
      style: {
        foreground: theme.error,
      },
    },
    {
      scope: ["variable.super"],
      style: {
        foreground: theme.error,
      },
    },
    {
      scope: ["string.escape", "string.regexp"],
      style: {
        foreground: theme.syntaxKeyword,
      },
    },
    {
      scope: ["keyword.directive"],
      style: {
        foreground: theme.syntaxKeyword,
        italic: true,
      },
    },
    {
      scope: ["punctuation.special"],
      style: {
        foreground: theme.syntaxOperator,
      },
    },
    {
      scope: ["keyword.modifier"],
      style: {
        foreground: theme.syntaxKeyword,
        italic: true,
      },
    },
    {
      scope: ["keyword.exception"],
      style: {
        foreground: theme.syntaxKeyword,
        italic: true,
      },
    },
    // Markdown specific styles
    {
      scope: ["markup.heading"],
      style: {
        foreground: theme.markdownHeading,
        bold: true,
      },
    },
    {
      scope: ["markup.heading.1"],
      style: {
        foreground: theme.markdownHeading,
        bold: true,
        underline: true,
      },
    },
    {
      scope: ["markup.heading.2"],
      style: {
        foreground: theme.markdownHeading,
        bold: true,
      },
    },
    {
      scope: ["markup.heading.3"],
      style: {
        foreground: theme.markdownHeading,
        bold: true,
      },
    },
    {
      scope: ["markup.heading.4"],
      style: {
        foreground: theme.markdownHeading,
        bold: true,
      },
    },
    {
      scope: ["markup.heading.5"],
      style: {
        foreground: theme.markdownHeading,
        bold: true,
      },
    },
    {
      scope: ["markup.heading.6"],
      style: {
        foreground: theme.markdownHeading,
        bold: true,
      },
    },
    {
      scope: ["markup.bold", "markup.strong"],
      style: {
        foreground: theme.markdownStrong,
        bold: true,
      },
    },
    {
      scope: ["markup.italic"],
      style: {
        foreground: theme.markdownEmph,
        italic: true,
      },
    },
    {
      scope: ["markup.list"],
      style: {
        foreground: theme.markdownListItem,
      },
    },
    {
      scope: ["markup.quote"],
      style: {
        foreground: theme.markdownBlockQuote,
        italic: true,
      },
    },
    {
      scope: ["markup.raw", "markup.raw.block"],
      style: {
        foreground: theme.markdownCode,
      },
    },
    {
      scope: ["markup.raw.inline"],
      style: {
        foreground: theme.markdownCode,
        background: theme.background,
      },
    },
    {
      scope: ["markup.link"],
      style: {
        foreground: theme.markdownLink,
        underline: true,
      },
    },
    {
      scope: ["markup.link.label"],
      style: {
        foreground: theme.markdownLinkText,
        underline: true,
      },
    },
    {
      scope: ["markup.link.url"],
      style: {
        foreground: theme.markdownLink,
        underline: true,
      },
    },
    {
      scope: ["label"],
      style: {
        foreground: theme.markdownLinkText,
      },
    },
    {
      scope: ["spell", "nospell"],
      style: {
        foreground: theme.text,
      },
    },
    {
      scope: ["conceal"],
      style: {
        foreground: theme.textMuted,
      },
    },
    // Additional common highlight groups
    {
      scope: ["string.special", "string.special.url"],
      style: {
        foreground: theme.markdownLink,
        underline: true,
      },
    },
    {
      scope: ["character"],
      style: {
        foreground: theme.syntaxString,
      },
    },
    {
      scope: ["float"],
      style: {
        foreground: theme.syntaxNumber,
      },
    },
    {
      scope: ["comment.error"],
      style: {
        foreground: theme.error,
        italic: true,
        bold: true,
      },
    },
    {
      scope: ["comment.warning"],
      style: {
        foreground: theme.warning,
        italic: true,
        bold: true,
      },
    },
    {
      scope: ["comment.todo", "comment.note"],
      style: {
        foreground: theme.info,
        italic: true,
        bold: true,
      },
    },
    {
      scope: ["namespace"],
      style: {
        foreground: theme.syntaxType,
      },
    },
    {
      scope: ["field"],
      style: {
        foreground: theme.syntaxVariable,
      },
    },
    {
      scope: ["type.definition"],
      style: {
        foreground: theme.syntaxType,
        bold: true,
      },
    },
    {
      scope: ["keyword.export"],
      style: {
        foreground: theme.syntaxKeyword,
      },
    },
    {
      scope: ["attribute", "annotation"],
      style: {
        foreground: theme.warning,
      },
    },
    {
      scope: ["tag"],
      style: {
        foreground: theme.error,
      },
    },
    {
      scope: ["tag.attribute"],
      style: {
        foreground: theme.syntaxKeyword,
      },
    },
    {
      scope: ["tag.delimiter"],
      style: {
        foreground: theme.syntaxOperator,
      },
    },
    {
      scope: ["markup.strikethrough"],
      style: {
        foreground: theme.textMuted,
      },
    },
    {
      scope: ["markup.underline"],
      style: {
        foreground: theme.text,
        underline: true,
      },
    },
    {
      scope: ["markup.list.checked"],
      style: {
        foreground: theme.success,
      },
    },
    {
      scope: ["markup.list.unchecked"],
      style: {
        foreground: theme.textMuted,
      },
    },
    {
      scope: ["diff.plus"],
      style: {
        foreground: theme.diffAdded,
        background: theme.diffAddedBg,
      },
    },
    {
      scope: ["diff.minus"],
      style: {
        foreground: theme.diffRemoved,
        background: theme.diffRemovedBg,
      },
    },
    {
      scope: ["diff.delta"],
      style: {
        foreground: theme.diffContext,
        background: theme.diffContextBg,
      },
    },
    {
      scope: ["error"],
      style: {
        foreground: theme.error,
        bold: true,
      },
    },
    {
      scope: ["warning"],
      style: {
        foreground: theme.warning,
        bold: true,
      },
    },
    {
      scope: ["info"],
      style: {
        foreground: theme.info,
      },
    },
    {
      scope: ["debug"],
      style: {
        foreground: theme.textMuted,
      },
    },
  ]
}
