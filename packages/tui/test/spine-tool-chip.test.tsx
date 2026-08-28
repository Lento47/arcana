/** @jsxImportSource @opentui/solid */
import { afterEach, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { SpineToolChip } from "../src/shell/command-spine/spine-tool-chip"

let app: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  app?.renderer.destroy()
  app = undefined
})

async function renderChip(chip: () => any, width = 72) {
  app = await testRender(
    () => <box width={width} flexDirection="column">{chip()}</box>,
    { width, height: 4 },
  )
  await app.renderOnce()
  return app.captureCharFrame().split("\n").map((line) => line.trimEnd()).join("\n").trimEnd()
}

describe("SpineToolChip", () => {
  test("renders a stable status/category pill for every lifecycle", async () => {
    const frame = await renderChip(() => (
      <box flexDirection="column">
        <SpineToolChip kind="run" label="run" summary="bun test" lifecycle="queued" />
        <SpineToolChip kind="read" label="read" summary="src/index.ts" lifecycle="running" />
        <SpineToolChip kind="edit" label="edit" summary="src/app.tsx" lifecycle="success" />
        <SpineToolChip kind="task" label="task" summary="Review changes" lifecycle="failure" />
      </box>
    ))

    expect(frame).toContain("· run  bun test")
    expect(frame).toContain("● read  src/index.ts")
    expect(frame).toContain("✓ edit  src/app.tsx")
    expect(frame).toContain("✗ task  Review changes")
  })

  test("clips only the preview at a measured narrow width", async () => {
    const frame = await renderChip(() => (
      <SpineToolChip
        kind="search"
        label="search"
        summary="Grep database configuration in packages/arcana/src/storage/database.ts"
        lifecycle="success"
        contentWidth={28}
      />
    ), 40)
    expect(frame).toContain("✓ search")
    expect(frame).toContain("…")
    expect(frame.split("\n").filter((line) => line.trim()).length).toBe(1)
  })
})
