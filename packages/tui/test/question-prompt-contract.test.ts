import { expect, test } from "bun:test"

const source = await Bun.file(new URL("../src/routes/session/question.tsx", import.meta.url)).text()
const keybinds = await Bun.file(new URL("../src/config/keybind.ts", import.meta.url)).text()

test("question form uses explicit stacked navigation and submission", () => {
  expect(source).toContain('<For each={questions()}>')
  expect(source).toContain('key: "tab"')
  expect(source).toContain('key: "shift+tab"')
  expect(source).toContain('key: "escape"')
  // Enter on the submit chip while incomplete must never be silent: it jumps
  // to the first unanswered question and pulses it.
  expect(source).toContain("focusFirstUnanswered")
  expect(source).not.toContain('if (single())')
})

test("number shortcuts exclude the custom-answer slot", () => {
  expect(source).toContain("optionCount, 9")
  expect(source).not.toContain("Math.min(total, 9)")
})

test("esc dismiss is armed (double-esc) instead of instant", () => {
  expect(source).toContain("Esc again to discard")
  expect(source).toContain("dismissIntent")
})

test("reply/dismiss dismiss the form locally (SSE-miss resilience)", () => {
  expect(source).toContain("dismissLocal")
  expect(source).toContain("dropLocal")
  // Structural 404 detection shared with the permission gate — not message regex.
  expect(source).toContain("isUnknownRequestNotFoundError")
  expect(source).not.toContain("isAlreadyAnsweredError")
})

test("plain Tab does not open the agent picker", () => {
  expect(keybinds).toContain('agent_cycle: keybind("none", "Open agent picker")')
  expect(keybinds).toContain('agent_cycle_reverse: keybind("shift+tab", "Cycle agent")')
})
