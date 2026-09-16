/** @jsxImportSource @opentui/solid */
/**
 * The inspector's snapshot section, rendered.
 *
 * The section has four states and one shape. Two of them — `missing` and
 * `error` — used to be a bare bold line over a paragraph in a plain column box,
 * which is why the paragraph opened with a literal `{" "}`: JSX drops
 * whitespace-only text between elements, so the indent had to be smuggled in as
 * a text node. `loading` had no frame at all, so the section changed height the
 * moment the fetch resolved and the report moved under the operator's eyes
 * exactly as they began reading it.
 *
 * These tests pin both properties where they are visible: the note is drawn at
 * the heading's own column (no smuggled indent), and the heading is drawn at the
 * same row in every state (nothing jumps). They also pin the fail-closed
 * contract — an unavailable snapshot shows no snapshot rows at all, so the
 * report cannot appear to have verified a request it never received.
 */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { createSignal, type Accessor } from "solid-js"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import type { ApprovalSnapshotDetail } from "../src/shell/command-spine/approval-http-bridge"
import {
  ApprovalInspector,
  type ApprovalSnapshotStatus,
} from "../src/routes/session/approval-inspector"
import { fallbackTheme } from "../src/theme"
import { TestTuiProviders } from "./fixture/tui-providers"

const REQUEST_HASH = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

const RECORD: ApprovalRecord = {
  approvalId: "appr_abcdef0123456789",
  version: 3,
  sessionId: "ses_0123456789abcdef",
  workspaceId: "ws_0123456789abcdef",
  requestHash: REQUEST_HASH,
  contractRevision: 6,
  principalId: "agent:build",
  state: "PENDING",
  expiresAt: "2099-08-02T12:00:00.000Z",
  updatedAt: "2026-08-02T12:00:01.000Z",
  createdAt: "2026-08-02T11:59:00.000Z",
}

const SNAPSHOT: ApprovalSnapshotDetail = {
  schemaVersion: "1",
  approvalId: RECORD.approvalId,
  requestHash: REQUEST_HASH,
  action: "mcp.call",
  resource: "fs.write",
  arguments: '{"path":"src/index.ts"}',
  capability: "workspace.write",
  principalId: "agent:build",
  intentId: "int_0001",
  policyVersion: "pol-2026-09-01",
  contractRevision: 6,
  riskClass: "elevated",
  diffPreview: { filePath: "src/index.ts", kind: "update", additions: 3, deletions: 1 },
}

/** Where `needle` is drawn. `row` is -1 when the text is absent. */
function at(frame: string, needle: string) {
  const lines = frame.split("\n")
  const row = lines.findIndex((line) => line.includes(needle))
  return { row, col: row === -1 ? -1 : lines[row]!.indexOf(needle) }
}

type Span = { text: string; fg: unknown }

/** RGBA spans arrive as an indexed 4-byte buffer, not as floats. */
function ints(color: unknown): number[] | undefined {
  const buffer = (color as { buffer?: Record<number, number> } | undefined)?.buffer
  if (!buffer) return undefined
  return [buffer[0]!, buffer[1]!, buffer[2]!, buffer[3]!]
}

function inkOf(app: Awaited<ReturnType<typeof testRender>>, needle: string): number[] | undefined {
  const spans = app
    .captureSpans()
    .lines.flatMap((line: { spans: Span[] }) => line.spans)
  return ints(spans.find((span) => span.text.includes(needle))?.fg)
}

function Harness(props: {
  status: Accessor<ApprovalSnapshotStatus>
  snapshot: Accessor<ApprovalSnapshotDetail | undefined>
}) {
  return (
    <TestTuiProviders>
      <ApprovalInspector approval={RECORD} snapshot={props.snapshot} snapshotStatus={props.status} />
    </TestTuiProviders>
  )
}

/**
 * The inspector over a mutable status/snapshot pair, so one render can be walked
 * through every state — which is also what makes the "nothing jumps" assertion
 * meaningful: the rows are compared across states within one layout.
 */
async function openInspector() {
  const [status, setStatus] = createSignal<ApprovalSnapshotStatus>("loading")
  const [snapshot, setSnapshot] = createSignal<ApprovalSnapshotDetail | undefined>(undefined)
  const app = await testRender(() => <Harness status={status} snapshot={snapshot} />, { width: 120, height: 60 })
  const settle = async () => {
    for (let attempt = 0; attempt < 8; attempt++) {
      await Bun.sleep(20)
      await app.renderOnce()
    }
  }
  await settle()
  return { app, setStatus, setSnapshot, settle, frame: () => app.captureCharFrame() }
}

const UNAVAILABLE_HEADING = "△ SNAPSHOT UNAVAILABLE · FAIL-CLOSED"
const READY_HEADING = "REQUEST SNAPSHOT · verified ✓"
const LOADING_HEADING = "REQUEST SNAPSHOT · loading…"

test("every snapshot state draws its banner at the same row and column", async () => {
  const inspector = await openInspector()
  try {
    const loading = at(inspector.frame(), LOADING_HEADING)

    inspector.setSnapshot(SNAPSHOT)
    inspector.setStatus("ready")
    await inspector.settle()
    const ready = at(inspector.frame(), READY_HEADING)

    inspector.setStatus("missing")
    await inspector.settle()
    const missing = at(inspector.frame(), UNAVAILABLE_HEADING)

    inspector.setStatus("error")
    await inspector.settle()
    const errored = at(inspector.frame(), UNAVAILABLE_HEADING)

    for (const state of [loading, ready, missing, errored]) {
      expect(state.row).toBeGreaterThan(-1)
    }
    // The section holds its place while the fetch resolves and after it fails:
    // one heading, one row, one column, four states.
    expect(ready.row).toBe(loading.row)
    expect(missing.row).toBe(loading.row)
    expect(errored.row).toBe(loading.row)
    expect(ready.col).toBe(loading.col)
    expect(missing.col).toBe(loading.col)
    expect(errored.col).toBe(loading.col)
  } finally {
    inspector.app.renderer.destroy()
  }
})

test("an unavailable snapshot fails closed: warning ink, the consequence, no snapshot rows", async () => {
  const inspector = await openInspector()
  try {
    inspector.setStatus("missing")
    await inspector.settle()
    const frame = inspector.frame()
    const heading = at(frame, UNAVAILABLE_HEADING)

    // The state is carried by ink, not only by words.
    expect(inkOf(inspector.app, UNAVAILABLE_HEADING)).toEqual(fallbackTheme("dark").warning.toInts())

    // Nothing verified is on screen to be mistaken for the request: no parity
    // row, no action/resource rows, no request hash echoed back as fact.
    expect(frame).not.toContain("Hash parity")
    expect(frame).not.toContain("Policy version")

    const note = at(frame, "This approval has no verified immutable request snapshot")
    // Directly under the heading — no blank row between label and note.
    expect(note.row).toBe(heading.row + 1)
    // And at the heading's own column: the note takes its inset from the frame,
    // where the old markup smuggled it in as a leading `{" "}` text node.
    expect(note.col).toBe(heading.col)
    expect(frame).toContain("Do not approve or deny until a snapshot is available.")

    // The transport failure reaches the same conclusion by its own route, and
    // says the one thing that can help.
    inspector.setStatus("error")
    await inspector.settle()
    const erroredFrame = inspector.frame()
    const erroredHeading = at(erroredFrame, UNAVAILABLE_HEADING)
    const erroredNote = at(erroredFrame, "Could not reach the engine to fetch the verified request snapshot")
    expect(erroredNote.row).toBe(erroredHeading.row + 1)
    expect(erroredNote.col).toBe(erroredHeading.col)
    expect(erroredFrame).toContain("close and reopen the inspector to retry.")
    expect(erroredFrame).not.toContain("Hash parity")
  } finally {
    inspector.app.renderer.destroy()
  }
})

test("a ready snapshot shows the verified banner over its rows, and reports a hash mismatch", async () => {
  const inspector = await openInspector()
  try {
    inspector.setSnapshot(SNAPSHOT)
    inspector.setStatus("ready")
    await inspector.settle()
    const frame = inspector.frame()

    // One row: the heading is a label, and a label that wraps reads as a broken
    // banner rather than as a long one.
    expect(at(frame, READY_HEADING).row).toBeGreaterThan(-1)
    expect(inkOf(inspector.app, "REQUEST SNAPSHOT")).toEqual(fallbackTheme("dark").accent.toInts())

    expect(frame).toContain("Action")
    expect(frame).toContain("mcp.call")
    expect(frame).toContain("Hash parity")
    expect(frame).toContain("verified ✓ matches record requestHash")

    // The engine recomputes the canonical request hash before answering, so a
    // mismatch is the defensive path — pinned because it is the one readout that
    // must never be quietly wrong.
    inspector.setSnapshot({ ...SNAPSHOT, requestHash: "f".repeat(64) })
    await inspector.settle()
    const tampered = at(inspector.frame(), "REQUEST SNAPSHOT · verified ✗")
    expect(tampered.row).toBeGreaterThan(-1)
    expect(at(inspector.frame(), READY_HEADING).row).toBe(-1)
  } finally {
    inspector.app.renderer.destroy()
  }
})
