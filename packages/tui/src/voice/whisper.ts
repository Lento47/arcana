import { spawn } from "node:child_process"
import crypto from "node:crypto"
import os from "node:os"
import path from "node:path"
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises"
import { which } from "../util/path"

export type WhisperConfig = {
  backend: "whisper.cpp"
  binary?: string
  model?: string
  language?: string
}

const BINARY_CANDIDATES = ["whisper-cli", "whisper.cpp", "whisper-bin", "main"]
const MODEL_NAMES = [
  "ggml-base.en.bin",
  "ggml-small.en.bin",
  "ggml-base.bin",
  "ggml-tiny.en.bin",
  "ggml-tiny.en-q5_1.bin",
  "base.bin",
]

export const DEFAULT_WHISPER_MODEL_NAME = "ggml-tiny.en.bin"
export const DEFAULT_WHISPER_MODEL_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin"

export function defaultWhisperModelDir(): string {
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "whisper")
  }
  return path.join(os.homedir(), ".local", "share", "whisper")
}

async function findWhisperBinary(configured?: string): Promise<string | undefined> {
  if (configured?.trim()) {
    const resolved = await which(configured.trim())
    if (resolved) return resolved
  }
  for (const name of BINARY_CANDIDATES) {
    const resolved = await which(name)
    if (resolved) return resolved
  }
  return undefined
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

async function findWhisperModel(configured?: string, binaryDir?: string): Promise<string | undefined> {
  if (configured?.trim()) {
    const resolved = await which(configured.trim())
    if (resolved) return resolved
    if (await fileExists(configured.trim())) return configured.trim()
    return undefined
  }

  const home = os.homedir()
  const dirs = [
    defaultWhisperModelDir(),
    path.join(home, ".local", "share", "whisper"),
    path.join(home, ".whisper"),
    path.join(home, "whisper.cpp", "models"),
    ...(binaryDir
      ? [binaryDir, path.join(binaryDir, "models"), path.join(binaryDir, "..", "models")]
      : []),
  ]
  for (const dir of dirs) {
    for (const name of MODEL_NAMES) {
      const candidate = path.join(dir, name)
      if (await fileExists(candidate)) return candidate
    }
  }
  return undefined
}

export async function downloadWhisperModel(destPath: string, signal?: AbortSignal): Promise<string> {
  await mkdir(path.dirname(destPath), { recursive: true })
  const response = await fetch(DEFAULT_WHISPER_MODEL_URL, {
    signal,
    redirect: "follow",
    headers: { "User-Agent": "arcana" },
  })
  if (!response.ok) {
    throw new Error(
      `Failed to download whisper model (${response.status}). Save ${DEFAULT_WHISPER_MODEL_NAME} to ${path.dirname(destPath)} or set voice.asr.model.`,
    )
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength < 1_000_000) {
    throw new Error("Downloaded whisper model was too small — Hugging Face may have returned an HTML error page.")
  }
  const tmp = `${destPath}.partial`
  await writeFile(tmp, bytes)
  await rename(tmp, destPath)
  return destPath
}

/** Existing ggml/gguf on disk, or download tiny.en (~75MB) once. */
export async function ensureWhisperModel(
  configured?: string,
  signal?: AbortSignal,
  binaryDir?: string,
): Promise<string> {
  const existing = await findWhisperModel(configured, binaryDir)
  if (existing) return existing
  return downloadWhisperModel(path.join(defaultWhisperModelDir(), DEFAULT_WHISPER_MODEL_NAME), signal)
}

/**
 * Transcribe a WAV file using a local whisper.cpp CLI binary.
 *
 * The function writes the transcript to a temp text file next to the WAV path,
 * reads it, and cleans up. Returns the trimmed raw transcript.
 */
export async function transcribe(
  wavPath: string,
  config: WhisperConfig,
  signal?: AbortSignal,
): Promise<string> {
  const binary = await findWhisperBinary(config.binary)
  if (!binary) {
    throw new Error(
      "whisper.cpp binary not found. Install whisper-cli/whisper.cpp/main or set `voice.asr.binary`.",
    )
  }

  const model = await ensureWhisperModel(config.model, signal, path.dirname(binary))

  const baseName = `arcana-whisper-${crypto.randomUUID()}`
  const tempBase = path.join(os.tmpdir(), baseName)
  const txtPath = `${tempBase}.txt`

  const args = [
    "-m",
    model,
    "-f",
    wavPath,
    "--output-txt",
    "--output-file",
    tempBase,
    "-np", // no progress printing
  ]
  if (config.language) {
    args.push("-l", config.language)
  }

  return new Promise<string>((resolve, reject) => {
    const child = spawn(binary, args, {
      stdio: ["ignore", "ignore", "pipe"],
      shell: false,
    })

    let stderr = ""
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8")
    })

    const cleanup = async () => {
      await unlink(txtPath).catch(() => {})
    }

    signal?.addEventListener(
      "abort",
      () => {
        child.kill("SIGTERM")
        void cleanup().then(() => reject(new Error("Transcription cancelled")))
      },
      { once: true },
    )

    child.on("error", (error) => {
      void cleanup().then(() =>
        reject(new Error(`Failed to start whisper.cpp (${binary}): ${error.message}`)),
      )
    })

    child.on("exit", (code, killSignal) => {
      if (code !== 0 && code !== null) {
        const trimmed = stderr.trim()
        void cleanup().then(() =>
          reject(
            new Error(
              `${binary} exited ${code}${trimmed ? `: ${trimmed.slice(0, 240)}` : ""}`,
            ),
          ),
        )
        return
      }
      if (killSignal) {
        void cleanup().then(() => reject(new Error(`Transcription killed (${killSignal})`)))
        return
      }

      readFile(txtPath, "utf8")
        .then((text) => {
          void cleanup()
          resolve(text.trim())
        })
        .catch((error) => {
          void cleanup()
          reject(new Error(`Failed to read whisper output: ${error.message}`))
        })
    })
  })
}

/**
 * Check whether a whisper.cpp binary and model are available.
 */
export async function whisperStatus(config: WhisperConfig): Promise<{
  binary?: string
  model?: string
  missing: ("binary" | "model")[]
}> {
  const binary = await findWhisperBinary(config.binary)
  const model = await findWhisperModel(config.model, binary ? path.dirname(binary) : undefined)
  const missing: ("binary" | "model")[] = []
  if (!binary) missing.push("binary")
  if (!model) missing.push("model")
  return { binary, model, missing }
}
