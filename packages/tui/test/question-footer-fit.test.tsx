/** @jsxImportSource @opentui/solid */
/**
 * The question gate's rows are whole or absent — and its control is never the
 * part that comes apart.
 *
 * The hint and the submit control sat in one `space-between` row with both of
 * them elastic. A row narrower than the two did not push the control to the far
 * edge; yoga shared the deficit between the two segments and both decoded:
 *
 *   40 |  │ Required: answer 1 ·    Submit (
 *      |     enter jumps to it       incomplete)
 *
 *   32 |  │ Required: answer Submit (
 *      |     1 · enter jumps  incomplete)
 *      |     to it
 *
 * — at 32 columns the hint and the control ran together with no gap at all, so
 * the row read as one sentence. The control is `flexShrink={0}` with a label
 * that cannot wrap, the hint is now the row's only elastic part, and the two
 * stack when the measurement says the hint no longer fits beside the button.
 *
 * The question's own index had the same fault one row up: sharing the deficit
 * with the question text ate the space between them, and from 64 columns down
 * every question printed glued to its number — `1.Deployment target`.
 *
 * A width here is the whole terminal. The harness reproduces the session frame's
 * own horizontal inset (`Space.frame("cozy") * 2`, the padding the real frame
 * applies per side) so the gate's budget and the gate's columns are the same
 * number, as they are in the app. The breakpoint is 68 columns: at 70 and wider
 * the hint and the control share a row, at 67 and narrower they stack. No width
 * below sits on it.
 */
import { expect, test } from "bun:test"
import { testRender, type JSX } from "@opentui/solid"
import type { QuestionRequest } from "@arcana/sdk/v2"
import { SDKProvider } from "../src/context/sdk"
import { ExitProvider } from "../src/context/exit"
import { ArgsProvider } from "../src/context/args"
import { ProjectProvider } from "../src/context/project"
import { SyncProvider } from "../src/context/sync"
import { PathFormatterProvider } from "../src/context/path-format"
import { QuestionPrompt } from "../src/routes/session/question"
import { TestTuiProviders } from "./fixture/tui-providers"
import { createEventSource, createFetch, directory } from "./fixture/tui-sdk"

/** The control's widest label, which is the one a fresh form shows. */
const SUBMIT = "Submit (incomplete)"
/** The longest hint the gate prints, at the widest state of the answer list. */
const HINT = "Required: answer 1 · enter jumps to it"
/** The question, whose number must stay separated from it. */
const QUESTION = "Deployment target"
/** The number and the question, together — the shape that must not print glued. */
const GLUED = "1.Deployment target"

/** Where the hint and the control share a row. */
const INLINE = [110, 90, 78, 70]
/** Where they stack, control on its own row against the right edge. */
const STACKED = [64, 56, 48, 40]
const WIDTHS = [...INLINE, ...STACKED]

const REQUEST = {
  id: "q_footer_fit",
  sessionID: "ses_f591be0c",
  questions: [
    {
      header: "Deployment target",
      question: "Which environment should this deploy to, and should the migration run first?",
      multiple: false,
      custom: true,
      options: [
        { label: "Staging", description: "the shared staging cluster" },
        { label: "Production", description: "customer-facing, requires a change window" },
      ],
    },
  ],
} as unknown as QuestionRequest

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

async function shot(width: number, height = 20) {
  const app = await testRender(
    () =>
      withProviders(() => (
        // The session frame's own inset, so the gate lays out in the columns its
        // budget assumes rather than four more.
        <box width="100%" height="100%" flexDirection="column" paddingLeft={2} paddingRight={2}>
          <QuestionPrompt request={REQUEST} />
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

test("the submit control is whole at every width the gate can be given", async () => {
  for (const width of WIDTHS) {
    const rows = await shot(width)
    // The label is intact on one row, never split across two.
    expect(rows.some((row) => row.includes(SUBMIT))).toBe(true)
    expect(rows.some((row) => row.includes("incomplete)") && !row.includes(SUBMIT))).toBe(false)
  }
})

test("the hint and the control share a row while the hint fits beside the button", async () => {
  for (const width of INLINE) {
    const rows = await shot(width)
    expect(rows.filter((row) => row.includes(HINT) && row.includes(SUBMIT)).length).toBe(1)
  }
})

test("they stack when they do not, and the control keeps the right edge", async () => {
  for (const width of STACKED) {
    const rows = await shot(width)
    // The fused row is what is being ruled out — the hint's last word running
    // straight into the button's first.
    expect(rows.filter((row) => row.includes("answer") && row.includes("Submit")).length).toBe(0)
    const hint = rows.findIndex((row) => row.includes("Required: answer"))
    const control = rows.findIndex((row) => row.includes(SUBMIT))
    expect(hint).toBeGreaterThanOrEqual(0)
    expect(control).toBeGreaterThan(hint)
    // The button is flush to the right edge of its row, not left-aligned under
    // the hint: it is the family's action position, not a new paragraph.
    expect(rows[control]!.trimEnd().endsWith(SUBMIT)).toBe(true)
  }
})

test("the question's number never fuses into its own question", async () => {
  for (const width of WIDTHS) {
    const rows = await shot(width)
    expect(rows.some((row) => row.includes(GLUED))).toBe(false)
    expect(rows.some((row) => row.includes(QUESTION))).toBe(true)
  }
})
