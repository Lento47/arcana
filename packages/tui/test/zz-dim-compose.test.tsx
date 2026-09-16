/** @jsxImportSource @opentui/solid */
import { TextAttributes } from "@opentui/core"
import { testRender } from "@opentui/solid"

function attrMap(app: any): string[] {
  const buf = app.renderer.currentRenderBuffer
  const abuf = buf.buffers?.attributes
  const rows: string[] = []
  if (!abuf) return ["no-attr-buffer"]
  for (let y = 0; y < buf.height; y++) {
    let row = ""
    for (let x = 0; x < buf.width; x++) {
      const a = abuf[y * buf.width + x]
      row += a === 0 ? "." : a.toString(16)
    }
    rows.push(row)
  }
  return rows
}

async function settle(app: any, n = 12) {
  for (let i = 0; i < n; i++) {
    await app.renderOnce()
    await app.flush()
    await Bun.sleep(4)
  }
}

// Case A: bold span only, no renderable dim — baseline. Expect BOLD(1) on "bold".
const appA = await testRender(
  () => (
    <text>
      plain <span style={{ attributes: TextAttributes.BOLD }}>bold</span> rest
    </text>
  ),
  { width: 40, height: 4 },
)
await settle(appA)
console.log("A bold-only charFrame:", JSON.stringify(appA.captureCharFrame()))
console.log("A bold-only attr map:")
console.log(attrMap(appA).join("\n"))
appA.renderer.destroy()

// Case B: bold span + renderable DIM. 3 = OR compose, 2 = replace.
const appB = await testRender(
  () => (
    <text attributes={TextAttributes.DIM}>
      plain <span style={{ attributes: TextAttributes.BOLD }}>bold</span> rest
    </text>
  ),
  { width: 40, height: 4 },
)
await settle(appB)
console.log("B dim+bold charFrame:", JSON.stringify(appB.captureCharFrame()))
console.log("B dim+bold attr map:")
console.log(attrMap(appB).join("\n"))
appB.renderer.destroy()
