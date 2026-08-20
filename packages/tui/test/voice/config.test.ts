import { expect, test } from "bun:test"
import { resolve } from "../../src/config"

test("resolves voice defaults", () => {
  const config = resolve({}, { terminalSuspend: true })

  expect(config.voice.enabled).toBe(false)
  expect(config.voice.auto_submit).toBe(true)
  expect(config.voice.recorder).toEqual({ binary: undefined, args: undefined })
  expect(config.voice.asr).toMatchObject({
    backend: "whisper.cpp",
    binary: undefined,
    model: undefined,
    language: undefined,
  })
  expect(config.voice.normalizer).toMatchObject({
    provider: "ollama",
    host: "http://localhost:11434",
    model: "superwhisper/s1-mini",
  })
  expect(config.voice.normalizer.prompt).toContain("{text}")
})

test("reads voice overrides", () => {
  const config = resolve(
    {
      voice: {
        enabled: true,
        auto_submit: false,
        recorder: { binary: "ffmpeg", args: ["-i", "mic", "{output}"] },
        asr: { backend: "whisper.cpp", model: "/models/base.bin", language: "en" },
        normalizer: { provider: "ollama", host: "http://host:11434", model: "custom", prompt: "Fix: {text}" },
      },
    },
    { terminalSuspend: true },
  )

  expect(config.voice.enabled).toBe(true)
  expect(config.voice.auto_submit).toBe(false)
  expect(config.voice.recorder).toEqual({ binary: "ffmpeg", args: ["-i", "mic", "{output}"] })
  expect(config.voice.asr).toMatchObject({
    backend: "whisper.cpp",
    binary: undefined,
    model: "/models/base.bin",
    language: "en",
  })
  expect(config.voice.normalizer).toMatchObject({
    provider: "ollama",
    host: "http://host:11434",
    model: "custom",
    prompt: "Fix: {text}",
  })
})
