/**
 * Root-level OpenTUI Solid transform preload.
 *
 * Bun only applies the nearest bunfig.toml for the process cwd. When launching
 * Arcana TUI from the monorepo root, package-level preloads in packages/engine
 * are skipped — without the Solid transform, context providers fail at runtime
 * (e.g. "TuiStartupProvider is missing").
 *
 * Resolve @opentui/solid via a packages/tui source file so this works from the
 * repo root without adding OpenTUI to the root package.json.
 */
const parent = import.meta.resolve("../packages/tui/src/app.tsx")
const preloadUrl = import.meta.resolve("@opentui/solid/preload", parent)
await import(preloadUrl)
