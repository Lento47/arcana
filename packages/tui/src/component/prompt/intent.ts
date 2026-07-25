/** Minimal agent shape needed for intent matching.
 *  Mirrors fields from @arcana/sdk/v2 Agent without depending on the package. */
interface AgentInfo {
  name: string
  description?: string
  hidden?: boolean
}

export interface IntentSuggestion {
  /** The full name to insert when accepted (e.g. "debugging-hermes-tui-commands") */
  name: string
  /** Short description for display (first sentence, truncated to 60 chars) */
  description: string
  /** Type of intent — used for icon / display color */
  type: "skill" | "agent"
}

interface IntentEntry {
  name: string
  description: string
  type: IntentSuggestion["type"]
  /** Lowercased name tokens for fast prefix matching */
  nameLower: string
  /** Lowercased description tokens for overlap scoring */
  descTokens: Set<string>
}

const MIN_INPUT_LENGTH = 3
const MIN_SCORE_THRESHOLD = 0.2
/** Debounce window — classifier won't rerun within this many ms */
const DEBOUNCE_MS = 300

/**
 * Lightweight classifier that matches user input against a pre-built
 * registry of skills and agents. Returns the single best match or null.
 *
 * Scoring weights:
 *   - Exact name prefix match:  0.8
 *   - Name substring match:     0.5
 *   - Description token overlap: 0.3 per matching token
 *   - Normalised by input length to avoid biasing toward shorter queries
 */
export class IntentRegistry {
  private entries: IntentEntry[] = []
  private lastInput = ""
  private lastResult: IntentSuggestion | null = null
  private lastRun = 0

  /**
   * Build the registry from skills and agents at startup.
   * Call once when data is available.
   */
  build(input: { skills?: { name: string; description?: string }[]; agents?: AgentInfo[] }) {
    const entries: IntentEntry[] = []

    if (input.skills) {
      for (const s of input.skills) {
        entries.push({
          name: s.name,
          description: s.description ?? "",
          type: "skill",
          nameLower: s.name.toLowerCase(),
          descTokens: new Set(tokenize(s.description ?? "")),
        })
      }
    }

    if (input.agents) {
      for (const a of input.agents) {
        // Skip hidden agents and the default "build" agent
        if (a.hidden || a.name === "build") continue
        entries.push({
          name: a.name,
          description: a.description ?? "",
          type: "agent",
          nameLower: a.name.toLowerCase(),
          descTokens: new Set(tokenize(a.description ?? "")),
        })
      }
    }

    this.entries = entries
  }

  /**
   * Classify the current input text. Returns the best match or null.
   * Debounced: returns the cached result if called within DEBOUNCE_MS.
   */
  classify(input: string): IntentSuggestion | null {
    // Only run on 3+ characters
    const trimmed = input.trim()
    if (trimmed.length < MIN_INPUT_LENGTH) {
      this.lastResult = null
      this.lastInput = trimmed
      return null
    }

    // Debounce: return cached if same input or within cooldown
    const now = Date.now()
    if (trimmed === this.lastInput && now - this.lastRun < DEBOUNCE_MS * 2) {
      return this.lastResult
    }
    if (now - this.lastRun < DEBOUNCE_MS) return this.lastResult

    this.lastInput = trimmed
    this.lastRun = now

    if (this.entries.length === 0) return null

    // Tokenize the input
    const inputLower = trimmed.toLowerCase()
    const inputTokens = tokenize(inputLower)

    let bestScore = 0
    let bestEntry: IntentEntry | null = null

    for (const entry of this.entries) {
      const score = this.score(entry, inputLower, inputTokens)
      if (score > bestScore) {
        bestScore = score
        bestEntry = entry
      }
    }

    if (!bestEntry || bestScore < MIN_SCORE_THRESHOLD) {
      this.lastResult = null
      return null
    }

    this.lastResult = {
      name: bestEntry.name,
      description: truncateDesc(bestEntry.description),
      type: bestEntry.type,
    }
    return this.lastResult
  }

  /** Clear the registry (e.g. on agent/skill reload) */
  clear() {
    this.entries = []
    this.lastResult = null
    this.lastInput = ""
  }

  /** True when the registry is empty (no data loaded yet) */
  get empty(): boolean {
    return this.entries.length === 0
  }

  private score(entry: IntentEntry, inputLower: string, inputTokens: string[]): number {
    let score = 0

    // Exact name prefix match — highest weight
    if (entry.nameLower.startsWith(inputLower)) {
      score += 0.8
    } else if (entry.nameLower.includes(inputLower)) {
      // Substring match in name
      score += 0.5
    } else {
      // Token-level fuzzy: each input token that appears in name
      for (const token of inputTokens) {
        if (entry.nameLower.includes(token)) {
          score += 0.2
        }
      }
    }

    // Description overlap — bonus for matching terms in description
    for (const token of inputTokens) {
      if (entry.descTokens.has(token)) {
        score += 0.15
      }
    }

    // Penalise long names to prefer shorter, more specific matches
    // when score is otherwise equal
    score -= (entry.name.length - inputLower.length) * 0.001

    return Math.max(0, score)
  }
}

// -- Helpers --

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\-_.,:;!?()[\]{}'"\n\r]+/)
    .filter((t) => t.length >= 2)
}

function truncateDesc(desc: string, max = 60): string {
  const cleaned = desc.replace(/\s+/g, " ").trim()
  if (cleaned.length <= max) return cleaned
  // Try to break at word boundary
  const truncated = cleaned.slice(0, max)
  const lastSpace = truncated.lastIndexOf(" ")
  return (lastSpace > max * 0.6 ? truncated.slice(0, lastSpace) : truncated).trimEnd()
}
