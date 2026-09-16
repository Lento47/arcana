import { getTreeSitterClient } from "@opentui/core"

/**
 * Treesitter warm-up for the streamed bodies that must paint styled on their
 * first visible frame (see script/patch-opentui.ts "paint styled first frame").
 *
 * The parser worker is spawned lazily on the first highlight request, and each
 * filetype compiles its wasm/queries on first use. Streaming a code block while
 * that happens would hold its first paint for the whole cold start, so the
 * common filetypes are warmed in the background once the first screen settles.
 * Warming is best-effort: an unknown or uncached filetype stays cold and the
 * leaf's deadline fallback still keeps content visible.
 */
const PREWARM_FILETYPES = [
  "markdown",
  "typescript",
  "typescriptreact",
  "javascript",
  "javascriptreact",
  "python",
  "bash",
  "diff",
] as const

const PREWARM_DELAY_MS = 1_500

let scheduled = false

async function prewarm() {
  const client = getTreeSitterClient()
  await client.initialize()
  for (const filetype of PREWARM_FILETYPES) {
    try {
      await client.preloadParser(filetype)
    } catch {
      // Best effort — the deadline paint covers a parser that never loads.
    }
  }
}

/**
 * Schedule a one-shot tree-sitter warm-up after the first screen has settled.
 * Returns a cancel function for the caller's process scope. Idempotent.
 */
export function scheduleTreeSitterPrewarm(): () => void {
  if (scheduled) return () => {}
  scheduled = true
  const timer = setTimeout(() => {
    void prewarm().catch(() => {
      // The worker is unusable; highlighting falls back to the deadline paint.
    })
  }, PREWARM_DELAY_MS)
  return () => clearTimeout(timer)
}
