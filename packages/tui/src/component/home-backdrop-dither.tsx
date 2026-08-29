import { RGBA, StyledText, type TextChunk, type TextRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect } from "solid-js"
import { useTheme } from "../context/theme"

const DITHER_DENSITY = 0.48
const DITHER_JITTER = 0.45
const MAX_DITHER_CELLS = 2048
const DOT_ALPHA = 0.26
const DITHER_GLYPHS = [
  ["·", "·", "+", "·", "x", "·", "-", "·"],
  ["·", ":", "·", "-", "·", "x", "·", "·"],
  ["x", "·", "+", ":", "·", "-", "·", "+"],
  ["·", "-", "·", "x", "+", "·", ":", "·"],
] as const
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const

export type HomeDitherCell = Readonly<{
  x: number
  y: number
  /** 0..1 envelope strength used to derive the dot ink alpha. */
  strength: number
}>

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
}

function integerDimension(value: number) {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0))
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

/**
 * Generate a deterministic ordered-dither mask for the static backdrop.
 *
 * The small hash jitter keeps the low-density Bayer pattern from collapsing
 * into horizontal bands while preserving the ordered, mesh-like rhythm. There
 * is no per-frame randomness or animation state, so the texture never sparkles,
 * moves, or changes the foreground renderables.
 */
export function homeDitherCells(width: number, height: number): HomeDitherCell[] {
  const columns = integerDimension(width)
  const rows = integerDimension(height)
  if (columns === 0 || rows === 0) return []

  const cells: HomeDitherCell[] = []

  for (let y = 0; y < rows; y++) {
    const strength = homeDitherRowStrength(rows, y)
    if (strength <= 0) continue
    const density = DITHER_DENSITY * strength
    for (let x = 0; x < columns; x++) {
      const ordered = (BAYER_4X4[y & 3]![x & 3]! + 0.5) / 16
      const threshold = ordered + (cellRank(x, y) - 0.5) * DITHER_JITTER
      if (threshold >= density) continue
      cells.push({ x, y, strength })
    }
  }

  if (cells.length <= MAX_DITHER_CELLS) return cells

  // Select a stable spatial sample rather than every Nth row-major cell. A
  // row-major stride can erase whole Bayer rows on wide terminals and make the
  // fade look banded; hashing keeps the sparse veil distributed everywhere.
  const ranked = cells
    .map((cell) => ({ cell, rank: cellRank(cell.x, cell.y) }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_DITHER_CELLS)
  return ranked
    .sort((a, b) => a.cell.y - b.cell.y || a.cell.x - b.cell.x)
    .map(({ cell }) => cell)
}

function cellRank(x: number, y: number) {
  let value = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263)
  value = Math.imul(value ^ (value >>> 13), 1274126177)
  value ^= value >>> 16
  return (value >>> 0) / 0x1_0000_0000
}

function ditherGlyph(x: number, y: number) {
  return DITHER_GLYPHS[y & 3]![x & 7]!
}

function ditherInk(background: RGBA, ink: RGBA, strength: number, glyph: string) {
  const amount = 0.55 + clamp(strength) * 0.25
  const weight = glyph === "·" || glyph === ":" ? 1 : 0.84
  return RGBA.fromValues(
    background.r + (ink.r - background.r) * amount,
    background.g + (ink.g - background.g) * amount,
    background.b + (ink.b - background.b) * amount,
    DOT_ALPHA * weight * clamp(strength),
  )
}

/**
 * Convert the mask into background-only text chunks. Every visible cell is a
 * low-contrast mesh glyph; gaps remain spaces so the layer never paints a
 * surface or captures input.
 */
export function buildHomeDitherChunks(
  width: number,
  height: number,
  background = RGBA.fromValues(0, 0, 0),
  ink = RGBA.fromValues(1, 1, 1),
): TextChunk[] {
  const columns = integerDimension(width)
  const rows = integerDimension(height)
  if (columns === 0 || rows === 0) return []

  const byRow = new Map<number, HomeDitherCell[]>()
  for (const cell of homeDitherCells(columns, rows)) {
    const row = byRow.get(cell.y)
    if (row) row.push(cell)
    else byRow.set(cell.y, [cell])
  }

  const chunks: TextChunk[] = []
  for (let y = 0; y < rows; y++) {
    const row = byRow.get(y) ?? []
    let cursor = 0
    for (const cell of row) {
      if (cell.x > cursor) {
        chunks.push({ __isChunk: true, text: " ".repeat(cell.x - cursor) })
      }
      const glyph = ditherGlyph(cell.x, cell.y)
      chunks.push({ __isChunk: true, text: glyph, fg: ditherInk(background, ink, cell.strength, glyph) })
      cursor = cell.x + 1
    }
    if (cursor < columns) {
      chunks.push({ __isChunk: true, text: " ".repeat(columns - cursor) })
    }
    if (y < rows - 1) chunks.push({ __isChunk: true, text: "\n" })
  }
  return chunks
}

export function HomeBackdropDither() {
  const theme = useTheme().theme
  const dimensions = useTerminalDimensions()
  let node: TextRenderable | undefined
  let latest: StyledText | undefined

  const renderFrame = () => {
    const next = new StyledText(
      buildHomeDitherChunks(dimensions().width, dimensions().height, theme.background, theme.textMuted),
    )
    latest = next
    if (node && !node.isDestroyed) node.content = next
  }

  createEffect(() => {
    // The accessors inside renderFrame keep the static field aligned with
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
