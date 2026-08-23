import { expect, mock, test, beforeEach } from "bun:test"
import type { Voice } from "../../src/config"
import { createVoiceOrchestrator, type VoiceOrchestratorServices } from "../../src/voice/orchestrator"

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
let transcribe: ReturnType<typeof mock>
let normalize: ReturnType<typeof mock>

beforeEach(() => {
  detectRecorder = mock(() => Promise.resolve({ binary: "ffmpeg", args: [] }))
  record = mock(() => Promise.resolve("/tmp/arcana-voice-test.wav"))
  transcribe = mock(() => Promise.resolve("  hello world  "))
  normalize = mock(() => Promise.resolve("Hello world."))
})

function services(): VoiceOrchestratorServices {
  return {
    detectRecorder: detectRecorder as VoiceOrchestratorServices["detectRecorder"],
    record: record as VoiceOrchestratorServices["record"],
    whisperStatus: mock(() => Promise.resolve({ binary: "whisper-cli", model: "model.bin", missing: [] })),
    transcribe: transcribe as VoiceOrchestratorServices["transcribe"],
    normalize: normalize as VoiceOrchestratorServices["normalize"],
  }
}

test("records, transcribes, normalizes and submits", async () => {
  const onResult = mock((_text: string, _autoSubmit: boolean) => {})

  const orchestrator = createVoiceOrchestrator({
    config: () => baseVoice,
    toast: createToast(),
    lexicon,
    onResult,
    services: services(),
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
  const orchestrator = createVoiceOrchestrator({
    config: () => baseVoice,
    toast: createToast(),
    lexicon,
    onResult: () => {},
    services: services(),
  })

  await orchestrator.start()
  expect(orchestrator.status()).toBe("recording")

  await orchestrator.start()
  expect(orchestrator.status()).toBe("recording")
  expect(record).toHaveBeenCalledTimes(1)
})

test("cancels active recording", async () => {
  const orchestrator = createVoiceOrchestrator({
    config: () => baseVoice,
    toast: createToast(),
    lexicon,
    onResult: () => {},
    services: services(),
  })

  await orchestrator.start()
  expect(orchestrator.status()).toBe("recording")

  orchestrator.cancel()
  expect(orchestrator.status()).toBe("idle")
  expect(record).toHaveBeenCalled()
})

test("submits raw ASR text if superwhisper normalizer fails", async () => {
  normalize = mock(() => Promise.reject(new Error("Ollama model not pulled")))
  const onResult = mock((_text: string, _autoSubmit: boolean) => {})
  const orchestrator = createVoiceOrchestrator({
    config: () => baseVoice,
    toast: createToast(),
    lexicon,
    onResult,
    services: services(),
  })

  await orchestrator.start()
  await orchestrator.stop()
  expect(onResult).toHaveBeenCalledWith("hello world", true)
})

test("recorder failure does not reject start (TUI must stay up)", async () => {
  record = mock(() => Promise.reject(new Error("ffmpeg.exe exited 251: ffmpeg version ...")))
  const toast = createToast()
  const orchestrator = createVoiceOrchestrator({
    config: () => baseVoice,
    toast,
    lexicon,
    onResult: () => {},
    services: services(),
  })

  await expect(orchestrator.start()).resolves.toBeUndefined()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(orchestrator.status()).toBe("idle")
  expect(toast.show).toHaveBeenCalled()
})

test("ignores start when disabled", async () => {
  const toast = createToast()
  const orchestrator = createVoiceOrchestrator({
    config: () => ({ ...baseVoice, enabled: false }),
    toast,
    lexicon,
    onResult: () => {},
    services: services(),
  })

  await orchestrator.start()
  expect(orchestrator.status()).toBe("idle")
  expect(detectRecorder).not.toHaveBeenCalled()
  expect(toast.show).toHaveBeenCalled()
})
