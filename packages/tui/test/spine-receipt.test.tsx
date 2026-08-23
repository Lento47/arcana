/** @jsxImportSource @opentui/solid */
import { testRender, type JSX } from "@opentui/solid"
import { expect, test } from "bun:test"
import { ThemeProvider } from "../src/context/theme"
import { ToastProvider } from "../src/ui/toast"
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
          <ToastProvider>
            <ThemeProvider mode="dark">{component()}</ThemeProvider>
          </ToastProvider>
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
    { width, height: 12 },
  )
}

async function renderOnceSettled(app: Awaited<ReturnType<typeof testRender>>) {
  // ThemeProvider resolves the active theme asynchronously (system/custom
  // discovery), so the first explicit renderOnce often yields an empty frame.
  // The receipt layout also streams in (border + label first, stats next), so
  // wait until the frame stops changing and is non-empty.
  let previous = ""
  for (let i = 0; i < 40; i++) {
    await app.renderOnce()
    const frame = app.captureCharFrame()
    const trimmed = frame.trim()
    if (trimmed.length > 0 && trimmed === previous) break
    previous = trimmed
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

async function capture(app: Awaited<ReturnType<typeof testRender>>) {
  try {
    await renderOnceSettled(app)
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

test("run + pending receipt defers to the single composer shimmer", async () => {
  const frame = await capture(
    await renderReceipt(
      "run",
      { label: "bash", command: "cargo build", status: "pending" },
      "wide",
      120,
    ),
  )
  expect(frame).not.toContain("Working")
})

test("interrupted receipt is static recovery evidence", async () => {
  const frame = await capture(
    await renderReceipt(
      "run",
      { label: "bash", command: "cargo build", status: "interrupted" },
      "wide",
      120,
    ),
  )
  expect(frame).toContain("cargo build")
  expect(frame).not.toContain("Working")
})

test("interrupted receipt has a compact minimal label", async () => {
  const frame = await capture(
    await renderReceipt(
      "patch",
      { label: "edit", status: "interrupted" },
      "minimal",
      40,
    ),
  )
  expect(frame).toBe("INTERRUPTED")
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

test("inspect receipt shows Done when completed without summary", async () => {
  const frame = await capture(
    await renderReceipt(
      "inspect",
      { label: "read", status: "ok" },
      "wide",
      120,
    ),
  )
  expect(frame).toContain("Done")
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
  expect(frame).toContain("Done")
})

test("unknown kind at minimal shows Done", async () => {
  const frame = await capture(
    await renderReceipt(
      "plan",
      { label: "assistant", status: "ok" },
      "minimal",
      40,
    ),
  )
  expect(frame).toContain("Done")
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
