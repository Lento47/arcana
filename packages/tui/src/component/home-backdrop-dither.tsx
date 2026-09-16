import { RGBA, StyledText, type TextChunk, type TextRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect } from "solid-js"
import { useTheme } from "../context/theme"

const DEFAULT_SEED = 0x00c0ffee
const DITHER_LEVELS = 4
/**
 * Luminance gain applied right before the ordered threshold. Authored
 * highlights reach full dot coverage, and the composition envelope can dim the
 * mid-tones without turning the raster into an empty stipple.
 */
const DITHER_DENSITY = 1.25
const DITHER_JITTER = 0.11
const MAX_DOT_ALPHA = 0.3
const QUIET_FEATHER = 0.06
const CRT_SCANLINE_DROP = 0.035
/**
 * The bottom of the screen falls away from full strength with this exponent.
 * The contract is unchanged from the original watermark: the backdrop must
 * never compete with the prompt rows.
 */
const VERTICAL_FADE_EXPONENT = 1.26
/** One static raster may not exceed this many braille dots of work. */
const MAX_DITHER_DOTS = 147_456
const MAX_RENDER_CACHE = 4
const CONTOUR_DEFINITION_THRESHOLD = 0.18
/** Distance in dot rows over which a ridge lip catches the sky. */
const RIDGE_LIP_ROWS = 2.4
/**
 * Terrain facets and grain are authored per column and per depth bucket, then
 * interpolated per dot. The raster is static, but this keeps a resize render
 * inside a frame budget on large terminals.
 */
const DEPTH_BUCKETS = 8

/**
 * The public allow-list is used by the renderer tests. Braille cells give the
 * backdrop a 2×4 subpixel grid; every mask is legal now because the raster is
 * genuinely dithered dot by dot instead of sampled from a fixed palette.
 */
const ASCII_DITHER_GLYPHS = [
  "·",
  ".",
  ":",
  "~",
  "-",
  "|",
  "/",
  "\\",
  "+",
  "^",
  "x",
  "*",
  "#",
  "%",
  "░",
  "▒",
  "▓",
  "█",
] as const
const BRAILLE_DITHER_GLYPHS = Array.from({ length: 255 }, (_, index) => String.fromCodePoint(0x2800 + index + 1))
export const HOME_DITHER_GLYPHS: readonly string[] = [...ASCII_DITHER_GLYPHS, ...BRAILLE_DITHER_GLYPHS]

/** Braille bit for [column][row] inside one terminal cell. */
const BRAILLE_BITS = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
] as const

const BAYER_8X8 = [
  [0, 48, 12, 60, 3, 51, 15, 63],
  [32, 16, 44, 28, 35, 19, 47, 31],
  [8, 56, 4, 52, 11, 59, 7, 55],
  [40, 24, 36, 20, 43, 27, 39, 23],
  [2, 50, 14, 62, 1, 49, 13, 61],
  [34, 18, 46, 30, 33, 17, 45, 29],
  [10, 58, 6, 54, 9, 57, 5, 53],
  [42, 26, 38, 22, 41, 25, 37, 21],
] as const

export type HomeBackdropSeed = number
export type HomeDitherCell = Readonly<{
  x: number
  y: number
  /** Braille bitmask for this cell; the primary ink shape of the raster. */
  mask: number
  /** Final envelope strength used for glyph ink alpha. */
  strength: number
  /** Mean dithered luminance across the cell's eight braille dots. */
  tone: number
  /** Four-level quantized tone used for accents and ink weight. */
  shade: number
  /** Local luminance contrast used for sparse contour accents. */
  definition: number
  /** Seeded glyph variation; it is stable for this terminal cell. */
  variant: number
}>

export type HomeSceneProfile = (x: number, seed: HomeBackdropSeed) => number
export type HomeSceneLight = Readonly<{ x: number; y: number }>
export type HomeSceneSky = Readonly<{
  /** Luminance at the top edge. */
  top: number
  /** Luminance at the horizon line. */
  horizon: number
  /** Star field density, 0 disables. */
  stars: number
  moon?: Readonly<{ x: number; y: number; r: number; phase: number }>
}>

export type HomeSceneTerrain = Readonly<{
  kind: "terrain"
  /** Ridge profile: the screen y of the top edge for a normalized column. */
  profile: HomeSceneProfile
  /** Body bottom; defaults to the bottom of the raster. */
  bottom?: number
  /** Tone at the ridge crest. */
  crest: number
  /** Tone at the body base. */
  base: number
  /** Facet-driven light contrast, 0 = flat fill. */
  relief?: number
  /** Surface grain strength. */
  grain?: number
  /** Surface grain frequency. */
  scale?: number
  /** Aerial haze; 1 dissolves the layer into the sky. */
  fog: number
  /** Strata band frequency, 0 disables. */
  strata?: number
  /** Extra seed salt so layers never share texture. */
  salt?: number
}>

export type HomeSceneBlock = Readonly<{
  kind: "block"
  left: number
  right: number
  top: number
  bottom: number
  tone: number
  fog: number
  /** Strength of the two-tone light/shadow split across the face. */
  relief?: number
  /** Dark window speckle density, 0 disables. */
  speckle?: number
  salt?: number
}>

export type HomeSceneDome = Readonly<{
  kind: "dome"
  cx: number
  cy: number
  rx: number
  ry: number
  tone: number
  fog: number
}>

export type HomeSceneCone = Readonly<{
  kind: "cone"
  cx: number
  halfWidth: number
  /** Apex y. */
  top: number
  /** Base y. */
  bottom: number
  tone: number
  fog: number
}>

export type HomeSceneShadow = Readonly<{
  kind: "shadow"
  cx: number
  cy: number
  rx: number
  ry: number
  /** Multiplier taken away from whatever is already painted. */
  strength: number
  feather?: number
}>

export type HomeSceneHaze = Readonly<{
  kind: "haze"
  left: number
  right: number
  top: number
  bottom: number
  tone: number
  strength: number
  feather?: number
}>

export type HomeSceneWater = Readonly<{
  /** Waterline in screen space. */
  y: number
  /** Base water luminance before reflection. */
  tone: number
  /** Reflection mix, 0 = flat water. */
  reflection: number
  /** Horizontal wave distortion in normalized units. */
  wave: number
  glint?: Readonly<{ x: number; spread: number; strength: number }>
}>

export type HomeScenePainter =
  | HomeSceneTerrain
  | HomeSceneBlock
  | HomeSceneDome
  | HomeSceneCone
  | HomeSceneShadow
  | HomeSceneHaze

export type HomeSceneId =
  | "fortress"
  | "mountain-pass"
  | "observatory"
  | "temple-ruins"
  | "harbor-skyline"
  | "canyon-archipelago"

export type HomeBackdropScene = Readonly<{
  id: HomeSceneId
  name: string
  /**
   * Legacy ASCII design reference. It documents the scene's intent for humans;
   * the raster itself is produced by the ordered painters below.
   */
  rows: readonly string[]
  /** Key light direction in screen space; light comes FROM this direction. */
  light: HomeSceneLight
  /** Screen y of the horizon line used by the sky gradient. */
  horizon: number
  sky: HomeSceneSky
  painters: readonly HomeScenePainter[]
  water?: HomeSceneWater
}>

export type HomeDitherOptions = Readonly<{
  seed?: HomeBackdropSeed
  scene?: HomeSceneId | HomeBackdropScene
}>

export type HomeBackdropDitherProps = HomeDitherOptions

function sceneRows(...rows: string[]): readonly string[] {
  const width = Math.max(1, ...rows.map((row) => row.length))
  return rows.map((row) => row.padEnd(width, " "))
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
}

function mix(from: number, to: number, amount: number) {
  return from + (to - from) * clamp(amount)
}

function integerDimension(value: number) {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0))
}

function normalizeSeed(seed: number) {
  return Number.isFinite(seed) ? seed >>> 0 : DEFAULT_SEED
}

function quantizeTone(value: number) {
  const steps = DITHER_LEVELS - 1
  return Math.round(clamp(value) * steps) / steps
}

function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1
  const normalized = clamp((value - edge0) / (edge1 - edge0))
  return normalized * normalized * (3 - 2 * normalized)
}

function cellRank(seed: HomeBackdropSeed, x: number, y: number) {
  let value = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ normalizeSeed(seed)
  value = Math.imul(value ^ (value >>> 13), 1274126177)
  value ^= value >>> 16
  return (value >>> 0) / 0x1_0000_0000
}

function seeded(seed: HomeBackdropSeed, salt: number) {
  return (normalizeSeed(seed) ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0
}

function smoothNoise(seed: HomeBackdropSeed, x: number, y: number) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const tx = smoothstep(0, 1, x - x0)
  const ty = smoothstep(0, 1, y - y0)
  const top = cellRank(seed, x0, y0) * (1 - tx) + cellRank(seed, x0 + 1, y0) * tx
  const bottom = cellRank(seed, x0, y0 + 1) * (1 - tx) + cellRank(seed, x0 + 1, y0 + 1) * tx
  return top * (1 - ty) + bottom * ty
}

function fbm(seed: HomeBackdropSeed, x: number, y: number, octaves = 4) {
  let sum = 0
  let amplitude = 0.5
  let frequency = 1
  let norm = 0
  for (let octave = 0; octave < octaves; octave++) {
    sum += smoothNoise(seeded(seed, octave * 13 + 1), x * frequency, y * frequency) * amplitude
    norm += amplitude
    amplitude *= 0.5
    frequency *= 2.07
  }
  return sum / norm
}

function ridged(seed: HomeBackdropSeed, x: number, y: number, octaves = 4) {
  let sum = 0
  let amplitude = 0.5
  let frequency = 1
  let norm = 0
  for (let octave = 0; octave < octaves; octave++) {
    const noise = smoothNoise(seeded(seed, octave * 29 + 7), x * frequency, y * frequency)
    const ridge = 1 - Math.abs(noise * 2 - 1)
    sum += ridge * ridge * amplitude
    norm += amplitude
    amplitude *= 0.5
    frequency *= 2.03
  }
  return sum / norm
}

/**
 * A rolling ridge. `amplitude` is the full peak-to-valley swing in screen y.
 */
function ridge(baseY: number, amplitude: number, frequency: number, salt: number, octaves = 4): HomeSceneProfile {
  return (x, seed) => baseY - amplitude * (fbm(seed, x * frequency, salt * 0.37, octaves) - 0.5) * 2
}

/** A sharper, mountain-like ridge built from ridged noise. */
function peaks(baseY: number, amplitude: number, frequency: number, salt: number, octaves = 4): HomeSceneProfile {
  return (x, seed) => baseY - amplitude * ridged(seed, x * frequency, salt * 0.31, octaves)
}

/** A ridged profile pulled toward discrete steps, for mesas and canyon walls. */
function terraces(
  baseY: number,
  amplitude: number,
  frequency: number,
  salt: number,
  steps: number,
  blend = 0.65,
  octaves = 4,
): HomeSceneProfile {
  return (x, seed) => {
    const raw = baseY - amplitude * ridged(seed, x * frequency, salt * 0.31, octaves)
    const stepped = Math.round(raw * steps) / steps
    return mix(raw, stepped, blend)
  }
}

function block(spec: Omit<HomeSceneBlock, "kind">): HomeSceneBlock {
  return { kind: "block", ...spec }
}

function cone(spec: Omit<HomeSceneCone, "kind">): HomeSceneCone {
  return { kind: "cone", ...spec }
}

function dome(spec: Omit<HomeSceneDome, "kind">): HomeSceneDome {
  return { kind: "dome", ...spec }
}

// ---------------------------------------------------------------------------
// Scene library
// ---------------------------------------------------------------------------

export const HOME_BACKDROP_SCENES: readonly HomeBackdropScene[] = [
  {
    id: "fortress",
    name: "Citadel at dusk",
    rows: sceneRows(
      "                                                                                ",
      "                          .                    .                              ",
      "                       .--+--.              .--+--.                           ",
      "                    .-/      \\-.          .-/      \\-.                      ",
      "                .--/            \\--.  .--/            \\--.                 ",
      "          .----/        .----+----.\\--/ .----+----.        \\----.          ",
      "         /             /######|######\\/######|######\\             \\         ",
      " .------+------.      |#######|      ||      |#######|      .------+------. ",
      " |      |      | .----+########+-----++-----+########+----. |      |      | ",
      " |  .---+--.   |/     |########|     ||     |########|     \\|   .--+---.  | ",
      " | /       \\  /      |########|     ||     |########|      \\  /       \\ | ",
      " | |  .--.  | |       +----+---+-----++-----+---+----+       | |  .--.  | | ",
      " +-+--+  +--+-+            |    |     ||     |    |            +-+-+  +--+-+ ",
      "      |  |                 |    |     ||     |    |                 |  |    ",
      "  .---+--+--------.   .----+----+-----++-----+----+----.   .--------+--+---.",
      " /                  \\/                         \\/                  \\      ",
      " .----..----..----..----..----..----..----..----..----..----..----..----.  ",
    ),
    light: { x: -0.7, y: -0.5 },
    horizon: 0.21,
    sky: { top: 0.004, horizon: 0.028, stars: 0.5, moon: { x: 0.79, y: 0.085, r: 0.042, phase: 0.6 } },
    painters: [
      {
        kind: "terrain",
        profile: ridge(0.215, 0.045, 3.2, 11),
        crest: 0.5,
        base: 0.3,
        fog: 0.38,
        grain: 0.22,
        scale: 4.5,
      },
      {
        kind: "terrain",
        profile: ridge(0.29, 0.05, 5.6, 23),
        bottom: 0.85,
        crest: 0.5,
        base: 0.3,
        fog: 0.16,
        grain: 0.35,
        scale: 6,
      },
      block({ left: 0.14, right: 0.86, top: 0.19, bottom: 0.3, tone: 0.6, fog: 0.18, relief: 0.85 }),
      block({ left: 0.12, right: 0.21, top: 0.115, bottom: 0.31, tone: 0.64, fog: 0.16, relief: 0.9 }),
      block({ left: 0.79, right: 0.88, top: 0.135, bottom: 0.31, tone: 0.6, fog: 0.16, relief: 0.9 }),
      block({ left: 0.43, right: 0.57, top: 0.09, bottom: 0.31, tone: 0.68, fog: 0.14, relief: 0.9 }),
      cone({ cx: 0.5, halfWidth: 0.095, top: 0.04, bottom: 0.095, tone: 0.66, fog: 0.14 }),
      cone({ cx: 0.165, halfWidth: 0.06, top: 0.075, bottom: 0.12, tone: 0.62, fog: 0.16 }),
      cone({ cx: 0.835, halfWidth: 0.06, top: 0.095, bottom: 0.14, tone: 0.6, fog: 0.16 }),
      { kind: "shadow", cx: 0.5, cy: 0.275, rx: 0.03, ry: 0.045, strength: 0.6 },
      {
        kind: "terrain",
        profile: ridge(0.42, 0.055, 4.4, 41),
        bottom: 1.1,
        crest: 0.55,
        base: 0.26,
        fog: 0.05,
        grain: 0.5,
        scale: 7,
      },
    ],
  },
  {
    id: "mountain-pass",
    name: "Mountain pass",
    rows: sceneRows(
      "                         ^                                    ",
      "                        / \\                  .                 ",
      "       ..             /   \\                / \\                ",
      "      /  \\____       /     \\____      ____/   \\____           ",
      "  ___/        \\_____/           \\____/             \\___       ",
      " /      . .          . .           . .          . .      \\    ",
      "/____---+---____----+---____----+---____----+---____----\\___",
      "       / \\          / \\          / \\          / \\              ",
      "  ____/   \\________/   \\________/   \\________/   \\____       ",
      "      :        :        :        :        :        :            ",
      "  ..---..  ..---..  ..---..  ..---..  ..---..  ..---..         ",
    ),
    light: { x: -0.4, y: -0.62 },
    horizon: 0.24,
    sky: { top: 0.004, horizon: 0.032, stars: 0.85, moon: { x: 0.67, y: 0.065, r: 0.028, phase: 0.35 } },
    painters: [
      {
        kind: "terrain",
        profile: peaks(0.255, 0.1, 2.4, 5),
        crest: 0.5,
        base: 0.28,
        fog: 0.36,
        grain: 0.26,
        scale: 4,
      },
      {
        kind: "terrain",
        profile: peaks(0.46, 0.18, 3.6, 17),
        bottom: 1.1,
        crest: 0.5,
        base: 0.24,
        fog: 0.12,
        grain: 0.45,
        scale: 6,
      },
      { kind: "haze", left: 0.18, right: 0.82, top: 0.3, bottom: 0.37, tone: 0.16, strength: 0.45, feather: 0.05 },
      {
        kind: "terrain",
        profile: ridge(0.62, 0.08, 5.2, 33),
        bottom: 1.1,
        crest: 0.52,
        base: 0.2,
        fog: 0.04,
        grain: 0.5,
        scale: 8,
      },
    ],
  },
  {
    id: "observatory",
    name: "Observatory",
    rows: sceneRows(
      "                              .                              ",
      "                         .----+----.                         ",
      "                     .---+########+---.                     ",
      "                  .--+######@@######+--.                  ",
      "                 /######################\\                 ",
      "                /##########++############\\                ",
      "                    |######||######|                       ",
      "                    |######||######|          .            ",
      "              .-----+######++######+-----.    / \\           ",
      "              |########################| ___/   \\___        ",
      "              +------------------------+---+-----+---        ",
    ),
    light: { x: -0.55, y: -0.52 },
    horizon: 0.2,
    sky: { top: 0.004, horizon: 0.028, stars: 1, moon: { x: 0.2, y: 0.07, r: 0.028, phase: 0.5 } },
    painters: [
      {
        kind: "terrain",
        profile: ridge(0.27, 0.05, 3.1, 7),
        crest: 0.48,
        base: 0.28,
        fog: 0.34,
        grain: 0.24,
        scale: 4.5,
      },
      block({ left: 0.29, right: 0.44, top: 0.2, bottom: 0.3, tone: 0.5, fog: 0.24, relief: 0.8 }),
      block({ left: 0.56, right: 0.71, top: 0.2, bottom: 0.3, tone: 0.5, fog: 0.24, relief: 0.8 }),
      block({ left: 0.44, right: 0.56, top: 0.145, bottom: 0.3, tone: 0.6, fog: 0.18, relief: 0.9 }),
      dome({ cx: 0.5, cy: 0.145, rx: 0.075, ry: 0.065, tone: 0.72, fog: 0.14 }),
      { kind: "shadow", cx: 0.53, cy: 0.135, rx: 0.008, ry: 0.05, strength: 0.5, feather: 0.03 },
      block({ left: 0.497, right: 0.503, top: 0.03, bottom: 0.135, tone: 0.5, fog: 0.2 }),
      {
        kind: "terrain",
        profile: ridge(0.5, 0.06, 4.7, 29),
        bottom: 1.1,
        crest: 0.52,
        base: 0.2,
        fog: 0.04,
        grain: 0.5,
        scale: 7,
      },
    ],
  },
  {
    id: "temple-ruins",
    name: "Temple ruins",
    rows: sceneRows(
      "          ^           ^                         ^              ",
      "         / \\         / \\                       / \\             ",
      "    .----+--+-------+--+---------+-----------+--+----.         ",
      "    |####|  |#######|  |#########|###########|  |####|         ",
      "    |####|  |#######|  |#########|###########|  |####|         ",
      "    |####+--+#######+--+#########+###########+--+####|         ",
      "    |####|  |#######|  |#########|###########|  |####|         ",
      "    +----+--+-------+--+---------+-----------+--+----+         ",
      "       :      :         :         :         :      :             ",
      "  ..---+---..---+---..---+---..---+---..---+---..---..          ",
      "       .          .          .          .          .             ",
    ),
    light: { x: -0.62, y: -0.42 },
    horizon: 0.27,
    sky: { top: 0.005, horizon: 0.038, stars: 0.45 },
    painters: [
      {
        kind: "terrain",
        profile: ridge(0.335, 0.04, 2.7, 13),
        crest: 0.46,
        base: 0.26,
        fog: 0.36,
        grain: 0.26,
        scale: 4,
      },
      block({ left: 0.17, right: 0.83, top: 0.255, bottom: 0.315, tone: 0.5, fog: 0.24, relief: 0.75 }),
      block({ left: 0.22, right: 0.78, top: 0.19, bottom: 0.235, tone: 0.6, fog: 0.2, relief: 0.8 }),
      cone({ cx: 0.5, halfWidth: 0.29, top: 0.105, bottom: 0.19, tone: 0.64, fog: 0.2 }),
      block({ left: 0.243, right: 0.277, top: 0.235, bottom: 0.26, tone: 0.68, fog: 0.18, relief: 0.95 }),
      block({ left: 0.353, right: 0.387, top: 0.235, bottom: 0.26, tone: 0.68, fog: 0.18, relief: 0.95 }),
      block({ left: 0.483, right: 0.517, top: 0.235, bottom: 0.26, tone: 0.68, fog: 0.18, relief: 0.95 }),
      block({ left: 0.613, right: 0.647, top: 0.235, bottom: 0.26, tone: 0.68, fog: 0.18, relief: 0.95 }),
      block({ left: 0.723, right: 0.757, top: 0.235, bottom: 0.26, tone: 0.68, fog: 0.18, relief: 0.95 }),
      block({ left: 0.08, right: 0.2, top: 0.22, bottom: 0.315, tone: 0.44, fog: 0.3, relief: 0.7 }),
      {
        kind: "terrain",
        profile: ridge(0.5, 0.05, 4.6, 29),
        bottom: 1.1,
        crest: 0.52,
        base: 0.2,
        fog: 0.04,
        grain: 0.5,
        scale: 7,
      },
    ],
  },
  {
    id: "harbor-skyline",
    name: "Harbor skyline",
    rows: sceneRows(
      " .  .     .     .   .        .   .  .     .                  ",
      " |  | .   |     |   |  .     |   |  | .   |                  ",
      " |  | |   |  .  |   |  |  .  |   |  | |   |    .             ",
      " |  +-+---+--+--+---+--+-----+---+--+-+---+-.  / \\            ",
      " |  |###| |##| |####| |#####| |##| |###| |##| /   \\           ",
      " +--+---+-+--+-+----+-+-----+-+--+-+---+-+--+-----+           ",
      " |######|    |######|  |########|    |######|   |            ",
      " |######|    |######|  |########|    |######|   |            ",
      " +--+----+----+------+--+--------+----+------+---+            ",
      " ~~~~~~ ~~~~~~ ~~~~~~ ~~~~~~ ~~~~~~ ~~~~~~ ~~~~~~             ",
      " ..---.. ..---.. ..---.. ..---.. ..---.. ..---.. ..---..       ",
    ),
    light: { x: -0.6, y: -0.45 },
    horizon: 0.235,
    sky: { top: 0.004, horizon: 0.03, stars: 0.7, moon: { x: 0.72, y: 0.07, r: 0.034, phase: 0.45 } },
    painters: [
      {
        kind: "terrain",
        profile: ridge(0.245, 0.035, 3.4, 9),
        bottom: 0.75,
        crest: 0.44,
        base: 0.26,
        fog: 0.42,
        grain: 0.24,
        scale: 4.5,
      },
      block({ left: 0.05, right: 0.135, top: 0.185, bottom: 0.3, tone: 0.52, fog: 0.3, relief: 0.8, speckle: 0.05 }),
      block({ left: 0.15, right: 0.2, top: 0.145, bottom: 0.3, tone: 0.58, fog: 0.24, relief: 0.85, speckle: 0.05 }),
      block({ left: 0.215, right: 0.3, top: 0.2, bottom: 0.3, tone: 0.46, fog: 0.34, relief: 0.75, speckle: 0.05 }),
      block({ left: 0.325, right: 0.375, top: 0.12, bottom: 0.3, tone: 0.62, fog: 0.2, relief: 0.9, speckle: 0.05 }),
      block({ left: 0.4, right: 0.47, top: 0.175, bottom: 0.3, tone: 0.54, fog: 0.28, relief: 0.8, speckle: 0.05 }),
      block({ left: 0.5, right: 0.545, top: 0.155, bottom: 0.3, tone: 0.58, fog: 0.24, relief: 0.85, speckle: 0.05 }),
      block({ left: 0.57, right: 0.66, top: 0.2, bottom: 0.3, tone: 0.44, fog: 0.36, relief: 0.75, speckle: 0.05 }),
      block({ left: 0.7, right: 0.75, top: 0.165, bottom: 0.3, tone: 0.56, fog: 0.26, relief: 0.85, speckle: 0.05 }),
      block({ left: 0.78, right: 0.87, top: 0.135, bottom: 0.3, tone: 0.6, fog: 0.22, relief: 0.85, speckle: 0.05 }),
      block({ left: 0.28, right: 0.286, top: 0.075, bottom: 0.3, tone: 0.5, fog: 0.25, relief: 0.7 }),
      block({ left: 0.6, right: 0.606, top: 0.1, bottom: 0.3, tone: 0.5, fog: 0.25, relief: 0.7 }),
    ],
    water: { y: 0.3, tone: 0.05, reflection: 0.55, wave: 0.0035, glint: { x: 0.72, spread: 0.05, strength: 0.16 } },
  },
  {
    id: "canyon-archipelago",
    name: "Canyon archipelago",
    rows: sceneRows(
      "         .                 .                      .            ",
      "        / \\               / \\                    / \\           ",
      "  .----/   \\____     ____/   \\____        ______/   \\---.     ",
      " /               \\___/              \\____/               \\    ",
      "/   . . . . . .                 . . . . . . . . . . . .   \\  ",
      "\\____----+-----____       ____-----+----____       ____----/  ",
      "      \\  |  /      \\_____/      \\  |  /      \\_____/         ",
      "       \\ | /                    \\ | /                         ",
      "        \\|/                      \\|/                          ",
      "  ..---..---..---..---..---..---..---..---..---..---..        ",
      "       .        .        .        .        .        .          ",
    ),
    light: { x: -0.5, y: -0.5 },
    horizon: 0.22,
    sky: { top: 0.004, horizon: 0.032, stars: 0.5 },
    painters: [
      {
        kind: "terrain",
        profile: terraces(0.3, 0.09, 2.2, 5, 5, 0.55),
        crest: 0.48,
        base: 0.26,
        fog: 0.38,
        grain: 0.28,
        scale: 4,
        strata: 26,
      },
      {
        kind: "terrain",
        profile: terraces(0.42, 0.16, 3.2, 19, 4, 0.6),
        bottom: 0.95,
        crest: 0.5,
        base: 0.24,
        fog: 0.16,
        grain: 0.4,
        scale: 5.5,
        strata: 20,
      },
      { kind: "haze", left: 0.47, right: 0.57, top: 0.1, bottom: 0.3, tone: 0.16, strength: 0.5, feather: 0.02 },
      block({ left: 0.43, right: 0.49, top: 0.115, bottom: 0.3, tone: 0.6, fog: 0.14, relief: 0.9 }),
      block({ left: 0.555, right: 0.615, top: 0.115, bottom: 0.3, tone: 0.6, fog: 0.14, relief: 0.9 }),
      block({ left: 0.42, right: 0.625, top: 0.085, bottom: 0.12, tone: 0.66, fog: 0.12, relief: 0.85 }),
      {
        kind: "terrain",
        profile: (x, seed) => 0.34 + x * 0.85 + 0.03 * (fbm(seed, x * 6, 0.3, 3) - 0.5),
        bottom: 1.1,
        crest: 0.54,
        base: 0.2,
        fog: 0.04,
        grain: 0.55,
        scale: 7,
        strata: 14,
      },
      {
        kind: "terrain",
        profile: (x, seed) => 0.34 + (1 - x) * 0.85 + 0.03 * (fbm(seed, x * 6, 9.3, 3) - 0.5),
        bottom: 1.1,
        crest: 0.54,
        base: 0.2,
        fog: 0.04,
        grain: 0.55,
        scale: 7,
        strata: 14,
      },
    ],
  },
] as const

export function createHomeBackdropSeed(): HomeBackdropSeed {
  const values = new Uint32Array(1)
  try {
    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(values)
      return values[0] ?? DEFAULT_SEED
    }
  } catch {
    // Fall through to a local, non-persistent fallback on older runtimes.
  }
  return (Date.now() ^ Math.floor(performance.now())) >>> 0
}

export function selectHomeScene(
  seed: HomeBackdropSeed,
  scenes: readonly HomeBackdropScene[] = HOME_BACKDROP_SCENES,
): HomeBackdropScene {
  if (scenes.length === 0) return HOME_BACKDROP_SCENES[0]!
  return scenes[normalizeSeed(seed) % scenes.length]!
}

/**
 * Return the static light strength for a row. The top is clearest and the
 * texture fades monotonically into the normal dark background below it.
 */
export function homeDitherRowStrength(height: number, row: number) {
  const rows = integerDimension(height)
  if (rows <= 1) return row === 0 ? 1 : 0
  const normalized = clamp(row / (rows - 1))
  return (1 - normalized) ** VERTICAL_FADE_EXPONENT
}

function sceneFor(options: HomeDitherOptions) {
  if (options.scene && typeof options.scene !== "string") return options.scene
  if (typeof options.scene === "string") {
    const found = HOME_BACKDROP_SCENES.find((scene) => scene.id === options.scene)
    if (found) return found
  }
  return selectHomeScene(options.seed ?? DEFAULT_SEED)
}

// ---------------------------------------------------------------------------
// Raster
// ---------------------------------------------------------------------------

type LuminanceField = Readonly<{ width: number; height: number; data: Float32Array }>

type RenderState = Readonly<{
  data: Float32Array
  width: number
  height: number
  seed: HomeBackdropSeed
  horizon: number
  light: HomeSceneLight
}>

function paintSky(state: RenderState, sky: HomeSceneSky) {
  const { data, width, height, horizon, seed } = state
  const moon = sky.moon
  for (let j = 0; j < height; j++) {
    const y = (j + 0.5) / height
    const grad = smoothstep(0, 1, clamp(y / Math.max(0.001, horizon)))
    const glow = Math.exp(-(((y - horizon) / 0.06) ** 2)) * 0.03
    const base = mix(sky.top, sky.horizon, grad) + glow
    for (let i = 0; i < width; i++) {
      const x = (i + 0.5) / width
      let value = base
      if (moon) {
        const dx = (x - moon.x) / moon.r
        const dy = (y - moon.y) / moon.r
        const distance = Math.sqrt(dx * dx + dy * dy)
        if (distance < 2.2) value += Math.exp(-(((distance - 1) / 0.45) ** 2)) * 0.07
        if (distance <= 1) {
          const shadow = Math.sqrt((x - moon.x - moon.phase * moon.r * 1.15) ** 2 / (moon.r * moon.r) + dy * dy)
          const lit = shadow > 1
          const edge = 1 - smoothstep(0.86, 1, distance)
          value = Math.max(value, lit ? 0.42 + 0.3 * edge : 0.08 + 0.06 * edge)
        }
      }
      if (sky.stars > 0 && y < horizon * 0.95) {
        const star = cellRank(seed ^ 0x5bd1e995, i, j)
        if (star > 1 - 0.0016 * sky.stars) value = Math.min(1, value + 0.7)
      }
      data[j * width + i] = value
    }
  }
}

function paintTerrain(state: RenderState, layer: HomeSceneTerrain) {
  const { data, width, height, seed, horizon } = state
  const bottom = layer.bottom ?? 1.06
  const relief = layer.relief ?? 0.7
  const grain = layer.grain ?? 0.3
  const scale = layer.scale ?? 5
  const salt = layer.salt ?? 0
  // Aerial haze lands between the sky and the body, never on the sky itself.
  const fogTone = clamp(horizon * 2.4 + 0.015)
  const tops = new Float32Array(width)
  for (let i = 0; i < width; i++) tops[i] = layer.profile((i + 0.5) / width, seed)
  const facetGrid = new Float32Array(width * DEPTH_BUCKETS)
  const grainGrid = new Float32Array(width * DEPTH_BUCKETS)
  for (let i = 0; i < width; i++) {
    const x = (i + 0.5) / width
    for (let bucket = 0; bucket < DEPTH_BUCKETS; bucket++) {
      const depth = (bucket + 0.5) / DEPTH_BUCKETS
      facetGrid[i * DEPTH_BUCKETS + bucket] = ridged(
        seeded(seed, salt + 101),
        x * scale * 1.6,
        salt * 0.5 + depth * scale * 1.1,
        3,
      )
      grainGrid[i * DEPTH_BUCKETS + bucket] = fbm(
        seeded(seed, salt),
        x * scale * (0.5 + depth * 1.6),
        salt * 0.13 + depth * scale * 0.35,
        3,
      )
    }
  }
  for (let i = 0; i < width; i++) {
    const x = (i + 0.5) / width
    const top = tops[i]!
    const slope =
      (layer.profile(Math.min(1, x + 0.004), seed) - layer.profile(Math.max(0, x - 0.004), seed)) / 0.008
    const j0 = Math.max(0, Math.floor(top * height))
    const j1 = Math.min(height - 1, Math.ceil(bottom * height))
    for (let j = j0; j <= j1; j++) {
      const y = (j + 0.5) / height
      if (y < top || y > bottom) continue
      const depth = clamp((y - top) / Math.max(0.001, bottom - top))
      // Facet noise gives the body lit and shadowed rock faces instead of one
      // flat fill; the profile slope tells the eye which way a ridge is facing.
      const position = depth * DEPTH_BUCKETS - 0.5
      const bucket = clamp(Math.floor(position), 0, DEPTH_BUCKETS - 1)
      const next = Math.min(DEPTH_BUCKETS - 1, bucket + 1)
      const blend = clamp(position - bucket)
      const facet = mix(facetGrid[i * DEPTH_BUCKETS + bucket]!, facetGrid[i * DEPTH_BUCKETS + next]!, blend)
      const texture = mix(grainGrid[i * DEPTH_BUCKETS + bucket]!, grainGrid[i * DEPTH_BUCKETS + next]!, blend)
      const lambert = clamp(0.42 + facet * 0.95 - slope * state.light.x * 2.4)
      // The shoulder just below the ridge catches the sky; deeper rows fall
      // into the valley shadow, which is what makes the body recede in depth.
      const shoulder = Math.exp(-(((depth - 0.14) / 0.2) ** 2))
      let tone = layer.crest + (layer.base - layer.crest) * depth
      tone *= 0.5 + lambert * relief * 1.05
      tone += (texture - 0.5) * grain * (0.35 + depth * 0.85)
      if (layer.strata) tone += Math.sin(depth * layer.strata + texture * 3) * 0.045
      tone *= 0.82 + 0.42 * shoulder
      // Seat the body with a soft occlusion, then let the ridge lip catch the
      // sky so the silhouette stays legible against the empty upper rows.
      tone -= 0.1 * depth
      tone += Math.exp(-((y - top) * height) / RIDGE_LIP_ROWS) * 0.07
      const haze = clamp(layer.fog * (1 - depth * 0.55) ** 1.1)
      tone = mix(tone, fogTone, haze)
      data[j * width + i] = clamp(tone)
    }
  }
}

function paintBlock(state: RenderState, form: HomeSceneBlock) {
  const { data, width, height, seed, horizon, light } = state
  const relief = form.relief ?? 0.7
  const i0 = Math.max(0, Math.floor(form.left * width))
  const i1 = Math.min(width - 1, Math.ceil(form.right * width))
  const j0 = Math.max(0, Math.floor(form.top * height))
  const j1 = Math.min(height - 1, Math.ceil(form.bottom * height))
  const span = Math.max(0.001, form.bottom - form.top)
  const topBand = Math.max(0.004, span * 0.16)
  const salt = form.salt ?? 0
  for (let j = j0; j <= j1; j++) {
    const y = (j + 0.5) / height
    if (y < form.top || y > form.bottom) continue
    const depth = (y - form.top) / span
    for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) / width
      if (x < form.left || x > form.right) continue
      const across = (x - form.left) / Math.max(0.001, form.right - form.left)
      const lit = smoothstep(0.34, 0.66, light.x < 0 ? 1 - across : across)
      let tone = form.tone * (0.4 + relief * 1.05 * lit)
      tone += smoothstep(0, 1, 1 - (y - form.top) / topBand) * 0.18 * (0.4 + 0.6 * lit)
      tone *= 1 - 0.22 * smoothstep(0.85, 1, depth)
      if (form.speckle && cellRank(seeded(seed, salt ^ 0x51ed), i, j) > 1 - form.speckle) tone *= 0.35
      data[j * width + i] = clamp(mix(tone, horizon, form.fog))
    }
  }
}

function paintDome(state: RenderState, form: HomeSceneDome) {
  const { data, width, height, horizon, light } = state
  const i0 = Math.max(0, Math.floor((form.cx - form.rx) * width))
  const i1 = Math.min(width - 1, Math.ceil((form.cx + form.rx) * width))
  const j0 = Math.max(0, Math.floor((form.cy - form.ry) * height))
  const j1 = Math.min(height - 1, Math.ceil((form.cy + form.ry) * height))
  for (let j = j0; j <= j1; j++) {
    const y = (j + 0.5) / height
    const ny = (y - form.cy) / form.ry
    for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) / width
      const nx = (x - form.cx) / form.rx
      const radius = nx * nx + ny * ny
      if (radius > 1) continue
      const nz = Math.sqrt(Math.max(0, 1 - radius))
      const lambert = clamp(0.24 + (nx * light.x + ny * light.y + nz * 0.62) * 0.9)
      const tone = form.tone * lambert * (0.78 + 0.22 * nz)
      data[j * width + i] = clamp(mix(tone, horizon, form.fog))
    }
  }
}

function paintCone(state: RenderState, form: HomeSceneCone) {
  const { data, width, height, horizon, light } = state
  const i0 = Math.max(0, Math.floor((form.cx - form.halfWidth) * width))
  const i1 = Math.min(width - 1, Math.ceil((form.cx + form.halfWidth) * width))
  const j0 = Math.max(0, Math.floor(form.top * height))
  const j1 = Math.min(height - 1, Math.ceil(form.bottom * height))
  const span = Math.max(0.001, form.bottom - form.top)
  for (let j = j0; j <= j1; j++) {
    const y = (j + 0.5) / height
    if (y < form.top || y > form.bottom) continue
    for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) / width
      const across = (x - form.cx) / form.halfWidth
      if (across < -1 || across > 1) continue
      const roof = form.top + Math.abs(across) * span
      if (y < roof) continue
      const lit = smoothstep(0.05, 0.75, light.x < 0 ? -across : across)
      const tone = form.tone * (0.5 + 0.8 * lit) * (0.86 + 0.14 * ((y - form.top) / span))
      data[j * width + i] = clamp(mix(tone, horizon, form.fog))
    }
  }
}

function paintShadow(state: RenderState, form: HomeSceneShadow) {
  const { data, width, height } = state
  const feather = form.feather ?? 0.02
  const i0 = Math.max(0, Math.floor((form.cx - form.rx - feather) * width))
  const i1 = Math.min(width - 1, Math.ceil((form.cx + form.rx + feather) * width))
  const j0 = Math.max(0, Math.floor((form.cy - form.ry - feather) * height))
  const j1 = Math.min(height - 1, Math.ceil((form.cy + form.ry + feather) * height))
  for (let j = j0; j <= j1; j++) {
    const y = (j + 0.5) / height
    const ny = (y - form.cy) / form.ry
    for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) / width
      const nx = (x - form.cx) / form.rx
      const distance = Math.sqrt(nx * nx + ny * ny)
      if (distance > 1 + feather * 8) continue
      const amount = form.strength * (1 - smoothstep(1, 1 + feather * 8, distance))
      data[j * width + i] = clamp(data[j * width + i]! * (1 - amount))
    }
  }
}

function paintHaze(state: RenderState, form: HomeSceneHaze) {
  const { data, width, height } = state
  const feather = Math.max(0.005, form.feather ?? 0.03)
  const i0 = Math.max(0, Math.floor((form.left - feather) * width))
  const i1 = Math.min(width - 1, Math.ceil((form.right + feather) * width))
  const j0 = Math.max(0, Math.floor((form.top - feather) * height))
  const j1 = Math.min(height - 1, Math.ceil((form.bottom + feather) * height))
  for (let j = j0; j <= j1; j++) {
    const y = (j + 0.5) / height
    const outsideY = Math.max(form.top - y, 0, y - form.bottom)
    for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) / width
      const outsideX = Math.max(form.left - x, 0, x - form.right)
      const outside = Math.max(outsideX, outsideY)
      if (outside > feather) continue
      const amount = form.strength * (1 - smoothstep(0, feather, outside))
      data[j * width + i] = clamp(mix(data[j * width + i]!, form.tone, amount))
    }
  }
}

function paintWater(state: RenderState, water: HomeSceneWater) {
  const { data, width, height, seed } = state
  const start = Math.max(0, Math.floor(water.y * height))
  for (let j = start; j < height; j++) {
    const y = (j + 0.5) / height
    const dy = y - water.y
    const sourceY = water.y - dy * 0.92
    if (sourceY < 0 || start === 0) continue
    // Reflections always read above the waterline; row `start` is written by
    // this pass, so it can never be its own source.
    const sourceJ = Math.min(start - 1, Math.max(0, Math.floor(sourceY * height)))
    const damp = water.reflection * Math.pow(0.9, dy * height * 0.32)
    for (let i = 0; i < width; i++) {
      const x = (i + 0.5) / width
      const wave = (smoothNoise(seeded(seed, 0x71a3), x * 26, y * 30) - 0.5) * water.wave * width
      const sourceX = clamp(i + wave, 0, width - 1)
      const x0 = Math.floor(sourceX)
      const x1 = Math.min(width - 1, x0 + 1)
      const blendX = sourceX - x0
      const mirrored = data[sourceJ * width + x0]! * (1 - blendX) + data[sourceJ * width + x1]! * blendX
      let tone = mix(water.tone, mirrored, clamp(damp))
      if (water.glint) {
        const across = (x - water.glint.x) / water.glint.spread
        const shimmer = 0.5 + 0.5 * Math.sin(y * 90 + smoothNoise(seeded(seed, 0x18f), x * 10, y * 16) * 8)
        tone += Math.exp(-(across * across)) * water.glint.strength * shimmer * Math.exp(-dy * 8)
      }
      data[j * width + i] = clamp(tone)
    }
  }
}

function paintPainter(state: RenderState, painter: HomeScenePainter) {
  switch (painter.kind) {
    case "terrain":
      paintTerrain(state, painter)
      return
    case "block":
      paintBlock(state, painter)
      return
    case "dome":
      paintDome(state, painter)
      return
    case "cone":
      paintCone(state, painter)
      return
    case "shadow":
      paintShadow(state, painter)
      return
    case "haze":
      paintHaze(state, painter)
  }
}

function renderScene(scene: HomeBackdropScene, seed: HomeBackdropSeed, width: number, height: number): LuminanceField {
  const data = new Float32Array(width * height)
  const state: RenderState = {
    data,
    width,
    height,
    seed,
    horizon: scene.sky.horizon,
    light: scene.light,
  }
  paintSky(state, scene.sky)
  for (const painter of scene.painters) paintPainter(state, painter)
  if (scene.water) paintWater(state, scene.water)
  return { width, height, data }
}

function resampleField(field: LuminanceField, width: number, height: number): LuminanceField {
  if (field.width === width && field.height === height) return field
  const data = new Float32Array(width * height)
  const scaleX = field.width / width
  const scaleY = field.height / height
  for (let j = 0; j < height; j++) {
    const fy = (j + 0.5) * scaleY - 0.5
    const y0 = clamp(Math.floor(fy), 0, field.height - 1)
    const y1 = Math.min(field.height - 1, y0 + 1)
    const ty = clamp(fy - y0)
    for (let i = 0; i < width; i++) {
      const fx = (i + 0.5) * scaleX - 0.5
      const x0 = clamp(Math.floor(fx), 0, field.width - 1)
      const x1 = Math.min(field.width - 1, x0 + 1)
      const tx = clamp(fx - x0)
      const top = field.data[y0 * field.width + x0]! * (1 - tx) + field.data[y0 * field.width + x1]! * tx
      const bottom = field.data[y1 * field.width + x0]! * (1 - tx) + field.data[y1 * field.width + x1]! * tx
      data[j * width + i] = top * (1 - ty) + bottom * ty
    }
  }
  return { width, height, data }
}

function roundedZoneFactor(x: number, y: number, left: number, right: number, top: number, bottom: number) {
  const dx = Math.max(left - x, 0, x - right)
  const dy = Math.max(top - y, 0, y - bottom)
  if (dx === 0 && dy === 0) return 0
  // Math.hypot is noticeably slower than the explicit form, and this runs once
  // per braille dot.
  return clamp(Math.sqrt(dx * dx + dy * dy) / QUIET_FEATHER)
}

/**
 * The Home identity and prompt keep their negative space. Everything inside
 * these rounded rectangles is fully quiet; the feather returns the raster to
 * full strength outside them.
 */
function quietZoneFactor(x: number, y: number) {
  const logo = roundedZoneFactor(x, y, 0.3, 0.7, 0.26, 0.65)
  const prompt = roundedZoneFactor(x, y, 0.18, 0.82, 0.7, 0.98)
  return Math.min(logo, prompt)
}

function vignetteFactor(x: number) {
  // Let the sides dissolve before the center, where the Home identity and
  // prompt need the cleanest negative space.
  return smoothstep(0.02, 0.2, Math.min(x, 1 - x))
}

function applyEnvelope(field: LuminanceField) {
  const { width, height, data } = field
  const composed = new Float32Array(data.length)
  for (let j = 0; j < height; j++) {
    const rowStrength = homeDitherRowStrength(height, j)
    const scanline = Math.floor(j / 4) % 2 === 0 ? 1 : 1 - CRT_SCANLINE_DROP
    for (let i = 0; i < width; i++) {
      const x = (i + 0.5) / width
      const y = (j + 0.5) / height
      const envelope = rowStrength * scanline * vignetteFactor(x) * quietZoneFactor(x, y)
      composed[j * width + i] = data[j * width + i]! * envelope
    }
  }
  return composed
}

type SceneRender = Readonly<{ image: LuminanceField; composed: Float32Array }>

const renderCache = new Map<string, SceneRender>()

function cacheRender(key: string, render: SceneRender) {
  renderCache.set(key, render)
  while (renderCache.size > MAX_RENDER_CACHE) {
    const oldest = renderCache.keys().next().value
    if (oldest === undefined) break
    renderCache.delete(oldest)
  }
}

/**
 * Render the scene into a luminance raster at braille dot resolution. The
 * result is memoized because the backdrop is static: resizes and theme changes
 * reuse the same image, and the ink color is applied later, per chunk.
 */
function sceneRender(scene: HomeBackdropScene, seed: HomeBackdropSeed, dotWidth: number, dotHeight: number): SceneRender {
  const key = `${scene.id}|${seed}|${dotWidth}x${dotHeight}`
  const cached = renderCache.get(key)
  if (cached) {
    renderCache.delete(key)
    renderCache.set(key, cached)
    return cached
  }
  const dots = dotWidth * dotHeight
  const scale = dots > MAX_DITHER_DOTS ? Math.sqrt(MAX_DITHER_DOTS / dots) : 1
  const sampleWidth = Math.max(1, Math.round(dotWidth * scale))
  const sampleHeight = Math.max(1, Math.round(dotHeight * scale))
  const sampled = renderScene(scene, seed, sampleWidth, sampleHeight)
  const image = scale < 1 ? resampleField(sampled, dotWidth, dotHeight) : sampled
  const render: SceneRender = { image, composed: applyEnvelope(image) }
  cacheRender(key, render)
  return render
}

/**
 * Generate the static backdrop raster for one terminal size. Cells carry the
 * braille mask, the envelope strength and the local contrast needed by the
 * glyph pass; all values are deterministic for a given seed.
 */
export function homeDitherCells(width: number, height: number, options: HomeDitherOptions = {}): HomeDitherCell[] {
  const columns = integerDimension(width)
  const rows = integerDimension(height)
  if (columns === 0 || rows === 0) return []

  const seed = normalizeSeed(options.seed ?? DEFAULT_SEED)
  const scene = sceneFor(options)
  const dotWidth = columns * 2
  const dotHeight = rows * 4
  const { image, composed } = sceneRender(scene, seed, dotWidth, dotHeight)
  const cells: HomeDitherCell[] = []
  const phaseX = seed & 7
  const phaseY = (seed >>> 3) & 7

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < columns; cx++) {
      let mask = 0
      let total = 0
      for (let b = 0; b < 2; b++) {
        for (let d = 0; d < 4; d++) {
          const i = cx * 2 + b
          const j = cy * 4 + d
          const lum = clamp(composed[j * dotWidth + i]!) * DITHER_DENSITY
          total += Math.min(1, lum)
          if (lum <= 0) continue
          const ordered = (BAYER_8X8[(j + phaseY) & 7]![(i + phaseX) & 7]! + 0.5) / 64
          const grain = cellRank(seed ^ 0x7f4a7c15, i, j)
          const jitter = (cellRank(seed ^ 0x94d049bb, i, j) - 0.5) * DITHER_JITTER
          if (ordered * 0.78 + grain * 0.22 + jitter * 0.35 >= lum) continue
          mask |= BRAILLE_BITS[b]![d]!
        }
      }
      if (mask === 0) continue

      const y = (cy + 0.5) / rows
      const x = (cx + 0.5) / columns
      const strength = clamp(
        homeDitherRowStrength(rows, cy) *
          (cy % 2 === 0 ? 1 : 1 - CRT_SCANLINE_DROP) *
          vignetteFactor(x) *
          quietZoneFactor(x, y),
      )
      if (strength <= 0) continue

      const centerI = cx * 2
      const centerJ = cy * 4
      const left = Math.max(0, centerI - 2)
      const right = Math.min(dotWidth - 1, centerI + 2)
      const up = Math.max(0, centerJ - 2)
      const down = Math.min(dotHeight - 1, centerJ + 2)
      const gx = Math.abs(image.data[centerJ * dotWidth + right]! - image.data[centerJ * dotWidth + left]!)
      const gy = Math.abs(image.data[down * dotWidth + centerI]! - image.data[up * dotWidth + centerI]!)
      const definition = clamp((gx + gy) * 0.85)
      const tone = Math.max(1 / 255, total / 8)

      cells.push({
        x: cx,
        y: cy,
        mask,
        strength,
        tone,
        shade: Math.max(1 / (DITHER_LEVELS - 1), quantizeTone(tone)),
        definition,
        variant: cellRank(seed ^ 0xa5a5a5a5, cx, cy),
      })
    }
  }

  return cells
}

function ditherGlyph(cell: HomeDitherCell) {
  const band = Math.max(0, Math.min(DITHER_LEVELS - 1, Math.round(cell.shade * (DITHER_LEVELS - 1))))
  // Local relief gets a small family of directional marks. They give a
  // roofline, ridge, or shoreline definition without turning every edge into a
  // literal ASCII outline.
  const contourRoll = (cell.x * 29 + cell.y * 13 + Math.floor(cell.variant * 17)) & 127
  if (cell.definition > CONTOUR_DEFINITION_THRESHOLD && band >= 2) {
    if (contourRoll === 0) return "|"
    if (contourRoll === 1) return cell.y & 1 ? "\\" : "/"
    if (contourRoll === 2) return "~"
  }
  // Keep a few ASCII accents in the deepest values. They are spatially rare,
  // so the eye reads them as grain and contour texture rather than lettering.
  const accentRoll = (cell.x * 17 + cell.y * 31) & 63
  if (band >= 2 && accentRoll === 0) return "-"
  if (band >= 2 && accentRoll === 1) return "+"
  if (band >= 2 && accentRoll === 2) return "x"
  if (band === 3 && accentRoll === 3) return "░"
  if (band === 3 && accentRoll === 4) return "▒"
  if (band === 3 && accentRoll === 5) return "▓"
  if (band === 3 && accentRoll === 6) return "█"
  if (band === 3 && accentRoll === 7) return "#"
  return String.fromCodePoint(0x2800 + cell.mask)
}

function ditherInk(background: RGBA, ink: RGBA, strength: number, tone: number, glyph: string) {
  const shade = quantizeTone(tone)
  const amount = 0.5 + shade * 0.3
  const codePoint = glyph.codePointAt(0) ?? 0
  const weight = codePoint >= 0x2800 && codePoint <= 0x28ff || glyph === "·" || glyph === "." || glyph === ":" ? 1 : 0.82
  return RGBA.fromValues(
    background.r + (ink.r - background.r) * amount,
    background.g + (ink.g - background.g) * amount,
    background.b + (ink.b - background.b) * amount,
    MAX_DOT_ALPHA * weight * clamp(strength) * (0.72 + shade * 0.28),
  )
}

/**
 * Convert the mask into background-only text chunks. Every visible cell is a
 * low-contrast dithered glyph; gaps remain spaces so the layer never captures
 * input or paints a surface behind the foreground UI.
 */
export function buildHomeDitherChunks(
  width: number,
  height: number,
  background = RGBA.fromValues(0, 0, 0),
  ink = RGBA.fromValues(1, 1, 1),
  options: HomeDitherOptions = {},
): TextChunk[] {
  const columns = integerDimension(width)
  const rows = integerDimension(height)
  if (columns === 0 || rows === 0) return []

  const byRow = new Map<number, HomeDitherCell[]>()
  for (const cell of homeDitherCells(columns, rows, options)) {
    const row = byRow.get(cell.y)
    if (row) row.push(cell)
    else byRow.set(cell.y, [cell])
  }

  const chunks: TextChunk[] = []
  for (let y = 0; y < rows; y++) {
    const row = byRow.get(y) ?? []
    let cursor = 0
    for (const cell of row) {
      if (cell.x > cursor) chunks.push({ __isChunk: true, text: " ".repeat(cell.x - cursor) })
      const glyph = ditherGlyph(cell)
      chunks.push({
        __isChunk: true,
        text: glyph,
        fg: ditherInk(background, ink, cell.strength, cell.tone, glyph),
      })
      cursor = cell.x + 1
    }
    if (cursor < columns) chunks.push({ __isChunk: true, text: " ".repeat(columns - cursor) })
    if (y < rows - 1) chunks.push({ __isChunk: true, text: "\n" })
  }
  return chunks
}

export function HomeBackdropDither(props: HomeBackdropDitherProps = {}) {
  const theme = useTheme().theme
  const dimensions = useTerminalDimensions()
  const seed = normalizeSeed(props.seed ?? createHomeBackdropSeed())
  const scene = props.scene ?? selectHomeScene(seed).id
  // Keep the raster monochrome, but move it toward the theme's success/phosphor
  // channel. Arcana's default theme is a soft terminal green; other themes
  // still retain their own semantic hue instead of receiving a hard-coded RGB.
  const phosphorInk = RGBA.fromValues(
    theme.textMuted.r * 0.42 + theme.success.r * 0.58,
    theme.textMuted.g * 0.42 + theme.success.g * 0.58,
    theme.textMuted.b * 0.42 + theme.success.b * 0.58,
  )
  let node: TextRenderable | undefined
  let latest: StyledText | undefined

  const renderFrame = () => {
    const next = new StyledText(
      buildHomeDitherChunks(
        dimensions().width,
        dimensions().height,
        theme.background,
        phosphorInk,
        { seed, scene },
      ),
    )
    latest = next
    if (node && !node.isDestroyed) node.content = next
  }

  createEffect(() => {
    // The accessors inside renderFrame keep the static scene aligned with
    // terminal resizes and theme changes without introducing animation.
    renderFrame()
  })

  return (
    <text
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      wrapMode="none"
      selectable={false}
      zIndex={-1}
      ref={(value: TextRenderable) => {
        node = value
        if (latest && !value.isDestroyed) value.content = latest
      }}
    />
  )
}
