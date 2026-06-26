import { describe, expect, test } from "bun:test"
import {
  cockpitAccessibilityCoversSteps57To60,
  cockpitKeyboardHelp,
  createCockpitAccessibilityState,
  moveCockpitFocus,
  selectCockpitPanelItem,
  setCockpitVisualMode,
} from "./cockpit.accessibility"

describe("Arcana cockpit accessibility", () => {
  test("covers steps 57 through 60", () => {
    expect(cockpitAccessibilityCoversSteps57To60()).toBe(true)
  })

  test("moves global focus across panels", () => {
    const state = createCockpitAccessibilityState()
    const next = moveCockpitFocus(state, "right")

    expect(state.focus.panel).toBe("mission")
    expect(next.focus.panel).toBe("actions")
  })

  test("selects panel-local item with clamping", () => {
    const state = createCockpitAccessibilityState({ focus: { panel: "actions", index: 0 }, panel_counts: { actions: 3 } })

    expect(selectCockpitPanelItem(state, 2).focus.index).toBe(2)
    expect(selectCockpitPanelItem(state, 99).focus.index).toBe(2)
  })

  test("switches visual modes", () => {
    const state = createCockpitAccessibilityState()

    expect(setCockpitVisualMode(state, "dense").visual_mode).toBe("dense")
    expect(setCockpitVisualMode(state, "high_contrast").visual_mode).toBe("high_contrast")
  })

  test("provides keyboard help", () => {
    expect(cockpitKeyboardHelp().some((line) => line.includes("previous panel"))).toBe(true)
    expect(cockpitKeyboardHelp().some((line) => line.includes("return to prompt"))).toBe(true)
  })
})
