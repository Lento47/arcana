import { createMemo, createSignal, onMount } from "solid-js"
import { TextAttributes } from "@opentui/core"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import { useTheme } from "../context/theme"
import { useSync } from "../context/sync"
import { useDialog } from "./dialog"
import { useBindings } from "../keymap"
import { Locale } from "../util/locale"
import { Space } from "./chrome"
import { sortRows, type Column, type SortState } from "./kit/table"
import { Table } from "./kit/table-view"
import { DialogColumn, DialogFooter, DialogTitleRow } from "./dialog-chrome"
import { ApprovalInspector } from "../routes/session/approval-inspector"

const FILTERS = ["all", "pending", "approved", "denied", "expired"] as const
type Filter = (typeof FILTERS)[number]

/**
 * `/docket` — every durable approval in one table.
 *
 * Sort with `s` (state/risk/age), filter with `f`, move with up/down, and
 * `⏎` opens the full approval inspector for the selected row.
 */
export function DialogDocket() {
  const dialog = useDialog()
  const sync = useSync()
  const { theme } = useTheme()
  const [selected, setSelected] = createSignal(0)
  const [filter, setFilter] = createSignal<Filter>("all")
  const [sort, setSort] = createSignal<SortState | undefined>(undefined)

  onMount(() => dialog.setSize("large"))

  const columns: Array<Column<ApprovalRecord>> = [
    { key: "state", label: "state", width: 12, value: (record) => record.state.toLowerCase() },
    { key: "risk", label: "risk", width: 9, value: (record) => record.riskClass ?? "-" },
    {
      key: "age",
      label: "age",
      width: 10,
      value: (record) => Locale.duration(Date.now() - Date.parse(record.createdAt)) || "now",
    },
    { key: "session", label: "session", width: 10, value: (record) => record.sessionId.slice(-10) },
    { key: "id", label: "id", value: (record) => record.approvalId },
  ]

  const rows = createMemo(() => {
    const all = Object.values(sync.data.approvals as Record<string, ApprovalRecord>)
    const filtered = filter() === "all" ? all : all.filter((record) => record.state.toLowerCase() === filter())
    return sortRows(filtered, columns, sort())
  })

  const open = (record: ApprovalRecord | undefined) => {
    if (!record) return
    dialog.replace(() => <ApprovalInspector approval={record} snapshotStatus={() => "missing"} />)
  }

  useBindings(() => ({
    bindings: [
      { key: "up", desc: "Previous approval", group: "Dialog", cmd: () => setSelected((i) => Math.max(0, i - 1)) },
      {
        key: "down",
        desc: "Next approval",
        group: "Dialog",
        cmd: () => setSelected((i) => Math.min(Math.max(0, rows().length - 1), i + 1)),
      },
      {
        key: "s",
        desc: "Sort the docket",
        group: "Dialog",
        cmd: () =>
          setSort((current) => {
            const order = ["state", "risk", "age"] as const
            const next = order[(current ? order.indexOf(current.key as (typeof order)[number]) + 1 : 0) % order.length]!
            return { key: next, direction: current?.key === next ? ((-current.direction) as 1 | -1) : 1 }
          }),
      },
      {
        key: "f",
        desc: "Filter the docket",
        group: "Dialog",
        cmd: () => setFilter((current) => FILTERS[(FILTERS.indexOf(current) + 1) % FILTERS.length]!),
      },
      { key: "return", desc: "Inspect the approval", group: "Dialog", cmd: () => open(rows()[selected()]) },
      { key: "escape", desc: "Close the docket", group: "Dialog", cmd: () => dialog.clear() },
    ],
  }))

  return (
    <DialogColumn padBottom>
      <DialogTitleRow title="Approvals docket" onClose={() => dialog.clear()} />
      <text fg={theme.textMuted} wrapMode="none">
        {`${rows().length} record${rows().length === 1 ? "" : "s"} · filter ${filter()} · sort ${
          sort() ? `${sort()!.key}${sort()!.direction === 1 ? "↑" : "↓"}` : "newest first"
        }`}
      </text>
      <Table columns={columns} rows={rows()} selected={selected()} onSelect={setSelected} empty="No approvals recorded." />
      <box flexDirection="row" gap={Space.gapWide} minWidth={0}>
        <text fg={theme.textMuted} wrapMode="none">
          <span style={{ fg: theme.primary }}>s</span> sort · <span style={{ fg: theme.primary }}>f</span> filter ·{" "}
          <span style={{ fg: theme.primary }}>⏎</span> inspect
        </text>
      </box>
      <text attributes={TextAttributes.BOLD} fg={theme.accent}>
        {filter() === "all" ? "Every state shown" : `Only ${filter()} shown`}
      </text>
      <DialogFooter />
    </DialogColumn>
  )
}
