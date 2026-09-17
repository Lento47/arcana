/** @jsxImportSource @opentui/solid */
/**
 * The gate spends columns, not rows.
 *
 * Both gates used to stack their rows on a bare `width < 80` breakpoint. At
 * 60–79 columns the decision row needs 58 columns and the hint row 52, so for
 * twenty columns of terminal width the gate grew five rows tall to hold two
 * rows of content — on the one surface whose entire job is to be answered and
 * dismissed. The rejection card did the same to its input and its key hints.
 *
 * The fit is now measured: the rows are laid out one line each while they fit
 * the column the gate actually has, and stacked only when one genuinely does
 * not. These tests pin both sides of that, at widths where the old breakpoint
 * and the measurement disagree — 66 to 79 columns.
 *
 * Widths here are the whole terminal, and the harness renders the gate without
 * the session frame, so the gate has four columns more than `GATE_RAIL` budgets
 * for. Every width below is chosen so the harness and the app agree on the
 * outcome; none of them sits on the boundary.
 */
import { expect, test } from "bun:test"
import { testRender, type JSX } from "@opentui/solid"
import type { PermissionRequest } from "@arcana/sdk/v2"
import { SDKProvider } from "../src/context/sdk"
import { ExitProvider } from "../src/context/exit"
import { ArgsProvider } from "../src/context/args"
import { ProjectProvider } from "../src/context/project"
import { SyncProvider } from "../src/context/sync"
import { PathFormatterProvider } from "../src/context/path-format"
import { PermissionPrompt, RejectPrompt } from "../src/routes/session/permission"
import { TestTuiProviders } from "./fixture/tui-providers"
import { createEventSource, createFetch, directory } from "./fixture/tui-sdk"

/** Widest of the three contract-admission decisions, so the row is measured by it. */
const OPTIONS = ["Always Activate", "Activate Once", "Decline"] as const
const DECISION = "Decision"
const HINT_SELECT = "←/→ select"
const HINT_CONFIRM = "enter confirm"
const FULLSCREEN = "fullscreen"
const REJECT_CONFIRM = "enter confirm"
const REJECT_CANCEL = "esc cancel"

/** Where the rows still fit on one line each — all of them past the old breakpoint. */
const FITS = [90, 76, 70, 66]
/** Where they no longer do, in the harness as well as in the app. */
const STACKS = [60, 48]

const REQUEST: PermissionRequest = {
  id: "per_gate_fit",
  sessionID: "ses_f591be0c",
  permission: "contract.accept",
  patterns: ["ses_f591be0c"],
  metadata: { kind: "contract_admission", objective: "Fix permission persistence" },
  always: ["*"],
  tool: { messageID: "msg_1", callID: "call_1" },
}

function withProviders(component: () => JSX.Element) {
  const calls = createFetch()
  const events = createEventSource()
  return (
    <TestTuiProviders>
      <ExitProvider exit={() => {}}>
        <ArgsProvider>
          <SDKProvider url="http://test" directory={directory} fetch={calls.fetch} events={events.source}>
            <ProjectProvider>
              <SyncProvider>
                <PathFormatterProvider path={directory}>{component()}</PathFormatterProvider>
              </SyncProvider>
            </ProjectProvider>
          </SDKProvider>
        </ArgsProvider>
      </ExitProvider>
    </TestTuiProviders>
  )
}

async function shot(component: () => JSX.Element, width: number, height = 20) {
  const app = await testRender(
    () =>
      withProviders(() => (
        <box width="100%" height="100%" flexDirection="column">
          {component()}
        </box>
      )),
    { width, height },
  )
  let frame = ""
  for (let attempt = 0; attempt < 10; attempt++) {
    await app.renderOnce()
    await app.flush()
    const next = app.captureCharFrame()
    if (next.trim().length > 0 && next === frame) break
    frame = next
    await Bun.sleep(30)
  }
  app.renderer.destroy()
  return frame.split("\n")
}

const rowsWith = (rows: string[], ...needles: string[]) => rows.filter((row) => needles.every((n) => row.includes(n)))

test("the decision row is one row while it fits", async () => {
  for (const width of FITS) {
    const rows = await shot(() => <PermissionPrompt request={REQUEST} />, width)
    // The label and every option on one row: the row is whole, not wrapped.
    expect(rowsWith(rows, DECISION, ...OPTIONS).length).toBe(1)
  }
})

test("the decision row stacks when it does not fit, one option per row", async () => {
  for (const width of STACKS) {
    const rows = await shot(() => <PermissionPrompt request={REQUEST} />, width)
    // The label keeps its own row and the options are one per row beneath it —
    // a stack, not a wrap: nothing is chopped mid-label.
    expect(rowsWith(rows, DECISION, OPTIONS[0]).length).toBe(0)
    expect(rowsWith(rows, DECISION).length).toBe(1)
    for (const option of OPTIONS) {
      expect(rowsWith(rows, option).length).toBe(1)
    }
  }
})

test("the hint row follows the same measurement, not a second breakpoint", async () => {
  for (const width of FITS) {
    const rows = await shot(() => <PermissionPrompt request={REQUEST} />, width)
    expect(rowsWith(rows, HINT_SELECT, HINT_CONFIRM, FULLSCREEN).length).toBe(1)
  }
  for (const width of STACKS) {
    const rows = await shot(() => <PermissionPrompt request={REQUEST} />, width)
    expect(rowsWith(rows, HINT_SELECT, HINT_CONFIRM).length).toBe(0)
    expect(rowsWith(rows, HINT_SELECT).length).toBe(1)
    expect(rowsWith(rows, HINT_CONFIRM).length).toBe(1)
  }
})

test("the rejection's hints sit beside the input while the field can still show a reason", async () => {
  for (const width of [90, 76, 64]) {
    const rows = await shot(() => <RejectPrompt onCancel={() => {}} onConfirm={() => {}} />, width, 12)
    expect(rowsWith(rows, REJECT_CONFIRM, REJECT_CANCEL).length).toBe(1)
  }
  for (const width of [54, 48]) {
    const rows = await shot(() => <RejectPrompt onCancel={() => {}} onConfirm={() => {}} />, width, 12)
    expect(rowsWith(rows, REJECT_CONFIRM, REJECT_CANCEL).length).toBe(0)
    expect(rowsWith(rows, REJECT_CONFIRM).length).toBe(1)
    expect(rowsWith(rows, REJECT_CANCEL).length).toBe(1)
  }
})
