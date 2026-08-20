import { createSignal } from "solid-js"
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
  error: string
}

export type VoiceOrchestrator = {
  status: () => VoiceStatus
  error: () => string | null
  start: () => Promise<void>
  stop: () => Promise<void>
  cancel: () => void
}

export function createVoiceOrchestrator(input: {
  config: () => Voice
  toast: ToastAPI
  lexicon: () => VoiceLexicon
  onResult: (text: string, autoSubmit: boolean) => void
}): VoiceOrchestrator {
  const [status, setStatus] = createSignal<VoiceStatus>("idle")
  const [error, setError] = createSignal<string | null>(null)

  let abortController: AbortController | null = null
  let recordingPromise: Promise<string> | null = null

  function setIdle() {
    setStatus("idle")
    abortController = null
    recordingPromise = null
  }

  function showError(message: string) {
    setError(message)
    setStatus("error")
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
        message: "Voice input is not enabled. Set `voice.enabled` to true.",
        variant: "info",
      })
      return
    }

    if (status() === "recording") {
      // Toggle: stop the recording and continue the pipeline.
      await stop()
      return
    }

    if (status() !== "idle" && status() !== "error") {
      // Busy in another stage; ignore the keypress.
      return
    }

    setError(null)
    setStatus("recording")
    input.toast.show({ message: `${input.lexicon().listen}…`, variant: "info" })
    abortController = new AbortController()

    const recorder = await Recorder.detectRecorder(cfg.recorder)
    if (!recorder) {
      showError(
        "No microphone recorder found. Install ffmpeg/sox/arecord/rec or set `voice.recorder.binary`.",
      )
      setIdle()
      return
    }

    // Fire-and-forget: the recorder process runs until stop() aborts the signal.
    recordingPromise = Recorder.record(recorder, abortController.signal).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.toLowerCase().includes("cancelled") && !message.toLowerCase().includes("abort")) {
        showError(message)
      }
      setIdle()
      throw error
    })
  }

  async function stop() {
    if (status() !== "recording" || !recordingPromise || !abortController) {
      return
    }

    const cfg = input.config()

    // End the recording by aborting the signal; the recorder process exits and
    // the stored promise resolves with the WAV path.
    abortController.abort("Voice recording stopped")

    try {
      const wavPath = await recordingPromise
      setStatus("transcribing")
      const rawText = await Whisper.transcribe(wavPath, cfg.asr as Whisper.WhisperConfig, abortController.signal)
      if (!rawText.trim()) {
        throw new Error("Nothing was heard — try speaking closer to the microphone.")
      }

      setStatus("normalizing")
      const normalized = await Normalizer.normalize(rawText, cfg.normalizer as Normalizer.NormalizerConfig, abortController.signal)

      setStatus("sending")
      input.onResult(normalized, cfg.auto_submit ?? true)
      setIdle()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.toLowerCase().includes("cancelled") && !message.toLowerCase().includes("abort")) {
        showError(message)
      }
      setIdle()
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
