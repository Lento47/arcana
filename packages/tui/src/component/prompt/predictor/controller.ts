import {
  PREDICTOR_DEFAULT_DEBOUNCE_MS,
  PREDICTOR_DEFAULT_MAX_TOKENS,
  isPredictionFresh,
  nextPredictionChunk,
  postProcessPrediction,
  shouldPredict,
  type PredictorSettings,
} from "./predict"
import { PredictorUnavailableError, requestPrediction, resolveCached } from "./client"

export interface PredictorInputState {
  text: string
  cursorOffset: number
  autocompleteVisible: boolean
  busy?: boolean
}

interface StoredPrediction {
  prefix: string
  prediction: string
}

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

  /** Called after every settle (result stored or failed) and every invalidation. */
  onUpdate: () => void = () => {}
  /** Called once when the predictor gives up for the session. */
  onDisabled: (reason: string) => void = () => {}

  constructor(private settings: () => PredictorSettings | null) {}

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

    const gen = this.generation
    this.timer = setTimeout(() => {
      void this.run(gen, settings, prefix)
    }, settings.debounce_ms ?? PREDICTOR_DEFAULT_DEBOUNCE_MS)
  }

  private async run(gen: number, settings: PredictorSettings, prefix: string) {
    try {
      const endpoint = await resolveCached(settings)
      const controller = new AbortController()
      this.abort = controller
      const raw = await requestPrediction(
        endpoint,
        prefix,
        settings.max_tokens ?? PREDICTOR_DEFAULT_MAX_TOKENS,
        controller.signal,
      )
      if (gen !== this.generation) return
      const prediction = postProcessPrediction(raw, prefix)
      if (prediction) this.stored = { prefix, prediction }
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
