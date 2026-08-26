export type PredictorSource = "ollama" | "arcana-proxy" | "openrouter" | "custom"

export interface PredictorSettings {
  enabled: boolean
  source: PredictorSource
  /** Ollama host (source=ollama). Default http://localhost:11434 */
  host?: string
  /** Model id. Required for arcana-proxy/custom; ollama falls back to a small default. */
  model?: string
  /** OpenAI-compatible base URL (source=custom) */
  base_url?: string
  api_key?: string
  max_tokens?: number
  debounce_ms?: number
}

export const PREDICTOR_DEFAULT_MAX_TOKENS = 24
export const PREDICTOR_DEFAULT_DEBOUNCE_MS = 350
export const PREDICTOR_MIN_CHARS = 12

const ECHO_WINDOW = 48
const MIN_PREDICTION_CHARS = 3

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
): Record<string, unknown> {
  return {
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a typing predictor. Continue the user's draft text naturally. Output ONLY the continuation — no preamble, no quotes, do not repeat any text the user already wrote. At most one sentence.",
      },
      { role: "user", content: prefix },
    ],
    max_tokens: maxTokens,
    temperature: 0.3,
    stop: ["\n\n"],
    stream: false,
  }
}

/**
 * Clean a raw completion into an insertable continuation.
 * Strips echo of the typed tail, collapses whitespace, cuts at the first
 * sentence terminator. Returns null when nothing usable remains.
 */
export function postProcessPrediction(raw: string, prefix: string): string | null {
  let out = raw.trimStart()
  if (!out) return null

  const cap = Math.min(ECHO_WINDOW, prefix.length)
  for (let len = cap; len >= 2; len--) {
    const suffix = prefix.slice(prefix.length - len)
    if (out.startsWith(suffix)) {
      out = out.slice(len).trimStart()
      break
    }
  }

  out = out.replace(/\s+/g, " ")

  const sentence = out.match(/^[\s\S]*?[.!?:](?=\s|$)/)
  if (sentence) out = sentence[0]

  out = out.trimEnd()
  if (out.trim().length < MIN_PREDICTION_CHARS) return null
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
