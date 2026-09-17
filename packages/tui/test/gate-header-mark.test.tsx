/** @jsxImportSource @opentui/solid */
/**
 * One mark per gate.
 *
 * Both decision gates draw their mark twice. `GateFrame` puts a glyph on the
 * gate's rail node — the spine's own vocabulary, and the reason a gate is on
 * screen at all is that something is waiting on the operator — and then each
 * gate's heading drew a second copy of the same character one column to its
 * right. Every gate rendered as `△ △ COMPLETION CONTRACT`, and the deny gate as
 * `× × REJECT PERMISSION`: the same mark twice, with a space between them, which
 * reads as a rendering fault rather than a heading.
 *
 * The deny gate's mark was also the wrong character three times over. U+00D7
 * (multiplication sign) is neither of the app's marks — the spine denies and
 * fails with `✗` and dismisses with `✕` — so the one screen that exists to
 * refuse a request was the only one whose mark matched nothing else in the app.
 *
 * These are the two screens an operator acts on, and neither had a render test.
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
import { Glyph } from "../src/branding"
import { PermissionPrompt, RejectPrompt } from "../src/routes/session/permission"
import { TestTuiProviders } from "./fixture/tui-providers"
import { createEventSource, createFetch, directory } from "./fixture/tui-sdk"

/** U+00D7 — the multiplication sign the deny gate used to print. */
const MULTIPLICATION_SIGN = "×"
/** The spine's deny/fail mark, which the deny gate's rail now carries. */
const DENY = "✗"
const HEADING = "COMPLETION CONTRACT"
const DETAIL = "Fix permission persistence"

const REQUEST: PermissionRequest = {
  id: "per_gate_mark",
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

const WIDTHS = [120, 90, 76, 60]

test("the action gate draws its mark once, and from the rail", async () => {
  for (const width of WIDTHS) {
    const rows = await shot(() => <PermissionPrompt request={REQUEST} />, width)
    const frame = rows.join("\n")

    // One mark in the whole frame. Two copies printed `△ △ COMPLETION CONTRACT`.
    expect(frame.split(Glyph.attention).length - 1).toBe(1)
    // And the heading is the mark plus its caption, not a second mark.
    expect(rows.some((row) => row.includes(`${Glyph.attention} ${HEADING}`))).toBe(true)
    expect(frame).not.toContain(`${Glyph.attention} ${Glyph.attention}`)
  }
})

test("the gate's detail starts in the heading's own column", async () => {
  // The heading used to carry its own mark, and the detail row was inset by two
  // columns so the icon lined up under the *text* of a heading whose mark took
  // the first two. The heading is now the rail's caption, so both rows begin at
  // the content column — keeping the inset would leave the icon adrift by the
  // width of a mark that is no longer there.
  const rows = await shot(() => <PermissionPrompt request={REQUEST} />, 90)
  const heading = rows.find((row) => row.includes(HEADING))
  const detail = rows.find((row) => row.includes(DETAIL))
  expect(heading).toBeDefined()
  expect(detail).toBeDefined()
  expect(heading!.indexOf(HEADING)).toBe(detail!.indexOf("◇"))
})

test("the deny gate draws the spine's deny mark, once", async () => {
  for (const width of WIDTHS) {
    const rows = await shot(() => <RejectPrompt onCancel={() => {}} onConfirm={() => {}} />, width, 14)
    const frame = rows.join("\n")

    expect(rows.some((row) => row.includes(`REJECT PERMISSION`))).toBe(true)
    expect(frame.split(DENY).length - 1).toBe(1)
    expect(frame).not.toContain(`${DENY} ${DENY}`)
    // The third sign is gone — from the heading and from the rail.
    expect(frame).not.toContain(MULTIPLICATION_SIGN)
    expect(frame).not.toContain(`✕`)
  }
})
