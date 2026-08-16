import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"
import {
  DEFAULT_GOVERNANCE_CONFIG,
  loadGovernanceConfig,
  normalizeGovernanceConfig,
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
})
