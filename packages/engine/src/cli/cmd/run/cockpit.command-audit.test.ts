import { describe, expect, test } from "bun:test"
import { ARCANA_COCKPIT_COMMANDS, arcanaCockpitCommandEntries, auditCockpitCommandCoverage } from "./cockpit.command-audit"

describe("Arcana cockpit command audit", () => {
  test("defines command entries for every required cockpit command", () => {
    expect(arcanaCockpitCommandEntries().map((command) => command.name)).toEqual([...ARCANA_COCKPIT_COMMANDS])
  })

  test("reports incomplete coverage when no runtime commands registered", () => {
    const coverage = auditCockpitCommandCoverage(undefined)

    expect(coverage.complete).toBe(false)
    expect(coverage.missing.length).toBeGreaterThan(0)
  })
})
