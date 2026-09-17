import { createMemo, createSignal, onMount } from "solid-js"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import { useTheme } from "../context/theme"
import { useSync } from "../context/sync"
import { useRoute } from "../context/route"
import { useDialog } from "./dialog"
import { useBindings } from "../keymap"
import { Locale } from "../util/locale"
import { Space } from "./chrome"
import type { Column } from "./kit/table"
import { Table } from "./kit/table-view"
import { DialogColumn, DialogFooter, DialogTitleRow } from "./dialog-chrome"

type Finding = { at: number; kind: string; what: string; sessionID: string }

/**
 * `/findings` — the quickfix list for a session tree.
 *
 * Everything that went wrong or got sealed, in one place: failed tool calls,
 * denied/expired approvals, context compactions. `⏎` jumps to the session a
 * finding belongs to (the current one stays put).
 */
export function DialogFindings() {
  const dialog = useDialog()
  const sync = useSync()
  const route = useRoute()
  const { theme } = useTheme()
  const [selected, setSelected] = createSignal(0)
  onMount(() => dialog.setSize("large"))

  const current = () =>
    route.data?.type === "session" ? ((route.data as { sessionID?: string }).sessionID ?? undefined) : undefined

  const findings = createMemo<Finding[]>(() => {
    const id = current()
    if (!id) return []
    const children = (sync.data.session ?? []).filter((session) => session.parentID === id)
    const scan = [id, ...children.map((session) => session.id)]
    const found: Finding[] = []
    for (const sessionID of scan) {
      for (const message of sync.data.message[sessionID] ?? []) {
        for (const part of sync.data.part[message.id] ?? []) {
          if (part.type === "tool") {
            const state = (part as { state?: { status?: string; title?: string; time?: { end?: number } } }).state
            if (state?.status !== "error") continue
            found.push({
              at: state.time?.end ?? message.time?.created ?? Date.now(),
              kind: "tool",
              what: `${(part as { tool?: string }).tool ?? "tool"}${state.title ? ` · ${state.title}` : ""}`,
              sessionID,
            })
          }
          if (part.type === "compaction") {
            found.push({
              at: message.time?.created ?? Date.now(),
              kind: "compaction",
              what: "context compacted",
              sessionID,
            })
          }
        }
      }
    }
    for (const record of Object.values(sync.data.approvals as Record<string, ApprovalRecord>)) {
      if (!scan.includes(record.sessionId)) continue
      if (!["DENIED", "EXPIRED", "INVALIDATED"].includes(record.state)) continue
      found.push({
        at: Date.parse(record.updatedAt) || Date.parse(record.createdAt) || Date.now(),
        kind: "approval",
        what: `${record.state.toLowerCase()} · ${record.requestHash.slice(0, 8)}`,
        sessionID: record.sessionId,
      })
    }
    return found.sort((a, b) => b.at - a.at)
  })

  const columns: Array<Column<Finding>> = [
    { key: "kind", label: "kind", width: 11, value: (row) => row.kind },
    { key: "what", label: "what", value: (row) => row.what },
    { key: "session", label: "session", width: 10, value: (row) => row.sessionID.slice(-10) },
    { key: "age", label: "age", width: 9, value: (row) => Locale.duration(Date.now() - row.at) || "now" },
  ]

  useBindings(() => ({
    bindings: [
      { key: "up", desc: "Previous finding", group: "Dialog", cmd: () => setSelected((i) => Math.max(0, i - 1)) },
      {
        key: "down",
        desc: "Next finding",
        group: "Dialog",
        cmd: () => setSelected((i) => Math.min(Math.max(0, findings().length - 1), i + 1)),
      },
      {
        key: "return",
        desc: "Jump to the finding's session",
        group: "Dialog",
        cmd: () => {
          const row = findings()[selected()]
          if (!row || row.sessionID === current()) return
          route.navigate({ type: "session", sessionID: row.sessionID })
          dialog.clear()
        },
      },
      { key: "escape", desc: "Close findings", group: "Dialog", cmd: () => dialog.clear() },
    ],
  }))

  return (
    <DialogColumn padBottom>
      <DialogTitleRow title="Findings" onClose={() => dialog.clear()} />
      <text fg={theme.textMuted} wrapMode="none">
        {`${findings().length} finding${findings().length === 1 ? "" : "s"} · failures, denials and compactions`}
      </text>
      <Table
        columns={columns}
        rows={findings()}
        selected={selected()}
        onSelect={setSelected}
        empty="Nothing found — failures, denials and compactions will collect here."
      />
      <box flexDirection="row" gap={Space.gapWide} minWidth={0}>
        <text fg={theme.textMuted} wrapMode="none">
          <span style={{ fg: theme.primary }}>⏎</span> jump to session
        </text>
      </box>
      <DialogFooter />
    </DialogColumn>
  )
}
