import { describe, expect, test } from "bun:test"
import { ARCANA_COCKPIT_COMMANDS, arcanaCockpitCommandEntries, auditCockpitCommandCoverage } from "./cockpit.command-audit"

describe("Arcana cockpit command audit", () => {
  test("defines command entries for every required cockpit command", () => {
    expect(arcanaCockpitCommandEntries().map((command) => command.name)).toEqual([...ARCANA_COCKPIT_COMMANDS])
  })

  test("reports complete coverage from built-in cockpit entries", () => {
    const coverage = auditCockpitCommandCoverage(undefined)

    expect(coverage.complete).toBe(true)
    expect(coverage.missing).toEqual([])
    expect(coverage.reflected).toContain("mission")
    expect(coverage.reflected).toContain("diffgate")
    expect(coverage.reflected).toContain("tokens")
  })
})
