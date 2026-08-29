import { RGBA, StyledText, type TextChunk, type TextRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect } from "solid-js"
import { useTheme } from "../context/theme"

const DEFAULT_SEED = 0x00c0ffee
const DITHER_DENSITY = 0.78
const DITHER_JITTER = 0.42
const MAX_DITHER_CELLS = 3072
const MAX_DOT_ALPHA = 0.3
const SCENE_WIDTH = 0.84
const SCENE_SPAN = 0.48
const QUIET_FEATHER = 0.06

/**
 * The ramp is intentionally compact. Sparse characters keep the outer field
 * airy while the heavier glyphs make authored landmarks read as line art.
 */
export const HOME_DITHER_GLYPHS = ["·", ".", ":", "~", "-", "|", "/", "\\", "+", "^", "x", "*", "#"] as const

/**
 * A small motif tile keeps the field feeling like a mesh instead of a sheet of
 * unrelated noise. Tone still controls the minimum glyph weight per cell.
 */
const GLYPH_PATTERN = [
  [0, 0, 8, 0, 10, 0, 4, 6],
  [0, 2, 0, 4, 0, 9, 0, 0],
  [10, 0, 6, 2, 0, 8, 0, 4],
  [0, 4, 0, 10, 6, 0, 2, 0],
] as const

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const

const SCENE_MARK_STRENGTH: Readonly<Record<string, number>> = {
  ".": 0.08,
  ":": 0.16,
  "~": 0.2,
  "-": 0.3,
  "|": 0.38,
  "/": 0.42,
  "\\": 0.42,
  "+": 0.5,
  "^": 0.58,
  "x": 0.64,
  "#": 0.78,
  "@": 0.92,
}

const SCENE_MARK_GLYPH: Readonly<Record<string, string>> = {
  ".": ".",
  ":": ":",
  "~": "~",
  "-": "-",
  "|": "|",
  "/": "/",
  "\\": "\\",
  "+": "+",
  "^": "^",
  "x": "x",
  "#": "#",
  "@": "#",
}

export type HomeBackdropSeed = number

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
  /** Authored mark at this coordinate, or a blank space for ambient texture. */
  mark: string
  /** Seeded glyph variation; it is stable for this terminal cell. */
  variant: number
}>

function sceneRows(...rows: string[]): readonly string[] {
  const width = Math.max(1, ...rows.map((row) => row.length))
  return rows.map((row) => row.padEnd(width, " "))
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
  return (1 - normalized) ** 1.35
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

function sceneMarkAt(scene: HomeBackdropScene, x: number, y: number) {
  if (y > SCENE_SPAN) return " "
  const width = scene.rows[0]?.length ?? 0
  if (width === 0 || scene.rows.length === 0) return " "
  const sceneX = (clamp(x) - (1 - SCENE_WIDTH) / 2) / SCENE_WIDTH
  if (sceneX < 0 || sceneX > 1) return " "
  const column = Math.min(width - 1, Math.floor(sceneX * width))
  const row = Math.min(scene.rows.length - 1, Math.floor((clamp(y) / SCENE_SPAN) * scene.rows.length))
  return scene.rows[row]?.[column] ?? " "
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

  for (let y = 0; y < rows; y++) {
    const rowStrength = homeDitherRowStrength(rows, y)
    if (rowStrength <= 0) continue
    for (let x = 0; x < columns; x++) {
      const normalizedX = (x + 0.5) / columns
      const normalizedY = (y + 0.5) / rows
      const quiet = quietZoneFactor(normalizedX, normalizedY)
      if (quiet <= 0) continue

      const mark = sceneMarkAt(scene, normalizedX, normalizedY)
      const structure = SCENE_MARK_STRENGTH[mark] ?? 0
      // Keep the upper field richly textured; the monotonic envelope still
      // carries it gently into the untouched dark background below.
      const ambient = 0.42 * (1 - normalizedY) ** 1.1
      const tone = clamp((ambient + structure * 1.15) * rowStrength * quiet)
      if (tone <= 0.015) continue

      const ordered = (BAYER_4X4[y & 3]![x & 3]! + 0.5) / 16
      const threshold = ordered + (cellRank(seed, x, y) - 0.5) * DITHER_JITTER
      if (threshold >= tone * DITHER_DENSITY) continue
      cells.push({
        x,
        y,
        strength: clamp(rowStrength * quiet),
        tone,
        mark,
        variant: cellRank(seed ^ 0xa5a5a5a5, x, y),
      })
    }
  }

  return rowStratifiedSample(cells, seed, rows)
}

function ditherGlyph(cell: HomeDitherCell) {
  const authored = cell.mark === " " ? undefined : SCENE_MARK_GLYPH[cell.mark]
  // Keep even light contour marks intact; the alpha envelope, not glyph
  // substitution, is what keeps the landmark behind the foreground UI.
  if (authored && cell.tone >= 0.1) return authored
  const pattern = clamp(
    GLYPH_PATTERN[cell.y & 3]![cell.x & 7]! + Math.floor(cell.variant * 3) - 1,
    0,
    HOME_DITHER_GLYPHS.length - 1,
  )
  const toneIndex = Math.floor(clamp(cell.tone) * (HOME_DITHER_GLYPHS.length - 1))
  return HOME_DITHER_GLYPHS[Math.min(HOME_DITHER_GLYPHS.length - 1, Math.max(pattern, toneIndex))]!
}

function ditherInk(background: RGBA, ink: RGBA, strength: number, tone: number, glyph: string) {
  const amount = 0.5 + clamp(tone) * 0.3
  const weight = glyph === "·" || glyph === "." || glyph === ":" ? 1 : 0.82
  return RGBA.fromValues(
    background.r + (ink.r - background.r) * amount,
    background.g + (ink.g - background.g) * amount,
    background.b + (ink.b - background.b) * amount,
    MAX_DOT_ALPHA * weight * clamp(strength),
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
  let node: TextRenderable | undefined
  let latest: StyledText | undefined

  const renderFrame = () => {
    const next = new StyledText(
      buildHomeDitherChunks(
        dimensions().width,
        dimensions().height,
        theme.background,
        theme.textMuted,
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
