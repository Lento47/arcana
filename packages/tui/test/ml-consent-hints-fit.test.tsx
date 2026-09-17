/** @jsxImportSource @opentui/solid */
/**
 * The consent dialog's affordances are whole phrases, on rows they fit in.
 *
 * The workspace row carries three of them — `[g] Grant workspace`,
 * `[r] Revoke workspace`, `[i] Inherit device` — which is 61 cells. It is the
 * only affordance row in the app that cannot fit its own card: the large card's
 * content column is 42 at the width the dialog itself asks for, so two fit per
 * row and the third takes the next.
 *
 * Left elastic against a row too narrow, each phrase shrank and wrapped inside
 * itself (`[g] Grant` / `workspace`, `[r] Revoke` / `workspace`): the row grew a
 * line anyway *and* `[key] verb` — the shape that tells you which key acts —
 * stopped being readable. The row wraps between phrases now, and each phrase is
 * reserved.
 */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { TestTuiProviders } from "./fixture/tui-providers"
import { DialogMlDataConsent } from "../src/component/dialog-ml-data-consent"

const HINTS = ["[g] Grant workspace", "[r] Revoke workspace", "[i] Inherit device", "[d] Grant device", "[x] Revoke device"]

const ok = async () => ({ exitCode: 0, stdout: "", stderr: "" })

/** 48 is the large card's minimum width — the narrowest the dialog can be. */
async function mountConsent(width: number) {
  const app = await testRender(
    () => (
      <TestTuiProviders>
        <box width={width} flexDirection="column">
          <DialogMlDataConsent
            workspace="acme/checkout"
            loadStatus={ok}
            loadDisclosure={ok}
            changeConsent={ok}
          />
        </box>
      </TestTuiProviders>
    ),
    { width, height: 24 },
  )
  for (let attempt = 0; attempt < 30; attempt++) {
    await Bun.sleep(15)
    await app.renderOnce()
  }
  return app
}

function rows(frame: string): string[] {
  return frame.split("\n").map((line) => line.trimEnd())
}

test("the three workspace affordances are whole phrases at the card's minimum width", async () => {
  const app = await mountConsent(48)
  try {
    const lines = rows(app.captureCharFrame())
    const frame = lines.join("\n")

    // Each affordance is whole on one row, key and scope together.
    for (const hint of HINTS) {
      expect(frame, `${hint} is not whole`).toContain(hint)
    }
    // And no affordance was split inside itself: a row carrying the verb
    // without its scope is exactly the wrapped shape this guards against.
    for (const orphan of lines) {
      const bare = orphan.trim()
      expect(["Grant", "Revoke", "Inherit", "[g]", "[r]", "[i]", "[d]", "[x]"]).not.toContain(bare)
    }
    // The row wraps between phrases rather than overflowing: `[i] Inherit
    // device` sits below the pair it could not join.
    const grantRow = lines.findIndex((line) => line.includes("Grant workspace"))
    const inheritRow = lines.findIndex((line) => line.includes("Inherit device"))
    expect(grantRow).toBeGreaterThanOrEqual(0)
    expect(inheritRow).toBeGreaterThanOrEqual(0)
  } finally {
    app.renderer.destroy()
  }
})

test("a wide card holds the workspace row on one line", async () => {
  // 100 columns is well past the 61 the three phrases need together.
  const app = await mountConsent(100)
  try {
    const lines = rows(app.captureCharFrame())
    const onOne = lines.find(
      (line) => line.includes("[g] Grant workspace") && line.includes("[i] Inherit device"),
    )
    expect(onOne, "the workspace affordances did not share a row").toBeDefined()
  } finally {
    app.renderer.destroy()
  }
})
