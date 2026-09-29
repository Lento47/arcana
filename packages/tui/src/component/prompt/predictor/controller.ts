import {
  PREDICTOR_DEFAULT_DEBOUNCE_MS,
  PREDICTOR_DEFAULT_MAX_TOKENS,
  isPredictionFresh,
  nextPredictionChunk,
  postProcessPrediction,
  shouldPredict,
  type PredictorContextMessage,
  type PredictorSettings,
} from "./predict"
import { PredictorUnavailableError, requestPrediction, resolveCached } from "./client"

export interface PredictorInputState {
  text: string
  cursorOffset: number
  autocompleteVisible: boolean
  busy?: boolean
  /**
   * Recent turns, resolved lazily so keystrokes never rebuild context for a
   * request that the debounce may never send.
   */
  context?: () => readonly PredictorContextMessage[]
}

interface StoredPrediction {
  prefix: string
  prediction: string
}

/**
 * Prefix → prediction memo. Pausing, typing a character and deleting it again
 * must show the same ghost, not re-roll a different continuation for the same
 * draft (which reads as the predictor being unstable).
 */
const CACHE_LIMIT = 8

/**
 * Debounced, abortable predictor pipeline. Framework-free; the owner wires it
 * to signals. Every schedule() invalidates pending work and the stored ghost.
 */
export class PredictorController {
  private stored: StoredPrediction | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private abort: AbortController | undefined
  private generation = 0
  private dead = false
  private cache = new Map<string, string>()

  /** Called after every settle (result stored or failed) and every invalidation. */
  onUpdate: () => void = () => {}
  /** Called once when the predictor gives up for the session. */
  onDisabled: (reason: string) => void = () => {}

  constructor(
    private settings: () => PredictorSettings | null,
    /** Injectable for tests; production always uses the real client. */
    private request: typeof requestPrediction = requestPrediction,
  ) {}

  /** Valid prediction for the exact text before the cursor, or null. */
  peek(textBeforeCursor: string): string | null {
    const stored = this.stored
    if (!stored || !isPredictionFresh(stored.prefix, textBeforeCursor)) return null
    return stored.prediction
  }

  clear() {
    this.stored = null
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.abort?.abort()
    this.abort = undefined
    this.generation++
    this.onUpdate()
  }

  schedule(input: PredictorInputState) {
    this.clear()
    if (this.dead) return
    const settings = this.settings()
    if (!settings?.enabled) return

    const prefix = input.text.slice(0, input.cursorOffset)
    if (
      !shouldPredict({
        textBeforeCursor: prefix,
        autocompleteVisible: input.autocompleteVisible,
        disabled: false,
        busy: input.busy,
      })
    ) {
      return
    }

    const cached = this.cache.get(prefix)
    if (cached) {
      this.stored = { prefix, prediction: cached }
      this.onUpdate()
      return
    }

    const gen = this.generation
    this.timer = setTimeout(() => {
      void this.run(gen, settings, prefix, input.context)
    }, settings.debounce_ms ?? PREDICTOR_DEFAULT_DEBOUNCE_MS)
  }

  private remember(prefix: string, prediction: string) {
    this.cache.set(prefix, prediction)
    while (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value
      if (oldest === undefined) break
      this.cache.delete(oldest)
    }
  }

  private async run(
    gen: number,
    settings: PredictorSettings,
    prefix: string,
    context?: () => readonly PredictorContextMessage[],
  ) {
    try {
      const endpoint = await resolveCached(settings)
      const controller = new AbortController()
      this.abort = controller
      const raw = await this.request(
        endpoint,
        prefix,
        settings.max_tokens ?? PREDICTOR_DEFAULT_MAX_TOKENS,
        controller.signal,
        context?.() ?? [],
      )
      if (gen !== this.generation) return
      const prediction = postProcessPrediction(raw, prefix)
      if (!prediction) return
      this.stored = { prefix, prediction }
      this.remember(prefix, prediction)
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return
      this.dead = true
      const reason =
        error instanceof PredictorUnavailableError || error instanceof Error
          ? error.message
          : String(error)
      this.onDisabled(reason)
    } finally {
      this.onUpdate()
    }
  }

  /** Consume the next word. Returns the chunk actually inserted (separator included). */
  acceptWord(textBeforeCursor: string, separator: string): string | null {
    const prediction = this.peek(textBeforeCursor)
    if (!prediction) return null
    const next = nextPredictionChunk(prediction)
    if (!next) {
      this.stored = null
      this.onUpdate()
      return null
    }
    const inserted = separator + next.chunk
    this.stored = { prefix: textBeforeCursor + inserted, prediction: next.rest }
    if (!next.rest.trim()) this.stored = null
    this.onUpdate()
    return inserted
  }
}
