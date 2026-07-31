/**
 * Ensure OpenTUI's Solid JSX transform is registered before any TUI .tsx loads.
 *
 * Relying only on bunfig `preload` is brittle: package-level bunfig is ignored
 * when bun is launched from the monorepo root (or any other cwd). Without the
 * transform, Solid context providers break at runtime
 * ("TuiStartupProvider is missing") and the TUI exits immediately.
 */
let ensured = false

export async function ensureSolidPreload(): Promise<void> {
  if (ensured) return
  ensured = true

  try {
    // Prefer package export resolution (works when engine deps are installed).
    await import("@opentui/solid/preload")
    return
  } catch {
    // Fall through — resolve via @arcana/tui's dependency graph.
  }

  try {
    const parent = import.meta.resolve("@arcana/tui")
    const preloadUrl = import.meta.resolve("@opentui/solid/preload", parent)
    await import(preloadUrl)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(
      `[arcana] failed to load OpenTUI Solid preload (TUI may crash):\n  ${message}\n` +
        `  fix: run from repo after bun install, or ensure @opentui/solid is installed\n`,
    )
  }
}
