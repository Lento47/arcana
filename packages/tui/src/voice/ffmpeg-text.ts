const BANNER_LINE =
  /^(?:ffmpeg version|built with|configuration:|libav|libsw|--enable-)/i

/** ffmpeg prints a long banner first; keep the actual error, not configure flags. */
export function ffmpegErrorTail(stderr: string, max = 280): string {
  const lines = stderr
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  const useful = lines.filter((line) => !BANNER_LINE.test(line))
  const compact = (useful.length ? useful : lines).join("\n").trim()
  if (compact.length <= max) return compact
  return compact.slice(-max).trim()
}
