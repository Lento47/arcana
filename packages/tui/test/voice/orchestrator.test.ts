import { expect, mock, test, beforeEach, afterEach } from "bun:test"
import type { Voice } from "../../src/config"

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

let nextToastId = 1
function createToast() {
  return {
    show: mock(() => nextToastId++),
    dismiss: mock(() => {}),
    error: mock(() => {}),
    toasts: [],
  }
}

function lexicon() {
  return {
    listen: "Listening",
    transcribe: "Transcribing",
    normalize: "Refining",
    send: "Sending",
    disabled: "Voice is disabled.",
    error: "Error",
  }
}

let detectRecorder: ReturnType<typeof mock>
let record: ReturnType<typeof mock>
let recorderStatus: ReturnType<typeof mock>
let transcribe: ReturnType<typeof mock>
let whisperStatus: ReturnType<typeof mock>
let normalize: ReturnType<typeof mock>
let normalizerStatus: ReturnType<typeof mock>

beforeEach(() => {
  detectRecorder = mock(() => Promise.resolve({ binary: "ffmpeg", args: [] }))
  record = mock(() => Promise.resolve("/tmp/arcana-voice-test.wav"))
  recorderStatus = mock(() => Promise.resolve({ available: true, binary: "ffmpeg", args: [] }))
  transcribe = mock(() => Promise.resolve("  hello world  "))
  whisperStatus = mock(() => Promise.resolve({ binary: "whisper-cli", model: "model.bin", missing: [] }))
  normalize = mock(() => Promise.resolve("Hello world."))
  normalizerStatus = mock(() => Promise.resolve({ reachable: true, modelAvailable: true, models: [] }))

  mock.module("../../src/voice/recorder", () => ({
    detectRecorder,
    record,
    recorderStatus,
    parseDshowAudioDevice: () => undefined,
  }))
  mock.module("../../src/voice/whisper", () => ({
    transcribe,
    whisperStatus,
  }))
  mock.module("../../src/voice/normalizer", () => ({
    normalize,
    normalizerStatus,
  }))
})

afterEach(() => {
  mock.restore()
})

async function loadOrchestrator() {
  const { createVoiceOrchestrator } = await import("../../src/voice/orchestrator")
  return { createVoiceOrchestrator }
}

test("records, transcribes, normalizes and submits", async () => {
  const { createVoiceOrchestrator } = await loadOrchestrator()
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

test("start is a no-op while already recording", async () => {
  const { createVoiceOrchestrator } = await loadOrchestrator()
  const orchestrator = createVoiceOrchestrator({
    config: () => baseVoice,
    toast: createToast(),
    lexicon,
    onResult: () => {},
  })

  await orchestrator.start()
  expect(orchestrator.status()).toBe("recording")

  await orchestrator.start()
  expect(orchestrator.status()).toBe("recording")
  expect(record).toHaveBeenCalledTimes(1)
})

test("cancels active recording", async () => {
  const { createVoiceOrchestrator } = await loadOrchestrator()
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

test("submits raw ASR text if superwhisper normalizer fails", async () => {
  normalize = mock(() => Promise.reject(new Error("Ollama model not pulled")))
  mock.module("../../src/voice/normalizer", () => ({
    normalize,
    normalizerStatus,
  }))
  const { createVoiceOrchestrator } = await loadOrchestrator()
  const onResult = mock((_text: string, _autoSubmit: boolean) => {})
  const orchestrator = createVoiceOrchestrator({
    config: () => baseVoice,
    toast: createToast(),
    lexicon,
    onResult,
  })

  await orchestrator.start()
  await orchestrator.stop()
  expect(onResult).toHaveBeenCalledWith("hello world", true)
})

test("recorder failure does not reject start (TUI must stay up)", async () => {
  record = mock(() => Promise.reject(new Error("ffmpeg.exe exited 251: ffmpeg version ...")))
  mock.module("../../src/voice/recorder", () => ({
    detectRecorder,
    record,
    recorderStatus,
    parseDshowAudioDevice: () => undefined,
  }))
  const { createVoiceOrchestrator } = await loadOrchestrator()
  const toast = createToast()
  const orchestrator = createVoiceOrchestrator({
    config: () => baseVoice,
    toast,
    lexicon,
    onResult: () => {},
  })

  await expect(orchestrator.start()).resolves.toBeUndefined()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(orchestrator.status()).toBe("idle")
  expect(toast.show).toHaveBeenCalled()
})

test("ignores start when disabled", async () => {
  const { createVoiceOrchestrator } = await loadOrchestrator()
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
