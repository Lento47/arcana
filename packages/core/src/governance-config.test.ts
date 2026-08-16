import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"
import {
  DEFAULT_GOVERNANCE_CONFIG,
  loadGovernanceConfig,
  normalizeGovernanceConfig,
  resolveGovernanceConfig,
  shouldForwardGovernanceEventToDesktop,
  shouldShowGovernanceEvent,
  writeGovernanceConfigYaml,
} from "./governance-config"

function withTempWorkspace(run: (directory: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), "arcana-governance-"))
  try {
    run(directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe("governance config", () => {
  test("keeps governance rows out of the TUI by default while the desktop stream stays on", () => {
    expect(DEFAULT_GOVERNANCE_CONFIG.display.tui.enabled).toBe(false)
    expect(DEFAULT_GOVERNANCE_CONFIG.display.desktop.enabled).toBe(true)
    expect(shouldShowGovernanceEvent(DEFAULT_GOVERNANCE_CONFIG, "authorization.allowed")).toBe(false)
    expect(shouldForwardGovernanceEventToDesktop(DEFAULT_GOVERNANCE_CONFIG, "authorization.allowed")).toBe(true)
  })

  test("does not share mutable default arrays with normalized configs", () => {
    const defaultsBefore = {
      hidden: [...DEFAULT_GOVERNANCE_CONFIG.display.tui.hideEventTypes],
      included: [...DEFAULT_GOVERNANCE_CONFIG.display.desktop.includePrefixes],
    }
    const config = normalizeGovernanceConfig({})

    config.display.tui.hideEventTypes.push("mutated.type")
    config.display.desktop.includePrefixes.length = 0

    expect(DEFAULT_GOVERNANCE_CONFIG.display.tui.hideEventTypes).toEqual(defaultsBefore.hidden)
    expect(DEFAULT_GOVERNANCE_CONFIG.display.desktop.includePrefixes).toEqual(defaultsBefore.included)
  })

  test("normalizes partial YAML/JSON input back to a complete config", () => {
    const config = normalizeGovernanceConfig({
      display: {
        tui: { enabled: true, hideEventTypes: ["verification.*"] },
        desktop: { includePrefixes: ["authorization."], excludePrefixes: ["authorization.debug"] },
      },
      policy: { approvalRoute: "DESKTOP_REQUIRED" },
    })
    expect(config.display.tui.collapseGovernanceGroups).toBe(true)
    expect(config.display.tui.collapseThreshold).toBe(12)
    expect(config.display.desktop.enabled).toBe(true)
    expect(config.policy.approvalRoute).toBe("DESKTOP_REQUIRED")
  })

  test("applies exact, prefix, trailing-star, and catch-all display filters", () => {
    const config = normalizeGovernanceConfig({
      display: {
        tui: { enabled: true, hideEventTypes: ["authorization.executed", "verification.*"] },
        desktop: {
          enabled: true,
          includePrefixes: ["*"],
          excludePrefixes: ["verification.recorded"],
        },
      },
    })
    expect(shouldShowGovernanceEvent(config, "authorization.executed")).toBe(false)
    expect(shouldShowGovernanceEvent(config, "verification.recorded")).toBe(false)
    expect(shouldShowGovernanceEvent(config, "authorization.allowed")).toBe(true)
    expect(shouldForwardGovernanceEventToDesktop(config, "contract.proposed")).toBe(true)
    expect(shouldForwardGovernanceEventToDesktop(config, "verification.recorded")).toBe(false)
  })

  test("writes and reloads a workspace YAML round-trip without losing controls", () => {
    withTempWorkspace((directory) => {
      const config = normalizeGovernanceConfig({
        display: {
          tui: { enabled: false, collapseThreshold: 5 },
          desktop: { enabled: true, includePrefixes: ["contract.", "claim."] },
        },
      })
      const savedPath = writeGovernanceConfigYaml(directory, config)
      const loaded = loadGovernanceConfig(directory)
      expect(loaded.path).toBe(savedPath)
      expect(loaded.config.display.tui.enabled).toBe(false)
      expect(loaded.config.display.tui.collapseThreshold).toBe(5)
      expect(loaded.config.display.desktop.includePrefixes).toEqual(["contract.", "claim."])
    })
  })

  test("keeps explicitly cleared TUI and desktop filters empty after reload", () => {
    withTempWorkspace((directory) => {
      const config = normalizeGovernanceConfig({
        display: {
          tui: { enabled: true, hideEventTypes: [] },
          desktop: { enabled: true, includePrefixes: [], excludePrefixes: [] },
        },
      })
      writeGovernanceConfigYaml(directory, config)
      const loaded = loadGovernanceConfig(directory)

      expect(loaded.config.display.tui.hideEventTypes).toEqual([])
      expect(loaded.config.display.desktop.includePrefixes).toEqual([])
      expect(loaded.config.display.desktop.excludePrefixes).toEqual([])
      expect(shouldShowGovernanceEvent(loaded.config, "authorization.executed")).toBe(true)
      expect(shouldForwardGovernanceEventToDesktop(loaded.config, "contract.proposed")).toBe(false)
    })
  })

  test("fills omitted filters from defaults while preserving policy overrides", () => {
    withTempWorkspace((directory) => {
      const config = normalizeGovernanceConfig({
        policy: { approvalRoute: "DESKTOP_REQUIRED" },
      })
      writeGovernanceConfigYaml(directory, config)
      const loaded = loadGovernanceConfig(directory)

      expect(loaded.config.display.tui.hideEventTypes).toEqual(
        DEFAULT_GOVERNANCE_CONFIG.display.tui.hideEventTypes,
      )
      expect(loaded.config.display.desktop.includePrefixes).toEqual(
        DEFAULT_GOVERNANCE_CONFIG.display.desktop.includePrefixes,
      )
      expect(loaded.config.policy.approvalRoute).toBe("DESKTOP_REQUIRED")
    })
  })

  test("preserves global display overrides when a workspace config omits them", () => {
    const globalDir = mkdtempSync(join(tmpdir(), "arcana-governance-global-"))
    try {
      writeFileSync(
        join(globalDir, "governance.yml"),
        [
          "version: 1",
          "display:",
          "  tui:",
          "    enabled: true",
          "    collapseGovernanceGroups: false",
          "  desktop:",
          "    enabled: false",
          "    includePrefixes:",
          '      - "contract."',
          "",
        ].join("\n"),
        "utf8",
      )

      withTempWorkspace((directory) => {
        mkdirSync(join(directory, ".arcana"), { recursive: true })
        writeFileSync(
          join(directory, ".arcana", "governance.yml"),
          "version: 1\npolicy:\n  approvalRoute: DESKTOP_REQUIRED\n",
          "utf8",
        )
        const loaded = loadGovernanceConfig(directory, globalDir)

        expect(loaded.config.display.tui.enabled).toBe(true)
        expect(loaded.config.display.tui.collapseGovernanceGroups).toBe(false)
        expect(loaded.config.display.desktop.enabled).toBe(false)
        expect(loaded.config.display.desktop.includePrefixes).toEqual(["contract."])
        expect(loaded.config.policy.approvalRoute).toBe("DESKTOP_REQUIRED")
      })
    } finally {
      rmSync(globalDir, { recursive: true, force: true })
    }
  })

  test("resolves a partial update over the existing config without resetting fields", () => {
    const base = normalizeGovernanceConfig({
      display: {
        tui: { enabled: true, hideEventTypes: ["contract.proposed"] },
        desktop: { enabled: false, includePrefixes: ["claim."] },
      },
    })
    const next = resolveGovernanceConfig(base, {
      policy: { approvalRoute: "DESKTOP_REQUIRED" },
    })

    expect(next.display.tui.enabled).toBe(true)
    expect(next.display.tui.hideEventTypes).toEqual(["contract.proposed"])
    expect(next.display.desktop.enabled).toBe(false)
    expect(next.display.desktop.includePrefixes).toEqual(["claim."])
    expect(next.policy.approvalRoute).toBe("DESKTOP_REQUIRED")
  })
})
