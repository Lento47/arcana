import { plugin as registerBunPlugin, type BunPlugin } from "bun"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

const parent = import.meta.resolve("../packages/tui/src/app.tsx")

// Resolve the Solid plugin from the TUI package's own node_modules first:
// `import.meta.resolve` in workspace mode does not walk the parent package's
// local node_modules, so a package-local install (Bun workspaces keep catalog
// deps under packages/tui/node_modules) would otherwise be invisible here.
const localPlugin = new URL(
  "../node_modules/@opentui/solid/scripts/solid-plugin.js",
  parent,
)
const pluginPath = existsSync(fileURLToPath(localPlugin))
  ? localPlugin.href
  : import.meta.resolve("@opentui/solid/bun-plugin", parent)

const { default: solidPlugin } = (await import(pluginPath)) as {
  default: BunPlugin
}

function sourcePath(path: string): string {
  const searchIndex = path.indexOf("?")
  const hashIndex = path.indexOf("#")
  const end = [searchIndex, hashIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0]
  return end === undefined ? path : path.slice(0, end)
}

function isSolidJsNodeModule(path: string): boolean {
  return path.includes("/node_modules/solid-js/") || path.includes("\\node_modules\\solid-js\\")
}

function isTuiOrEngine(path: string): boolean {
  return (
    path.includes("/packages/tui/") ||
    path.includes("\\packages\\tui\\") ||
    path.includes("/packages/engine/") ||
    path.includes("\\packages\\engine\\")
  )
}

registerBunPlugin({
  name: "root-tui-test-solid",
  setup(build) {
    const wrapHandler =
      (handler: (args: { path: string }) => Promise<unknown> | unknown) =>
      async (args: { path: string }) => {
        const src = sourcePath(args.path)
        if (!isTuiOrEngine(src) && !isSolidJsNodeModule(src)) return undefined
        return handler(args)
      }

    solidPlugin.setup({
      ...build,
      onLoad(filter, handler) {
        return build.onLoad(filter, wrapHandler(handler))
      },
    })
  },
})

// Engine tests rely on an isolated environment (XDG dirs, test home, managed
// config dir, in-memory DB, workspace trust, cleared provider credentials).
// Running `bun test packages/engine` from the repo root uses this root
// preload instead of packages/engine/test/preload.ts; without the engine
// preload the tests silently read the real user config/home and treat every
// tmpdir worktree as untrusted, which strips agent/plugin config and breaks
// suites that depend on the test environment. Load it here so root runs are
// equivalent to package-local runs. Module caching keeps initProjectors
// single-shot and afterAll hooks stay scoped to the test process.
await import("../packages/engine/test/preload.ts")
