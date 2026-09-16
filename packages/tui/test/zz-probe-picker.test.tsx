/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { onMount } from "solid-js"
import { testRender } from "@opentui/solid"
import { useDialog } from "../src/ui/dialog"
import { DialogSelect } from "../src/ui/dialog-select"
import { TestTuiProviders } from "./fixture/tui-providers"

const SHORT = process.env.PROBE_SHORT === "1"
const OPTIONS = SHORT
  ? [
      { title: "aaa", value: "a", footer: "1" },
      { title: "bbb", value: "b", footer: "2" },
    ]
  : [
      { title: "claude-sonnet-5", value: "a", description: "fast", footer: "Free", category: "Anthropic" },
      { title: "claude-opus-5", value: "b", description: "deep", footer: "Pro", category: "Anthropic" },
      { title: "gpt-5", value: "c", details: ["via openrouter"], category: "OpenAI" },
    ]

function Opener() {
  const dialog = useDialog()
  onMount(() => {
    dialog.replace(() => (
      <DialogSelect
        title="Choose a model"
        placeholder="Scry models…"
        options={OPTIONS as any}
        current="b"
        footerHints={[
          { title: "enter", label: "select", side: "right" },
          { title: "esc", label: "close", side: "right" },
        ]}
      />
    ))
  })
  return null
}

test("probe: picker frame", async () => {
  for (const [w, h] of [
    [96, 20],
    [96, 24],
    [96, 40],
  ] as const) {
    const app = await testRender(
      () => (
        <TestTuiProviders>
          <Opener />
        </TestTuiProviders>
      ),
      { width: w, height: h },
    )
    for (let i = 0; i < 60 && app.renderer.root.getChildren().length === 0; i++) {
      await Bun.sleep(10)
      await app.renderOnce()
    }
    for (let i = 0; i < 20; i++) {
      await Bun.sleep(20)
      await app.renderOnce()
    }
    const lines = app.captureCharFrame().split("\n")
    console.log(`----FRAME ${w}x${h}----`)
    lines.forEach((l, i) => console.log(String(i).padStart(2, " ") + "|" + l.replace(/ +$/, "") + "|"))
    if (h === 24) {
      console.log(`----TREE ${w}x${h}----`)
      const walk = (n: any, depth: number) => {
        const name = n.constructor?.name ?? "?"
        console.log("  ".repeat(depth) + `${name} x=${n.x} y=${n.y} w=${n.width} h=${n.height}`)
        for (const c of n.getChildren()) walk(c, depth + 1)
      }
      walk(app.renderer.root, 0)
    }
    app.renderer.destroy()
  }
  expect(true).toBe(true)
})
