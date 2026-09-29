export type PredictorSource = "ollama" | "arcana-proxy" | "openrouter" | "custom"

/** One prior turn handed to the predictor so it can match topic and vocabulary. */
export type PredictorContextMessage = Readonly<{ role: "user" | "assistant"; content: string }>

export interface PredictorSettings {
  enabled: boolean
  source: PredictorSource
  /** Ollama host (source=ollama). Default http://localhost:11434 */
  host?: string
  /** Model id. Required for arcana-proxy/custom; ollama picks the best installed small model. */
  model?: string
  /** OpenAI-compatible base URL (source=custom) */
  base_url?: string
  api_key?: string
  max_tokens?: number
  debounce_ms?: number
  /** Recent session messages sent as context. 0 disables. */
  context_messages?: number
}

export const PREDICTOR_DEFAULT_MAX_TOKENS = 24
export const PREDICTOR_DEFAULT_DEBOUNCE_MS = 350
export const PREDICTOR_MIN_CHARS = 12
export const PREDICTOR_DEFAULT_CONTEXT_MESSAGES = 3
export const PREDICTOR_CONTEXT_CHARS_PER_MESSAGE = 240
export const PREDICTOR_CONTEXT_CHARS_TOTAL = 720

const ECHO_WINDOW = 240
const MIN_PREDICTION_CHARS = 3
/** A ghost that runs past one breath is noise, not a suggestion. */
const MAX_PREDICTION_CHARS = 160

/**
 * The predictor is an inline autocomplete, not a chat partner: it continues the
 * operator's own sentence. Topic and vocabulary come from the session context
 * that precedes the draft, never from inventing a new subject.
 */
export const PREDICTOR_SYSTEM_PROMPT = [
  "You are the inline autocomplete of a terminal coding agent.",
  "Continue the operator's draft message from exactly where it stops.",
  "Never repeat, restate, or answer what they already typed.",
  "Match their language, tone, and vocabulary; stay on the same subject.",
  "Prefer the concrete thing the sentence is heading toward (a file, command, flag, or decision) over generic filler.",
  "Write one short fragment, at most about twelve words.",
  "Output only the continuation: no preamble, quotes, markdown, lists, or code fences.",
  "If you cannot continue with confidence, output nothing at all.",
].join(" ")

/** Collapse every whitespace run into a single space. */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ")
}

/**
 * Keep the most recent turns within a small character budget, oldest-first.
 * Context exists to sharpen wording; it must never crowd out the draft.
 */
export function trimContext(
  messages: readonly PredictorContextMessage[],
  options: { maxMessages?: number; charsPerMessage?: number; charsTotal?: number } = {},
): PredictorContextMessage[] {
  const maxMessages = options.maxMessages ?? PREDICTOR_DEFAULT_CONTEXT_MESSAGES
  if (maxMessages <= 0) return []
  const charsPerMessage = options.charsPerMessage ?? PREDICTOR_CONTEXT_CHARS_PER_MESSAGE
  const charsTotal = options.charsTotal ?? PREDICTOR_CONTEXT_CHARS_TOTAL
  const kept: PredictorContextMessage[] = []
  let used = 0
  for (let index = messages.length - 1; index >= 0 && kept.length < maxMessages; index--) {
    const message = messages[index]!
    const content = collapseWhitespace(message.content).slice(0, charsPerMessage).trim()
    if (!content) continue
    if (used + content.length > charsTotal) break
    used += content.length
    kept.push({ role: message.role, content })
  }
  return kept.reverse()
}

/**
 * Trigger policy for the ghost-text predictor. Pure predicate.
 */
export function shouldPredict(input: {
  textBeforeCursor: string
  autocompleteVisible: boolean
  disabled: boolean
  busy?: boolean
}): boolean {
  if (input.disabled || input.autocompleteVisible || input.busy) return false
  const text = input.textBeforeCursor
  if (text.length < PREDICTOR_MIN_CHARS) return false
  if (text.startsWith("/")) return false
  return true
}

/** OpenAI chat-completions body for a continuation request. */
export function buildRequestBody(
  prefix: string,
  model: string,
  maxTokens: number,
  context: readonly PredictorContextMessage[] = [],
): Record<string, unknown> {
  return {
    model,
    messages: [
      { role: "system", content: PREDICTOR_SYSTEM_PROMPT },
      // Prior turns frame the draft as the operator's own next message, so the
      // continuation matches the conversation instead of the model's defaults.
      ...context.map((message) => ({ role: message.role, content: message.content })),
      { role: "user", content: prefix },
    ],
    max_tokens: maxTokens,
    temperature: 0.3,
    // A ghost is one line: never let the model answer with a paragraph.
    stop: ["\n\n", "\n"],
    stream: false,
  }
}

const LOW_VALUE_LEAD =
  /^(?:as an ai|i'?m sorry|i am sorry|i cannot|i can'?t|sorry,|sure[,!]|certainly[,!]|of course[,!]|here(?:'s| is)|note:|note that|the user|this (?:message|sentence|draft))/i
/** Markdown structure reads as a new block, not a continuation of this line. */
const MARKDOWN_LEAD = /^(?:[-*+>#]\s|\d+[.)]\s|```|~~~|\[[^\]]*\]\()/

/**
 * True when the continuation opens with the draft's own tail (a restatement,
 * possibly with different punctuation or casing that the exact echo strip
 * could not match). Only a three-word opening counts — two words is common
 * enough in real continuations to be noise.
 */
export function isPrefixEcho(prediction: string, prefix: string): boolean {
  const head = wordsOf(prediction).slice(0, 3)
  if (head.length < 3) return false
  const tail = wordsOf(prefix).slice(-6)
  for (let start = 0; start + head.length <= tail.length; start++) {
    if (head.every((word, index) => word === tail[start + index])) return true
  }
  return false
}

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter(Boolean)
}

function stripWrappingQuotes(text: string): string {
  const pairs: readonly (readonly [string, string])[] = [
    ['"', '"'],
    ["'", "'"],
    ["“", "”"],
    ["‘", "’"],
    ["`", "`"],
  ]
  for (const [open, close] of pairs) {
    if (text.length <= open.length + close.length) continue
    if (text.startsWith(open) && text.endsWith(close)) {
      return text.slice(open.length, text.length - close.length).trim()
    }
  }
  return text
}

/**
 * Clean a raw completion into an insertable continuation.
 * Drops echo of the typed tail (up to a long window — models often re-emit the
 * whole draft), wraps, quotes, markdown blocks and low-value preambles; cuts at
 * the first sentence terminator. Returns null when nothing usable remains.
 */
export function postProcessPrediction(raw: string, prefix: string): string | null {
  let out = raw.replace(/^\s+/, "")
  if (!out) return null

  const cap = Math.min(ECHO_WINDOW, prefix.length)
  for (let len = cap; len >= 2; len--) {
    const suffix = prefix.slice(prefix.length - len)
    if (out.startsWith(suffix)) {
      out = out.slice(len).replace(/^\s+/, "")
      break
    }
  }

  out = collapseWhitespace(out)
  out = stripWrappingQuotes(out)

  const sentence = out.match(/^[\s\S]*?[.!?:](?=\s|$)/)
  if (sentence) out = sentence[0]

  out = out.trimEnd()
  if (out.length > MAX_PREDICTION_CHARS) return null
  const trimmed = out.trim()
  if (trimmed.length < MIN_PREDICTION_CHARS) return null
  if (LOW_VALUE_LEAD.test(trimmed)) return null
  if (MARKDOWN_LEAD.test(trimmed)) return null
  if (isPrefixEcho(out, prefix)) return null
  return out
}

/** Split the next word (+ trailing space) off a prediction. */
export function nextPredictionChunk(prediction: string): { chunk: string; rest: string } | null {
  const match = prediction.match(/^\S+(?:\s+|$)/)
  if (!match) return null
  const chunk = match[0]
  if (!chunk.trim()) return null
  return { chunk, rest: prediction.slice(chunk.length) }
}

/** Staleness guard: a stored prediction is valid only for its exact prefix. */
export function isPredictionFresh(storedPrefix: string, textBeforeCursor: string): boolean {
  return storedPrefix === textBeforeCursor
}
