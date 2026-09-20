import { describe, expect, test } from "bun:test"
import { startStartupAnimation, startupFrame } from "../src/startup-animation"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function fakeStream(isTTY = true) {
  const writes: string[] = []
  return {
    isTTY,
    writes,
    write(chunk: string) {
      writes.push(chunk)
      return true
    },
  }
}

describe("startup frame", () => {
  test("cycles the sigil sequence and keeps the label", () => {
    const glyphs = ["A", "B", "C"]
    expect(startupFrame({ tick: 0, label: "boot", glyphs, color: false })).toBe("A arcana · boot")
    expect(startupFrame({ tick: 3, label: "boot", glyphs, color: false })).toBe("A arcana · boot")
    expect(startupFrame({ tick: 4, label: "boot", glyphs, color: false })).toBe("B arcana · boot")
  })

  test("colors by default and strips color when asked", () => {
    const colored = startupFrame({ tick: 0, label: "boot", glyphs: ["A"] })
    expect(colored).toContain("\x1b[38;2;")
    expect(colored).toContain("\x1b[0m")
    expect(startupFrame({ tick: 0, label: "boot", glyphs: ["A"], color: false })).not.toContain("\x1b[")
  })

  test("non-finite ticks and empty pools stay safe", () => {
    expect(startupFrame({ tick: Number.NaN, label: "x", glyphs: [], color: false })).toBe("◆ arcana · x")
  })
})

describe("startup animation", () => {
  test("draws and advances on a TTY, then erases on stop", async () => {
    const stream = fakeStream()
    const animation = startStartupAnimation({
      stream,
      intervalMs: 16,
      phrases: ["boot"],
      glyphs: ["A", "B"],
      color: false,
    })

    // First frame paints immediately, with the line erased first.
    expect(stream.writes[0]).toBe("\r\x1b[2KA arcana · boot")

    await sleep(60)
    expect(stream.writes.length).toBeGreaterThan(2)

    animation.setLabel("connecting daemon")
    expect(stream.writes.at(-1)).toContain("connecting daemon")

    const before = stream.writes.length
    animation.stop()
    expect(stream.writes.at(-1)).toBe("\r\x1b[2K")
    expect(stream.writes.length).toBe(before + 1)
    const settled = stream.writes.length
    await sleep(40)
    expect(stream.writes.length).toBe(settled)
    animation.stop() // idempotent
  })

  test("writes nothing when disabled or not a TTY", async () => {
    const disabled = fakeStream()
    startStartupAnimation({ stream: disabled, enabled: false, intervalMs: 16 })

    const piped = fakeStream(false)
    startStartupAnimation({ stream: piped, intervalMs: 16 })

    await sleep(40)
    expect(disabled.writes).toHaveLength(0)
    expect(piped.writes).toHaveLength(0)
  })
})
