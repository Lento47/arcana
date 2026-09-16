/** @jsxImportSource @opentui/solid */
/**
 * The attention mark — one character, from one source.
 *
 * `△` (U+25B3) was re-typed at seven sites: the permission gate's card and rail
 * node, the approval and permission inspectors, the pending-request rows in the
 * permissions dialog, and the footer's count. Nothing tied them together, so the
 * mark that means "this one needs you" could move on one surface and stay put on
 * the other six — and the retune that would do it is exactly the kind a brand
 * file exists to make cheap.
 *
 * It is deliberately not `⚠`, which the app keeps for a statement about
 * behaviour (a lock, a wholesale replacement) rather than a request for a
 * decision. The two are pinned apart here so a later "tidy-up" cannot merge
 * them: they say different things and one of them is drawn on a rail node.
 */
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { testRender } from "@opentui/solid"
import type { PermissionRequest } from "@arcana/sdk/v2"
import { Glyph } from "../src/branding"
import { PermissionInspector } from "../src/routes/session/permission-inspector"
import { TestTuiProviders } from "./fixture/tui-providers"

/** U+25B3, spelled out: the literal these files used to carry. */
const TRIANGLE = "△"

const REQUEST: PermissionRequest = {
  id: "permission-req-1",
  sessionID: "ses_0123456789abcdef0123456789abcdef",
  permission: "contract.accept",
  patterns: ["ses_0123456789abcdef0123456789abcdef"],
  metadata: { description: "Accept the intent contract" },
  always: [],
  tool: { messageID: "msg_123", callID: "call_456" },
}

test("the attention mark is the triangle, and is not the warning mark", () => {
  expect(Glyph.attention).toBe(TRIANGLE)
  expect(Glyph.attention).not.toBe("⚠")
})

test("no surface re-types the attention mark — it comes from the brand layer", () => {
  const files = [
    "src/routes/session/permission.tsx",
    "src/routes/session/approval-inspector.tsx",
    "src/routes/session/permission-inspector.tsx",
    "src/routes/session/footer.tsx",
    "src/component/dialog-permissions.tsx",
  ]
  for (const file of files) {
    const source = readFileSync(join(import.meta.dir, "..", file), "utf8")
    expect(source).not.toContain(TRIANGLE)
  }
})

test("a rendered surface prints the mark from the brand layer", async () => {
  const app = await testRender(
    () => (
      <TestTuiProviders>
        <PermissionInspector request={REQUEST} />
      </TestTuiProviders>
    ),
    { width: 90, height: 20 },
  )
  try {
    let frame = ""
    for (let attempt = 0; attempt < 10; attempt++) {
      await app.renderOnce()
      await app.flush()
      const next = app.captureCharFrame()
      if (next.trim().length > 0 && next === frame) break
      frame = next
      await Bun.sleep(20)
    }
    // The mark reaches the surface, against the panel's name, and it is the
    // triangle — not the warning mark the app keeps for statements about
    // behaviour.
    expect(frame).toContain(`${Glyph.attention} PERMISSION INSPECTOR`)
    expect(frame).not.toContain("⚠")
  } finally {
    app.renderer.destroy()
  }
})
