/** First DirectShow audio capture device name, or undefined. */
export function parseDshowAudioDevice(ffmpegStderr: string): string | undefined {
  const lines = ffmpegStderr.split(/\r?\n/)

  // FFmpeg 8+ dshow: `"Microphone (INZONE H5)" (audio)`
  for (const line of lines) {
    if (/alternative name/i.test(line)) continue
    const tagged = line.match(/"([^"]+)"\s*\(\s*audio\s*\)/i)
    if (tagged?.[1]) return tagged[1]
  }

  // FFmpeg 6/7: section header, then the first quoted name.
  let inAudio = false
  for (const line of lines) {
    if (/DirectShow audio devices/i.test(line)) {
      inAudio = true
      continue
    }
    if (inAudio && /DirectShow video devices/i.test(line)) break
    if (!inAudio) continue
    const quoted = line.match(/"([^"]+)"/)
    if (quoted?.[1] && !/alternative name/i.test(line)) return quoted[1]
  }
  return undefined
}
