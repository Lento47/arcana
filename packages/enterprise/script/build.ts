#!/usr/bin/env bun
/**
 * Enterprise (SolidStart) build wrapper.
 *
 * On Windows, Vite/Rollup + bun's `.bun/@solidjs+start@…` store paths strip
 * backslashes (e.g. `L:PROJECTSarcana…`), so `vite build` fails. Skip there
 * so monorepo `bun run build` can still produce engine/TUI binaries.
 * Linux/macOS (CI) run the real Vite build. Force with: bun run build:force
 */
import { $ } from "bun"

if (process.platform === "win32" && process.env.ARCANA_FORCE_ENTERPRISE_BUILD !== "1") {
  console.log("skip enterprise build on Windows (SolidStart path resolution bug)")
  console.log("  override: ARCANA_FORCE_ENTERPRISE_BUILD=1 bun run build  (or bun run build:force)")
  process.exit(0)
}

await $`vite build`
