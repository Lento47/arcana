import { describe, expect, test } from "bun:test"
import {
  formatImageGenerateResult,
  normalizeAspectRatio,
  saveB64Image,
  imagesDir,
} from "./image-generate.js"
import { existsSync, rmSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("normalizeAspectRatio", () => {
  test("maps named aliases", () => {
    expect(normalizeAspectRatio("landscape")).toBe("16:9")
    expect(normalizeAspectRatio("portrait")).toBe("9:16")
    expect(normalizeAspectRatio("square")).toBe("1:1")
    expect(normalizeAspectRatio("wide")).toBe("16:9")
  })

  test("passes through explicit ratios", () => {
    expect(normalizeAspectRatio("4:3")).toBe("4:3")
    expect(normalizeAspectRatio("21:9")).toBe("21:9")
  })

  test("handles empty", () => {
    expect(normalizeAspectRatio(undefined)).toBeUndefined()
    expect(normalizeAspectRatio("")).toBeUndefined()
    expect(normalizeAspectRatio("  ")).toBeUndefined()
  })
})

describe("formatImageGenerateResult", () => {
  test("formats success with paths", () => {
    const text = formatImageGenerateResult({
      ok: true,
      model: "openai/gpt-5-image",
      provider: "openrouter",
      images: [{ path: "/tmp/a.png" }, { path: "/tmp/b.png" }],
      usage: { cost: 0.04 },
    })
    expect(text).toContain("Generated 2 image")
    expect(text).toContain("/tmp/a.png")
    expect(text).toContain("openai/gpt-5-image")
    expect(text).toContain("$0.04")
  })

  test("formats insufficient credits", () => {
    const text = formatImageGenerateResult({
      ok: false,
      images: [],
      error: "insufficient_credits",
      message: "need 5",
    })
    expect(text).toContain("insufficient_credits")
    expect(text).toContain("Top up")
  })
})

describe("saveB64Image", () => {
  test("writes a tiny png-ish buffer under artifacts/images", () => {
    // Minimal valid-enough payload: just check write + path under imagesDir
    const b64 = Buffer.from("fake-png-bytes").toString("base64")
    const path = saveB64Image(b64, { media_type: "image/png", prompt: "test red cube", index: 0 })
    expect(path.includes("artifacts")).toBe(true)
    expect(path.endsWith(".png")).toBe(true)
    expect(existsSync(path)).toBe(true)
    expect(readFileSync(path).toString()).toBe("fake-png-bytes")
    // cleanup this file only
    try { rmSync(path) } catch {}
  })

  test("imagesDir ends with artifacts/images", () => {
    const d = imagesDir()
    expect(d.replace(/\\/g, "/").endsWith("artifacts/images")).toBe(true)
  })
})
