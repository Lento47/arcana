import { RGBA } from "@opentui/core"

/**
 * Custom TUI background image (Phase 1, truecolor-gated).
 *
 * The original implementation composited a decoded image into the cell grid via
 * a renderer post-process pass using upper-half-block "▀" glyphs (fg = top pixel,
 * bg = bottom pixel). On non-truecolor terminals the RGBA→palette quantization
 * shifts every block's hue, and where the bottom half inherits the default
 * background half the block becomes invisible (audit C1/D6).
 *
 * Per the audit fix, compositing is gated on `renderer.capabilities.rgb` and
 * skipped entirely on ANSI-256 terminals. When truecolor IS available we prefer
 * `renderer.setBackgroundColor()` (OSC 11, mirroring `context/theme.tsx`) so the
 * terminal itself paints the background — no per-frame decode, no half-block
 * ghosting. This module therefore derives a single representative color from the
 * image; app.tsx decides whether to apply it.
 */

export interface DecodedImage {
  width: number
  height: number
  data: Uint8Array // RGBA, row-major
}

export async function decodeImage(filePath: string): Promise<DecodedImage | undefined> {
  try {
    const { Jimp } = await import("jimp")
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

// Quantized histogram bucket (4 bits per channel) → dominant color. Keeps the
// average honest by counting the most-populated bucket, not the mean of the
// whole image (which trends gray on mixed-content photos).
const BUCKET = 16 // 4 bits per channel
const BUCKETS = BUCKET * BUCKET * BUCKET

/**
 * Representative background color for the terminal (OSC 11 via
 * `renderer.setBackgroundColor`). Computes a dominant color from the decoded
 * image: quantize each pixel into a 4-bit-per-channel bucket, pick the most
 * populated bucket, and return the arithmetic mean of that bucket's members.
 * `opacity` scales the result toward black (0..1), matching the previous
 * composite's dimming behavior.
 */
export function dominantColor(image: DecodedImage, opts: { opacity: number }): RGBA {
  const dim = Math.max(0, Math.min(1, opts.opacity))
  const n = image.width * image.height
  if (n === 0) return RGBA.fromInts(0, 0, 0)

  const counts = new Uint32Array(BUCKETS)
  const sumR = new Float64Array(BUCKETS)
  const sumG = new Float64Array(BUCKETS)
  const sumB = new Float64Array(BUCKETS)
  const data = image.data
  for (let i = 0; i < n; i++) {
    const o = i * 4
    const r = data[o]
    const g = data[o + 1]
    const b = data[o + 2]
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    counts[key]++
    sumR[key] += r
    sumG[key] += g
    sumB[key] += b
  }

  let best = 0
  let bestN = 0
  for (let key = 0; key < BUCKETS; key++) {
    if (counts[key] > bestN) {
      bestN = counts[key]
      best = key
    }
  }

  const mean = (sum: Float64Array) => (bestN > 0 ? sum[best] / bestN : 0)
  // Explicit opaque alpha: the terminal background (OSC 11) must not be transparent.
  return RGBA.fromInts(
    Math.round(mean(sumR) * dim),
    Math.round(mean(sumG) * dim),
    Math.round(mean(sumB) * dim),
    255,
  )
}
