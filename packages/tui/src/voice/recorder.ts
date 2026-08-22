import { spawn } from "node:child_process"
import crypto from "node:crypto"
import os from "node:os"
import path from "node:path"
import { access, unlink } from "node:fs/promises"
import { which } from "../util/path"
import { parseDshowAudioDevice } from "./dshow"
export { parseDshowAudioDevice } from "./dshow"
import { ffmpegErrorTail } from "./ffmpeg-text"
export { ffmpegErrorTail } from "./ffmpeg-text"

export type RecorderConfig = {
  binary?: string
  args?: string[]
}

export type DetectedRecorder = {
  binary: string
  args: string[]
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

function defaultFfmpegArgs(input: string, format: string): string[] {
  return ["-nostdin", "-hide_banner", "-y", "-f", format, "-i", input, "-ar", "16000", "-ac", "1", "{output}"]
}

let cachedWindowsArgs: { ffmpegPath: string; args: string[] } | undefined

function collectFfmpegStderr(binary: string, args: string[], timeoutMs = 8000): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(binary, args, {
      stdio: ["ignore", "ignore", "pipe"],
      shell: false,
      windowsHide: true,
    })
    let stderr = ""
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve(stderr)
    }
    const timer = setTimeout(() => {
      child.kill()
      finish()
    }, timeoutMs)
    timer.unref?.()
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8")
    })
    child.on("error", finish)
    child.on("exit", finish)
  })
}

/**
 * Detect an available external audio recorder.
 *
 * Order of preference:
 * 1. User-configured binary + args from `voice.recorder`.
 * 2. `ffmpeg` with platform-specific default device args.
 * 3. `sox` / `rec` (sox recording alias).
 * 4. `arecord` (Linux ALSA).
 */
export async function detectRecorder(config?: RecorderConfig): Promise<DetectedRecorder | undefined> {
  const configuredBinary = config?.binary?.trim()
  if (configuredBinary) {
    const resolved = await findBinary(configuredBinary)
    if (resolved) {
      return {
        binary: resolved,
        args: config?.args?.length ? config.args : await platformDefaultArgs(resolved),
      }
    }
  }

  const ffmpeg = await findBinary("ffmpeg")
  if (ffmpeg) {
    return { binary: ffmpeg, args: await platformDefaultArgs(ffmpeg) }
  }

  const fallbacks = [
    { binary: "sox", args: ["-d", "{output}"] },
    { binary: "rec", args: ["-r", "16000", "-c", "1", "{output}"] },
    { binary: "arecord", args: ["-f", "S16_LE", "-r", "16000", "-c", "1", "{output}"] },
  ]
  for (const candidate of fallbacks) {
    const resolved = await findBinary(candidate.binary)
    if (resolved) return { binary: resolved, args: candidate.args }
  }
  return undefined
}

async function platformDefaultArgs(ffmpegPath: string): Promise<string[]> {
  if (platform() === "darwin") return defaultFfmpegArgs(":0", "avfoundation")
  if (platform() === "linux") return defaultFfmpegArgs("default", "pulse")
  if (platform() === "win32") {
    if (cachedWindowsArgs?.ffmpegPath === ffmpegPath) return cachedWindowsArgs.args
    // Gyan and other Windows builds often omit WASAPI (`Unknown input format:
    // 'wasapi'`). DirectShow works; FFmpeg 8 lists `"Name" (audio)`.
    const listed = await collectFfmpegStderr(ffmpegPath, [
      "-hide_banner",
      "-list_devices",
      "true",
      "-f",
      "dshow",
      "-i",
      "dummy",
    ])
    const device = parseDshowAudioDevice(listed)
    const args = device
      ? defaultFfmpegArgs(`audio=${device}`, "dshow")
      : defaultFfmpegArgs("default", "wasapi")
    cachedWindowsArgs = { ffmpegPath, args }
    return args
  }
  return defaultFfmpegArgs("default", "pulse")
}

/**
 * Record audio from the default microphone to a 16kHz mono WAV file.
 *
 * Aborting the signal is a graceful stop: the process is asked to exit and the
 * promise resolves with the WAV path (the file is kept). Hard failures reject
 * and delete the temp file.
 */
export async function record(recorder: DetectedRecorder, signal?: AbortSignal): Promise<string> {
  const outputPath = path.join(os.tmpdir(), `arcana-voice-${crypto.randomUUID()}.wav`)
  const args = expandOutput(recorder.args, outputPath)

  return new Promise<string>((resolve) => {
    const child = spawn(recorder.binary, args, {
      stdio: ["ignore", "ignore", "pipe"],
      shell: false,
      windowsHide: true,
    })

    let stderr = ""
    let settled = false
    let gracefulStop = false

    const fail = (_error: Error) => {
      if (settled) return
      settled = true
      void unlink(outputPath).catch(() => {})
      // Never reject: unhandled child-exit kills the whole TUI (process.exit(1)).
      resolve("")
    }

    const succeed = () => {
      if (settled) return
      settled = true
      void access(outputPath)
        .then(() => resolve(outputPath))
        .catch(() => resolve(""))
    }

    const stopProcess = () => {
      gracefulStop = true
      try {
        child.kill("SIGTERM")
      } catch {
        // already gone
      }
    }

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8")
    })
    child.on("error", (error) => {
      if (gracefulStop) {
        succeed()
        return
      }
      fail(new Error(`Failed to start recorder ${recorder.binary}: ${error.message}`))
    })
    child.on("exit", (code) => {
      if (gracefulStop) {
        succeed()
        return
      }
      if (code !== 0 && code !== null) {
        const trimmed = stderr.trim()
        fail(
          new Error(
            `${recorder.binary} exited ${code}${trimmed ? `: ${ffmpegErrorTail(trimmed)}` : ""}`,
          ),
        )
        return
      }
      succeed()
    })

    if (signal?.aborted) {
      stopProcess()
    } else {
      signal?.addEventListener("abort", stopProcess, { once: true })
    }
  })
}

export function recorderStatus(config?: RecorderConfig): Promise<{
  available: boolean
  binary?: string
  args?: string[]
}> {
  return detectRecorder(config).then((recorder) =>
    recorder ? { available: true, binary: recorder.binary, args: recorder.args } : { available: false },
  )
}
