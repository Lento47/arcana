import { SyntaxStyle, RGBA, type TerminalColors } from "@opentui/core"
import { contrastingInk, ensureMinContrast, hslToRgba, relativeLuminance, rgbaToHsl, srgbToLinear } from "./contrast"
import { APCA_BAND_LC, apcaBandForRatio, apcaContrast, apcaPasses, apcaTargetLuminance, type ApcaBand } from "./apca"
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
/**
 * Global monochrome strength. `off` keeps the palette exactly as authored,
 * `soft` desaturates it while keeping its own luminance structure, `full`
 * re-draws it on the designed ramp.
 */
export type MonoMode = "off" | "soft" | "full"

/**
 * Per-theme monochrome character: the hue to cast with and the two saturation
 * strengths. A theme can also declare `mono: false` to opt out entirely.
 */
export type MonoCharacter = {
  hue?: number
  structure?: number
  identity?: number
}

export type ThemeJson = {
  $schema?: string
  /**
   * Inherit every token and `defs` entry this theme does not define from
   * another theme (built-in, plugin or custom). Missing keys used to fall back
   * to gray, which made a three-line tweak theme render as a broken app.
   */
  extends?: string
  /** Monochrome declaration for this theme: false opts out, an object tunes it. */
  mono?: boolean | MonoCharacter
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
 * Shipped palettes take the designed monochrome ramp by default; `soft` and
 * `off` are opt-outs (config or a theme's own `mono` declaration).
 */
const DEFAULT_MONO_MODE: MonoMode = "full"

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
 * Flatten an `extends` chain into one ThemeJson. `defs` and `theme` merge with
 * the child winning; an unknown or cyclic base is ignored with a warning rather
 * than crashing the resolver (a broken custom file must not take the TUI down).
 */
function resolveInherited(theme: ThemeJson, seen = new Set<ThemeJson>()): ThemeJson {
  const baseName = theme.extends
  if (!baseName) return theme
  const base = listThemes()[baseName]
  if (!base || base === theme || seen.has(base)) {
    if (!base) console.warn(`[theme] "${baseName}" extends an unknown theme; ignored`)
    return theme
  }
  seen.add(theme)
  const inherited = resolveInherited(base, seen)
  return {
    ...theme,
    // A child that does not declare mono inherits the base's declaration.
    mono: theme.mono ?? inherited.mono,
    defs: { ...inherited.defs, ...theme.defs },
    theme: { ...inherited.theme, ...theme.theme },
  }
}

export function resolveTheme(
  theme: ThemeJson,
  mode: "dark" | "light",
  options?: { mono?: MonoMode; report?: ThemeAdjustment[] },
) {
  const source = resolveInherited(theme)
  const merged = { ...source.theme }
  const defs = source.defs ?? {}
  const monoMode: MonoMode = source.mono === false ? "off" : (options?.mono ?? DEFAULT_MONO_MODE)
  const character = typeof source.mono === "object" ? source.mono : undefined
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

  // Monochrome layer. `full` re-draws the palette on the designed ramp (cast
  // tinted); `soft` desaturates it while keeping its own structure; `off`
  // leaves it exactly as authored. Runs BEFORE the optional-token fallbacks so
  // they follow the transformed tokens instead of snapshotting the originals.
  if (monoMode === "full") applyDesignedMonochrome(resolved, mode, character)
  else if (monoMode === "soft") applyMonochrome(resolved, THEME_MONOCHROME)

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
  if (monoMode === "full") applyDesignedMonochrome(resolved, mode, character)

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
  // re-space the spine signal roles by lightness, then guard contrast. The
  // ladder only applies to the designed ramp; `soft` keeps the palette's own
  // (hue-distinct) roles, and `off` leaves everything alone.
  if (monoMode === "full") {
    // Explicit spine* colors in the palette JSON resolve through spineFB, after
    // the design passes above; run the ramp once more so the whole spine sits
    // on the designed ladder before the role ladder re-spaces its signal roles.
    applyDesignedMonochrome(resolved, mode, character)
    clampToCast(resolved, mode, character)
    spaceMonochromeRoles(resolved, mode, character)
  }
  applyReadabilityFloor(resolved, options?.report)

  return {
    ...resolved,
    _hasSelectedListItemText: hasSelectedListItemText,
    thinkingOpacity,
  } as Theme
}

/**
 * Resolve a theme and report every token the readability floor had to lift.
 * The designed ramp is authored inside the floors, so a built-in theme should
 * report zero adjustments; an authored palette shows exactly which colors the
 * contrast guarantee overrode, and against which ratio.
 */
export function inspectTheme(
  theme: ThemeJson,
  mode: "dark" | "light",
  options?: { mono?: MonoMode },
): { theme: Theme; adjustments: ThemeAdjustment[]; apca: ApcaReading[] } {
  const adjustments: ThemeAdjustment[] = []
  const resolved = resolveTheme(theme, mode, { mono: options?.mono, report: adjustments })
  // A token can be lifted twice (diff highlights against two surfaces); keep
  // the final adjustment per token.
  const last = new Map<string, ThemeAdjustment>()
  for (const adjustment of adjustments) last.set(adjustment.token, adjustment)
  return { theme: resolved, adjustments: [...last.values()], apca: apcaAudit(resolved) }
}

/** Temperature family for a hue in degrees. */
function hueFamily(hue: number) {
  if (hue < 70 || hue >= 330) return "warm"
  if (hue < 160) return "green"
  if (hue < 260) return "cool"
  return "violet"
}

/** Hue name for a hue in degrees. */
function hueName(hue: number) {
  if (hue < 15 || hue >= 345) return "red"
  if (hue < 45) return "amber"
  if (hue < 70) return "yellow"
  if (hue < 160) return "green"
  if (hue < 195) return "teal"
  if (hue < 250) return "blue"
  if (hue < 290) return "violet"
  if (hue < 330) return "magenta"
  return "red"
}

/**
 * One-line character summary for the theme picker: the authored accent's hue
 * family, plus the declarations that change what the user will actually see (a
 * theme that opts out of the monochrome layer, a theme that is not built in).
 */
export function themeCharacter(name: string, theme: ThemeJson): string {
  let accent: RGBA | undefined
  try {
    accent = resolveTheme(theme, "dark", { mono: "off" }).accent
  } catch {
    // A broken custom theme (circular refs) must not take the picker down.
    accent = undefined
  }
  const parts: string[] = []
  if (accent) {
    const { h, s } = rgbaToHsl(accent)
    const family = hueFamily(h)
    const label = hueName(h)
    parts.push(s < 0.08 ? "neutral" : family === label ? label : `${family} ${label}`)
  } else {
    parts.push("unresolved")
  }
  if (theme.mono === false) parts.push("keeps its palette")
  if (!DEFAULT_THEMES[name]) parts.push("custom")
  return parts.join(" · ")
}

export type ThemeIssue = { level: "error" | "warning"; message: string }

/** Tokens every theme must resolve (after inheritance) or the UI breaks. */
const REQUIRED_THEME_TOKENS = [
  "background",
  "backgroundPanel",
  "backgroundElement",
  "border",
  "borderSubtle",
  "text",
  "textMuted",
  "primary",
  "accent",
  "info",
  "success",
  "warning",
  "error",
] as const

const HEX_COLOR = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

let knownThemeKeys: Set<string> | undefined

/** Every token name any built-in declares, plus the optional ones. */
function knownTokenKeys() {
  if (!knownThemeKeys) {
    knownThemeKeys = new Set(Object.values(DEFAULT_THEMES).flatMap((theme) => Object.keys(theme.theme)))
    for (const key of ["backgroundMenu", "borderThinking", "surfaceAlt", "selectedListItemText", "thinkingOpacity"]) {
      knownThemeKeys.add(key)
    }
  }
  return knownThemeKeys
}

/** The `extends` chain from a theme up to a cycle or an unknown base. */
function inheritanceChain(name: string, theme: ThemeJson): ThemeJson[] {
  const chain = [theme]
  const seen = new Set<string>([name])
  let current = theme
  while (current.extends) {
    const baseName = current.extends
    if (seen.has(baseName)) break
    seen.add(baseName)
    const base = allThemes()[baseName]
    if (!base) break
    chain.push(base)
    current = base
  }
  return chain
}

function checkColorValue(
  label: string,
  value: unknown,
  defs: Set<string>,
  tokens: Set<string>,
  issues: ThemeIssue[],
) {
  if (typeof value === "string") {
    if (value === "transparent" || value === "none") return
    if (value.startsWith("#")) {
      if (!HEX_COLOR.test(value)) {
        issues.push({ level: "warning", message: `${label}: "${value}" is not a valid hex color` })
      }
      return
    }
    if (!defs.has(value) && !tokens.has(value)) {
      issues.push({ level: "warning", message: `${label}: unknown reference "${value}" (renders as fallback gray)` })
    }
    return
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      issues.push({ level: "warning", message: `${label}: ANSI code must be an integer in [0, 255]` })
    }
    return
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const variant = value as Record<string, unknown>
    const modes = (["dark", "light"] as const).filter((mode) => mode in variant)
    if (modes.length === 0) {
      issues.push({ level: "warning", message: `${label}: object values need dark/light keys` })
      return
    }
    for (const mode of modes) checkColorValue(`${label}.${mode}`, variant[mode], defs, tokens, issues)
    return
  }
  issues.push({ level: "warning", message: `${label}: unsupported value` })
}

/**
 * Static checks for a theme file: unknown tokens, dangling references,
 * malformed colors, an unresolvable `extends`, missing required tokens and an
 * out-of-range `mono` declaration. Built-ins are lint-clean; the checks exist
 * for custom themes (`arcana theme lint`).
 */
export function lintTheme(name: string, theme: ThemeJson): ThemeIssue[] {
  const issues: ThemeIssue[] = []
  const chain = inheritanceChain(name, theme)
  if (theme.extends && chain.length === 1) {
    issues.push({ level: "warning", message: `extends unknown theme "${theme.extends}"` })
  }
  const known = knownTokenKeys()
  for (const key of Object.keys(theme.theme)) {
    if (!known.has(key)) issues.push({ level: "warning", message: `unknown token "${key}"` })
  }
  const defs = new Set(chain.flatMap((entry) => Object.keys(entry.defs ?? {})))
  const tokens = new Set(chain.flatMap((entry) => Object.keys(entry.theme)))
  for (const [key, value] of Object.entries(theme.theme)) {
    // `thinkingOpacity` is a number, not an ANSI color code.
    if (key === "thinkingOpacity") continue
    checkColorValue(key, value, defs, tokens, issues)
  }
  let resolved: Theme | undefined
  try {
    resolved = resolveTheme(theme, "dark", { mono: "off" })
  } catch (error) {
    issues.push({
      level: "error",
      message: `resolution failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
  if (resolved) {
    for (const token of REQUIRED_THEME_TOKENS) {
      if (!resolved[token]) issues.push({ level: "error", message: `missing token "${token}"` })
    }
  }
  if (theme.mono && typeof theme.mono === "object") {
    const { hue, structure, identity } = theme.mono
    if (hue !== undefined && !(Number.isFinite(hue) && hue >= 0 && hue < 360)) {
      issues.push({ level: "warning", message: "mono.hue must be in [0, 360)" })
    }
    if (structure !== undefined && !(Number.isFinite(structure) && structure >= 0 && structure <= 1)) {
      issues.push({ level: "warning", message: "mono.structure must be in [0, 1]" })
    }
    if (identity !== undefined && !(Number.isFinite(identity) && identity >= 0 && identity <= 1)) {
      issues.push({ level: "warning", message: "mono.identity must be in [0, 1]" })
    }
  }
  return issues
}

/** Lint every known theme; only themes with issues are returned. */
export function lintThemes(): Array<{ name: string; issues: ThemeIssue[] }> {
  return Object.entries(allThemes())
    .map(([name, theme]) => ({ name, issues: lintTheme(name, theme) }))
    .filter((result) => result.issues.length > 0)
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

/**
 * Dark ink rungs are shaped by APCA, not HSL lightness.
 *
 * On near-black surfaces WCAG 2.x ratios overestimate perceived contrast: an
 * HSL ladder that clears every WCAG floor still lands mid rungs at APCA |Lc|
 * 30–50, where fluent text needs 60 (and body ink 75). The result was a dim
 * perceptual valley between the near-black surfaces and the bright top rungs.
 * These targets are the APCA |Lc| for each ink step; the luminance is solved
 * against the designed background with `apcaLuminanceForLc` and pinned by
 * `castColor`, so the ladder is perceptually even while the WCAG floor stays
 * the hard gate.
 *
 * Steps 7/8 are rails and comments (non-text 30 / sub-fluent 45); 9–13 carry
 * muted and semantic ink (fluent 60+); 14–17 carry body ink and headings.
 */
const MONO_DARK_LC: Partial<Record<number, number>> = {
  7: 33,
  8: 49,
  9: 61,
  10: 67,
  11: 73,
  12: 79,
  13: 85,
  14: 91,
  15: 96,
  16: 100,
  17: 103,
}

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
  // The 3.8:1 floor is also checked against the diff surface (step 1), so line
  // numbers sit one rung above the comment level.
  diffLineNumber: 9,
  // Spine roles that do not participate in the ladder. Explicit spine* colors
  // in a palette JSON bypassed the design pass entirely and were then lifted by
  // the floor; mapping them here keeps the whole spine on the ramp.
  spineActor: 10,
  spineContext: 10,
  spineThink: 12,
  spineDiffMuted: 9,
  spineGutterElapsed: 9,
  spineGutterTimestamp: 9,
  spineSubagent: 13,
  spineFail: 14,
  spineFix: 16,
  spineOk: 11,
  spineDiffAdd: 11,
  spineDiffRemove: 11,
  spineRail: 8,
  spineRailActive: 12,
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
  markdownHorizontalRule: 10,
  syntaxKeyword: 5,
  syntaxString: 8,
  syntaxNumber: 6,
  syntaxType: 5,
  syntaxOperator: 7,
  syntaxComment: 10,
  syntaxVariable: 4,
  syntaxPunctuation: 5,
  syntaxFunction: 4,
  diffAdded: 6,
  diffRemoved: 6,
  diffContext: 7,
  diffHunkHeader: 6,
  diffHighlightAdded: 4,
  diffHighlightRemoved: 4,
  diffLineNumber: 9,
  // Spine roles that do not participate in the ladder (see the dark map).
  spineActor: 9,
  spineContext: 9,
  spineThink: 6,
  spineDiffMuted: 9,
  spineGutterElapsed: 9,
  spineGutterTimestamp: 9,
  spineSubagent: 6,
  spineFail: 9,
  spineFix: 7,
  spineOk: 9,
  spineDiffAdd: 6,
  spineDiffRemove: 6,
  spineRail: 12,
  spineRailActive: 10,
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

function monochromeCast(
  theme: Partial<Record<ThemeColor, RGBA>>,
  mode: "dark" | "light",
  character?: MonoCharacter,
) {
  // The accent is the theme's declared identity; fall back to the primary and
  // only then to the background, which is often nearly neutral.
  const accent = theme.accent ? rgbaToHsl(theme.accent) : undefined
  const primary = theme.primary ? rgbaToHsl(theme.primary) : undefined
  const background = theme.background && theme.background.a > 0 ? rgbaToHsl(theme.background) : undefined
  const source = [accent, primary, background].find((hsl) => hsl && hsl.s > 0.05) ?? accent ?? primary ?? background
  return {
    hue: character?.hue ?? source?.h ?? 0,
    sat: character?.structure ?? (mode === "dark" ? MONO_STRUCTURE_SAT : MONO_STRUCTURE_SAT_LIGHT),
    identitySat: character?.identity ?? (mode === "dark" ? MONO_IDENTITY_SAT : MONO_IDENTITY_SAT_LIGHT),
  }
}

/**
 * A cast-tinted color carrying (approximately) the requested WCAG luminance.
 *
 * Tinting in HSL at constant lightness shifts luminance — a blue-tinted gray is
 * darker than a neutral one at the same lightness — which silently pushed ramp
 * steps below their contrast floors, so the floor "lifted" tokens the ramp had
 * just designed. Scaling the linear channels preserves the tint direction and
 * pins the luminance, so every step ships the contrast it was authored for.
 * Falls back to the neutral gray when the tint cannot reach the target inside
 * the sRGB gamut.
 */
function castColor(hue: number, sat: number, luminance: number, alpha: number): RGBA {
  const neutral = grayFromLuminance(luminance)
  const fallback = RGBA.fromValues(neutral, neutral, neutral, alpha)
  if (sat <= 0) return fallback
  let color = hslToRgba(hue, sat, neutral, alpha)
  // Re-scale after quantization: each pass preserves the channel ratios (the
  // tint) and moves the measured luminance toward the target.
  for (let i = 0; i < 3; i++) {
    const y = relativeLuminance(color)
    if (!(y > 0)) return fallback
    const k = luminance / y
    const r = srgbToLinear(color.r) * k
    const g = srgbToLinear(color.g) * k
    const b = srgbToLinear(color.b) * k
    if (r > 1 || g > 1 || b > 1) return fallback
    color = RGBA.fromValues(linearToSrgb(r), linearToSrgb(g), linearToSrgb(b), alpha)
  }
  return color
}

/** Re-draw every structural token on the designed ladder, cast-tinted. */
function applyDesignedMonochrome(
  theme: Partial<Record<ThemeColor, RGBA>>,
  mode: "dark" | "light",
  character?: MonoCharacter,
) {
  const steps = mode === "dark" ? MONO_DARK_STEPS : MONO_LIGHT_STEPS
  const map = mode === "dark" ? MONO_DARK_MAP : MONO_LIGHT_MAP
  const cast = monochromeCast(theme, mode, character)
  // Ink rungs with an APCA target are solved against the designed surface so
  // perception, not linear light, spaces the ladder. Surfaces are designed
  // before ink in both maps, so the surface is already on the ramp here.
  const surface = () =>
    theme.background && theme.background.a === 0 ? (theme.backgroundPanel ?? theme.background) : theme.background
  for (const [key, step] of Object.entries(map) as Array<[ThemeColor, number]>) {
    const current = theme[key]
    if (!current) continue
    const sat = MONO_IDENTITY_TOKENS.has(key) ? cast.identitySat : cast.sat
    const lc = mode === "dark" ? MONO_DARK_LC[step] : undefined
    const base = lc !== undefined ? surface() : undefined
    const target =
      lc !== undefined && base
        ? (apcaTargetLuminance(base, -lc) ?? srgbToLinear(steps[step]!))
        : srgbToLinear(steps[step]!)
    theme[key] = castColor(cast.hue, sat, target, current.a)
  }
}

/**
 * Cap every remaining token at the cast's saturation, keeping its lightness.
 * The design pass only re-draws the tokens it maps; an explicit `spine*` key in
 * the palette JSON (or any future token) otherwise stayed fully saturated and
 * rendered as a colored chip in an otherwise gray UI. Custom themes are exempt:
 * their desaturation is the 0.85 transform, not this cast.
 */
function clampToCast(
  theme: Partial<Record<ThemeColor, RGBA>>,
  mode: "dark" | "light",
  character?: MonoCharacter,
) {
  const cast = monochromeCast(theme, mode, character)
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
/** Ladder roles are sub-fluent chrome labels; ARC's floor for that is Lc 45. */
const LADDER_LC = 45
/** Keep the role ladder clear of body ink on dark surfaces. */
const LADDER_INK_CLEARANCE = 0.05

function spaceMonochromeRoles(
  theme: Partial<Record<ThemeColor, RGBA>>,
  mode: "dark" | "light",
  character?: MonoCharacter,
) {
  const surface = theme.background && theme.background.a === 0 ? theme.backgroundPanel : theme.background
  const text = theme.text
  if (!surface || !text) return
  const cast = monochromeCast(theme, mode, character)
  const lightBg = relativeLuminance(surface) > 0.5
  // The strictest surface these roles are checked against. Dark ink gets
  // brighter, so the strictest dark surface is the LIGHTEST (menu); light ink
  // gets darker, so the strictest light surface is the DARKEST. Picking the
  // opposite end let the floor lift roles the ladder had just placed.
  const surfaces = [surface, theme.backgroundMenu, theme.backgroundPanel].filter(Boolean) as RGBA[]
  const strictest = surfaces.reduce((a, b) => {
    const la = relativeLuminance(a)
    const lb = relativeLuminance(b)
    return lightBg ? (la < lb ? a : b) : la > lb ? a : b
  })
  const surfaceLum = relativeLuminance(strictest)
  // Compact chrome labels are sub-fluent text: ARC allows Lc 45 for those, and
  // the wider band that buys is what keeps six roles visibly stepped apart.
  // The bound must satisfy BOTH gates — the WCAG 4.5 floor (the hard
  // invariant) and APCA 45 — and which one binds depends on polarity: on dark
  // surfaces APCA is stricter, on light surfaces the WCAG ratio is. The floor
  // side is bound at 4.6 so castColor rounding can never drop the least
  // prominent role back under 4.5.
  const floorLum = lightBg ? (surfaceLum + 0.05) / 4.6 - 0.05 : 4.6 * (surfaceLum + 0.05) - 0.05
  const apcaLum = apcaTargetLuminance(strictest, lightBg ? LADDER_LC : -LADDER_LC)
  const boundLum = apcaLum === undefined ? floorLum : lightBg ? Math.min(floorLum, apcaLum) : Math.max(floorLum, apcaLum)
  const boundGray = grayFromLuminance(boundLum)
  const textGray = grayFromLuminance(relativeLuminance(text))
  const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
  // Dark surfaces put body text at the bright end, so the ladder keeps clear of
  // it. Light surfaces put text in the middle of the usable band, so the ladder
  // may span the whole band — that is what keeps its steps wide.
  const band = lightBg
    ? { lo: 0, hi: clamp01(boundGray) }
    : { lo: clamp01(boundGray), hi: clamp01(textGray - LADDER_INK_CLEARANCE) }
  const span = Math.max(0, band.hi - band.lo)
  const gap = Math.min(MONO_ROLE_MAX_GAP, span / MONO_LADDER_KEYS.length)
  // Prominent end of the band: brighter on a dark surface, darker on a light
  // one. Brand is pinned there; the six signal roles ladder away from it in
  // their original prominence order.
  const brandGray = clamp01(lightBg ? band.lo : band.hi)
  const brand = theme.spineBrand
  if (brand) theme.spineBrand = castColor(cast.hue, cast.identitySat, srgbToLinear(brandGray), brand.a)
  const roles = MONO_LADDER_KEYS.map((key) => ({ key, lum: relativeLuminance(theme[key]!) })).sort((a, b) =>
    lightBg ? a.lum - b.lum : b.lum - a.lum,
  )
  roles.forEach((role, index) => {
    const offset = (index + 1) * gap
    const gray = clamp01(lightBg ? band.lo + offset : band.hi - offset)
    const current = theme[role.key]!
    theme[role.key] = castColor(cast.hue, cast.identitySat, srgbToLinear(gray), current.a)
  })
}

/** A token the readability floor had to lift, and the ratio that forced it. */
export type ThemeAdjustment = {
  token: ThemeColor | "selectedListItemText"
  before: RGBA
  after: RGBA
  required: number
}

/** Surfaces the readability floor and the APCA audit measure a token against. */
type FloorSurface = "background" | "panel" | "menu" | "diffAddedBg" | "diffRemovedBg" | "diffContextBg" | "primary"

type FloorRule = {
  token: ThemeColor
  surface: FloorSurface
  ratio: number
  /**
   * APCA band override. The floor ratio is the hard gate; the band says which
   * perceptual level that guarantee corresponds to. Compact chrome labels
   * (spine chips) are sub-fluent text — ARC allows Lc 45 for those — so they
   * keep a wider, clearly stepped ladder than fluent content would allow.
   */
  band?: ApcaBand
}

/**
 * Every readability guarantee in one table: which token must clear which ratio
 * against which surface. The floor lifts violations; the APCA audit re-checks
 * the same pairs with a perceptual metric, so a new token cannot be validated
 * against a surface the floor never guaranteed.
 *
 * Order matters where a token appears twice (diff highlights sit on a tinted
 * surface inside the diff block; spinePrompt also renders on the menu): the
 * later, stricter lift wins.
 */
const READABILITY_FLOORS: FloorRule[] = [
  { token: "text", surface: "background", ratio: 7 },
  { token: "textMuted", surface: "background", ratio: 4.7 },
  { token: "primary", surface: "background", ratio: 4.5 },
  { token: "secondary", surface: "background", ratio: 4.5 },
  { token: "accent", surface: "background", ratio: 4.5 },
  { token: "highlight", surface: "background", ratio: 4.5 },
  { token: "info", surface: "background", ratio: 4.5 },
  { token: "success", surface: "background", ratio: 4.5 },
  { token: "warning", surface: "background", ratio: 4.5 },
  { token: "error", surface: "background", ratio: 4.8 },
  { token: "borderSubtle", surface: "background", ratio: 2.2 },
  { token: "border", surface: "background", ratio: 2.8 },
  { token: "diffAdded", surface: "background", ratio: 4.5 },
  { token: "diffRemoved", surface: "background", ratio: 4.5 },
  { token: "diffContext", surface: "background", ratio: 4.5 },
  { token: "diffHunkHeader", surface: "background", ratio: 4.5 },
  { token: "diffHighlightAdded", surface: "background", ratio: 4.5 },
  { token: "diffHighlightRemoved", surface: "background", ratio: 4.5 },
  { token: "diffLineNumber", surface: "background", ratio: 3.8 },
  { token: "diffHighlightAdded", surface: "diffAddedBg", ratio: 4.5 },
  { token: "diffHighlightRemoved", surface: "diffRemovedBg", ratio: 4.5 },
  { token: "diffLineNumber", surface: "diffContextBg", ratio: 3.8 },
  { token: "markdownText", surface: "background", ratio: 7 },
  { token: "markdownHeading", surface: "background", ratio: 4.8 },
  { token: "markdownLink", surface: "background", ratio: 4.5 },
  { token: "markdownLinkText", surface: "background", ratio: 4.5 },
  { token: "markdownCode", surface: "background", ratio: 4.5 },
  { token: "markdownBlockQuote", surface: "background", ratio: 4.5 },
  { token: "markdownEmph", surface: "background", ratio: 4.5 },
  { token: "markdownStrong", surface: "background", ratio: 4.8 },
  { token: "markdownHorizontalRule", surface: "background", ratio: 3.8 },
  { token: "markdownListItem", surface: "background", ratio: 4.5 },
  { token: "markdownListEnumeration", surface: "background", ratio: 4.5 },
  { token: "markdownImage", surface: "background", ratio: 4.5 },
  { token: "markdownImageText", surface: "background", ratio: 4.5 },
  { token: "markdownCodeBlock", surface: "background", ratio: 7 },
  { token: "syntaxComment", surface: "background", ratio: 3.8 },
  { token: "syntaxKeyword", surface: "background", ratio: 4.5 },
  { token: "syntaxFunction", surface: "background", ratio: 4.5 },
  { token: "syntaxVariable", surface: "background", ratio: 7 },
  { token: "syntaxString", surface: "background", ratio: 4.5 },
  { token: "syntaxNumber", surface: "background", ratio: 4.5 },
  { token: "syntaxType", surface: "background", ratio: 4.5 },
  { token: "syntaxOperator", surface: "background", ratio: 4.5 },
  { token: "syntaxPunctuation", surface: "background", ratio: 7 },
  { token: "spineBrand", surface: "background", ratio: 7 },
  { token: "spineContext", surface: "background", ratio: 4.7 },
  { token: "spineActor", surface: "background", ratio: 4.5 },
  { token: "spineThink", surface: "background", ratio: 4.5 },
  { token: "spineDiffMuted", surface: "background", ratio: 4.5 },
  { token: "spineGutterElapsed", surface: "background", ratio: 4.5 },
  { token: "spineGutterTimestamp", surface: "background", ratio: 4.5 },
  { token: "spineSubagent", surface: "background", ratio: 4.5 },
  { token: "spineAsk", surface: "background", ratio: 4.5, band: "subFluent" },
  { token: "spinePlan", surface: "background", ratio: 4.5, band: "subFluent" },
  { token: "spineInspect", surface: "background", ratio: 4.5, band: "subFluent" },
  { token: "spinePatch", surface: "background", ratio: 4.5, band: "subFluent" },
  { token: "spineRun", surface: "background", ratio: 4.5, band: "subFluent" },
  { token: "spineFail", surface: "background", ratio: 4.8 },
  { token: "spineFix", surface: "background", ratio: 4.5 },
  { token: "spineOk", surface: "background", ratio: 4.5 },
  { token: "spinePrompt", surface: "background", ratio: 4.8, band: "subFluent" },
  { token: "spineDiffAdd", surface: "background", ratio: 4.5 },
  { token: "spineDiffRemove", surface: "background", ratio: 4.5 },
  { token: "spineRail", surface: "panel", ratio: 2.4 },
  { token: "spineRailActive", surface: "panel", ratio: 3.2 },
  { token: "selectedListItemText", surface: "primary", ratio: 4.5 },
  { token: "spinePrompt", surface: "menu", ratio: 4.5, band: "subFluent" },
]

function floorSurface(
  theme: Partial<Record<ThemeColor, RGBA>>,
  surface: FloorSurface,
  base: RGBA,
  panel: RGBA,
  menu: RGBA,
): RGBA | undefined {
  switch (surface) {
    case "background":
      return base
    case "panel":
      return panel
    case "menu":
      return menu
    case "diffAddedBg":
      return theme.diffAddedBg ?? base
    case "diffRemovedBg":
      return theme.diffRemovedBg ?? base
    case "diffContextBg":
      return theme.diffContextBg ?? base
    case "primary":
      return theme.primary
  }
}

function applyReadabilityFloor(theme: Partial<Record<ThemeColor, RGBA>>, report?: ThemeAdjustment[]) {
  const baseSurface =
    theme.background && theme.background.a === 0 ? (theme.backgroundPanel ?? theme.background) : theme.background
  if (!baseSurface) return
  const panel = theme.backgroundPanel ?? baseSurface
  const menu = theme.backgroundMenu ?? panel
  for (const rule of READABILITY_FLOORS) {
    const value = theme[rule.token]
    if (!value) continue
    const surface = floorSurface(theme, rule.surface, baseSurface, panel, menu)
    if (!surface) continue
    const adjusted = ensureMinContrast(value, surface, rule.ratio)
    if (adjusted !== value && report) {
      report.push({ token: rule.token, before: value, after: adjusted, required: rule.ratio })
    }
    theme[rule.token] = adjusted
  }
}

/** One APCA reading: a text token measured against the surface it renders on. */
export type ApcaReading = {
  token: ThemeColor
  surface: FloorSurface
  lc: number
  band: ApcaBand
  threshold: number
  passes: boolean
}

/**
 * Perceptual re-check of every readability guarantee with APCA. WCAG 2.x
 * ratios overestimate contrast on dark surfaces — APCA is polarity-aware and
 * predicts what a reader actually sees. Advisory only: the WCAG floor above is
 * the hard invariant, this reports where the two metrics disagree.
 */
export function apcaAudit(theme: Theme): ApcaReading[] {
  const baseSurface =
    theme.background && theme.background.a === 0 ? (theme.backgroundPanel ?? theme.background) : theme.background
  if (!baseSurface) return []
  const panel = theme.backgroundPanel ?? baseSurface
  const menu = theme.backgroundMenu ?? panel
  // A token can be checked against several surfaces; the worst reading is the
  // one that matters.
  const worst = new Map<ThemeColor, ApcaReading>()
  for (const rule of READABILITY_FLOORS) {
    const text = theme[rule.token]
    if (!text) continue
    const surface = floorSurface(theme, rule.surface, baseSurface, panel, menu)
    if (!surface) continue
    const band = rule.band ?? apcaBandForRatio(rule.ratio)
    const lc = apcaContrast(text, surface)
    const reading: ApcaReading = {
      token: rule.token,
      surface: rule.surface,
      lc,
      band,
      threshold: APCA_BAND_LC[band],
      passes: apcaPasses(lc, band),
    }
    const existing = worst.get(rule.token)
    if (!existing || Math.abs(lc) < Math.abs(existing.lc)) worst.set(rule.token, reading)
  }
  return [...worst.values()]
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
