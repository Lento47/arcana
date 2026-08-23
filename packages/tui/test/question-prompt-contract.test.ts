import { expect, test } from "bun:test"

const source = await Bun.file(new URL("../src/routes/session/question.tsx", import.meta.url)).text()
const keybinds = await Bun.file(new URL("../src/config/keybind.ts", import.meta.url)).text()

test("question form uses explicit stacked navigation and submission", () => {
  expect(source).toContain('<For each={questions()}>')
  expect(source).toContain('key: "tab"')
  expect(source).toContain('key: "shift+tab"')
  expect(source).toContain('key: "escape"')
  expect(source).toContain('if (busy() || !complete()) return')
  expect(source).not.toContain('if (single())')
})

test("plain Tab does not open the agent picker", () => {
  expect(keybinds).toContain('agent_cycle: keybind("none", "Open agent picker")')
  expect(keybinds).toContain('agent_cycle_reverse: keybind("shift+tab", "Cycle agent")')
})
