export namespace Slug {
  const ADJECTIVES = [
    "umbral",
    "ashen",
    "veiled",
    "gilded",
    "hollow",
    "runic",
    "astral",
    "obsidian",
    "dusk",
    "pale",
    "void",
    "ember",
  ] as const

  const NOUNS = [
    "sigil",
    "oracle",
    "wraith",
    "rune",
    "lantern",
    "veil",
    "cipher",
    "grimoire",
    "comet",
    "warden",
    "ember",
    "glyph",
  ] as const

  export function create() {
    return [
      ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)],
      NOUNS[Math.floor(Math.random() * NOUNS.length)],
    ].join("-")
  }
}
