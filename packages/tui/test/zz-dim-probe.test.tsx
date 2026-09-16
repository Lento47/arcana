/** @jsxImportSource @opentui/solid */
import { RGBA, SyntaxStyle, TextAttributes } from "@opentui/core"
import { testRender } from "@opentui/solid"

const syntaxStyle = SyntaxStyle.fromStyles({
  default: { fg: RGBA.fromHex("#ffffff") },
  "markup.strong": { fg: RGBA.fromHex("#ff0000"), bold: true },
})

const app = await testRender(
  () => (
    <markdown
      width={40}
      content={"plain **bold** tail"}
      syntaxStyle={syntaxStyle}
      streaming={true}
      internalBlockMode="top-level"
      conceal={true}
    />
  ),
  { width: 60, height: 12 },
)
for (let i = 0; i < 12; i++) {
  await app.renderOnce()
  await app.flush()
  await Bun.sleep(4)
}

let mdNode: any
const walk = (n: any) => {
  if (!n) return
  if (n.constructor?.name === "MarkdownRenderable") mdNode = n
  n.getChildren?.().forEach(walk)
}
walk(app.renderer.root)
console.log("found md:", !!mdNode, "blocks:", mdNode?._blockStates?.length, "stable:", mdNode?._stableBlockCount)
console.log("block types:", mdNode?._blockStates?.map((b: any) => b.renderable?.constructor?.name))
console.log("block attrs before:", mdNode?._blockStates?.map((b: any) => b.renderable?.attributes))

const target = mdNode._blockStates[mdNode._blockStates.length - 1]
const block = target.renderable
block.attributes = TextAttributes.DIM
for (let i = 0; i < 4; i++) {
  await app.renderOnce()
  await app.flush()
  await Bun.sleep(4)
}
console.log("after set:", block.attributes)

const buf = app.renderer.currentRenderBuffer
console.log("charFrame:", JSON.stringify(app.captureCharFrame()))
const abuf = buf.buffers?.attributes
if (abuf) {
  const w = buf.width
  const h = buf.height
  const rows: string[] = []
  for (let y = 0; y < h; y++) {
    let row = ""
    for (let x = 0; x < w; x++) {
      const a = abuf[y * w + x]
      row += a === 0 ? "." : a.toString(16)
    }
    rows.push(row)
  }
  console.log("attr map:")
  console.log(rows.join("\n"))
}
app.renderer.destroy()
