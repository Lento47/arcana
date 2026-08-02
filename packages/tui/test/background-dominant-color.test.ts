import { describe, expect, test } from "bun:test"
import { dominantColor, type DecodedImage } from "../src/background"

function image(width: number, height: number, fill: [number, number, number]): DecodedImage {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = fill[0]
    data[i * 4 + 1] = fill[1]
    data[i * 4 + 2] = fill[2]
    data[i * 4 + 3] = 255
  }
  return { width, height, data }
}

describe("dominantColor", () => {
  test("solid image returns its exact color at full opacity", () => {
    const c = dominantColor(image(4, 4, [51, 102, 153]), { opacity: 1 })
    const [r, g, b] = c.toInts()
    expect(r).toBe(51)
    expect(g).toBe(102)
    expect(b).toBe(153)
  })

  test("opacity dims the dominant color toward black", () => {
    const c = dominantColor(image(2, 2, [200, 100, 50]), { opacity: 0.5 })
    const [r, g, b] = c.toInts()
    expect(r).toBe(100)
    expect(g).toBe(50)
    expect(b).toBe(25)
  })

  test("clamps opacity to [0, 1]", () => {
    const c = dominantColor(image(1, 1, [128, 64, 32]), { opacity: 7 })
    const [r, g, b] = c.toInts()
    expect(r).toBe(128)
    expect(g).toBe(64)
    expect(b).toBe(32)
  })

  test("most-populated bucket wins, not the mean of the whole image", () => {
    // 3 red pixels + 1 blue pixel: mean would be (192,0,64)-ish; dominant must be red.
    const data = new Uint8Array(4 * 4)
    for (let i = 0; i < 3; i++) {
      data[i * 4] = 255 // red
      data[i * 4 + 3] = 255
    }
    data[3 * 4 + 2] = 255 // one blue pixel
    data[3 * 4 + 3] = 255
    const c = dominantColor({ width: 2, height: 2, data }, { opacity: 1 })
    const [r, g, b] = c.toInts()
    expect(r).toBeGreaterThan(b)
    expect(r).toBe(255)
    expect(b).toBe(0)
  })

  test("empty image degrades to black", () => {
    const c = dominantColor({ width: 0, height: 0, data: new Uint8Array(0) }, { opacity: 1 })
    const [r, g, b] = c.toInts()
    expect(r).toBe(0)
    expect(g).toBe(0)
    expect(b).toBe(0)
  })
})
