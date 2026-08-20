import { expect, mock, test, afterEach } from "bun:test"
import type { Voice } from "../../src/config"

const detectRecorder = mock(() => Promise.resolve({ binary: "ffmpeg", args: [] }))
const record = mock(() => Promise.resolve("/tmp/arcana-voice-test.wav"))
const recorderStatus = mock(() => Promise.resolve({ available: true, binary: "ffmpeg", args: [] }))

const transcribe = mock(() => Promise.resolve("  hello world  "))
const whisperStatus = mock(() => Promise.resolve({ binary: "whisper-cli", model: "model.bin", missing: [] }))

const normalize = mock(() => Promise.resolve("Hello world."))
const normalizerStatus = mock(() => Promise.resolve({ reachable: true, modelAvailable: true, models: [] }))

mock.module("../../src/voice/recorder", () => ({
  detectRecorder,
  record,
  recorderStatus,
}))
mock.module("../../src/voice/whisper", () => ({
  transcribe,
  whisperStatus,
}))
mock.module("../../src/voice/normalizer", () => ({
  normalize,
  normalizerStatus,
}))

import { createVoiceOrchestrator } from "../../src/voice/orchestrator"

const baseVoice: Voice = {
  enabled: true,
  auto_submit: true,
  recorder: {},
  asr: { backend: "whisper.cpp" },
  normalizer: {
    provider: "ollama",
    host: "http://localhost:11434",
    model: "superwhisper/s1-mini",
    prompt: "{text}",
  },
}

function createToast() {
  return { show: mock(() => {}) }
}

function lexicon() {
  return {
    listen: "Listening",
    transcribe: "Transcribing",
    normalize: "Refining",
    send: "Sending",
    error: "Error",
  }
}

afterEach(() => {
  detectRecorder.mockClear()
  record.mockClear()
  recorderStatus.mockClear()
  transcribe.mockClear()
  whisperStatus.mockClear()
  normalize.mockClear()
  normalizerStatus.mockClear()
})

test("records, transcribes, normalizes and submits", async () => {
  const onResult = mock((_text: string, _autoSubmit: boolean) => {})

  const orchestrator = createVoiceOrchestrator({
    config: () => baseVoice,
    toast: createToast(),
    lexicon,
    onResult,
  })

  expect(orchestrator.status()).toBe("idle")

  await orchestrator.start()
  expect(orchestrator.status()).toBe("recording")
  expect(detectRecorder).toHaveBeenCalled()

  await orchestrator.stop()
  expect(orchestrator.status()).toBe("idle")
  expect(record).toHaveBeenCalled()
  expect(transcribe).toHaveBeenCalledWith("/tmp/arcana-voice-test.wav", expect.anything(), expect.any(AbortSignal))
  expect(normalize).toHaveBeenCalledWith("  hello world  ", expect.anything(), expect.any(AbortSignal))
  expect(onResult).toHaveBeenCalledWith("Hello world.", true)
})

test("toggles off when already recording", async () => {
  const orchestrator = createVoiceOrchestrator({
    config: () => baseVoice,
    toast: createToast(),
    lexicon,
    onResult: () => {},
  })

  await orchestrator.start()
  expect(orchestrator.status()).toBe("recording")

  await orchestrator.start()
  expect(orchestrator.status()).toBe("idle")
  expect(record).toHaveBeenCalled()
})

test("cancels active recording", async () => {
  const orchestrator = createVoiceOrchestrator({
    config: () => baseVoice,
    toast: createToast(),
    lexicon,
    onResult: () => {},
  })

  await orchestrator.start()
  expect(orchestrator.status()).toBe("recording")

  orchestrator.cancel()
  expect(orchestrator.status()).toBe("idle")
  expect(record).toHaveBeenCalled()
})

test("ignores start when disabled", async () => {
  const toast = createToast()
  const orchestrator = createVoiceOrchestrator({
    config: () => ({ ...baseVoice, enabled: false }),
    toast,
    lexicon,
    onResult: () => {},
  })

  await orchestrator.start()
  expect(orchestrator.status()).toBe("idle")
  expect(detectRecorder).not.toHaveBeenCalled()
  expect(toast.show).toHaveBeenCalled()
})
