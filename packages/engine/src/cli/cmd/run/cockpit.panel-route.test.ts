import { describe, expect, test } from "bun:test"
import { cockpitFocusRoute, cockpitFocusRouteEvent, cockpitPanelRoute, normalizeCockpitRouteName } from "./cockpit.panel-route"

describe("Arcana cockpit panel routes", () => {
  test("normalizes route names", () => {
    expect(normalizeCockpitRouteName(":mission")).toBe("mission")
    expect(normalizeCockpitRouteName("/tokens")).toBe("tokens")
    expect(normalizeCockpitRouteName("unknown")).toBeUndefined()
  })

  test("maps cockpit routes to panels", () => {
    expect(cockpitPanelRoute("mission")).toBe("mission")
    expect(cockpitPanelRoute("actions")).toBe("actions")
    expect(cockpitPanelRoute("risk")).toBe("risk")
    expect(cockpitPanelRoute("diffgate")).toBe("diffgate")
    expect(cockpitPanelRoute("verify")).toBe("verify")
    expect(cockpitPanelRoute("proof")).toBe("proof")
    expect(cockpitPanelRoute("tokens")).toBe("tokens")
  })

  test("creates projection focus events", () => {
    expect(cockpitFocusRoute("tokens", 2)).toEqual({ panel: "tokens", index: 2 })
    expect(cockpitFocusRouteEvent("proof")).toEqual({ type: "focus", focus: { panel: "proof", index: 0 } })
  })
})
