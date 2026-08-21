import { expect, test, afterEach } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  DEFAULT_WHISPER_MODEL_NAME,
  defaultWhisperModelDir,
  downloadWhisperModel,
} from "../../src/voice/whisper"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test("defaultWhisperModelDir is a local whisper folder", () => {
  const dir = defaultWhisperModelDir()
  expect(dir.toLowerCase()).toContain("whisper")
  if (process.platform === "win32") {
    expect(dir).toContain("AppData")
  }
})

test("downloadWhisperModel writes the Hugging Face payload", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "arcana-whisper-"))
  const dest = path.join(dir, DEFAULT_WHISPER_MODEL_NAME)
  const payload = Buffer.alloc(1_000_001, 7)
  globalThis.fetch = (async () =>
    new Response(payload, { status: 200 })) as unknown as typeof fetch

  const written = await downloadWhisperModel(dest)
  expect(written).toBe(dest)
  const onDisk = await readFile(dest)
  expect(onDisk.byteLength).toBe(payload.byteLength)
  await rm(dir, { recursive: true, force: true })
})

test("downloadWhisperModel rejects a tiny error-page body", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "arcana-whisper-"))
  const dest = path.join(dir, DEFAULT_WHISPER_MODEL_NAME)
  globalThis.fetch = (async () =>
    new Response("not found", { status: 200 })) as unknown as typeof fetch

  await expect(downloadWhisperModel(dest)).rejects.toThrow(/too small/)
  await rm(dir, { recursive: true, force: true })
})
