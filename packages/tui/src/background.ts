import { RGBA } from "@opentui/core"
import type { OptimizedBuffer } from "@opentui/core"
import { Jimp } from "jimp"

/**
 * Custom TUI background image (Phase 1).
 *
 * opentui has no background-image primitive, so we composite a decoded image into the
 * cell grid via a renderer post-process pass. Each terminal cell holds 2 vertical pixels
 * rendered as the upper-half-block "▀" (fg = top pixel, bg = bottom pixel) — truecolor,
 * works in any 24-bit terminal. We only paint cells that are still "background"
 * (empty glyph + the most-common bg value), so existing text and panels are untouched.
 * Result: the image shows on the home/splash and any empty area. Full see-through during
 * chat (transparent scrollback/panels) is Phase 2.
 */

export interface DecodedImage {
  width: number
  height: number
  data: Uint8Array // RGBA, row-major
}

export async function decodeImage(filePath: string): Promise<DecodedImage | undefined> {
  try {
    const img = await Jimp.read(filePath)
    return {
      width: img.bitmap.width,
      height: img.bitmap.height,
      data: new Uint8Array(img.bitmap.data),
    }
  } catch {
    return undefined
  }
}

const UPPER_HALF_BLOCK = "▀"

// Most-common bg value = the cleared background. Comparing raw packed Uint16 avoids
// needing to know opentui's color packing.
function mostCommonU16(arr: Uint16Array): number {
  const counts = new Map<number, number>()
  let best = arr.length ? arr[0] : 0
  let bestN = 0
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i]
    const n = (counts.get(v) ?? 0) + 1
    counts.set(v, n)
    if (n > bestN) {
      bestN = n
      best = v
    }
  }
  return best
}

export function createBackgroundComposite(
  image: DecodedImage,
  opts: { opacity: number; fit: "cover" | "contain" },
): (buffer: OptimizedBuffer) => void {
  const dim = Math.max(0, Math.min(1, opts.opacity))
  let cw = -1
  let ch = -1
  let top: RGBA[] = []
  let bottom: RGBA[] = []
  let bgVal: number | undefined

  function rebuild(cols: number, rows: number) {
    const pxW = cols
    const pxH = rows * 2 // 2 vertical pixels per cell (half-block)
    top = new Array(cols * rows)
    bottom = new Array(cols * rows)
    const iw = image.width
    const ih = image.height
    if (iw === 0 || ih === 0) return
    const scale = opts.fit === "contain" ? Math.min(pxW / iw, pxH / ih) : Math.max(pxW / iw, pxH / ih)
    const offX = (pxW - iw * scale) / 2
    const offY = (pxH - ih * scale) / 2
    const px = (tx: number, ty: number): RGBA => {
      const sx = Math.floor((tx - offX) / scale)
      const sy = Math.floor((ty - offY) / scale)
      if (sx < 0 || sy < 0 || sx >= iw || sy >= ih) return RGBA.fromInts(0, 0, 0)
      const o = (sy * iw + sx) * 4
      return RGBA.fromInts(
        Math.round(image.data[o] * dim),
        Math.round(image.data[o + 1] * dim),
        Math.round(image.data[o + 2] * dim),
      )
    }
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        top[i] = px(x, y * 2)
        bottom[i] = px(x, y * 2 + 1)
      }
    }
  }

  return (buffer: OptimizedBuffer) => {
    const cols = buffer.width
    const rows = buffer.height
    if (cols !== cw || rows !== ch) {
      rebuild(cols, rows)
      cw = cols
      ch = rows
      bgVal = undefined
    }
    if (top.length !== cols * rows) return
    const { char, bg } = buffer.buffers
    if (bgVal === undefined) bgVal = mostCommonU16(bg)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        const c = char[i]
        if ((c === 0 || c === 32) && bg[i] === bgVal) {
          buffer.setCell(x, y, UPPER_HALF_BLOCK, top[i], bottom[i])
        }
      }
    }
  }
}
