/** @jsxImportSource @opentui/solid */
/**
 * S-dismiss: one close mark, from one source.
 *
 * The toast's dismiss control and both command-spine dismiss affordances must
 * print `Glyph.dismiss`. The spine shipped a literal U+00D7 (multiplication
 * sign) where the rest of the app prints U+2715, so the same "dismiss this"
 * affordance was two different characters depending on which row carried it.
 */
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { onMount } from "solid-js"
import { testRender, type JSX } from "@opentui/solid"
import { Glyph } from "../src/branding"
import { Toast, useToast } from "../src/ui/toast"
import { SpineNode } from "../src/shell/command-spine/spine-node"
import { TestTuiProviders } from "./fixture/tui-providers"

/** U+00D7 — what the spine used to print; a different character from Glyph.dismiss. */
const MULTIPLICATION_SIGN = "×"

const DISMISS_SUMMARY = "e8093c29 · exact request required"

async function capture(component: () => JSX.Element, width = 90, height = 12) {
  const app = await testRender(() => <TestTuiProviders>{component()}</TestTuiProviders>, { width, height })
  try {
    for (let i = 0; i < 4; i++) {
      await app.renderOnce()
      await new Promise((resolve) => setTimeout(resolve, 30))
      await app.flush()
      await app.renderOnce()
    }
    return app.captureCharFrame()
  } finally {
    app.renderer.destroy()
  }
}

/** The toast store is provider-scoped, so the row has to be shown from inside it. */
function ToastHarness() {
  const toast = useToast()
  onMount(() => toast.show({ variant: "info", message: "Inscribed to clipboard" }))
  return <Toast />
}

test("toast dismiss control prints the brand close mark", async () => {
  const frame = await capture(() => <ToastHarness />)

  expect(frame).toContain(Glyph.dismiss)
  expect(frame).not.toContain(MULTIPLICATION_SIGN)
})

test("spine dismiss affordance prints the brand close mark in a label layout", async () => {
  const frame = await capture(() => (
    <SpineNode kind="approve" label="approve" summary={DISMISS_SUMMARY} layout="wide" onDismiss={() => {}} />
  ))

  expect(frame).toContain(Glyph.dismiss)
  expect(frame).not.toContain(MULTIPLICATION_SIGN)
})

test("spine dismiss affordance prints the brand close mark in the minimal layout", async () => {
  const frame = await capture(() => (
    <SpineNode kind="approve" label="approve" summary={DISMISS_SUMMARY} layout="minimal" onDismiss={() => {}}
    />
  ))

  expect(frame).toContain(Glyph.dismiss)
  expect(frame).not.toContain(MULTIPLICATION_SIGN)
})

test("no surface re-types the close mark — it comes from the brand layer", () => {
  for (const file of ["src/ui/toast.tsx", "src/shell/command-spine/spine-node.tsx"]) {
    const source = readFileSync(join(import.meta.dir, "..", file), "utf8")
    expect(source).not.toContain(MULTIPLICATION_SIGN)
    expect(source).not.toContain(Glyph.dismiss)
  }
})
