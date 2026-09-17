import { createMemo, type Setter } from "solid-js"
import { useKV } from "./kv"

export type ThinkingMode = "show" | "hide"

const MODES: readonly ThinkingMode[] = ["show", "hide"] as const

// OpenAI's Responses API surfaces reasoning summaries that start with a bolded
// title block: "**Inspecting PR workflow**\n\n<body>". Treat that first block,
// or a complete title still awaiting its body while streaming, as disclosure
// metadata so the TUI can style its header independently from the markdown body.
export function reasoningSummary(text: string) {
  const content = text.trim()
  const match = content.match(/^\*\*([^*\n]+)\*\*(?:\r?\n\r?\n|$)/)
  if (!match) return { title: null, body: content }
  return { title: match[1].trim(), body: content.slice(match[0].length).trimEnd() }
}

/** Classify a thinking block for header chrome (verb + live vs complete). */
export function classifyThinking(text: string, streaming?: boolean) {
  const { title, body } = reasoningSummary(text)
  const live = streaming === true
  return {
    title,
    body,
    streaming: live,
    verb: live ? "Thinking" : "Thought",
    hasBody: body.trim().length > 0,
    cue: live ? "live" : "done",
  }
}

export function isThinkingMode(value: unknown): value is ThinkingMode {
  return typeof value === "string" && (MODES as readonly string[]).includes(value)
}

/**
 * Resolve the effective thinking mode from stored + legacy values.
 *
 * - Explicit legacy `thinking_visibility === false` still hides.
 * - One-time migration (`migrated === false`): the old build seeded "hide"
 *   into KV via `kv.signal`, so an untouched install reads "hide" too. The
 *   product default is now inline thinking, so that value flips to "show"
 *   once; afterwards a stored "hide" is a real operator choice and sticks.
 * - "minimal" was a legacy store value and stays collapsed.
 */
export function resolveThinkingMode(input: {
  stored: unknown
  legacy: unknown
  migrated: boolean
}): ThinkingMode {
  if (input.legacy === false) return "hide"
  if (input.stored === "minimal") return "hide"
  const storedMode = isThinkingMode(input.stored) ? input.stored : "show"
  if (!input.migrated && (input.stored === undefined || storedMode === "hide")) return "show"
  return storedMode
}

// Cycle order matches the slash command: show → hide → show.
export function nextThinkingMode(current: ThinkingMode): ThinkingMode {
  const idx = MODES.indexOf(current)
  return MODES[(idx + 1) % MODES.length] ?? "show"
}

const INLINE_MIGRATION_KEY = "thinking_inline_default_v1"

export function useThinkingMode() {
  const kv = useKV()
  const [stored, setStored] = kv.signal<ThinkingMode>("thinking_mode", "show")

  // The kv signal exposes its setter typed as `Setter<T>` which carries Solid's
  // overload set; passing an updater fn through a property access loses the
  // bivariance trick the existing `setX((prev) => ...)` callsites rely on.
  // Wrap it in a sane shape so consumers can just call `set(next)` or pass
  // an updater.
  const set = (next: ThinkingMode | ((prev: ThinkingMode) => ThinkingMode)) => {
    if (typeof next === "function") setStored(next as Setter<ThinkingMode>)
    else setStored(() => next)
  }

  const migrated = kv.get(INLINE_MIGRATION_KEY) === true
  const legacy = kv.get("thinking_visibility")

  // One-time flip of the old seeded "hide" default — see resolveThinkingMode.
  if (!migrated) {
    kv.set(INLINE_MIGRATION_KEY, true)
    const resolved = resolveThinkingMode({ stored: stored(), legacy, migrated: false })
    if (resolved !== stored()) set(resolved)
  }

  const mode = createMemo<ThinkingMode>(() =>
    resolveThinkingMode({ stored: stored(), legacy, migrated: true }),
  )

  return {
    mode,
    set,
  }
}
