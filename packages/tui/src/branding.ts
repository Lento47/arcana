/**
 * Central brand identity for the arcana TUI.
 *
 * Single source for the app name, taglines, external links, and the signature
 * glyphs/sigils used across the cyberpunk/arcane redesign. Anything that shows
 * the product name or a brand mark should read from here, not a string literal.
 */

export const APP_NAME = "arcana"
export const APP_NAME_UPPER = "ARCANA"

/** Short descriptor used after the wordmark / in titles. */
export const TAGLINE = "arcane terminal"
/** Decorative line rendered under the launch wordmark. */
export const WORDMARK_TAGLINE = "« decrypt the arcane »"

/** Abbreviation used in compact spots (e.g. the terminal-title prefix). */
export const APP_ABBR = "ARC"

/**
 * External links. Still pointed at functional upstream targets until
 * arcana-owned URLs exist — swap these two in one place when they do.
 */
export const DOCS_URL = "https://arcana.ai/docs"
export const BUG_URL = "https://github.com/Lento47/arcana/issues/new"

/** Notification sound-pack display name (id stays as registered in core). */
export const SOUND_PACK_NAME = "Arcana Default"

/** Signature glyphs for cyberpunk/crypto chrome. */
export const Glyph = {
  prompt: "❯",
  bullet: "▰",
  sep: "▰",
  diamond: "◆",
  sigil: "⛧",
  star: "✦",
  chevron: "›",
  charge: "◈",
  meter: "▰",
  well: "▣",
} as const

/** Agent sigil glyphs by mode. */
export const AgentSigil = {
  primary: "⛧",
  subagent: "⛤",
  all: "⛧",
} as const

// --- Phase 5a: Voice Core ---

/**
 * Arcane verb lexicon — tool action display labels.
 * Used by InlineTool pending= strings in session/index.tsx.
 */
export const Lexicon = {
  think: "Divining",
  thought: "Divined",
  read: "scrying",
  write: "inscribing",
  edit: "transmuting",
  search: "divining",
  find: "seeking",
  shell: "invoking",
  fetch: "summoning",
  task: "conjuring",
  skill: "channeling",
  Token: {
    label: "glyphs",
    labelShort: "glphs",
    meter: "charge",
    cost: "tribute",
    pool: "well",
  },
  Agent: {
    primary: "Adept",
    subagent: "Familiar",
    all: "Adept",
    school: "coven",
  },
  Status: {
    idle: "dormant",
    busy: "channeling",
    retry: "re-casting",
    error: "corrupted",
    done: "complete",
  },
} as const

/** Boot/splash phrase pool — one picked per launch for pre-ready state. */
export const BOOT_PHRASES = [
  "decrypting arcane registry…",
  "binding sigils…",
  "aligning ley lines…",
  "consulting the grimoire…",
  "tracing the circle…",
  "waking familiars…",
] as const

/** Home prompt placeholder pools (rotating examples). */
export const PLACEHOLDER = {
  normal: [
    "Speak your intent…",
    "What secrets does this codebase hold?",
    "Inscribe a change…",
  ],
  shell: [
    "invoke a rite…",
    "cat /dev/arcana",
    "echo $SECRETS",
  ],
}

/** Prompt framing prefix text. */
export const PROMPT_FRAME = {
  normal: "Speak your intent…",
  shell: "Inscribe a command…",
}

/** Miscellaneous copy strings (toasts, notifications, empty states). */
export const COPY = {
  inscribedToClipboard: "Inscribed to clipboard",
  riteComplete: "The rite is complete",
  noEchoesFound: "No echoes found",
  chronicleEmpty: "The chronicle is empty",
} as const

/** Home idle epigram pool — rotates every ~12s with decrypt animation. */
export const IDLE_PHRASES = [
  "the arcane speaks in riddles…",
  "every cipher has its key…",
  "sigils flicker; truths emerge…",
  "the grimoire remembers all…",
  "ley lines hum beneath the code…",
  "a glyph in the static…",
  "silence between keystrokes…",
  "the veil thins at compile time…",
] as const

/** Verb pools — deterministic per-seed rotation avoids repetitive labels across sessions. */
export const VerbPool = {
  thinking: [
    "Divining", "Scrying", "Channeling", "Unraveling",
    "Decrypting", "Interpreting", "Decoding", "Translating",
    "Piercing", "Fathoming", "Weaving",
    "Dissecting", "Contemplating", "Unspooling", "Parsing",
  ] as const,
  thought: [
    "Divined", "Scried", "Channeled", "Unraveled",
    "Decrypted", "Interpreted", "Decoded", "Translated",
    "Pierced", "Fathomed", "Woven",
    "Dissected", "Contemplated", "Unspooled", "Parsed",
  ] as const,
  pending: {
    search: ["Divining", "Scrying", "Decrypting", "Decoding", "Interpreting", "Translating", "Parsing"] as const,
    read: ["Scrying", "Reading", "Deciphering", "Decoding", "Unraveling"] as const,
    write: ["Inscribing", "Writing", "Etching", "Engraving", "Glyphing"] as const,
    edit: ["Transmuting", "Editing", "Altering", "Reforging", "Morphing"] as const,
    fetch: ["Summoning", "Fetching", "Calling", "Drawing", "Pulling"] as const,
    shell: ["Invoking", "Executing", "Running", "Calling", "Triggering"] as const,
    task: ["Conjuring", "Tasking", "Assembling", "Orchestrating", "Weaving"] as const,
    skill: ["Channeling", "Focusing", "Attuning", "Syncing", "Harmonizing"] as const,
    generic: ["Invoking", "Running", "Processing", "Working", "Operating"] as const,
    todo: ["Inscribing", "Tracking", "Recording", "Logging", "Listing"] as const,
    question: ["Divining", "Asking", "Inquiring", "Querying", "Probing"] as const,
  },
}

/** Glyph pool for error "unencrypt" glitch effect — heavier, chaotic blocks. */
export const CORRUPT_GLYPHS = "░▒▓█▄▀■□▪▫◊○●◙◘◧◨◩◪◫◭◮◯◰◱◲◳◎◆◇◈◉"

/** Visual charge/glyph meter levels (0-4 segments). */
export const Meter = {
  0: "○○○○",
  1: "●○○○",
  2: "●●○○",
  3: "●●●○",
  4: "●●●●",
} as const
