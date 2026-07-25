import { cmd } from "./cmd"
import { UI } from "../ui"
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs"
import { join, basename } from "node:path"
import { homedir } from "node:os"
import { execSync } from "node:child_process"

const REGISTRY_URL =
  "https://raw.githubusercontent.com/otnel/arcana-plugins/master/plugins.json"
const REPO_URL = "https://github.com/otnel/arcana-plugins.git"
const PLUGINS_DIR = join(homedir(), ".arcana", "plugins")

interface PluginEntry {
  name: string
  description: string
  version: string
  author: string
  repository: string
  directory: string
  tags: string[]
  tui: boolean
  tools: boolean
}

interface RegistryIndex {
  version: string
  plugins: PluginEntry[]
}

async function fetchRegistry(): Promise<RegistryIndex | null> {
  try {
    const res = await fetch(REGISTRY_URL)
    if (!res.ok) return null
    return (await res.json()) as RegistryIndex
  } catch {
    return null
  }
}

function findPlugin(registry: RegistryIndex, name: string): PluginEntry | undefined {
  const normalized = name.toLowerCase()
  return registry.plugins.find(
    (p) =>
      p.name.toLowerCase() === normalized ||
      p.name.toLowerCase() === `arcana-plugin-${normalized}`,
  )
}

export const PluginStoreCommand = cmd({
  command: "plugin-store",
  describe: "browse, install, and publish arcana plugins",
  builder: (yargs) =>
    yargs
      .command({
        command: "search [query]",
        describe: "search for plugins in the registry",
        builder: (y) =>
          y.positional("query", { describe: "search query", type: "string" }),
        async handler(args: any) {
          const q = (args.query ?? "").toLowerCase()
          UI.println("🔍 Fetching plugin registry...")
          const registry = await fetchRegistry()
          if (!registry) {
            UI.println("❌ Could not reach plugin registry. Try again later.")
            return
          }
          const filtered = q
            ? registry.plugins.filter(
                (p) =>
                  p.name.toLowerCase().includes(q) ||
                  p.description.toLowerCase().includes(q) ||
                  p.tags.some((t) => t.toLowerCase().includes(q)),
              )
            : registry.plugins
          if (filtered.length === 0) {
            UI.println(`No plugins found${q ? ` for "${args.query}"` : ""}.`)
            UI.println(`Visit ${REPO_URL} to contribute one.`)
            return
          }
          UI.println(`Found ${filtered.length} plugin(s):\n`)
          for (const p of filtered) {
            const badges = [
              p.tui ? "TUI" : "",
              p.tools ? "tools" : "",
            ]
              .filter(Boolean)
              .join(" · ")
            UI.println(`  ${p.name} ${UI.Style.TEXT_DIM}v${p.version}${UI.Style.TEXT_NORMAL}`)
            UI.println(`  ${p.description}`)
            UI.println(
              `  ${UI.Style.TEXT_DIM}${badges} · ${p.author}${UI.Style.TEXT_NORMAL}`,
            )
            UI.println()
          }
          UI.println(`Install: arcana plugin-store install <name>`)
        },
      })
      .command({
        command: "install <name>",
        describe: "install a plugin from the registry",
        builder: (y) =>
          y.positional("name", { describe: "plugin name", type: "string" }),
        async handler(args: any) {
          const name = String(args.name)
          UI.println(`📦 Installing ${name}...`)
          const registry = await fetchRegistry()
          if (!registry) {
            UI.println("❌ Could not reach plugin registry.")
            return
          }
          const plugin = findPlugin(registry, name)
          if (!plugin) {
            UI.println(
              `❌ Plugin "${name}" not found in registry. Try: arcana plugin-store search`,
            )
            return
          }

          const dest = join(PLUGINS_DIR, plugin.name)
          mkdirSync(PLUGINS_DIR, { recursive: true })

          // Clone from GitHub — sparse checkout just the plugin directory
          if (existsSync(dest)) {
            UI.println(`⚠️  ${plugin.name} already exists at ${dest}`)
            UI.println("   Remove it first or use: arcana plugin-store update")
            return
          }

          try {
            // Clone with sparse-checkout for just this plugin
            execSync(
              `git clone --depth 1 --filter=blob:none --sparse ${REPO_URL} "${dest}"`,
              { stdio: "pipe" },
            )
            execSync(`git -C "${dest}" sparse-checkout set "${plugin.directory}"`, {
              stdio: "pipe",
            })
            // Move contents from plugins/{name} to root
            const pluginDir = join(dest, plugin.directory)
            if (existsSync(pluginDir)) {
              const files = execSync(`ls -A "${pluginDir}"`, { encoding: "utf8" })
                .trim()
                .split("\n")
                .filter(Boolean)
              for (const f of files) {
                execSync(
                  `mv "${join(pluginDir, f)}" "${join(dest, f)}"`,
                  { stdio: "pipe" },
                )
              }
              execSync(`rm -rf "${join(dest, "plugins")}" "${join(dest, ".git")}"`, {
                stdio: "pipe",
              })
            }
          } catch (e: any) {
            UI.println(`❌ Failed to install: ${e.message}`)
            // Clean up partial
            try {
              execSync(`rm -rf "${dest}"`, { stdio: "pipe" })
            } catch {}
            return
          }

          UI.println(`✅ Installed ${plugin.name} v${plugin.version} at ${dest}`)
          UI.println("   Restart Arcana to load the plugin.")
        },
      })
      .command({
        command: "create <name>",
        describe: "scaffold a new plugin from the template",
        builder: (y) =>
          y.positional("name", { describe: "plugin name", type: "string" }),
        async handler(args: any) {
          const name = String(args.name)
          const dir = join(PLUGINS_DIR, name)
          mkdirSync(dir, { recursive: true })

          const pkgName = name.startsWith("arcana-plugin-") ? name : `arcana-plugin-${name}`
          writeFileSync(
            join(dir, "package.json"),
            JSON.stringify(
              {
                name: pkgName,
                version: "0.1.0",
                description: "My Arcana plugin",
                type: "module",
                main: "src/index.ts",
                files: ["src"],
                keywords: ["arcana", "arcana-plugin"],
                author: "",
                license: "MIT",
                peerDependencies: { "@arcana/plugin": "^1.17.0" },
                devDependencies: { "@arcana/plugin": "^1.17.0" },
              },
              null,
              2,
            ),
            "utf8",
          )
          mkdirSync(join(dir, "src"), { recursive: true })
          writeFileSync(
            join(dir, "src", "index.ts"),
            [
              'import type { TuiPlugin } from "@arcana/plugin/tui"',
              "",
              `/**`,
              ` * ${name} — Arcana plugin`,
              ` */`,
              `const tui: TuiPlugin = async (api) => {`,
              `  api.keymap.registerLayer({`,
              `    commands: [{`,
              `      name: "myplugin.hello",`,
              `      title: "${name}: Hello",`,
              `      category: "${name}",`,
              `      namespace: "palette",`,
              `      run() {`,
              `        api.ui.toast({ message: "${name} says hello! 👋" })`,
              `      },`,
              `    }],`,
              `  })`,
              `}`,
              ``,
              `export default tui`,
            ].join("\n"),
            "utf8",
          )

          UI.println(`✅ Created ${pkgName} at ${dir}`)
          UI.println("   Edit src/index.ts and restart Arcana to load it.")
          UI.println(`   To share: publish to npm and add to ${REPO_URL}`)
        },
      })
      .command({
        command: "publish <name>",
        describe: "publish a plugin to the registry",
        builder: (y) =>
          y.positional("name", { describe: "plugin name", type: "string" }),
        async handler(_args: any) {
          UI.println("📤 Publishing a plugin to the registry:")
          UI.println()
          UI.println("  1. Publish your package to npm:")
          UI.println("     npm publish")
          UI.println()
          UI.println("  2. Fork and clone the registry:")
          UI.println(`     git clone ${REPO_URL}`)
          UI.println()
          UI.println("  3. Add your plugin to plugins.json:")
          UI.println("     {")
          UI.println('       "name": "your-package-name",')
          UI.println('       "description": "What it does",')
          UI.println('       "version": "0.1.0",')
          UI.println('       "author": "you",')
          UI.println(`       "repository": "${REPO_URL}",`)
          UI.println('       "directory": "plugins/your-plugin",')
          UI.println('       "tags": ["example"],')
          UI.println('       "tui": true,')
          UI.println('       "tools": false')
          UI.println("     }")
          UI.println()
          UI.println("  4. Submit a PR to add your plugin")
          UI.println()
          UI.println(`  Once merged, users can: arcana plugin-store install your-package`)
        },
      })
      .demandCommand(),
  async handler() {},
})
