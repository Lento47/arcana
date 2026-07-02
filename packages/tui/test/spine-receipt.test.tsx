/** @jsxImportSource @opentui/solid */
import { testRender, type JSX } from "@opentui/solid"
import { expect, test } from "bun:test"
import { ThemeProvider } from "../src/context/theme"
import { TuiConfigProvider } from "../src/config"
import { KVProvider } from "../src/context/kv"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { SpineReceipt } from "../src/shell/command-spine/spine-receipt"
import type { SpineReceipt as SpineReceiptType, SpineLayout } from "../src/shell/command-spine/spine-types"

function withTheme(component: () => JSX.Element) {
  return (
    <TestTuiContexts>
      <TuiConfigProvider config={createTuiResolvedConfig()}>
        <KVProvider>
          <ThemeProvider mode="dark">{component()}</ThemeProvider>
        </KVProvider>
      </TuiConfigProvider>
    </TestTuiContexts>
  )
}

function renderReceipt(kind: string, receipt: SpineReceiptType, layout: SpineLayout, width: number) {
  return testRender(
    () =>
      withTheme(() => (
        <box flexDirection="column" width={width}>
          <SpineReceipt kind={kind as any} receipt={receipt} layout={layout} />
        </box>
      )),
    { width, height: 5 },
  )
}

async function renderOnceSettled(app: Awaited<ReturnType<typeof testRender>>) {
  await app.renderOnce()
  await new Promise((resolve) => setTimeout(resolve, 50))
  await app.renderOnce()
}

async function capture(app: Awaited<ReturnType<typeof testRender>>) {
  try {
    await renderOnceSettled(app)
    for (let attempt = 0; attempt < 5; attempt++) {
      const frame = app.captureCharFrame()
      if (frame.trim().length > 0) return frame.trim()
      await new Promise((resolve) => setTimeout(resolve, 50))
      await app.renderOnce()
    }
    return app.captureCharFrame().trim()
  } finally {
    app.renderer.destroy()
  }
}

// ---------- run + ok ----------

test("run + ok receipt at wide (≥120 cols)", async () => {
  const frame = await capture(
    await renderReceipt(
      "run",
      { label: "test", command: "cargo test", stats: { passed: 124, failed: 0, duration: "4.01s" }, status: "ok" },
      "wide",
      120,
    ),
  )
  expect(frame).toContain("✓")
  expect(frame).toContain("124 passed")
  expect(frame).toContain("0 failed")
  expect(frame).toContain("4.01s")
})

test("run + ok receipt at narrow (80 cols)", async () => {
  const frame = await capture(
    await renderReceipt(
      "run",
      { label: "test", command: "cargo test", stats: { passed: 124, failed: 0, duration: "4.01s" }, status: "ok" },
      "narrow",
      80,
    ),
  )
  expect(frame).toContain("✓")
  expect(frame).toContain("124")
  expect(frame).toContain("0")
})

test("run + ok receipt at minimal", async () => {
  const frame = await capture(
    await renderReceipt(
      "run",
      { label: "test", command: "cargo test", stats: { passed: 124, failed: 0 }, status: "ok" },
      "minimal",
      40,
    ),
  )
  expect(frame).toContain("✓")
  expect(frame).toContain("124/0")
})

// ---------- run + fail ----------

test("run + fail receipt at wide", async () => {
  const frame = await capture(
    await renderReceipt(
      "run",
      { label: "bash", command: "error[E0308] mismatched types: expected Direction, found i32", status: "fail" },
      "wide",
      120,
    ),
  )
  expect(frame).toContain("E0308")
})

test("run + fail receipt at narrow", async () => {
  const frame = await capture(
    await renderReceipt(
      "run",
      { label: "bash", command: "error[E0308] mismatched types: expected Direction, found i32", status: "fail" },
      "narrow",
      80,
    ),
  )
  expect(frame).toContain("E0308")
})

test("run + fail receipt at minimal", async () => {
  const frame = await capture(
    await renderReceipt(
      "run",
      { label: "bash", command: "error[E0308] mismatched types", status: "fail" },
      "minimal",
      40,
    ),
  )
  expect(frame).toBe("FAIL")
})

// ---------- run + pending ----------

test("run + pending receipt shows running indicator", async () => {
  const frame = await capture(
    await renderReceipt(
      "run",
      { label: "bash", command: "cargo build", status: "pending" },
      "wide",
      120,
    ),
  )
  expect(frame).toContain("running")
})

// ---------- patch ----------

test("patch receipt at wide", async () => {
  const frame = await capture(
    await renderReceipt(
      "patch",
      { label: "edit", stats: { added: 45, removed: 12 }, status: "ok" },
      "wide",
      120,
    ),
  )
  expect(frame).toContain("+45")
  expect(frame).toContain("-12")
})

test("patch receipt at minimal", async () => {
  const frame = await capture(
    await renderReceipt(
      "patch",
      { label: "edit", stats: { added: 45, removed: 12 }, status: "ok" },
      "minimal",
      40,
    ),
  )
  expect(frame).toContain("+45/-12")
})

test("patch receipt with no stats returns null", async () => {
  const frame = await capture(
    await renderReceipt(
      "patch",
      { label: "edit", status: "ok" },
      "wide",
      120,
    ),
  )
  expect(frame).toBe("")
})

// ---------- inspect ----------

test("inspect receipt returns null (deferred)", async () => {
  const frame = await capture(
    await renderReceipt(
      "inspect",
      { label: "read", status: "ok" },
      "wide",
      120,
    ),
  )
  expect(frame).toBe("")
})

// ---------- fallback ----------

test("unknown kind shows fallback", async () => {
  const frame = await capture(
    await renderReceipt(
      "ask",
      { label: "user", status: "ok" },
      "wide",
      120,
    ),
  )
  expect(frame).toContain("user")
  expect(frame).toContain("ok")
})

test("unknown kind at minimal shows status only", async () => {
  const frame = await capture(
    await renderReceipt(
      "plan",
      { label: "assistant", status: "ok" },
      "minimal",
      40,
    ),
  )
  expect(frame).toBe("ok")
})

// ---------- empty receipt (guarded by Show) ----------

test("receipt does not render when not passed (guarded by entry)", async () => {
  const frame = await capture(
    await renderReceipt(
      "run",
      undefined as any,
      "wide",
      120,
    ),
  )
  expect(frame).toBe("")
})
