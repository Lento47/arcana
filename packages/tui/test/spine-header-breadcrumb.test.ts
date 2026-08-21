/**
 * Option A header redesign — breadcrumb trail + status zones.
 *
 * Pure helpers only: path→breadcrumb transform and the runtime/governance/
 * context zone partition. Component wiring is verified by typecheck and the
 * existing render suites; data keys are unchanged by design.
 */
import { describe, expect, test } from "bun:test"
import {
  breadcrumbFromPath,
  headerItemZone,
  partitionHeaderStatusItems,
} from "../src/shell/command-spine/spine-chrome"

describe("breadcrumbFromPath", () => {
  test("anchors on repo root, elides middle, keeps leaf (the mockup case)", () => {
    expect(breadcrumbFromPath("L:\\PROJECTS\\arcana\\packages\\engine", 3)).toBe("arcana ▸ … ▸ engine")
  })

  test("short paths render in full without ellipsis", () => {
    expect(breadcrumbFromPath("L:\\PROJECTS\\arcana", 4)).toBe("PROJECTS ▸ arcana")
    expect(breadcrumbFromPath("L:\\PROJECTS\\arcana", 2)).toBe("PROJECTS ▸ arcana")
  })

  test("drops drive letters", () => {
    expect(breadcrumbFromPath("C:\\dev", 3)).toBe("dev")
    expect(breadcrumbFromPath("Z:\\a\\b\\c\\d", 3)).toBe("a ▸ … ▸ d")
  })

  test("handles unix separators identically", () => {
    expect(breadcrumbFromPath("/home/user/arcana/packages/core", 3)).toBe("arcana ▸ … ▸ core")
  })

  test("tolerates mixed separators, trailing slashes, doubles", () => {
    expect(breadcrumbFromPath("L:\\PROJECTS/arcana\\\\packages\\engine\\", 3)).toBe("arcana ▸ … ▸ engine")
  })

  test("maxSegments below 3 is leaf-anchored with leading ellipsis", () => {
    expect(breadcrumbFromPath("L:\\PROJECTS\\arcana\\packages\\engine", 2)).toBe("… ▸ packages ▸ engine")
    expect(breadcrumbFromPath("L:\\PROJECTS\\arcana\\packages\\engine", 1)).toBe("… ▸ engine")
  })

  test("maxSegments 0 disables the trail", () => {
    expect(breadcrumbFromPath("L:\\PROJECTS\\arcana", 0)).toBe("")
  })

  test("no phantom ellipsis when everything fits", () => {
    expect(breadcrumbFromPath("L:\\PROJECTS\\arcana\\packages", 4)).toBe("PROJECTS ▸ arcana ▸ packages")
  })

  test("duplicate anchor falls back to plain leaf window", () => {
    // anchor "arcana" would duplicate the tail leaf → plain last-3 window.
    expect(breadcrumbFromPath("arcana\\a\\b\\arcana", 3)).toBe("a ▸ b ▸ arcana")
  })
})

describe("headerItemZone / partitionHeaderStatusItems", () => {
  test("live → runtime; contract/proof/governed/pending → governance; rest → context", () => {
    expect(headerItemZone({ key: "live" })).toBe("runtime")
    expect(headerItemZone({ key: "contract" })).toBe("governance")
    expect(headerItemZone({ key: "proof" })).toBe("governance")
    expect(headerItemZone({ key: "governed" })).toBe("governance")
    expect(headerItemZone({ key: "pending" })).toBe("governance")
    expect(headerItemZone({ key: "branch" })).toBe("context")
    expect(headerItemZone({ key: "model" })).toBe("context")
    expect(headerItemZone({ key: "session" })).toBe("context")
    expect(headerItemZone({ key: "path" })).toBe("context")
    expect(headerItemZone({ key: "agent" })).toBe("context")
  })

  test("partition preserves within-zone order and drops empty zones at render time", () => {
    const items = [
      { key: "branch", label: "arcanagov" },
      { key: "live", label: "live" },
      { key: "path", label: "arcana ▸ … ▸ engine" },
      { key: "proof", label: "P1 valid" },
      { key: "model", label: "qwen3.8-max-free" },
      { key: "governed", label: "5 governed" },
    ]
    const zones = partitionHeaderStatusItems(items)
    expect(zones.runtime.map((i) => i.key)).toEqual(["live"])
    expect(zones.governance.map((i) => i.key)).toEqual(["proof", "governed"])
    expect(zones.context.map((i) => i.key)).toEqual(["branch", "path", "model"])
  })
})
