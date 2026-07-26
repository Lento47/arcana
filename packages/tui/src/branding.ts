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
export const DOCS_URL = "https://arcana.otnelhq.com/docs"
export const BUG_URL = "https://github.com/Lento47/arcana-community/issues/new"

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

/**
 * Prompt placeholder pools (rotating examples).
 * Shared by home + command-spine — pick one at random per session / mode switch.
 * Keep lines short (≤ ~48 chars) so they fit narrow terminals.
 */
export const PLACEHOLDER = {
  normal: [
    "Speak your intent…",
    "What secrets does this codebase hold?",
    "Inscribe a change…",
    "Name the next objective…",
    "What should we forge next?",
    "Trace a bug to its source…",
    "Refactor something that frets you…",
    "Ask the chronicle a question…",
    "Ship a small, verifiable change…",
    "Explain this module like a spell…",
    "Draft a plan before we cast…",
    "Find the smell in this tree…",
    "Wire up the missing piece…",
    "Review the last patch with care…",
    "Open a path through this maze…",
    "Turn this idea into a commit…",
    "Summon help on a stuck rite…",
    "Decrypt what this function does…",
    "Align types until they hum…",
    "Carve a cleaner API surface…",
    "Test the edge cases that lurk…",
    "Document the unwritten rule…",
    "Cull the dead code gently…",
    "Lift a todo into a real fix…",
  ],
  shell: [
    "Inscribe a command…",
    "invoke a rite…",
    "cat /dev/arcana",
    "echo $SECRETS",
    "git status",
    "git diff --stat",
    "rg -n 'TODO|FIXME'",
    "ls -la",
    "pwd",
    "bun test",
    "bun run typecheck",
    "which arcana",
    "env | sort",
    "head -n 40 README.md",
    "find . -name '*.ts' | head",
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

/**
 * Sigil transition sequence — used for splash animation and brand motion.
 * Order matters: cycles left-to-right.
 */
export const SIGIL_SEQUENCE = ["◆", "▰", "❯", "⛧", "✦", "◈"] as const

/** Per-step delay for the sigil transition (ms). Tuned for ~1.2s total animation. */
export const SIGIL_STEP_MS = 200

/**
 * Brand surface that picks the theme `accent` token for sigil coloring.
 * Engine callers pass a resolved Theme; chrome.ts holds the type guard.
 */
export const SIGIL_TOKEN = "accent" as const

/**
 * Single source of truth for brand-tier copy (Arcana Pro / free, etc).
 * Mirrored inside `packages/engine/src/session/retry.ts` to avoid the
 * `@arcana/engine ← @arcana/tui` circular import — keep both in sync.
 */
export const BRAND_TIERS = {
  go: {
    name: "Arcana Pro",
    price: "$10/month",
    url: "https://arcana.otnelhq.com/pro",
    shortDescription:
      "Reliable access to popular open coding models with generous usage limits.",
    longDescription:
      "Arcana Pro is a $10 per month subscription that provides reliable access to popular open coding models with generous usage limits.",
    limitReachedTitle: "Free limit reached",
    limitReachedMessage:
      "OpenCode Go subscription — this tier is being phased out in the near future. Subscribe to Arcana Pro for higher rate limits and more models.",
    cta: "Upgrade",
  },
} as const
