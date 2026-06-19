import { cmd } from "./cmd"
import { UI } from "../ui"

export const PluginStoreCommand = cmd({
  command: "plugin-store",
  describe: "browse, install, and publish arcana plugins",
  builder: (yargs) =>
    yargs
      .command({
        command: "search [query]",
        describe: "search for plugins in the registry",
        builder: (y) => y.positional("query", { describe: "search query", type: "string" }),
        async handler(args: any) {
          const q = args.query ?? ""
          UI.println(`🔍 Searching for plugins${q ? ": " + q : "..."}`)
          UI.println("Plugin registry coming soon. Run: arcana plugin create to build your own.")
        },
      })
      .command({
        command: "install <name>",
        describe: "install a plugin from the registry",
        builder: (y) => y.positional("name", { describe: "plugin name", type: "string" }),
        async handler(args: any) {
          UI.println(`📦 Installing plugin: ${args.name}`)
          UI.println("Plugin registry coming soon. Manually download plugins to ~/.arcana/plugins/")
        },
      })
      .command({
        command: "create <name>",
        describe: "scaffold a new plugin",
        builder: (y) => y.positional("name", { describe: "plugin name", type: "string" }),
        async handler(args: any) {
          const { mkdirSync, writeFileSync } = await import("node:fs")
          const { join } = await import("node:path")
          const { homedir } = await import("node:os")
          const dir = join(homedir(), ".arcana", "plugins", String(args.name))
          mkdirSync(dir, { recursive: true })
          writeFileSync(join(dir, "index.ts"), [
            'import type { TuiPlugin, TuiPluginApi } from "@arcana/plugin/tui"',
            "",
            `const plugin: TuiPlugin = async (api: TuiPluginApi) => {`,
            `  // Your plugin code here`,
            `  api.slots.register({`,
            `    order: 999,`,
            `    slots: {`,
            `      sidebar_content() {`,
            `        return null`,
            `      },`,
            `    },`,
            `  })`,
            `}`,
            "",
            `export default plugin`,
          ].join("\n"), "utf8")
          UI.println(`✅ Plugin scaffolded at ~/.arcana/plugins/${args.name}/`)
          UI.println("Edit index.ts and restart arcana to load it.")
        },
      })
      .command({
        command: "publish <name>",
        describe: "publish a plugin to the registry",
        builder: (y) => y.positional("name", { describe: "plugin name", type: "string" }),
        async handler(_args: any) {
          UI.println("Plugin publishing coming soon.")
        },
      })
      .demandCommand(),
  async handler() {},
})
