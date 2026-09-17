/**
 * Braille canvas math — 2×4 dots per cell, 8× the resolution of block glyphs.
 *
 * Pure string output (no renderable): the chart kit composes these rows into
 * text or paints them through a FrameBuffer equally well. The dot-bit table is
 * the standard Unicode braille assignment (dots 1–8), so the glyphs render
 * correctly in any braille-capable font.
 */

/** Dot bits by column then row: [col][row]. */
const DOT_BITS: readonly (readonly number[])[] = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
]

const BRAILLE_BASE = 0x2800

export class BrailleGrid {
  readonly cols: number
  readonly rows: number
  readonly pixelWidth: number
  readonly pixelHeight: number
  private readonly mask: Uint8Array

  constructor(cols: number, rows: number) {
    this.cols = Math.max(0, Math.floor(cols))
    this.rows = Math.max(0, Math.floor(rows))
    this.pixelWidth = this.cols * 2
    this.pixelHeight = this.rows * 4
    this.mask = new Uint8Array(this.cols * this.rows)
  }

  /** Light one dot; out-of-bounds coordinates are dropped. */
  set(px: number, py: number): void {
    if (px < 0 || py < 0 || px >= this.pixelWidth || py >= this.pixelHeight) return
    const cellX = Math.floor(px / 2)
    const cellY = Math.floor(py / 4)
    this.mask[cellY * this.cols + cellX] |= DOT_BITS[px % 2]![py % 4]!
  }

  /** Bresenham line between two dots. */
  plot(x0: number, y0: number, x1: number, y1: number): void {
    let x = Math.round(x0)
    let y = Math.round(y0)
    const endX = Math.round(x1)
    const endY = Math.round(y1)
    const dx = Math.abs(endX - x)
    const dy = -Math.abs(endY - y)
    const sx = x < endX ? 1 : -1
    const sy = y < endY ? 1 : -1
    let error = dx + dy
    while (true) {
      this.set(x, y)
      if (x === endX && y === endY) return
      const doubled = 2 * error
      if (doubled >= dy) {
        error += dy
        x += sx
      }
      if (doubled <= dx) {
        error += dx
        y += sy
      }
    }
  }

  clear(): void {
    this.mask.fill(0)
  }

  /** One string per character row; blank dots render as braille blank (U+2800). */
  render(): string[] {
    const lines: string[] = []
    for (let row = 0; row < this.rows; row++) {
      let line = ""
      for (let col = 0; col < this.cols; col++) {
        line += String.fromCodePoint(BRAILLE_BASE + this.mask[row * this.cols + col]!)
      }
      lines.push(line)
    }
    return lines
  }
}

/**
 * Plot a numeric series as a line (optionally filled below) across the grid.
 * Values scale against their maximum with a zero baseline; the newest sample
 * is the rightmost column, matching the sparkline's reading direction.
 */
export function plotSeries(
  grid: BrailleGrid,
  values: readonly number[],
  options: { fill?: boolean } = {},
): void {
  const samples = values.filter((value) => Number.isFinite(value))
  if (samples.length === 0 || grid.pixelWidth === 0 || grid.pixelHeight === 0) return
  let max = 0
  for (const value of samples) if (value > max) max = value
  if (max <= 0) max = 1
  const baseline = grid.pixelHeight - 1
  const yFor = (value: number) => baseline - Math.round((value / max) * baseline)
  const xFor = (index: number) =>
    samples.length === 1 ? grid.pixelWidth - 1 : Math.round((index / (samples.length - 1)) * (grid.pixelWidth - 1))

  let previous: { x: number; y: number } | undefined
  for (let i = 0; i < samples.length; i++) {
    const point = { x: xFor(i), y: yFor(samples[i]!) }
    if (previous) {
      grid.plot(previous.x, previous.y, point.x, point.y)
      if (options.fill) {
        for (let x = previous.x; x <= point.x; x++) {
          for (let y = Math.max(previous.y, point.y); y <= baseline; y++) grid.set(x, y)
        }
      }
    }
    previous = point
  }
}

/** Convenience: a fresh grid of `width`×`height` cells rendered as lines. */
export function brailleSeries(
  values: readonly number[],
  width: number,
  height: number,
  options: { fill?: boolean } = {},
): string[] {
  const grid = new BrailleGrid(width, height)
  plotSeries(grid, values, options)
  return grid.render()
}
