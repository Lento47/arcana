import { afterEach, describe, expect, test } from "bun:test"
import { buildAppCommands, buildEngineCliCommand, buildMlConsentArgs } from "../src/app-commands"

/**
 * Command-parity registry tests: the documented Arcana verbs must be
 * reachable as palette/slash commands, and the bridge runner must build
 * engine CLI invocations correctly.
 */

function makeDeps(): Parameters<typeof buildAppCommands>[0] {
  return {
    dialog: { replace() {}, clear() {} },
    sync: {
      data: { session: [], console_state: {} },
      session: { get() { return undefined }, refresh: async () => {} },
    },
    local: {
      agent: { current() { return undefined }, set() {}, cycle() {}, cycleFavorite() {} },
      model: { variant: { list() { return [] }, cycle() {} }, current() { return undefined }, cycleFavorite() {}, cycleRecent() {} },
    },
    kv: { get() {}, set() {} },
    route: { data: { type: "session", sessionID: "ses_test" }, sessionID: "ses_test" },
    sdk: {},
    toast: { show() {}, error() {} },
    renderer: { toggleDebugOverlay() {}, console: { toggle() {} }, suspend() {}, resume() {}, setTerminalTitle() {} },
    exit() {},
    clipboard: {},
    pluginHost: {} as any,
    currentWorktreeWorkspace: () => undefined,
    connected: () => false,
    mlRuntimeEnabled: () => false,
    setMlRuntimeEnabled: () => {},
    terminalTitleEnabled: () => false,
    setTerminalTitleEnabled: () => {},
    pasteSummaryEnabled: () => true,
    setPasteSummaryEnabled: () => {},
    mode: () => "dark",
    setMode: () => {},
    locked: () => false,
    lock() {},
    unlock() {},
  } as any
}

describe("bridged CLI command parity", () => {
  afterEach(() => {})

  // /compact ships in the per-session command registry (session-commands.tsx),
  // not the app palette — asserted separately there.
  const REQUIRED_SLASHES = [
    "stats",
    "proof",
    "license",
    "proxy",
    "audit",
    "epistemic",
    "trust",
    "doctor",
    "cron",
    "memory",
    "mode",
  ]

  function slashMap(commands: Array<{ slashName?: string; slashAliases?: string[]; name: string }>) {
    const bySlash = new Map<string, string>()
    for (const c of commands) {
      if (c.slashName) bySlash.set(c.slashName, c.name)
      for (const alias of c.slashAliases ?? []) bySlash.set(alias, c.name)
    }
    return bySlash
  }

  test("every documented arcana slash resolves to a palette command", () => {
    const commands = buildAppCommands(makeDeps()) as Array<{ slashName?: string; slashAliases?: string[]; name: string }>
    const bySlash = slashMap(commands)
    for (const slash of REQUIRED_SLASHES) {
      expect(bySlash.has(slash)).toBe(true)
    }
  })

  test("slash names and aliases are unique across the registry", () => {
    const commands = buildAppCommands(makeDeps()) as Array<{ slashName?: string; slashAliases?: string[]; name: string }>
    const slashes = commands.flatMap((c) => [c.slashName, ...(c.slashAliases ?? [])]).filter(Boolean)
    expect(new Set(slashes).size).toBe(slashes.length)
  })

  test("new arcana commands are read-only runner verbs in the Arcana category", () => {
    const commands = buildAppCommands(makeDeps()) as Array<{ name: string; category?: string }>
    for (const name of ["stats.show", "proof.inspect", "license.status", "proxy.status", "audit.status", "epistemic.proof", "trust.status", "doctor.run", "cron.list", "memory.facts"]) {
      const cmd = commands.find((c) => c.name === name)
      expect(cmd).toBeDefined()
      expect(cmd!.category).toBe("Arcana")
    }
  })
})

describe("engine CLI arg builder", () => {
  test("builds bun invocation with browser conditions and verb args", () => {
    const entry = "/engine/src/index.ts"
    const cmd = buildEngineCliCommand("proof", ["inspect", "ses_1"], entry)
    expect(cmd[0]).toBe("bun")
    expect(cmd).toContain("--conditions=browser")
    expect(cmd[2]).toBe(entry)
    expect(cmd.slice(3)).toEqual(["proof", "inspect", "ses_1"])
  })

  test("supports verbs without extra args", () => {
    const cmd = buildEngineCliCommand("stats")
    expect(cmd[cmd.length - 1]).toBe("stats")
  })

  test("adds explicit confirmation only to GUI consent grants", () => {
    expect(buildMlConsentArgs("grant", "workspace")).toEqual([
      "consent",
      "grant",
      "--scope",
      "workspace",
      "--yes",
    ])
    expect(buildMlConsentArgs("revoke", "workspace")).toEqual([
      "consent",
      "revoke",
      "--scope",
      "workspace",
    ])
    expect(buildMlConsentArgs("inherit", "workspace")).toEqual([
      "consent",
      "inherit",
      "--scope",
      "workspace",
    ])
  })
})
