/**
 * Central brand identity for the arcana TUI.
 *
 * Single source for the app name, taglines, external links, and the signature
 * glyphs/sigils used across the cyberpunk/arcane redesign. Anything that shows
 * the product name or a brand mark should read from here, not a string literal.
 *
 * Voice: the interface lexicon (tool verbs, statuses, placeholders, copy) is
 * a live bundle. The default is the "arcane" voice; setLexiconVoice("plain")
 * swaps the exported bindings to plain language. Consumers import the live
 * names (Lexicon, VerbPool, PLACEHOLDER, ...) and read them at call time, so
 * the swap takes effect for every subsequent render — call it once at startup
 * with the resolved config.
 */

export const APP_NAME = "arcana"
export const APP_NAME_UPPER = "ARCANA"

/** Short descriptor used after the wordmark / in titles. */
export const TAGLINE = "arcane terminal"
/** Decorative line rendered under the launch wordmark. */
const DEFAULT_WORDMARK_TAGLINE = "« decrypt the arcane »"
export let WORDMARK_TAGLINE: string = DEFAULT_WORDMARK_TAGLINE
export const PLAIN_WORDMARK_TAGLINE = "governed autonomy, in your terminal"

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
const DEFAULT_LEXICON = {
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

/** Plain-language counterpart of DEFAULT_LEXICON. Same shape, different voice. */
export const PLAIN_LEXICON = {
  think: "Thinking",
  thought: "Thought",
  read: "reading",
  write: "writing",
  edit: "editing",
  search: "searching",
  find: "finding",
  shell: "running",
  fetch: "fetching",
  task: "tasking",
  skill: "using skill",
  Token: {
    label: "tokens",
    labelShort: "tok",
    meter: "usage",
    cost: "cost",
    pool: "pool",
  },
  Agent: {
    primary: "Agent",
    subagent: "Subagent",
    all: "Agent",
    school: "team",
  },
  Status: {
    idle: "idle",
    busy: "working",
    retry: "retrying",
    error: "error",
    done: "done",
  },
} as const

export let Lexicon: typeof DEFAULT_LEXICON | typeof PLAIN_LEXICON = DEFAULT_LEXICON

/** Boot/splash phrase pool — one picked per launch for pre-ready state. */
const DEFAULT_BOOT_PHRASES = [
  "decrypting arcane registry…",
  "binding sigils…",
  "aligning ley lines…",
  "consulting the grimoire…",
  "tracing the circle…",
  "waking familiars…",
] as const

export const PLAIN_BOOT_PHRASES = [
  "starting arcana…",
  "loading configuration…",
  "connecting providers…",
  "preparing workspace…",
  "loading skills…",
  "warming up…",
] as const

export let BOOT_PHRASES: readonly string[] = DEFAULT_BOOT_PHRASES

/** Ready-state label for the boot overlay (voice-aware). */
const DEFAULT_BOOT_READY = "binding sigils…"
export let BOOT_READY: string = DEFAULT_BOOT_READY
export const PLAIN_BOOT_READY = "ready"

/**
 * Prompt placeholder pools (rotating examples).
 * Shared by home + command-spine — pick one at random per session / mode switch.
 * Keep lines short (≤ ~48 chars) so they fit narrow terminals.
 */
const DEFAULT_PLACEHOLDER = {
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

export const PLAIN_PLACEHOLDER: { normal: string[]; shell: string[] } = {
  normal: [
    "Ask anything…",
    "What does this codebase hold?",
    "Make a change…",
    "Name the next objective…",
    "What should we build next?",
    "Trace a bug to its source…",
    "Refactor something that bothers you…",
    "Ask about the project history…",
    "Ship a small, verifiable change…",
    "Explain this module…",
    "Draft a plan before we start…",
    "Find the smell in this tree…",
    "Wire up the missing piece…",
    "Review the last patch carefully…",
    "Open a path through this maze…",
    "Turn this idea into a commit…",
    "Get help on a stuck task…",
    "Explain what this function does…",
    "Align types until they compile…",
    "Carve a cleaner API surface…",
    "Test the edge cases…",
    "Document the unwritten rule…",
    "Cull the dead code gently…",
    "Turn a todo into a real fix…",
  ],
  shell: [
    "Run a command…",
    "run a command…",
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

export let PLACEHOLDER: { normal: string[]; shell: string[] } = DEFAULT_PLACEHOLDER

/** Prompt framing prefix text. */
const DEFAULT_PROMPT_FRAME = {
  normal: "Speak your intent…",
  shell: "Inscribe a command…",
}

export const PLAIN_PROMPT_FRAME: { normal: string; shell: string } = {
  normal: "Ask anything…",
  shell: "Run a command…",
}

export let PROMPT_FRAME: { normal: string; shell: string } = DEFAULT_PROMPT_FRAME

/** Miscellaneous copy strings (toasts, notifications, empty states). */
const DEFAULT_COPY = {
  inscribedToClipboard: "Inscribed to clipboard",
  riteComplete: "The rite is complete",
  noEchoesFound: "No echoes found",
  chronicleEmpty: "The chronicle is empty",
} as const

export const PLAIN_COPY = {
  inscribedToClipboard: "Copied to clipboard",
  riteComplete: "Done",
  noEchoesFound: "No matches found",
  chronicleEmpty: "No sessions yet",
} as const

export let COPY: typeof DEFAULT_COPY | typeof PLAIN_COPY = DEFAULT_COPY

/** Home idle epigram pool — rotates every ~12s with decrypt animation. */
const DEFAULT_IDLE_PHRASES = [
  "the arcane speaks in riddles…",
  "every cipher has its key…",
  "sigils flicker; truths emerge…",
  "the grimoire remembers all…",
  "ley lines hum beneath the code…",
  "a glyph in the static…",
  "silence between keystrokes…",
  "the veil thins at compile time…",
] as const

export const PLAIN_IDLE_PHRASES = [
  "ask me anything…",
  "ready when you are…",
  "waiting for your first prompt…",
  "type /help to see commands…",
  "the workspace is quiet…",
  "no task running…",
  "plan it, then prove it…",
  "the terminal is listening…",
] as const

export let IDLE_PHRASES: readonly string[] = DEFAULT_IDLE_PHRASES

/** Verb pools — deterministic per-seed rotation avoids repetitive labels across sessions. */
const DEFAULT_VERB_POOL = {
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
} as const

/** Plain-language counterpart of DEFAULT_VERB_POOL. Same shape, different voice. */
export const PLAIN_VERB_POOL = {
  thinking: [
    "Thinking", "Reasoning", "Analyzing", "Reviewing",
    "Reading", "Parsing", "Tracing", "Exploring",
    "Inspecting", "Examining", "Investigating",
    "Considering", "Evaluating", "Deciding", "Planning",
  ] as const,
  thought: [
    "Thought", "Reasoned", "Analyzed", "Reviewed",
    "Read", "Parsed", "Traced", "Explored",
    "Inspected", "Examined", "Investigated",
    "Considered", "Evaluated", "Decided", "Planned",
  ] as const,
  pending: {
    search: ["Searching", "Scanning", "Finding", "Looking", "Querying", "Matching", "Hunting"] as const,
    read: ["Reading", "Opening", "Loading", "Viewing", "Inspecting"] as const,
    write: ["Writing", "Saving", "Creating", "Updating", "Editing"] as const,
    edit: ["Editing", "Modifying", "Updating", "Changing", "Rewriting"] as const,
    fetch: ["Fetching", "Downloading", "Loading", "Retrieving", "Calling"] as const,
    shell: ["Running", "Executing", "Calling", "Starting", "Triggering"] as const,
    task: ["Starting task", "Running task", "Delegating", "Spawning", "Dispatching"] as const,
    skill: ["Loading skill", "Using skill", "Attaching", "Loading", "Syncing"] as const,
    generic: ["Running", "Working", "Processing", "Executing", "Handling"] as const,
    todo: ["Updating todos", "Tracking", "Recording", "Logging", "Listing"] as const,
    question: ["Asking", "Prompting", "Inquiring", "Querying", "Checking"] as const,
  },
} as const

export let VerbPool: typeof DEFAULT_VERB_POOL | typeof PLAIN_VERB_POOL = DEFAULT_VERB_POOL

/** Interface voice selector. "arcane" is the default occult voice; "plain" is plain language. */
export type LexiconVoice = "arcane" | "plain"

/**
 * Swap the live branding bindings to the requested voice. Call once at
 * startup with the resolved config — every consumer reads the bindings at
 * call time, so the new voice applies to all subsequent renders.
 */
export function setLexiconVoice(voice: LexiconVoice) {
  if (voice === "plain") {
    WORDMARK_TAGLINE = PLAIN_WORDMARK_TAGLINE
    Lexicon = PLAIN_LEXICON
    BOOT_PHRASES = PLAIN_BOOT_PHRASES
    BOOT_READY = PLAIN_BOOT_READY
    PLACEHOLDER = PLAIN_PLACEHOLDER
    PROMPT_FRAME = PLAIN_PROMPT_FRAME
    COPY = PLAIN_COPY
    IDLE_PHRASES = PLAIN_IDLE_PHRASES
    VerbPool = PLAIN_VERB_POOL
    return
  }
  WORDMARK_TAGLINE = DEFAULT_WORDMARK_TAGLINE
  Lexicon = DEFAULT_LEXICON
  BOOT_PHRASES = DEFAULT_BOOT_PHRASES
  BOOT_READY = DEFAULT_BOOT_READY
  PLACEHOLDER = DEFAULT_PLACEHOLDER
  PROMPT_FRAME = DEFAULT_PROMPT_FRAME
  COPY = DEFAULT_COPY
  IDLE_PHRASES = DEFAULT_IDLE_PHRASES
  VerbPool = DEFAULT_VERB_POOL
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
      "Free tier limit reached. Subscribe to Arcana Pro for higher rate limits and more models.",
    cta: "Upgrade",
  },
} as const
