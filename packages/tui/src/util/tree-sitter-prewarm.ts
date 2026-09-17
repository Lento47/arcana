import { getTreeSitterClient } from "@opentui/core"

/**
 * Treesitter warm-up for the streamed bodies that must paint styled on their
 * first visible frame (see script/patch-opentui.ts "paint styled first frame").
 *
 * The parser worker is spawned lazily on the first highlight request, and each
 * filetype compiles its wasm/queries on first use. A brand-new code leaf whose
 * filetype is warm commits its highlight within a frame, which is what lets the
 * patched CodeRenderable hold the first paint instead of flashing plain text.
 * Warming is best-effort: an unknown filetype has no parser at all and the
 * leaf simply paints plain text.
 */
const PREWARM_FILETYPES = [
  "markdown",
  "markdown_inline",
  "typescript",
  "typescriptreact",
  "ts",
  "tsx",
  "javascript",
  "javascriptreact",
  "js",
  "jsx",
  "zig",
  "python",
  "bash",
  "diff",
] as const

const PREWARM_DELAY_MS = 1_500

let scheduled = false
const warmRequested = new Set<string>()

/**
 * The patched CodeRenderable holds a leaf's first paint only for filetypes the
 * client has already warmed. Marking is what arms that hold; a filetype without
 * a parser must never be marked, or the hold would eat two frames of a plain
 * body for nothing.
 */
function markWarm(client: ReturnType<typeof getTreeSitterClient>, filetype: string): void {
  const bag = client as unknown as { _arcanaWarmFiletypes?: Set<string> }
  ;(bag._arcanaWarmFiletypes ??= new Set()).add(filetype)
}

/**
 * Warm one filetype on first sight — a tool body's path, a fence language —
 * so the compile overlaps model/tool latency instead of the first paint.
 */
export function warmTreeSitterFiletype(filetype: string | undefined | null): void {
  const ft = filetype?.trim()
  if (!ft || warmRequested.has(ft)) return
  warmRequested.add(ft)
  const client = getTreeSitterClient()
  void client
    .preloadParser(ft)
    .then((hasParser) => {
      if (hasParser) markWarm(client, ft)
    })
    .catch(() => {
      // The worker is unusable or the filetype is unknown — plain text is the
      // correct outcome and the never-blank policy covers it.
    })
}

async function prewarm() {
  const client = getTreeSitterClient()
  await client.initialize()
  for (const filetype of PREWARM_FILETYPES) {
    try {
      if (await client.preloadParser(filetype)) markWarm(client, filetype)
    } catch {
      // Best effort — a parser that never loads falls back to plain text.
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
