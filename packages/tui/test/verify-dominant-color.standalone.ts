// Standalone verification of the truecolor-gated dominantColor policy. Runs with
// plain `bun run` (bun test segfaults on this Windows env). Mirrors
// background-dominant-color.test.ts — keep the two files in sync.
import { dominantColor, type DecodedImage } from "../src/background"

let failures = 0
const assert = (cond: boolean, msg: string) => {
  if (cond) {
    console.log("ok: " + msg)
  } else {
    failures++
    console.error("FAIL: " + msg)
  }
}

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

const solid = dominantColor(image(4, 4, [51, 102, 153]), { opacity: 1 }).toInts()
assert(solid[0] === 51 && solid[1] === 102 && solid[2] === 153, "solid image returns its exact color")

const dim = dominantColor(image(2, 2, [200, 100, 50]), { opacity: 0.5 }).toInts()
assert(dim[0] === 100 && dim[1] === 50 && dim[2] === 25, "opacity 0.5 dims toward black")

const clamped = dominantColor(image(1, 1, [128, 64, 32]), { opacity: 7 }).toInts()
assert(clamped[0] === 128 && clamped[1] === 64 && clamped[2] === 32, "opacity clamps to [0,1]")

// 3 red + 1 blue: dominant (bucket majority) must be red, not the gray-ish mean.
const data = new Uint8Array(4 * 4)
for (let i = 0; i < 3; i++) {
  data[i * 4] = 255
  data[i * 4 + 3] = 255
}
data[3 * 4 + 2] = 255
data[3 * 4 + 3] = 255
const maj = dominantColor({ width: 2, height: 2, data }, { opacity: 1 }).toInts()
assert(maj[0] === 255 && maj[1] === 0 && maj[2] === 0, "most-populated bucket wins (red beats mean)")

const empty = dominantColor({ width: 0, height: 0, data: new Uint8Array(0) }, { opacity: 1 }).toInts()
assert(empty[0] === 0 && empty[1] === 0 && empty[2] === 0, "empty image degrades to black")

if (failures > 0) {
  console.error(`\n${failures} FAILURES`)
  process.exit(1)
}
console.log("\nAll dominantColor assertions passed.")
