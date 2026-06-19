#!/usr/bin/env bun
/**
 * Fast prebuild: bundles opencode/src/index.ts into a cached .js bundle for faster startup.
 * Bun JIT-compiling 100s of TS files on every launch is the #1 startup bottleneck (~10-15s).
 * This produces a single bundled JS file that bun can run with minimal compilation overhead.
 *
 * Usage: bun packages/opencode/script/prebuild.ts
 * Output: packages/opencode/.prebuild/index.bun.js
 */
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dir = path.resolve(__dirname, "..")

const outdir = path.join(dir, ".prebuild")
const entry = path.join(dir, "src/index.ts")

// Ensure bunfig.toml preloads (@opentui/solid/preload) are active
const start = performance.now()
console.log("Prebuilding opencode entry…")

const result = await Bun.build({
  entrypoints: [entry],
  outdir,
  target: "bun",
  format: "esm",
  conditions: ["browser"],
  sourcemap: "none",
  minify: false,
  naming: "[dir]/index.bun.[ext]",
  // Keep external packages as imports (faster than bundling everything)
  external: ["@arcana/*", "@opentui/*", "yargs", "zod", "solid-js", "effect", "ai", "hono"],
})

if (!result.success) {
  console.error("Prebuild failed:")
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

const elapsed = ((performance.now() - start) / 1000).toFixed(1)
console.log(`Prebuild done in ${elapsed}s → ${path.relative(dir, outdir)}/index.bun.js`)
