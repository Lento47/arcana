import type { CommandModule } from "yargs"
import { readFileSync, existsSync, mkdirSync, readdirSync } from "node:fs"
import { atomicWriteSync } from "../../util/atomic-write"
import { join, dirname } from "node:path"
import { homedir } from "node:os"

const TUI_CONFIG = join(homedir(), ".config", "arcana", "tui.json")

type ThemeModule = typeof import("@arcana/tui/theme")
type ThemeJson = import("@arcana/tui/theme").ThemeJson

async function themeModule(): Promise<ThemeModule> {
  // Lazy so every other command does not pay the TUI dependency cost.
  return import("@arcana/tui/theme")
}

/** Custom theme directories: global config plus `.arcana`/`.opencode` up the tree. */
function customThemeDirs() {
  const dirs = [join(homedir(), ".config", "arcana", "themes")]
  let current = process.cwd()
  for (;;) {
    dirs.push(join(current, ".arcana", "themes"), join(current, ".opencode", "themes"))
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return dirs
}

/** Register discovered custom themes so `extends` chains and lint resolve. */
async function loadThemes() {
  const { addTheme, allThemes, isTheme } = await themeModule()
  for (const dir of customThemeDirs()) {
    if (!existsSync(dir)) continue
    let files: string[]
    try {
      files = readdirSync(dir)
    } catch {
      continue
    }
    for (const file of files) {
      if (!file.endsWith(".json")) continue
      try {
        const parsed = JSON.parse(readFileSync(join(dir, file), "utf8")) as unknown
        if (isTheme(parsed)) addTheme(file.slice(0, -".json".length), parsed)
      } catch {}
    }
  }
  return allThemes()
}

function readConfig(): Record<string, unknown> {
  if (!existsSync(TUI_CONFIG)) return {}
  try {
    return JSON.parse(readFileSync(TUI_CONFIG, "utf8")) as Record<string, unknown>
  } catch {
    return {}
  }
}

function currentTheme() {
  const config = readConfig()
  return typeof config.theme === "string" ? config.theme : "arcana"
}

function writeTheme(name: string) {
  const config = readConfig()
  config.theme = name
  mkdirSync(dirname(TUI_CONFIG), { recursive: true })
  atomicWriteSync(TUI_CONFIG, JSON.stringify(config, null, 2))
}

function hex(color: { toInts(): number[] }) {
  return (
    "#" +
    color
      .toInts()
      .slice(0, 3)
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")
  )
}

function summarize(adjustments: Array<{ token: string }>) {
  return adjustments.length ? `${adjustments.length} lift(s)` : "floor-clean"
}

export const ThemeCommand: CommandModule = {
  command: "theme [action] [theme]",
  describe: "list, inspect, lint and set arcana themes",
  builder: (yargs) =>
    yargs
      .positional("action", { choices: ["list", "set", "inspect", "lint"] as const, default: "list" as const })
      .positional("theme", { type: "string", describe: "theme name (set/inspect)" })
      .option("name", { alias: "n", type: "string", describe: "theme name (set/inspect)" }),
  async handler(args) {
    const action = String(args.action ?? "list")
    const { inspectTheme, lintTheme, themeCharacter } = await themeModule()
    const themes = await loadThemes()
    const names = Object.keys(themes).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    const name = String(args.name ?? args.theme ?? "")

    if (action === "set") {
      if (!name) {
        console.error("--name required. Choices: " + names.join(", "))
        process.exit(1)
      }
      if (!themes[name]) {
        console.error(`Unknown theme "${name}". Choices: ` + names.join(", "))
        process.exit(1)
      }
      writeTheme(name)
      console.log(`Theme set to "${name}". Restart arcana to apply.`)
      return
    }

    if (action === "inspect") {
      const theme: ThemeJson | undefined = themes[name]
      if (!theme) {
        console.error(`Unknown theme "${name}". Choices: ` + names.join(", "))
        process.exit(1)
      }
      console.log(`${name} — ${themeCharacter(name, theme)}\n`)
      for (const mode of ["dark", "light"] as const) {
        try {
          const full = inspectTheme(theme, mode, { mono: "full" })
          const authored = inspectTheme(theme, mode, { mono: "off" })
          const belowBand = full.apca.filter((reading) => !reading.passes)
          const apca = belowBand.length ? `${belowBand.length} below band` : "all bands met"
          console.log(
            `${mode.padEnd(5)}  mono full: ${summarize(full.adjustments)} · APCA: ${apca} · authored: ${summarize(authored.adjustments)}`,
          )
          for (const reading of belowBand) {
            console.log(
              `  ${mode.padEnd(5)} ${String(reading.token).padEnd(24)} Lc ${reading.lc.toFixed(1)} < ${reading.threshold} (${reading.band})`,
            )
          }
        } catch (error) {
          console.log(`${mode.padEnd(5)}  resolution failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      const issues = lintTheme(name, theme)
      if (issues.length) {
        console.log("\nlint:")
        for (const issue of issues) console.log(`  ${issue.level}: ${issue.message}`)
      } else {
        console.log("\nlint: clean")
      }
      // Detail the authored lifts: those are the colors the floor overrides.
      const lifts = (["dark", "light"] as const).flatMap((mode) => {
        try {
          return inspectTheme(theme, mode, { mono: "off" }).adjustments.map((adjustment) => ({ mode, adjustment }))
        } catch {
          return []
        }
      })
      if (lifts.length) {
        console.log("\nfloor adjustments on the authored palette:")
        for (const { mode, adjustment } of lifts) {
          console.log(
            `  ${mode.padEnd(5)} ${String(adjustment.token).padEnd(24)} ${adjustment.required.toFixed(1)}:1  ${hex(adjustment.before)} -> ${hex(adjustment.after)}`,
          )
        }
      }
      return
    }

    if (action === "lint") {
      let dirty = 0
      let errors = 0
      for (const themeName of names) {
        const issues = lintTheme(themeName, themes[themeName]!)
        if (!issues.length) continue
        dirty++
        errors += issues.filter((issue) => issue.level === "error").length
        console.log(`${themeName}:`)
        for (const issue of issues) console.log(`  ${issue.level}: ${issue.message}`)
      }
      if (!dirty) {
        console.log(`${names.length} themes lint clean`)
        return
      }
      if (errors) process.exit(1)
      return
    }

    // list
    const current = currentTheme()
    console.log(`${names.length} themes:\n`)
    for (const themeName of names) {
      const character = themeCharacter(themeName, themes[themeName]!)
      const marker = themeName === current ? "\u25C6" : " "
      console.log(`  ${marker} ${themeName.padEnd(12)} ${character}${themeName === current ? "  \u2190 active" : ""}`)
    }
    console.log("\n  arcana theme set <name>       to switch")
    console.log("  arcana theme inspect <name>   to see the resolved ramp")
    console.log("  arcana theme lint             to validate custom themes")
  },
}
