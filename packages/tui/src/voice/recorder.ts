import { spawn } from "node:child_process"
import crypto from "node:crypto"
import os from "node:os"
import path from "node:path"
import { unlink } from "node:fs/promises"
import { which } from "../util/path"

export type RecorderConfig = {
  binary?: string
  args?: string[]
}

export type DetectedRecorder = {
  binary: string
  args: string[]
}

const PLATFORM_DEFAULT_ARGS: Record<string, string[]> = {
  darwin: ["-y", "-f", "avfoundation", "-i", ":0", "-ar", "16000", "-ac", "1", "{output}"],
  linux: ["-y", "-f", "pulse", "-i", "default", "-ar", "16000", "-ac", "1", "{output}"],
  win32: ["-y", "-f", "dshow", "-i", "audio=Microphone", "-ar", "16000", "-ac", "1", "{output}"],
}

function platform() {
  return process.platform
}

function expandOutput(args: string[], outputPath: string): string[] {
  return args.map((arg) => (arg === "{output}" ? outputPath : arg))
}

async function findBinary(name: string): Promise<string | undefined> {
  const resolved = await which(name)
  if (resolved) return resolved
  return undefined
}

/**
 * Detect an available external audio recorder.
 *
 * Order of preference:
 * 1. User-configured binary + args from `voice.recorder`.
 * 2. `ffmpeg` with platform-specific default device args.
 * 3. `sox` / `rec` (sox recording alias).
 * 4. `arecord` (Linux ALSA).
 *
 * Returns `undefined` when no recorder is available.
 */
export async function detectRecorder(config?: RecorderConfig): Promise<DetectedRecorder | undefined> {
  const configuredBinary = config?.binary?.trim()
  if (configuredBinary) {
    const resolved = await findBinary(configuredBinary)
    if (resolved) {
      return {
        binary: resolved,
        args: config?.args?.length ? config.args : PLATFORM_DEFAULT_ARGS[platform()] ?? [],
      }
    }
  }

  const candidates = [
    { binary: "ffmpeg", args: PLATFORM_DEFAULT_ARGS[platform()] ?? [] },
    { binary: "sox", args: ["-d", "{output}"] },
    { binary: "rec", args: ["-r", "16000", "-c", "1", "{output}"] },
    { binary: "arecord", args: ["-f", "S16_LE", "-r", "16000", "-c", "1", "{output}"] },
  ]

  for (const candidate of candidates) {
    const resolved = await findBinary(candidate.binary)
    if (resolved) {
      return { binary: resolved, args: candidate.args }
    }
  }

  return undefined
}

/**
 * Record audio from the default microphone to a 16kHz mono WAV file.
 *
 * The returned promise resolves with the WAV file path once the process exits.
 * The caller is responsible for deleting the file after use.
 */
export async function record(recorder: DetectedRecorder, signal?: AbortSignal): Promise<string> {
  const tempDir = os.tmpdir()
  const id = crypto.randomUUID()
  const outputPath = path.join(tempDir, `arcana-voice-${id}.wav`)

  // Some recorders (e.g. sox with -d) infer the format from the extension.
  // ffmpeg gets explicit args.
  const args = expandOutput(recorder.args, outputPath)

  return new Promise<string>((resolve, reject) => {
    const child = spawn(recorder.binary, args, {
      stdio: ["ignore", "ignore", "pipe"],
      shell: false,
    })

    let stderr = ""
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8")
    })

    const cleanup = (error?: Error) => {
      void unlink(outputPath).catch(() => {})
      if (error) reject(error)
    }

    signal?.addEventListener(
      "abort",
      () => {
        child.kill("SIGTERM")
        cleanup(new Error("Recording cancelled"))
      },
      { once: true },
    )

    child.on("error", (error) => {
      cleanup(new Error(`Failed to start recorder ${recorder.binary}: ${error.message}`))
    })

    child.on("exit", (code, killSignal) => {
      if (code !== 0 && code !== null) {
        const trimmed = stderr.trim()
        cleanup(
          new Error(
            `${recorder.binary} exited ${code}${trimmed ? `: ${trimmed.slice(0, 240)}` : ""}`,
          ),
        )
        return
      }
      if (killSignal) {
        cleanup(new Error(`Recording killed (${killSignal})`))
        return
      }
      resolve(outputPath)
    })
  })
}

/**
 * Validate that a recorder can be found. Used in UI setup flows.
 */
export function recorderStatus(config?: RecorderConfig): Promise<{
  available: boolean
  binary?: string
  args?: string[]
}> {
  return detectRecorder(config).then((recorder) =>
    recorder
      ? { available: true, binary: recorder.binary, args: recorder.args }
      : { available: false },
  )
}
