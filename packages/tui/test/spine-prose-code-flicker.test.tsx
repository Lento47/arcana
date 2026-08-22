/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { RGBA, SyntaxStyle } from "@opentui/core"
import { MockTreeSitterClient } from "@opentui/core/testing"
import { testRender } from "@opentui/solid"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SOURCE = [
  "export function answer(): number {",
  "  return 42",
  "}",
].join("\n")

const syntaxStyle = SyntaxStyle.fromStyles({
  default: { fg: RGBA.fromHex("#ffffff") },
})

const spineProseSource = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/spine-prose.tsx"),
  "utf8",
)

let app: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  app?.renderer.destroy()
  app = undefined
})

test("read preview remains visible while Tree-sitter highlighting is pending", async () => {
  const treeSitter = new MockTreeSitterClient()

  app = await testRender(
    () => (
      <code
        content={SOURCE}
        filetype="typescript"
        syntaxStyle={syntaxStyle}
        treeSitterClient={treeSitter}
        drawUnstyledText={true}
        width={72}
      />
    ),
    { width: 80, height: 12 },
  )
  await app.renderOnce()

  expect(treeSitter.isHighlighting()).toBe(true)
  const pendingFrame = app.captureCharFrame()
  expect(pendingFrame).toContain("export function answer")
  expect(pendingFrame.split("export function answer")).toHaveLength(2)
  expect(spineProseSource).toMatch(
    /filetype=\{ft\(\)\}[\s\S]{0,300}drawUnstyledText=\{true\}/,
  )
})
