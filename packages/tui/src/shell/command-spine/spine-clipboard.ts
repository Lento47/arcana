import type { SpineEntry } from "./spine-types"

function pushLine(lines: string[], value: string | undefined) {
  const text = value?.trim()
  if (text) lines.push(text)
}

export function spineEntryCopyText(entry: SpineEntry) {
  const lines: string[] = []
  const head = [entry.kind, entry.actor, entry.summary].filter(Boolean).join(" · ")
  pushLine(lines, head)
  pushLine(lines, entry.body)

  if (entry.receipt) {
    pushLine(lines, entry.receipt.command)
    pushLine(lines, entry.receipt.summary)
    for (const file of entry.receipt.files ?? []) {
      pushLine(lines, `${file.path} +${file.added} -${file.removed}`)
    }
  }

  if (entry.diff) {
    pushLine(lines, entry.diff.files)
    pushLine(lines, entry.diff.stats)
    pushLine(lines, entry.diff.body)
  }

  if (entry.report) {
    pushLine(lines, entry.report.title)
    pushLine(lines, entry.report.summary)
    pushLine(lines, entry.report.body)
  }

  return lines.join("\n").trim()
}