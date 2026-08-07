import { defineConfig, PluginOption } from "vite"
import { solidStart } from "@solidjs/start/config"
import { nitro } from "nitro/vite"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"

/**
 * Nitro adds the `wasm`/`unwasm` export conditions to the Vite resolver, so
 * shiki's `import("shiki/wasm")` (from `bundle-full.mjs` / `bundle-web.mjs`)
 * resolves to the raw `shiki/dist/onig.wasm` asset. Vite cannot bundle that
 * form ("ESM integration proposal for Wasm" is not supported). Route it back
 * to shiki's JS-inlined wasm module — the same binary embedded as base64 — so
 * no `.wasm` file ever reaches the bundler and the highlighter keeps working.
 */
function shikiWasmShim(): PluginOption {
  return {
    name: "arcana:shiki-wasm-shim",
    enforce: "pre",
    resolveId(source, importer) {
      if (
        source === "shiki/wasm" &&
        importer?.replaceAll("\\", "/").includes("/shiki/dist/")
      ) {
        return path.resolve(path.dirname(importer), "wasm.mjs")
      }
      return null
    },
  }
}

const nitroConfig: any = (() => {
  const target = process.env.ARCANA_DEPLOYMENT_TARGET
  if (target === "cloudflare") {
    return {
      compatibilityDate: "2024-09-19",
      preset: "cloudflare-module",
      cloudflare: {
        nodeCompat: true,
      },
    }
  }
  return {}
})()

export default defineConfig({
  plugins: [
    shikiWasmShim(),
    tailwindcss(),
    solidStart() as PluginOption,
    nitro({
      ...nitroConfig,
      baseURL: process.env.ARCANA_BASE_URL,
    }),
  ],
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    port: 3002,
  },
  worker: {
    format: "es",
  },
})
