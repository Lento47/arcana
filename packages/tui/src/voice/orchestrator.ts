import { createSignal } from "solid-js"
import { unlink } from "node:fs/promises"
import type { Voice } from "../config"
import type { useToast } from "../ui/toast"
import * as Recorder from "./recorder"
import * as Whisper from "./whisper"
import * as Normalizer from "./normalizer"

export type VoiceStatus = "idle" | "recording" | "transcribing" | "normalizing" | "sending" | "error"

type ToastAPI = ReturnType<typeof useToast>

export type VoiceLexicon = {
  listen: string
  transcribe: string
  normalize: string
  send: string
  disabled: string
  error: string
}

export type VoiceOrchestrator = {
  status: () => VoiceStatus
  error: () => string | null
  start: () => Promise<void>
  stop: () => Promise<void>
  cancel: () => void
}

export type VoiceOrchestratorServices = {
  detectRecorder: typeof Recorder.detectRecorder
  record: typeof Recorder.record
  whisperStatus: typeof Whisper.whisperStatus
  transcribe: typeof Whisper.transcribe
  normalize: typeof Normalizer.normalize
}

const defaultServices: VoiceOrchestratorServices = {
  detectRecorder: Recorder.detectRecorder,
  record: Recorder.record,
  whisperStatus: Whisper.whisperStatus,
  transcribe: Whisper.transcribe,
  normalize: Normalizer.normalize,
}

export function createVoiceOrchestrator(input: {
  config: () => Voice
  toast: ToastAPI
  lexicon: () => VoiceLexicon
  onResult: (text: string, autoSubmit: boolean) => void
  onStatusChange?: (status: VoiceStatus) => void
  services?: VoiceOrchestratorServices
}): VoiceOrchestrator {
  const services = input.services ?? defaultServices
  const [status, setStatus] = createSignal<VoiceStatus>("idle")
  const [error, setError] = createSignal<string | null>(null)

  let abortController: AbortController | null = null
  let recordingPromise: Promise<string> | null = null
  let starting = false

  function notifyStatus(next: VoiceStatus) {
    setStatus(next)
    input.onStatusChange?.(next)
  }

  function setIdle() {
    notifyStatus("idle")
    abortController = null
    recordingPromise = null
    starting = false
  }

  function showError(message: string) {
    setError(message)
    notifyStatus("error")
    input.toast.show({
      message: `${input.lexicon().error}: ${message}`,
      variant: "error",
      duration: 6000,
    })
  }

  async function start() {
    const cfg = input.config()
    if (!cfg.enabled) {
      input.toast.show({
        message: input.lexicon().disabled,
        variant: "info",
      })
      return
    }

    if (starting || status() === "recording") return

    if (status() !== "idle" && status() !== "error") {
      // Busy in another stage; ignore the keypress.
      return
    }

    setError(null)
    notifyStatus("recording")
    starting = true
    abortController = new AbortController()
    const captureAbort = abortController

    try {
      const recorder = await services.detectRecorder(cfg.recorder)
      if (captureAbort.signal.aborted) {
        setIdle()
        return
      }
      if (!recorder) {
        showError("No microphone recorder found. Install ffmpeg/sox/arecord/rec or set `voice.recorder.binary`.")
        setIdle()
        return
      }

      // Fire-and-forget: the recorder process runs until stop() aborts the signal.
      // Never rethrow — an unhandled rejection kills the whole TUI (process.exit(1)).
      recordingPromise = services
        .record(recorder, captureAbort.signal)
        .then((path) => {
          if (!path && !captureAbort.signal.aborted && status() === "recording") {
            showError("Microphone capture failed. Check ffmpeg can open your recording device.")
            setIdle()
          }
          return path
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          if (!message.toLowerCase().includes("cancelled") && !message.toLowerCase().includes("abort")) {
            showError(message)
          }
          setIdle()
          return ""
        })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      showError(message)
      setIdle()
    } finally {
      starting = false
    }
  }

  async function stop() {
    if (status() !== "recording" || !abortController) {
      return
    }
    if (!recordingPromise) {
      abortController.abort("Voice recording stopped")
      setIdle()
      return
    }

    const cfg = input.config()
    const recordAbort = abortController
    const pipelineAbort = new AbortController()
    abortController = pipelineAbort

    // Graceful stop: the recorder keeps the WAV and resolves.
    recordAbort.abort("Voice recording stopped")

    let wavPath = ""
    try {
      wavPath = await recordingPromise
      if (!wavPath) {
        setIdle()
        return
      }
      notifyStatus("transcribing")
      const asr = cfg.asr as Whisper.WhisperConfig
      const whisperReady = await services.whisperStatus(asr)
      if (whisperReady.missing.includes("model")) {
        input.toast.show({
          message: "Downloading whisper tiny.en (~75MB, once)…",
          variant: "info",
          duration: 60_000,
        })
      } else {
        input.toast.show({ message: `${input.lexicon().transcribe}…`, variant: "info", duration: 3000 })
      }
      const rawText = await services.transcribe(wavPath, asr, pipelineAbort.signal)
      if (!rawText.trim()) {
        throw new Error("Nothing was heard — try speaking closer to the microphone.")
      }

      notifyStatus("normalizing")
      input.toast.show({ message: `${input.lexicon().normalize}…`, variant: "info", duration: 3000 })
      let promptText = rawText.trim()
      try {
        promptText = await services.normalize(
          rawText,
          cfg.normalizer as Normalizer.NormalizerConfig,
          pipelineAbort.signal,
        )
      } catch {
        // superwhisper/s1-mini is preferred, but dictation still submits the ASR text.
      }

      setStatus("sending")
      input.toast.show({ message: `${input.lexicon().send}…`, variant: "info", duration: 2000 })
      input.onResult(promptText, cfg.auto_submit ?? true)
      setIdle()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.toLowerCase().includes("cancelled") && !message.toLowerCase().includes("abort")) {
        showError(message)
      }
      setIdle()
    } finally {
      if (wavPath) void unlink(wavPath).catch(() => {})
    }
  }

  function cancel() {
    abortController?.abort("Voice input cancelled")
    setIdle()
  }

  return {
    status,
    error,
    start,
    stop,
    cancel,
  }
}
