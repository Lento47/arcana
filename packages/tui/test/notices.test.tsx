/** @jsxImportSource @opentui/solid */
/**
 * Notices are toasts that outlive their card.
 *
 * Two contracts are pinned here. First, a repeat of the same notice inside the
 * window is the *same* notice: it bumps a count instead of stacking a second
 * card (a failure retried every second must not paint a wall of identical
 * toasts). Second, the tray keeps what the cards cannot: newest first, with
 * the repeat count, so information that arrived while the operator was looking
 * elsewhere can still be found.
 */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { onMount } from "solid-js"
import { Toast, useToast } from "../src/ui/toast"
import { DialogNotices } from "../src/ui/dialog-notices"
import { TestTuiProviders } from "./fixture/tui-providers"

test("repeats collapse in the card and survive in the tray, newest first", async () => {
  function Harness() {
    const toast = useToast()
    onMount(() => {
      toast.show({ message: "older notice", variant: "info", duration: 60_000 })
      toast.show({ message: "same failure", variant: "error", duration: 60_000 })
      toast.show({ message: "same failure", variant: "error", duration: 60_000 })
      toast.show({ message: "same failure", variant: "error", duration: 60_000 })
    })
    // The probe prints the store state as text so a failure says what the
    // store held rather than "the frame did not contain X".
    return (
      <box flexDirection="column" width="100%" height="100%">
        <text>{`probe notices=${toast.notices.length} cards=${toast.toasts.length} count=${toast.notices[1]?.count ?? 0}`}</text>
        <Toast />
        <box flexDirection="column" flexGrow={1} minWidth={0}>
          <DialogNotices />
        </box>
      </box>
    )
  }

  const app = await testRender(
    () => (
      <TestTuiProviders>
        <Harness />
      </TestTuiProviders>
    ),
    { width: 100, height: 20 },
  )

  try {
    let frame = ""
    for (let attempt = 0; attempt < 12; attempt++) {
      await app.renderOnce()
      await app.flush()
      const next = app.captureCharFrame()
      if (next.trim().length > 0 && next === frame) break
      frame = next
      await Bun.sleep(20)
    }

    expect(frame).toContain("probe notices=2 cards=2 count=3")
    // One card for the repeated failure — not three.
    expect(frame.split("same failure").length - 1).toBe(2)
    // The card and the tray both carry the count.
    expect(frame).toContain("×3")
    // The tray is newest first: the failure precedes the older notice.
    expect(frame.indexOf("same failure")).toBeLessThan(frame.indexOf("older notice"))
    // The tray title counts notices, not repeats.
    expect(frame).toContain("Notices · 2")
  } finally {
    app.renderer.destroy()
  }
})
