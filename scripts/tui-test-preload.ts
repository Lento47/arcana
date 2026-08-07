import { plugin as registerBunPlugin, type BunPlugin } from "bun"

const parent = import.meta.resolve("../packages/tui/src/app.tsx")
const pluginPath = import.meta.resolve("@opentui/solid/bun-plugin", parent)

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
