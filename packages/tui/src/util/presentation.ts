import { logo } from "../logo"
import { APP_NAME, Glyph } from "../branding"

const reset = "\x1b[0m"
const bold = "\x1b[1m"
const dim = "\x1b[90m"
const accent = "\x1b[38;5;178m" // gold

function wordmark(pad = "") {
  const draw = (line: string, fg: string, shadow: string, bg: string) =>
    [...line]
      .map((char) => {
        if (char === "_") return `${bg} ${reset}`
        if (char === "^") return `${fg}${bg}▀${reset}`
        if (char === "~") return `${shadow}▀${reset}`
        if (char === " ") return " "
        return `${fg}${char}${reset}`
      })
      .join("")

  return logo.left.map((line, index) => {
    const left = draw(line, dim, "\x1b[38;5;235m", "\x1b[48;5;235m")
    const right = draw(logo.right[index] ?? "", reset, "\x1b[38;5;238m", "\x1b[48;5;238m")
    return `${pad}${left} ${right}`
  })
}

const EPILOGUE_PHRASES = [
  "sigils flicker; truths emerge…",
  "the grimoire remembers all…",
  "every cipher has its key…",
  "the veil thins at compile time…",
  "a glyph in the static…",
  "ley lines hum beneath the code…",
  "the arcane speaks in riddles…",
] as const

function formatDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} · ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function sessionEpilogue(input: { title: string; sessionID?: string }) {
  const phrase = EPILOGUE_PHRASES[Math.floor(Math.random() * EPILOGUE_PHRASES.length)]
  const lines: string[] = [...wordmark("  "), ""]

  // Chronicle (session info) — primary hierarchy
  lines.push(`  ${accent}${Glyph.sigil}${reset} ${bold}chronicle${reset}`)
  lines.push(`     ${dim}${input.title}${reset}`)
  // Extract date from title if present (ISO timestamp pattern)
  const isoMatch = input.title.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  if (isoMatch) lines.push(`     ${dim}${formatDate(isoMatch[0])}${reset}`)

  // Recall (continue command) — secondary hierarchy
  if (input.sessionID) {
    lines.push("")
    lines.push(`  ${accent}${Glyph.sigil}${reset} ${bold}recall${reset}`)
    lines.push(`     ${dim}${APP_NAME} -s ${input.sessionID}${reset}`)
  }

  // Epigram — tertiary, subtle
  lines.push("")
  lines.push(`  ${dim}${Glyph.sigil} ${phrase}${reset}`)
  lines.push("")

  return lines.join("\n")
}
