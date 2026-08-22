import { expect, test } from "bun:test"
import { parseDshowAudioDevice } from "../../src/voice/dshow"
import { ffmpegErrorTail } from "../../src/voice/ffmpeg-text"

test("parseDshowAudioDevice picks the first audio capture name", () => {
  const stderr = `
[dshow @ 000] DirectShow video devices (some may be unavailable)
[dshow @ 000]  "Integrated Camera"
[dshow @ 000] DirectShow audio devices
[dshow @ 000]  "Microphone Array (Realtek(R) Audio)"
[dshow @ 000]     Alternative name "@device_cm_{33D9A762-90C8-11D0-BD43-00A0C911CE86}\\wave"
`
  expect(parseDshowAudioDevice(stderr)).toBe("Microphone Array (Realtek(R) Audio)")
})

test("parseDshowAudioDevice reads FFmpeg 8 tagged audio lines", () => {
  const stderr = `
[in#0 @ 000] "OBS Virtual Camera" (none)
[in#0 @ 000]   Alternative name "@device_sw_{860BB310-5D01-11D0-BD3B-00A0C911CE86}\\cam"
[in#0 @ 000] "Microphone (INZONE H5)" (audio)
[in#0 @ 000]   Alternative name "@device_cm_{33D9A762-90C8-11D0-BD43-00A0C911CE86}\\wave"
Error opening input file dummy.
`
  expect(parseDshowAudioDevice(stderr)).toBe("Microphone (INZONE H5)")
})

test("ffmpegErrorTail prefers the end of a long banner", () => {
  const banner = `${"ffmpeg version banner\n".repeat(40)}Could not find audio device`
  expect(ffmpegErrorTail(banner)).toContain("Could not find audio device")
  expect(ffmpegErrorTail(banner).startsWith("ffmpeg version")).toBe(false)
})

test("ffmpegErrorTail skips gyan configuration flags", () => {
  const stderr = `ffmpeg version 8.1.1-full_build
  configuration: --enable-gpl --enable-libilbc --enable-libopus --enable-whisper
  libavutil      60. 26.101 / 60. 26.101
Unknown input format: 'wasapi'
Error opening input file default.`
  const tail = ffmpegErrorTail(stderr)
  expect(tail).toContain("Unknown input format: 'wasapi'")
  expect(tail).not.toContain("--enable-whisper")
})
