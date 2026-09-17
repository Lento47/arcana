/**
 * Table model math: columns describe how to read a row, and sort/filter are
 * plain functions over those readers. The renderable only paints.
 */

export type Column<T> = {
  key: string
  label: string
  /** Fixed width in cells; derived from content when omitted. */
  width?: number
  value: (row: T) => string
}

export type SortState = { key: string; direction: 1 | -1 }

export function sortRows<T>(rows: readonly T[], columns: readonly Column<T>[], sort?: SortState): T[] {
  if (!sort) return [...rows]
  const column = columns.find((candidate) => candidate.key === sort.key)
  if (!column) return [...rows]
  return [...rows].sort((a, b) => column.value(a).localeCompare(column.value(b)) * sort.direction)
}

export function filterRows<T>(rows: readonly T[], columns: readonly Column<T>[], query: string): T[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...rows]
  return rows.filter((row) =>
    columns.some((column) => column.value(row).toLowerCase().includes(needle)),
  )
}

/** Column widths: explicit width wins, else the widest cell (capped). */
export function cellWidths<T>(
  columns: readonly Column<T>[],
  rows: readonly T[],
  cap = 28,
): number[] {
  return columns.map((column) => {
    if (column.width !== undefined) return column.width
    let width = Math.max(1, column.label.length)
    for (const row of rows) width = Math.max(width, column.value(row).length)
    return Math.min(cap, width)
  })
}

/** Truncate a cell to `width`, marking the cut with an ellipsis. */
export function fitCell(value: string, width: number): string {
  if (width <= 0) return ""
  if (value.length <= width) return value.padEnd(width)
  if (width <= 1) return "…"
  return `${value.slice(0, width - 1)}…`
}
