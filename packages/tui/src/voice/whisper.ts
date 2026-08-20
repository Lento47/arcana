import { spawn } from "node:child_process"
import crypto from "node:crypto"
import os from "node:os"
import path from "node:path"
import { readFile, unlink } from "node:fs/promises"
import { which } from "../util/path"

export type WhisperConfig = {
  backend: "whisper.cpp"
  binary?: string
  model?: string
  language?: string
}

const BINARY_CANDIDATES = ["whisper-cli", "whisper.cpp", "main"]

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

  const model = config.model?.trim()
  if (!model) {
    throw new Error("whisper.cpp model path is not configured. Set `voice.asr.model`.")
  }

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
  const model = config.model?.trim()
  const missing: ("binary" | "model")[] = []
  if (!binary) missing.push("binary")
  if (!model) missing.push("model")
  return { binary, model, missing }
}
