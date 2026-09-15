import { RGBA, StyledText, type TextChunk, type TextRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect } from "solid-js"
import { useTheme } from "../context/theme"

const DEFAULT_SEED = 0x00c0ffee
const DITHER_LEVELS = 4
const DITHER_DENSITY = 0.86
const DITHER_JITTER = 0.11
const MAX_DITHER_CELLS = 3072
const MAX_DOT_ALPHA = 0.3
const SCENE_WIDTH = 0.84
const SCENE_SPAN = 0.56
const QUIET_FEATHER = 0.06

// These values describe the visual contract of the backdrop. The scene is a
// quiet atmospheric watermark: bright and legible near the upper edge, then
// progressively less present toward the prompt and the lower terminal rows.
const VERTICAL_FADE_EXPONENT = 1.26
const ATMOSPHERE_FADE_EXPONENT = 1.08
const AMBIENT_GAIN = 0.44
const STRUCTURE_GAIN = 1.04
const STRUCTURE_ATMOSPHERE_GAIN = 0.16
const DEFINITION_TONE_GAIN = 0.08
const CONTOUR_DEFINITION_THRESHOLD = 0.18
const CRT_SCANLINE_DROP = 0.035
const SCANLINE_FRAGMENT_GAIN = 0.055
const SCANLINE_FRAGMENT_PERIOD = 4
const SCANLINE_FRAGMENT_GROUP = 3
const SCANLINE_FRAGMENT_THRESHOLD = 0.63
const SCANLINE_FRAGMENT_SEED = 0x04b1d2f7
const SCENE_SAMPLE_X = 0.018
const SCENE_SAMPLE_Y = 0.022
const SCENE_RELIEF_GAIN = 0.14

/**
 * The public allow-list is also used by the renderer tests. Braille cells give
 * the backdrop a 2×4 subpixel grid, so its raster can carry much more detail
 * than a single terminal character while remaining one cell wide.
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
const BRAILLE_BANDS = [
  [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80],
  [0x03, 0x09, 0x12, 0x24, 0x41, 0x82, 0xc0, 0x48],
  [0x13, 0x2c, 0x61, 0x86, 0x3c, 0xc3, 0x7e, 0xdb],
  [0x17, 0x2f, 0x77, 0xb7, 0xef, 0xfb, 0xff],
] as const
const BRAILLE_DITHER_GLYPHS = [...new Set(BRAILLE_BANDS.flat())].map((mask) => String.fromCodePoint(0x2800 + mask))
export const HOME_DITHER_GLYPHS: readonly string[] = [...ASCII_DITHER_GLYPHS, ...BRAILLE_DITHER_GLYPHS]

/**
 * A small motif tile keeps the field feeling like a mesh instead of a sheet of
 * unrelated noise. Tone still controls the minimum glyph weight per cell.
 */
const GLYPH_PATTERN = [
  [0, 1, 0, 0, 2, 0, 1, 3],
  [0, 0, 1, 2, 0, 1, 0, 0],
  [2, 0, 1, 0, 0, 2, 0, 1],
  [0, 2, 0, 1, 4, 0, 1, 5],
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

export type HomeSceneField = (x: number, y: number, seed: HomeBackdropSeed) => number

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
  rows: readonly string[]
  field: HomeSceneField
}>

export type HomeDitherOptions = Readonly<{
  seed?: HomeBackdropSeed
  scene?: HomeSceneId | HomeBackdropScene
}>

export type HomeBackdropDitherProps = HomeDitherOptions

export type HomeDitherCell = Readonly<{
  x: number
  y: number
  /** Final envelope strength used for glyph ink alpha. */
  strength: number
  /** Combined scene, quiet-zone, and top-to-bottom tone used for dithering. */
  tone: number
  /** Four-level quantized tone used for the ordered retro shading pattern. */
  shade: number
  /** Local scene contrast used for sparse contour accents. */
  definition: number
  /** Seeded glyph variation; it is stable for this terminal cell. */
  variant: number
}>

function sceneRows(...rows: string[]): readonly string[] {
  const width = Math.max(1, ...rows.map((row) => row.length))
  return rows.map((row) => row.padEnd(width, " "))
}

type SceneSpace = Readonly<{ x: number; y: number }>
type SceneToneSample = Readonly<{ tone: number; definition: number }>

function sceneSpace(x: number, y: number): SceneSpace | undefined {
  if (y > SCENE_SPAN) return
  const sceneX = (clamp(x) - (1 - SCENE_WIDTH) / 2) / SCENE_WIDTH
  if (sceneX < 0 || sceneX > 1) return
  return { x: sceneX, y: clamp(y / SCENE_SPAN) }
}

function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1
  const normalized = clamp((value - edge0) / (edge1 - edge0))
  return normalized * normalized * (3 - 2 * normalized)
}

function softRect(x: number, y: number, left: number, right: number, top: number, bottom: number, feather = 0.025) {
  const outsideX = Math.max(left - x, 0, x - right)
  const outsideY = Math.max(top - y, 0, y - bottom)
  const outside = Math.max(outsideX, outsideY)
  return outside === 0 ? 1 : 1 - smoothstep(0, Math.max(feather, 0.035), outside)
}

function softEllipse(x: number, y: number, centerX: number, centerY: number, radiusX: number, radiusY: number, feather = 0.05) {
  const distance = Math.hypot((x - centerX) / radiusX, (y - centerY) / radiusY)
  return 1 - smoothstep(1, 1 + Math.max(feather, 0.07), distance - 0.0001)
}

function softTriangle(
  x: number,
  y: number,
  centerX: number,
  halfWidth: number,
  top: number,
  bottom: number,
  feather = 0.025,
) {
  const normalizedX = Math.abs(x - centerX) / halfWidth
  const roofLine = top + normalizedX * (bottom - top)
  const outside = Math.max(normalizedX - 1, top - y, y - bottom, roofLine - y)
  return outside <= 0 ? 1 : 1 - smoothstep(0, Math.max(feather, 0.035), outside)
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

function sceneTexture(seed: HomeBackdropSeed, x: number, y: number) {
  return (
    smoothNoise(seed ^ 0x13579bdf, x * 3.5, y * 2.5) * 0.55 +
    smoothNoise(seed ^ 0x2468ace0, x * 8.5, y * 6.5) * 0.3 +
    smoothNoise(seed ^ 0x9e3779b9, x * 19, y * 14) * 0.15
  )
}

/**
 * A low-frequency sky field keeps the dither from forming identical horizontal
 * stripes across the entire terminal. It is intentionally soft: the authored
 * scene remains the subject, while the atmosphere gives it photographic depth.
 */
function atmosphereTone(seed: HomeBackdropSeed, x: number, y: number) {
  const cloud = smoothNoise(seed ^ 0x6d2b79f5, x * 2.2, y * 1.8)
  const veil = smoothNoise(seed ^ 0x1b873593, x * 5.5, y * 3.2)
  const horizon = 1 - smoothstep(0.35, 0.9, y)
  return clamp(0.72 + cloud * 0.42 + veil * 0.12 + horizon * 0.08)
}

function fortressField(x: number, y: number, seed: HomeBackdropSeed) {
  const ridge = 0.56 + Math.sin(x * 7.5 + seed * 0.000001) * 0.035 + (sceneTexture(seed, x, y) - 0.5) * 0.06
  const distantHill = smoothstep(ridge - 0.04, ridge + 0.08, y) * 0.2
  const moon = softEllipse(x, y, 0.78, 0.13, 0.075, 0.085, 0.1)
  const moonShadow = softEllipse(x, y, 0.805, 0.115, 0.064, 0.073, 0.1)
  const leftTower = softRect(x, y, 0.14, 0.28, 0.23, 0.72, 0.018)
  const rightTower = softRect(x, y, 0.71, 0.84, 0.17, 0.72, 0.018)
  const leftRoof = softTriangle(x, y, 0.21, 0.11, 0.08, 0.27, 0.018)
  const rightRoof = softTriangle(x, y, 0.775, 0.12, 0.02, 0.2, 0.018)
  const keep = softRect(x, y, 0.34, 0.66, 0.28, 0.7, 0.02)
  const keepRoof = softTriangle(x, y, 0.5, 0.19, 0.1, 0.31, 0.02)
  const wall = softRect(x, y, 0.23, 0.78, 0.48, 0.76, 0.025)
  const gate = softEllipse(x, y, 0.5, 0.68, 0.07, 0.17, 0.08)
  const masonry = 0.78 + sceneTexture(seed ^ 0x51ed2705, x * 4, y * 5) * 0.22
  return clamp(
    distantHill +
      moon * 0.34 -
      moonShadow * 0.24 +
      (leftTower * 0.7 + rightTower * 0.78 + keep * 0.8 + wall * 0.45) * masonry +
      (leftRoof * 0.58 + rightRoof * 0.72 + keepRoof * 0.9) -
      gate * 0.28,
  )
}

function mountainPassField(x: number, y: number, seed: HomeBackdropSeed) {
  const primary = 0.42 + Math.sin(x * 5.8 + seed * 0.000002) * 0.08 + Math.sin(x * 13.2) * 0.025
  const secondary = 0.58 + Math.sin(x * 8.2 + 1.4) * 0.1 + (sceneTexture(seed, x, y) - 0.5) * 0.05
  const rear = smoothstep(primary - 0.025, primary + 0.1, y) * 0.38
  const front = smoothstep(secondary - 0.04, secondary + 0.1, y) * 0.62
  const pass = softEllipse(x, y, 0.5, 0.58, 0.18, 0.24, 0.12)
  const moon = softEllipse(x, y, 0.73, 0.15, 0.085, 0.085, 0.1)
  const moonShadow = softEllipse(x, y, 0.758, 0.13, 0.072, 0.07, 0.1)
  return clamp(
    moon * 0.32 -
      moonShadow * 0.2 +
      rear +
      front * (1 - pass * 0.55) +
      sceneTexture(seed ^ 0x17c6e3, x * 3, y * 4) * 0.12,
  )
}

function observatoryField(x: number, y: number, seed: HomeBackdropSeed) {
  const hill = smoothstep(0.62, 0.76, y) * 0.24
  const dome = softEllipse(x, y, 0.5, 0.35, 0.23, 0.2, 0.055)
  const domeCut = softEllipse(x, y, 0.5, 0.39, 0.19, 0.12, 0.05)
  const tower = softRect(x, y, 0.4, 0.6, 0.35, 0.72, 0.018)
  const leftWing = softRect(x, y, 0.27, 0.42, 0.48, 0.7, 0.02)
  const rightWing = softRect(x, y, 0.58, 0.73, 0.48, 0.7, 0.02)
  const antenna = softRect(x, y, 0.495, 0.505, 0.06, 0.25, 0.012)
  return clamp(hill + dome * 0.76 + tower * 0.64 + leftWing * 0.34 + rightWing * 0.34 + antenna * 0.38 - domeCut * 0.42 + sceneTexture(seed, x * 6, y * 5) * 0.12)
}

function templeRuinsField(x: number, y: number, seed: HomeBackdropSeed) {
  const ground = smoothstep(0.58, 0.78, y) * 0.22
  const pediment = softTriangle(x, y, 0.5, 0.31, 0.18, 0.43, 0.025)
  const base = softRect(x, y, 0.18, 0.82, 0.42, 0.7, 0.02)
  const columns = [0.24, 0.36, 0.5, 0.64, 0.77].reduce((sum, center, index) => {
    const top = 0.3 + (index % 2) * 0.055
    return sum + softRect(x, y, center - 0.032, center + 0.032, top, 0.69, 0.018) * (index === 2 ? 0.9 : 0.62)
  }, 0)
  const brokenWing = softRect(x, y, 0.06, 0.29, 0.38, 0.65, 0.03) * (0.55 + sceneTexture(seed, x * 5, y * 4) * 0.25)
  return clamp(ground + pediment * 0.62 + base * 0.38 + columns * 0.22 + brokenWing * 0.35)
}

function harborSkylineField(x: number, y: number, seed: HomeBackdropSeed) {
  const water = smoothstep(0.62, 0.76, y) * 0.32
  const skyline = [
    [0.08, 0.2, 0.36],
    [0.21, 0.13, 0.32],
    [0.34, 0.24, 0.4],
    [0.48, 0.11, 0.3],
    [0.58, 0.2, 0.36],
    [0.72, 0.15, 0.34],
    [0.86, 0.28, 0.44],
  ].reduce((sum, [center, width, top]) => sum + softRect(x, y, center - width / 2, center + width / 2, top, 0.7, 0.02) * 0.46, 0)
  const masts = softRect(x, y, 0.28, 0.292, 0.12, 0.69, 0.01) * 0.24 + softRect(x, y, 0.68, 0.692, 0.18, 0.69, 0.01) * 0.2
  const reflections = water * (0.65 + sceneTexture(seed ^ 0x32f0a9, x * 12, y * 8) * 0.35)
  return clamp(skyline + masts + reflections)
}

function canyonArchipelagoField(x: number, y: number, seed: HomeBackdropSeed) {
  const leftRidge = softTriangle(x, y, 0.02, 0.42, 0.2, 0.82, 0.04)
  const rightRidge = softTriangle(x, y, 0.98, 0.4, 0.25, 0.84, 0.04)
  const island = softEllipse(x, y, 0.52, 0.61, 0.26, 0.13, 0.08)
  const archOpening = softEllipse(x, y, 0.52, 0.59, 0.12, 0.09, 0.07)
  const strata = (0.5 + 0.5 * Math.sin((y * 30 + x * 6 + seed * 0.00001))) * 0.18
  return clamp(leftRidge * 0.62 + rightRidge * 0.68 + island * 0.54 - archOpening * 0.32 + strata)
}

/**
 * Generic iconic environments are authored as compact masks, not external
 * image assets. The texture and glyph choices around them still vary by seed.
 */
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
    field: fortressField,
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
    field: mountainPassField,
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
    field: observatoryField,
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
    field: templeRuinsField,
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
    field: harborSkylineField,
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
    field: canyonArchipelagoField,
  },
] as const

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
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

/**
 * Generate a launch seed once. It is never sampled inside the render loop.
 * Tests and visual fixtures can pass an explicit seed for reproducibility.
 */
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

function cellRank(seed: HomeBackdropSeed, x: number, y: number) {
  let value = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ normalizeSeed(seed)
  value = Math.imul(value ^ (value >>> 13), 1274126177)
  value ^= value >>> 16
  return (value >>> 0) / 0x1_0000_0000
}

function sceneFor(options: HomeDitherOptions) {
  if (options.scene && typeof options.scene !== "string") return options.scene
  if (typeof options.scene === "string") {
    const found = HOME_BACKDROP_SCENES.find((scene) => scene.id === options.scene)
    if (found) return found
  }
  return selectHomeScene(options.seed ?? DEFAULT_SEED)
}

/**
 * Sample the authored environment as a continuous luminance field. The scene
 * is deliberately not rendered from its ASCII reference rows: those rows are
 * metadata and a design reference, while the field is what gives the output
 * its soft, image-like halftone treatment.
 */
function sceneToneAt(scene: HomeBackdropScene, x: number, y: number, seed: HomeBackdropSeed): SceneToneSample {
  const space = sceneSpace(x, y)
  if (!space) return { tone: 0, definition: 0 }

  // A small cross-shaped footprint gives the masks a measured photographic
  // edge instead of a one-cell outline. The relief term restores a little
  // local contrast at ridges, roofs, and shorelines without drawing a hard
  // contour over the scene.
  const sample = (offsetX: number, offsetY: number) =>
    clamp(scene.field(clamp(space.x + offsetX), clamp(space.y + offsetY), seed))
  const center = sample(0, 0)
  const horizontal = (sample(SCENE_SAMPLE_X, 0) + sample(-SCENE_SAMPLE_X, 0)) / 2
  const vertical = (sample(0, SCENE_SAMPLE_Y) + sample(0, -SCENE_SAMPLE_Y)) / 2
  const neighborhood = horizontal * 0.58 + vertical * 0.42
  const body = center * 0.72 + neighborhood * 0.28
  const relief = Math.abs(center - neighborhood)
  return { tone: clamp(body + relief * SCENE_RELIEF_GAIN), definition: clamp(relief) }
}

function roundedZoneFactor(x: number, y: number, left: number, right: number, top: number, bottom: number) {
  const dx = Math.max(left - x, 0, x - right)
  const dy = Math.max(top - y, 0, y - bottom)
  if (dx === 0 && dy === 0) return 0
  return clamp(Math.hypot(dx, dy) / QUIET_FEATHER)
}

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

function rowStratifiedSample(cells: readonly HomeDitherCell[], seed: HomeBackdropSeed, rows: number) {
  if (cells.length <= MAX_DITHER_CELLS) return [...cells]

  const buckets = Array.from({ length: rows }, () => [] as HomeDitherCell[])
  for (const cell of cells) buckets[cell.y]?.push(cell)

  const scale = MAX_DITHER_CELLS / cells.length
  const allocations = buckets.map((bucket, y) => ({
    bucket,
    y,
    quota: Math.min(bucket.length, Math.floor(bucket.length * scale)),
    remainder: bucket.length * scale,
  }))
  let allocated = allocations.reduce((sum, item) => sum + item.quota, 0)
  for (const item of allocations.sort((a, b) => b.remainder - a.remainder)) {
    if (allocated >= MAX_DITHER_CELLS) break
    if (item.quota >= item.bucket.length) continue
    item.quota++
    allocated++
  }

  const sampled: HomeDitherCell[] = []
  for (const item of allocations) {
    if (item.quota === 0) continue
    sampled.push(
      ...item.bucket
        .slice()
        .sort((a, b) => cellRank(seed ^ 0x9e3779b9, a.x, a.y) - cellRank(seed ^ 0x9e3779b9, b.x, b.y))
        .slice(0, item.quota),
    )
  }
  return sampled.sort((a, b) => a.y - b.y || a.x - b.x)
}

/**
 * Generate a deterministic seeded scene mask for the static backdrop.
 *
 * The Bayer threshold supplies a repeatable mesh rhythm; the seed jitter keeps
 * wider terminals from showing obvious horizontal bands. No per-frame
 * randomness or animation state is involved.
 */
export function homeDitherCells(width: number, height: number, options: HomeDitherOptions = {}): HomeDitherCell[] {
  const columns = integerDimension(width)
  const rows = integerDimension(height)
  if (columns === 0 || rows === 0) return []

  const seed = normalizeSeed(options.seed ?? DEFAULT_SEED)
  const scene = sceneFor(options)
  const cells: HomeDitherCell[] = []
  const phaseX = seed & 7
  const phaseY = (seed >>> 3) & 7

  for (let y = 0; y < rows; y++) {
    const rowStrength = homeDitherRowStrength(rows, y)
    if (rowStrength <= 0) continue
    for (let x = 0; x < columns; x++) {
      const normalizedX = (x + 0.5) / columns
      const normalizedY = (y + 0.5) / rows
      const quiet = quietZoneFactor(normalizedX, normalizedY)
      if (quiet <= 0) continue

      const sceneSample = sceneToneAt(scene, normalizedX, normalizedY, seed)
      const structure = sceneSample.tone
      const definition = sceneSample.definition
      // Keep the upper field richly textured; the monotonic envelope still
      // carries it gently into the untouched dark background below. The
      // atmosphere term varies the sky horizontally so the halftone feels like
      // a luminance image instead of a repeated terminal-wide stripe.
      const atmosphere = atmosphereTone(seed, normalizedX, normalizedY)
      const ambient = AMBIENT_GAIN * atmosphere * (1 - normalizedY) ** ATMOSPHERE_FADE_EXPONENT
      // A fixed, low-amplitude CRT cadence gives the phosphor surface texture
      // without making the backdrop animate or compete with foreground text.
      const scanline = y % 2 === 0 ? 1 : 1 - CRT_SCANLINE_DROP
      // Below the authored scene, leave only grouped, broken scanline fragments
      // as a residual signal. They keep the fade feeling intentional instead of
      // ending on a perfectly clean horizontal cutoff.
      const fragmentSeed = cellRank(seed ^ SCANLINE_FRAGMENT_SEED, Math.floor(x / SCANLINE_FRAGMENT_GROUP), y)
      const scanlineFragment =
        normalizedY > 0.48 && y % SCANLINE_FRAGMENT_PERIOD === 1 && fragmentSeed > SCANLINE_FRAGMENT_THRESHOLD
          ? SCANLINE_FRAGMENT_GAIN * (1 - normalizedY) ** 0.7
          : 0
      const edgeFade = vignetteFactor(normalizedX)
      const envelope = rowStrength * scanline * edgeFade * quiet
      const tone = clamp(
        (ambient + structure * (STRUCTURE_GAIN + atmosphere * STRUCTURE_ATMOSPHERE_GAIN) + definition * DEFINITION_TONE_GAIN + scanlineFragment) * envelope,
      )
      if (tone <= 0.015) continue
      // Keep a non-zero display band for the very last cells in the fade. The
      // continuous tone still controls whether a cell is emitted, preventing
      // quantization from cutting the backdrop off in a hard horizontal line.
      const shade = Math.max(1 / (DITHER_LEVELS - 1), quantizeTone(tone))

      const ordered = (BAYER_8X8[(y + phaseY) & 7]![(x + phaseX) & 7]! + 0.5) / 64
      // Blend the ordered matrix with a deterministic grain sample. Pure
      // Bayer thresholds can reveal eight-cell stripes at small terminal
      // sizes; the grain preserves the ordered character while breaking that
      // mechanical banding into a finer, blue-noise-like surface.
      const grain = cellRank(seed ^ 0x7f4a7c15, x, y)
      const jitter = (cellRank(seed ^ 0x94d049bb, x, y) - 0.5) * DITHER_JITTER
      const threshold = ordered * 0.78 + grain * 0.22 + jitter * 0.35
      if (threshold >= tone * DITHER_DENSITY) continue
      cells.push({
        x,
        y,
        strength: clamp(envelope),
        tone,
        shade,
        definition,
        variant: cellRank(seed ^ 0xa5a5a5a5, x, y),
      })
    }
  }

  return rowStratifiedSample(cells, seed, rows)
}

function ditherGlyph(cell: HomeDitherCell) {
  const band = Math.max(0, Math.min(DITHER_LEVELS - 1, Math.round(cell.shade * (DITHER_LEVELS - 1))))
  const motif = GLYPH_PATTERN[cell.y & 3]![cell.x & 7]! / 8
  const sample = clamp(cell.variant * 0.78 + motif * 0.22)

  // Keep a few ASCII accents in the deepest values. They are spatially rare,
  // so the eye reads them as grain and contour texture rather than lettering.
  const accentRoll = (cell.x * 17 + cell.y * 31) & 63
  // Local relief gets an even smaller family of directional marks. They give
  // a roofline, ridge, or shoreline definition without turning every edge into
  // a literal ASCII outline.
  const contourRoll = (cell.x * 29 + cell.y * 13 + Math.floor(cell.variant * 17)) & 127
  if (cell.definition > CONTOUR_DEFINITION_THRESHOLD && band >= 2) {
    if (contourRoll === 0) return "|"
    if (contourRoll === 1) return cell.y & 1 ? "\\" : "/"
    if (contourRoll === 2) return "~"
  }
  if (band >= 2 && accentRoll === 0) return "-"
  if (band >= 2 && accentRoll === 1) return "+"
  if (band >= 2 && accentRoll === 2) return "x"
  if (band === 3 && accentRoll === 3) return "░"
  if (band === 3 && accentRoll === 4) return "▒"
  if (band === 3 && accentRoll === 5) return "▓"
  if (band === 3 && accentRoll === 6) return "█"
  if (band === 3 && accentRoll === 7) return "#"

  const palette = BRAILLE_BANDS[band] ?? BRAILLE_BANDS[0]
  const mask = palette[Math.min(palette.length - 1, Math.floor(sample * palette.length))]!
  return String.fromCodePoint(0x2800 + mask)
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
 * low-contrast mesh glyph; gaps remain spaces so the layer never captures
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
