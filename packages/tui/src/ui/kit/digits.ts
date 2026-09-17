/**
 * Compact 3-row block digits for headline numbers (Textual Digits parity,
 * no ASCII-font renderable needed). Unknown characters render as a blank cell
 * so a stray glyph never corrupts the figure.
 */

const GLYPHS: Record<string, readonly string[]> = {
  "0": ["█▀█", "█ █", "▀▀▀"],
  "1": [" █ ", " █ ", " ▀ "],
  "2": ["█▀█", "▄▀▀", "▀▀▀"],
  "3": ["█▀█", " ▀█", "▀▀▀"],
  "4": ["█ █", "▀▀█", "  ▀"],
  "5": ["█▀ ", "▀▀█", "▀▀▀"],
  "6": ["█▀ ", "█▀█", "▀▀▀"],
  "7": ["█▀█", "  █", "  ▀"],
  "8": ["█▀█", "█▀█", "▀▀▀"],
  "9": ["█▀█", "▀▀█", "▀▀▀"],
  ".": ["   ", "   ", " ▀ "],
  ",": ["   ", "   ", " ▄ "],
  "$": ["█▀▀", "▀▀█", "▀▀▀"],
  "%": ["█ █", " ▄ ", "█ █"],
  "K": ["█ █", "█▀▄", "▀ ▀"],
  "M": ["█▄█", "█ █", "▀ ▀"],
  "-": ["   ", "▀▀▀", "   "],
  " ": ["   ", "   ", "   "],
}

const ROWS = 3

/** Three text rows spelling `text` in block digits. */
export function bigDigits(text: string): string[] {
  const rows = Array.from({ length: ROWS }, () => "")
  for (const char of text) {
    const glyph = GLYPHS[char] ?? ["▄▄▄", " ▀ ", "   "]
    for (let row = 0; row < ROWS; row++) rows[row] += `${glyph[row] ?? "   "} `
  }
  return rows.map((row) => row.trimEnd())
}
